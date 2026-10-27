"""Strategist: learns what's working from the client's own numbers, and only proposes.

Once per STRATEGY_EVERY, per leads.segment: prospects contacted, prospect replies, replied leads,
reply rate and meetings, all on metrics.py's definitions (prospects only, sent = outbound with
status sent, replies exclude auto-replies). Below MIN_CONTACTED contacted or MIN_REPLIES replies
there is nothing honest to conclude: the decision is "insufficient data" with the counts, and no
LLM call is made. Otherwise one LLM call proposes changes backed by those numbers.

Proposals only. It never edits config.yaml, never changes score weights, never touches a lead.
There is no motorsport-vs-freight test: no freight list exists.
"""

from __future__ import annotations

import json
import logging
from collections import defaultdict
from datetime import UTC, datetime, timedelta
from typing import Any

from leadgen import agent_log, metrics
from leadgen.automation import MODEL, Writer
from leadgen.mission_control import default_writer, last_row, scrub_time_words
from leadgen.store import Store

log = logging.getLogger(__name__)

AGENT = "strategist"
STRATEGY_EVERY = timedelta(days=7)
MIN_CONTACTED = 50
MIN_REPLIES = 5
UNSEGMENTED = "(none)"

SYSTEM = (
    "You are the Strategist for Launch Control's outbound. You get reply numbers per lead segment. "
    "Propose at most three changes (which segments to aim at more or less, messaging angles to test), "
    "each with the exact numbers behind it. These are proposals for a person to approve; do not "
    "claim anything was changed. Never invent numbers. Never mention time, duration or speed. "
    "Plain text, at most 150 words."
)


def due(store: Store, now: datetime) -> bool:
    row = last_row(store, AGENT)
    return row is None or now - datetime.fromisoformat(row["started_at"].replace("Z", "+00:00")) >= STRATEGY_EVERY


def by_segment(store: Store) -> dict[str, dict[str, Any]]:
    leads = metrics.prospects(store)
    segment = {x["id"]: x.get("segment") or UNSEGMENTED for x in leads}
    msgs = metrics._all(store, "email_messages", {"select": "lead_id,direction,status,subject"})
    meetings = metrics._all(store, "calendar_events", {"select": "lead_id", "lead_id": "not.is.null"})
    contacted: dict[str, set[str]] = defaultdict(set)
    replied: dict[str, set[str]] = defaultdict(set)
    replies: dict[str, int] = defaultdict(int)
    for m in msgs:
        seg = segment.get(m["lead_id"])
        if seg is None:
            continue
        if m["direction"] == "out" and m["status"] == "sent":
            contacted[seg].add(m["lead_id"])
        elif m["direction"] == "in" and not metrics.is_auto_reply(m["subject"]):
            replies[seg] += 1
            replied[seg].add(m["lead_id"])
    met: dict[str, int] = defaultdict(int)
    for e in meetings:
        if e["lead_id"] in segment:
            met[segment[e["lead_id"]]] += 1
    out = {}
    for seg in sorted(set(segment.values())):
        n = len(contacted[seg])
        out[seg] = {"prospects": sum(s == seg for s in segment.values()), "contacted": n,
                    "replies": replies[seg], "replied_leads": len(replied[seg]),
                    "reply_rate": round(len(replied[seg]) / n, 4) if n else 0.0, "meetings": met[seg]}
    return out


def run_weekly(store: Store, now: datetime | None = None, writer: Writer | None = None,
               use_default_writer: bool = True) -> str | None:
    """This period's proposal, if due. Returns the decision text, or None when not due."""
    now = now or datetime.now(UTC)
    if not due(store, now):
        return None
    with agent_log.agent_run(store, AGENT) as run:
        segments = by_segment(store)
        contacted = sum(s["contacted"] for s in segments.values())
        replies = sum(s["replies"] for s in segments.values())
        run.evidence = {"segments": segments, "contacted": contacted, "replies": replies,
                        "min_contacted": MIN_CONTACTED, "min_replies": MIN_REPLIES}
        if contacted < MIN_CONTACTED or replies < MIN_REPLIES:
            run.decision = f"insufficient data: n={contacted}, replies={replies}; keep sending"
            return run.decision
        writer = writer or (default_writer() if use_default_writer else None)
        if writer is None:
            run.decision = (f"enough data (n={contacted}, replies={replies}) but no ANTHROPIC_API_KEY to write "
                            "proposals; per-segment numbers are in the evidence")
            return run.decision
        text = writer.write(SYSTEM, "Per-segment numbers (JSON):\n" + json.dumps(segments, indent=1))
        clean, removed = scrub_time_words(text)
        run.evidence["writer"] = MODEL
        run.evidence["time_words_removed"] = removed
        run.decision = "Proposals (not applied): " + (clean or "none written")
        return run.decision
