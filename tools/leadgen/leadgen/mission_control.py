"""Mission Control: runs the crew's day and writes Eris one short brief.

Once a day, after BRIEF_AFTER_HOUR in the team's time zone, it reads the whole system (pipeline
numbers from metrics.snapshot, totals and the latest window; worker heartbeats; what waits on a
person; the outbound halt; each agent's newest agent_runs row) and writes a plain-English brief:
what happened, what each agent did, and the ONE decision that needs him.

One LLM call writes the brief. Without ANTHROPIC_API_KEY, or if the call fails, a deterministic
brief is written from the same facts. The brief goes in agent_runs.decision and the numbers in
agent_runs.evidence; the worker then has notify.py email it to Eris. Generated copy may not
carry time or speed words: the model is told so, and any sentence that still has one is removed
and flagged in the evidence.
"""

from __future__ import annotations

import json
import logging
import os
from datetime import UTC, datetime, timedelta
from typing import Any

import anthropic

from leadgen import agent_log, alarms, metrics
from leadgen.automation import MODEL, TEAM_TZ, ClaudeWriter, Writer
from leadgen.copy_rules import TIME_WORDS, scrub_time_words  # noqa: F401  (re-exported for callers)
from leadgen.store import Store

log = logging.getLogger(__name__)

AGENT = "mission-control"
BRIEF_AFTER_HOUR = 7
CAMPAIGNS_URL = "https://crm.golaunchcontrol.com/admin/campaigns"
DRAFTS_URL = "https://crm.golaunchcontrol.com/admin/drafts"
# A heartbeat older than this many of its own intervals (or STALE_DEFAULT_S without one) is stale.
STALE_INTERVALS = 3
STALE_DEFAULT_S = 1800
# Status values that mean a pass actually finished; a failed or stuck pass doesn't count as today's.
FINISHED = ("done", "halted")
LLM_TIMEOUT_S = 60.0
# Used when the decision itself carries a banned word and is scrubbed away.
SAFE_DECISION = "Read the latest agent rows in Mission Control; the decision text was withheld by the copy check."

# Eris (2026-11-17): "Rewrite in plain words always." The old brief said the same jargon every day
# ("usable rate", "latest window", agent names, n=32). Now: what changed since the last brief, where
# things stand, what is waiting, problems, and the one decision, in words a busy owner reads at a glance.
SYSTEM = (
    "You write a short daily update for Eris, who owns Launch Control. Write it like a text to a busy "
    "owner: plain everyday words, short sentences, at most 80 words. Lines, in this order:\n"
    "1. 'Since the last update:' then what changed, from the 'changes' facts only. If 'changes' is "
    "empty or missing, the whole line is exactly 'Nothing new since the last update.'\n"
    "2. 'So far:' emails sent, businesses emailed, replies, meetings, deals won.\n"
    "3. 'Waiting for approval:' only if something is waiting, in plain words with the oldest date.\n"
    "4. 'Problems:' only if a problem is listed in 'problems'.\n"
    "5. The one decision, as a single sentence starting 'Decision:', keeping any links it has.\n"
    "Use only the facts given; never invent, estimate or combine numbers in new ways. Never use these "
    "words: window, usable, scanned, kept, rate, agent, crew, Guardian, Prospector, Strategist, "
    "Outreach-writer, heartbeat, worker, n=, percent signs. Describe what the helpers did only when it "
    "changed something, as 'the lead finder', 'the email writer', 'the safety check'. Zero replies is a "
    "normal fact, state it plainly. Never mention time, duration or speed: no hours, minutes, days, "
    "weeks, 'faster', 'quick', 'overnight', 'time saved'. No greeting, no sign-off, no headings, no markdown."
)
# Heartbeats written only when someone opens the CRM (its page-load mail sync), not by a loop. They go
# quiet whenever nobody is signed in, so they are not a sign anything stopped. The worker's own Outlook
# sync reports failures through alarms.py instead.
ON_DEMAND_BEATS = {"crm-mail-sync"}
# What the brief compares against the last brief, in the order it says them.
CHANGE_KEYS = (("sent", "email sent", "emails sent"), ("contacted", "new business emailed", "new businesses emailed"),
               ("replies", "reply", "replies"), ("meetings", "meeting", "meetings"), ("won", "deal won", "deals won"),
               ("usable", "new lead found", "new leads found"))


def last_row(store: Store, agent: str, finished_only: bool = False) -> dict[str, Any] | None:
    """Newest agent_runs row for one agent. (agent_log.last_runs reads the newest 200 rows overall,
    which the Guardian's frequent passes can crowd out.) finished_only skips failed and stuck rows."""
    params = {"select": "*", "agent": f"eq.{agent}", "order": "started_at.desc", "limit": "1"}
    if finished_only:
        params["status"] = f"in.({','.join(FINISHED)})"
    rows = store._req("GET", "agent_runs", params=params).json()
    return rows[0] if rows else None


def _parse(ts: str) -> datetime:
    return datetime.fromisoformat(ts.replace("Z", "+00:00"))


def due(store: Store, now: datetime) -> bool:
    """After BRIEF_AFTER_HOUR team time, and no mission-control row yet on that team date."""
    local = now.astimezone(TEAM_TZ)
    if local.hour < BRIEF_AFTER_HOUR:
        return False
    row = last_row(store, AGENT, finished_only=True)
    return row is None or _parse(row["started_at"]).astimezone(TEAM_TZ).date() != local.date()


# --- facts ---------------------------------------------------------------------------------------

def heartbeats(store: Store, now: datetime) -> list[dict[str, Any]]:
    rows = store._req("GET", "worker_heartbeats", params={"select": "name,beat_at,detail"}).json()
    out = []
    for r in rows:
        # alarms.py keeps its per-job state in "alarm:*" rows, written on change rather than on a beat.
        if str(r.get("name") or "").startswith(alarms.PREFIX) or r.get("name") in ON_DEMAND_BEATS:
            continue
        age = int((now - _parse(r["beat_at"])).total_seconds())
        every = (r.get("detail") or {}).get("every_s")
        limit = STALE_INTERVALS * every if isinstance(every, (int, float)) and every > 0 else STALE_DEFAULT_S
        out.append({"name": r["name"], "age_s": age, "stale": age > limit})
    return sorted(out, key=lambda h: h["name"])


def pending_approvals(store: Store) -> dict[str, Any]:
    drafts = metrics._all(store, "email_drafts", {"select": "id,kind,created_at", "status": "eq.pending"})
    campaigns = metrics._all(store, "email_campaigns", {"select": "id,name,created_at", "status": "eq.draft"})
    by_kind: dict[str, int] = {}
    for d in drafts:
        by_kind[d["kind"]] = by_kind.get(d["kind"], 0) + 1
    stamps = [str(r.get("created_at") or "") for r in [*drafts, *campaigns] if r.get("created_at")]
    return {"drafts_pending": len(drafts), "drafts_by_kind": by_kind, "campaign_drafts": len(campaigns),
            "oldest_waiting": min(stamps) if stamps else None}


def _since(ts: str | None) -> str:
    """'Nov 5' for a timestamp, in team time. No duration words: the brief's scrub drops those."""
    if not ts:
        return ""
    local = _parse(ts).astimezone(TEAM_TZ)
    return f"{local:%b} {local.day}"


def agent_activity(store: Store) -> dict[str, dict[str, Any]]:
    out = {}
    for agent in sorted(agent_log.AGENTS - {AGENT}):
        row = last_row(store, agent)
        if row:
            out[agent] = {"status": row.get("status"), "started_at": row.get("started_at"),
                          "decision": (row.get("decision") or "")[:300]}
    return out


def changes(store: Store, totals: dict[str, Any]) -> dict[str, int] | None:
    """What moved since the last finished brief, from its stored totals. None on the first brief."""
    prev = last_row(store, AGENT, finished_only=True)
    before = ((prev or {}).get("evidence") or {}).get("totals")
    if not isinstance(before, dict):
        return None
    out = {}
    for key, _one, _many in CHANGE_KEYS:
        if isinstance(totals.get(key), int) and isinstance(before.get(key), int) and totals[key] != before[key]:
            out[key] = totals[key] - before[key]
    return out


def problems(facts: dict[str, Any]) -> list[str]:
    out = []
    if facts["outbound_halted"]:
        out.append("Sending is stopped by the safety check.")
    stale = [h["name"] for h in facts["heartbeats"] if h["stale"]]
    if stale:
        out.append(f"These background jobs stopped checking in: {', '.join(stale)}.")
    for agent, row in facts["agents"].items():
        if row.get("status") in ("failed", "error"):
            out.append(f"The {PLAIN_NAMES.get(agent, agent)} failed on its last try.")
    return out


PLAIN_NAMES = {"guardian": "safety check", "prospector": "lead finder", "outreach-writer": "email writer",
               "strategist": "strategy check"}


def collect(store: Store, now: datetime) -> dict[str, Any]:
    totals = metrics.snapshot(store)
    facts: dict[str, Any] = {
        "totals": totals,
        "changes": changes(store, totals),
        "latest_window": metrics.snapshot(store, since=(now - timedelta(hours=24)).isoformat()),
        "heartbeats": heartbeats(store, now),
        "approvals": pending_approvals(store),
        "outbound_halted": agent_log.outbound_halted(store),
        "agents": agent_activity(store),
    }
    facts["problems"] = problems(facts)
    return facts


# --- the brief -----------------------------------------------------------------------------------

def the_decision(facts: dict[str, Any]) -> str:
    """The one thing that needs Eris, in priority order: halt, approvals, dead worker, guardian warning."""
    if facts["outbound_halted"]:
        why = (facts["agents"].get("guardian") or {}).get("decision") or "see the Guardian's last row"
        return f"Sending is stopped. Read why and turn it back on in the CRM if it is safe: {why}"
    a = facts["approvals"]
    if a["campaign_drafts"] or a["drafts_pending"]:
        since = _since(a.get("oldest_waiting"))
        return (f"Get Max to send or delete what is waiting ({waiting_words(a)})"
                + (f", some since {since}" if since else "")
                + f". Nothing new goes out until he does. Campaigns: {CAMPAIGNS_URL} Drafts: {DRAFTS_URL}")
    stale = [h["name"] for h in facts["heartbeats"] if h["stale"]]
    if stale:
        return f"These background jobs stopped checking in: {', '.join(stale)}. Check the worker on Railway."
    g = (facts["agents"].get("guardian") or {}).get("decision") or ""
    if "Warnings:" in g:
        return "The safety check has a warning: " + g.split("Warnings:", 1)[1].strip()
    return "Nothing needs a decision."


def _n(n: int, one: str, many: str) -> str:
    return f"{n} {one if n == 1 else many}"


def waiting_words(a: dict[str, Any]) -> str:
    parts = []
    if a["campaign_drafts"]:
        parts.append(_n(a["campaign_drafts"], "email batch", "email batches"))
    if a["drafts_pending"]:
        parts.append(_n(a["drafts_pending"], "follow-up", "follow-ups"))
    return " and ".join(parts)


def deterministic_brief(facts: dict[str, Any]) -> str:
    t, ch = facts["totals"], facts.get("changes")
    if ch:
        moved = [f"{v:+d} {many}" if v < 0 else _n(v, one, many) for key, one, many in CHANGE_KEYS if (v := ch.get(key))]
        lines = ["Since the last update: " + ", ".join(moved) + "."]
    else:
        lines = ["Nothing new since the last update."]
    lines.append(f"So far: {_n(t['sent'], 'email', 'emails')} sent to {_n(t['contacted'], 'business', 'businesses')}, "
                 f"{_n(t['replies'], 'reply', 'replies')}, {_n(t['meetings'], 'meeting', 'meetings')}, "
                 f"{_n(t['won'], 'deal', 'deals')} won.")
    a = facts["approvals"]
    if a["campaign_drafts"] or a["drafts_pending"]:
        lines.append(f"Waiting for approval: {waiting_words(a)}.")
    if facts.get("problems"):
        lines.append("Problems: " + " ".join(facts["problems"]))
    clean, _removed = scrub_time_words("\n".join(lines))
    return f"{clean}\n{decision_line(facts)}"


def decision_line(facts: dict[str, Any]) -> str:
    """'Decision: ...', scrubbed like the rest; a decision that loses everything gets SAFE_DECISION."""
    clean, _removed = scrub_time_words(the_decision(facts))
    return f"Decision: {clean or SAFE_DECISION}"


def _prompt(facts: dict[str, Any]) -> str:
    return ("Facts (JSON):\n" + json.dumps(facts, indent=1, default=str) +
            f"\n\nIf several things need Eris, the one decision is: {the_decision(facts)}")


def write_brief(facts: dict[str, Any], writer: Writer | None) -> tuple[str, dict[str, Any]]:
    """(brief, notes). Falls back to the deterministic brief without a writer or on any failure."""
    if writer is None:
        return deterministic_brief(facts), {"writer": "deterministic", "reason": "no ANTHROPIC_API_KEY"}
    try:
        text = writer.write(SYSTEM, _prompt(facts))
    except Exception as exc:
        log.exception("brief writer failed")
        return deterministic_brief(facts), {"writer": "deterministic", "reason": f"llm error: {type(exc).__name__}"}
    clean, removed = scrub_time_words(text)
    if not clean:
        return deterministic_brief(facts), {"writer": "deterministic", "reason": "llm brief empty after scrub",
                                            "time_words_removed": removed}
    if "Decision:" not in clean:
        clean += f"\n{decision_line(facts)}"
    return clean, {"writer": MODEL, "time_words_removed": removed}


def default_writer() -> Writer | None:
    if not os.environ.get("ANTHROPIC_API_KEY", "").strip():
        return None
    return ClaudeWriter(client=anthropic.Anthropic(max_retries=3, timeout=LLM_TIMEOUT_S))


def run_daily(store: Store, now: datetime | None = None, writer: Writer | None = None,
              use_default_writer: bool = True) -> str | None:
    """Write today's brief if it's due. Returns the brief, or None when not due."""
    now = now or datetime.now(UTC)
    if not due(store, now):
        return None
    writer = writer or (default_writer() if use_default_writer else None)
    with agent_log.agent_run(store, AGENT) as run:
        facts = collect(store, now)
        brief, notes = write_brief(facts, writer)
        run.decision = brief
        run.evidence = {**facts, "brief": notes}
    return brief
