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

from leadgen import agent_log, metrics
from leadgen.automation import MODEL, TEAM_TZ, ClaudeWriter, Writer
from leadgen.copy_rules import TIME_WORDS, scrub_time_words  # noqa: F401  (re-exported for callers)
from leadgen.store import Store

log = logging.getLogger(__name__)

AGENT = "mission-control"
BRIEF_AFTER_HOUR = 7
# A heartbeat older than this many of its own intervals (or STALE_DEFAULT_S without one) is stale.
STALE_INTERVALS = 3
STALE_DEFAULT_S = 1800
# Status values that mean a pass actually finished; a failed or stuck pass doesn't count as today's.
FINISHED = ("done", "halted")
LLM_TIMEOUT_S = 60.0
# Used when the decision itself carries a banned word and is scrubbed away.
SAFE_DECISION = "Read the latest agent rows in Mission Control; the decision text was withheld by the copy check."

SYSTEM = (
    "You write the daily brief for Eris, who runs Launch Control, a business development systems firm. "
    "Plain English, short: at most 120 words. Three parts: what happened (the numbers you are given, "
    "nothing else), one line per agent on what it did, and the ONE decision that needs Eris, as a "
    "single sentence starting 'Decision:'. Use only the facts provided; never invent or estimate numbers. "
    "Zero prospect replies is a normal fact, state it plainly. Never mention time, duration or speed: "
    "no hours, minutes, days, weeks, 'faster', 'quick', 'overnight', 'time saved'. Say 'in the latest "
    "window' instead of naming a span. No greeting, no sign-off, no markdown headings."
)


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
        age = int((now - _parse(r["beat_at"])).total_seconds())
        every = (r.get("detail") or {}).get("every_s")
        limit = STALE_INTERVALS * every if isinstance(every, (int, float)) and every > 0 else STALE_DEFAULT_S
        out.append({"name": r["name"], "age_s": age, "stale": age > limit})
    return sorted(out, key=lambda h: h["name"])


def pending_approvals(store: Store) -> dict[str, Any]:
    drafts = metrics._all(store, "email_drafts", {"select": "id,kind", "status": "eq.pending"})
    campaigns = metrics._all(store, "email_campaigns", {"select": "id,name", "status": "eq.draft"})
    by_kind: dict[str, int] = {}
    for d in drafts:
        by_kind[d["kind"]] = by_kind.get(d["kind"], 0) + 1
    return {"drafts_pending": len(drafts), "drafts_by_kind": by_kind, "campaign_drafts": len(campaigns)}


def agent_activity(store: Store) -> dict[str, dict[str, Any]]:
    out = {}
    for agent in sorted(agent_log.AGENTS - {AGENT}):
        row = last_row(store, agent)
        if row:
            out[agent] = {"status": row.get("status"), "started_at": row.get("started_at"),
                          "decision": (row.get("decision") or "")[:300]}
    return out


def collect(store: Store, now: datetime) -> dict[str, Any]:
    return {
        "totals": metrics.snapshot(store),
        "latest_window": metrics.snapshot(store, since=(now - timedelta(hours=24)).isoformat()),
        "heartbeats": heartbeats(store, now),
        "approvals": pending_approvals(store),
        "outbound_halted": agent_log.outbound_halted(store),
        "agents": agent_activity(store),
    }


# --- the brief -----------------------------------------------------------------------------------

def the_decision(facts: dict[str, Any]) -> str:
    """The one thing that needs Eris, in priority order: halt, approvals, dead worker, guardian warning."""
    if facts["outbound_halted"]:
        why = (facts["agents"].get("guardian") or {}).get("decision") or "see the Guardian's last row"
        return f"Outbound is halted. Review the reason and clear the halt in the CRM if it is safe: {why}"
    a = facts["approvals"]
    if a["campaign_drafts"] or a["drafts_pending"]:
        return (f"Review what is waiting for approval: {a['campaign_drafts']} campaign draft(s) and "
                f"{a['drafts_pending']} email draft(s).")
    stale = [h["name"] for h in facts["heartbeats"] if h["stale"]]
    if stale:
        return f"These workers stopped checking in: {', '.join(stale)}. Check the worker deploy."
    g = (facts["agents"].get("guardian") or {}).get("decision") or ""
    if "Warnings:" in g:
        return "The Guardian has a warning to resolve: " + g.split("Warnings:", 1)[1].strip()
    return "Nothing needs a decision."


def deterministic_brief(facts: dict[str, Any]) -> str:
    t, w = facts["totals"], facts["latest_window"]
    lines = [
        f"Latest window: {w['sent']} emails sent to {w['contacted']} prospects, {w['replies']} prospect replies, "
        f"{w['meetings']} meetings.",
        f"Totals: {t['scanned']} businesses scanned, {t['kept']} kept, {t['usable']} usable "
        f"({t['usable_rate']:.0%}), {t['contacted']} contacted, {t['replies']} replies, {t['won']} won.",
    ]
    for agent, row in facts["agents"].items():
        lines.append(f"{agent}: {row['status']}. {row['decision']}".strip())
    missing = sorted(agent_log.AGENTS - {AGENT} - set(facts["agents"]))
    if missing:
        lines.append(f"No runs logged yet: {', '.join(missing)}.")
    lines.append("Outbound: HALTED." if facts["outbound_halted"] else "Outbound: open.")
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
