"""Guardian: checks everything before it leaves, so the sender's domain and reputation stay intact.

Runs in the worker in front of every send call (campaigns.py, automation.send_due_follow_ups).
Plain arithmetic, no LLM:

1. Bounces. Per mailbox, over its last BOUNCE_WINDOW outbound messages: failed sends plus sent
   messages whose address is now suppressed as a bounce. Above BOUNCE_HALT_RATE halts, once the
   mailbox has BOUNCE_MIN_SENDS sends (fewer is noise).
2. Caps. Sends per mailbox over the last 24h vs DAILY_SEND_CAP (the CRM's own limit,
   crm/src/lib/email/send.ts), and automatic follow-ups since the start of the team's day vs
   automation_settings.daily_send_cap (the send-follow-ups route counts the same way). Above
   CAP_WARN_RATIO is a warning in the evidence; above the cap halts.
3. Suppressions. No pending recipient of a live campaign may be on email_suppressions.
4. Footer. company_info.address must be set: CAN-SPAM requires a postal address on commercial
   mail. Reported, not halting, until FOOTER_ADDRESS_HALTS is flipped (Eris owns that call).

A halting failure sets system_flags.outbound_halt. Clearing it is a person's job, in the CRM.
Every pass writes one agent_runs row. allow_outbound() is the gate senders call: the full check
runs at most every CHECK_EVERY_S (result cached), the halt flag is read on every call, and any
error fails closed.
"""

from __future__ import annotations

import logging
import os
import threading
import time
from collections import defaultdict
from dataclasses import dataclass, field
from datetime import UTC, datetime, timedelta
from typing import Any
from zoneinfo import ZoneInfo

from leadgen import agent_log, metrics
from leadgen.config import supabase_env
from leadgen.store import Store

log = logging.getLogger(__name__)

AGENT = "guardian"
BOUNCE_WINDOW = 200
BOUNCE_MIN_SENDS = 20
BOUNCE_HALT_RATE = 0.03
CAP_WARN_RATIO = 0.90
DEFAULT_DAILY_SEND_CAP = 400
LIVE_CAMPAIGN_STATUSES = ("scheduled", "sending", "paused")
# The CRM's automatic follow-up sender writes sent_by = 'automation' (send-follow-ups/route.ts).
FOLLOW_UP_SENT_BY = "automation"
# False until Eris provides the postal address: halting now would stop all mail.
FOOTER_ADDRESS_HALTS = False
CHECK_EVERY_S = 300
TEAM_TZ = ZoneInfo("America/Chicago")
# Upper bound on outbound rows read for the bounce window (all mailboxes together).
_OUTBOUND_READ_LIMIT = 5000


@dataclass(frozen=True)
class Finding:
    check: str
    ok: bool
    halts: bool
    detail: str
    numbers: dict[str, Any] = field(default_factory=dict)


def daily_send_cap() -> int:
    """DAILY_SEND_CAP from env, same rule as send.ts positiveInt(): a positive integer or 400."""
    raw = os.environ.get("DAILY_SEND_CAP", "").strip()
    return int(raw) if raw.isdigit() and int(raw) > 0 else DEFAULT_DAILY_SEND_CAP


def _first_address(addresses: str | None) -> str:
    return (addresses or "").split(",")[0].strip().lower()


def _suppressions(store: Store) -> dict[str, str]:
    rows = metrics._all(store, "email_suppressions", {"select": "email,reason"})
    return {r["email"].strip().lower(): str(r.get("reason") or "") for r in rows if r.get("email")}


# --- checks --------------------------------------------------------------------------------------

def check_bounces(store: Store, suppressed: dict[str, str]) -> list[Finding]:
    bounced = {email for email, reason in suppressed.items() if "bounce" in reason.lower()}
    rows = store._req("GET", "email_messages", params={
        "select": "account_id,to_address,status,created_at", "direction": "eq.out",
        "status": "in.(sent,failed)", "order": "created_at.desc", "limit": str(_OUTBOUND_READ_LIMIT),
    }).json()
    per_account: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for r in rows:
        window = per_account[str(r.get("account_id") or "unknown")]
        if len(window) < BOUNCE_WINDOW:
            window.append(r)
    findings = []
    for account, window in sorted(per_account.items()):
        failed = sum(r["status"] == "failed" for r in window)
        late = len({a for r in window if r["status"] == "sent" and (a := _first_address(r["to_address"])) in bounced})
        sends = len(window)
        rate = (failed + late) / sends if sends else 0.0
        enough = sends >= BOUNCE_MIN_SENDS
        bad = enough and rate > BOUNCE_HALT_RATE
        nums = {"account_id": account, "sends": sends, "failed": failed, "bounced_after_send": late,
                "rate": round(rate, 4), "halt_rate": BOUNCE_HALT_RATE, "min_sends": BOUNCE_MIN_SENDS}
        detail = (f"mailbox {account}: {failed + late}/{sends} bounced or failed ({rate:.1%}), "
                  f"limit {BOUNCE_HALT_RATE:.0%}" + ("" if enough else f"; under {BOUNCE_MIN_SENDS} sends, not judged"))
        findings.append(Finding("bounce_rate", not bad, bad, detail, nums))
    return findings


def _start_of_team_day(now: datetime) -> datetime:
    local = now.astimezone(TEAM_TZ)
    return local.replace(hour=0, minute=0, second=0, microsecond=0).astimezone(UTC)


def _cap_finding(check: str, label: str, count: int, cap: int, nums: dict[str, Any]) -> Finding:
    ratio = count / cap if cap > 0 else (float("inf") if count else 0.0)
    over = ratio > 1.0
    warn = ratio > CAP_WARN_RATIO
    state = "over cap" if over else "near cap" if warn else "ok"
    shown = f"{ratio:.0%}" if ratio != float("inf") else "over"
    nums = {**nums, "count": count, "cap": cap, "ratio": round(ratio, 4) if ratio != float("inf") else None,
            "warn": warn and not over}
    return Finding(check, not over, over, f"{label}: {count}/{cap} ({shown}), {state}", nums)


def check_caps(store: Store, now: datetime) -> list[Finding]:
    cap = daily_send_cap()
    since = (now - timedelta(hours=24)).isoformat()
    rows = store._req("GET", "email_messages", params={
        "select": "account_id", "direction": "eq.out", "status": "eq.sent", "created_at": f"gte.{since}",
        "limit": str(_OUTBOUND_READ_LIMIT),
    }).json()
    counts: dict[str, int] = defaultdict(int)
    for r in rows:
        counts[str(r.get("account_id") or "unknown")] += 1
    findings = [_cap_finding("mailbox_cap", f"mailbox {a} sends vs its daily cap", n, cap, {"account_id": a})
                for a, n in sorted(counts.items())]

    settings = store._req("GET", "automation_settings", params={"id": "eq.true", "select": "daily_send_cap"}).json()
    fu_cap = int((settings[0] if settings else {}).get("daily_send_cap", 25))
    fu_rows = store._req("GET", "email_messages", params={
        "select": "id", "direction": "eq.out", "status": "eq.sent", "sent_by": f"eq.{FOLLOW_UP_SENT_BY}",
        "created_at": f"gte.{_start_of_team_day(now).isoformat()}", "limit": str(_OUTBOUND_READ_LIMIT),
    }).json()
    findings.append(_cap_finding("follow_up_cap", "automatic follow-ups vs the follow-up cap",
                                 len(fu_rows), fu_cap, {}))
    return findings


def check_suppressions(store: Store, suppressed: dict[str, str]) -> Finding:
    pending = metrics._all(store, "campaign_recipients", {
        "select": "id,email,campaign_id,email_campaigns!inner(status)", "status": "eq.pending",
        "email_campaigns.status": f"in.({','.join(LIVE_CAMPAIGN_STATUSES)})",
    })
    hits = [r for r in pending if (r.get("email") or "").strip().lower() in suppressed]
    nums = {"pending_recipients": len(pending), "suppressed_pending": len(hits),
            "examples": [{"recipient_id": r["id"], "campaign_id": r["campaign_id"]} for r in hits[:10]]}
    detail = (f"{len(hits)} of {len(pending)} pending campaign recipients are suppressed" if hits
              else f"0 of {len(pending)} pending campaign recipients are suppressed")
    return Finding("suppressions", not hits, bool(hits), detail, nums)


def check_footer(store: Store) -> Finding:
    rows = store._req("GET", "company_info", params={"id": "eq.true", "select": "address"}).json()
    address = ((rows[0] if rows else {}).get("address") or "").strip()
    if address:
        return Finding("footer_address", True, False, "postal address set for the CAN-SPAM footer")
    return Finding("footer_address", False, FOOTER_ADDRESS_HALTS,
                   "WARNING: no postal address: CAN-SPAM footer cannot be sent",
                   {"halts": FOOTER_ADDRESS_HALTS})


def run_checks(store: Store, now: datetime) -> list[Finding]:
    suppressed = _suppressions(store)
    return [*check_bounces(store, suppressed), *check_caps(store, now),
            check_suppressions(store, suppressed), check_footer(store)]


# --- one pass ------------------------------------------------------------------------------------

def run_once(store: Store, now: datetime | None = None) -> bool:
    """One logged Guardian pass. True when outbound may proceed."""
    now = now or datetime.now(UTC)
    with agent_log.agent_run(store, AGENT) as run:
        if agent_log.outbound_halted(store):
            run.status = "halted"
            run.decision = "Outbound is already halted; checks skipped. A person clears the halt in the CRM."
            run.evidence = {"already_halted": True}
            return False
        findings = run_checks(store, now)
        halting = [f for f in findings if f.halts]
        warnings = [f.detail for f in findings if not f.ok and not f.halts]
        warnings += [f.detail for f in findings if f.numbers.get("warn")]
        run.evidence = {
            "checks": [{"check": f.check, "ok": f.ok, "halts": f.halts, "detail": f.detail, **f.numbers} for f in findings],
            "halted_by": [f.detail for f in halting],
            "warnings": warnings,
        }
        if halting:
            agent_log.set_halt(store, AGENT)
            run.status = "halted"
            run.decision = "Halted outbound: " + "; ".join(f.detail for f in halting)
            log.warning("guardian halted outbound: %s", run.decision)
            return False
        run.decision = "Outbound may proceed." + (" Warnings: " + "; ".join(warnings) if warnings else "")
        return True


# --- the gate senders call -----------------------------------------------------------------------

_lock = threading.Lock()
_cache: dict[str, float | bool] = {}
_clock = time.monotonic


def reset_cache() -> None:
    with _lock:
        _cache.clear()


def allow_outbound(store: Store, now: datetime | None = None) -> bool:
    """True when a send call may go ahead. Full check at most every CHECK_EVERY_S, halt flag every
    call. Any error (unreadable flag, missing table, failed check) fails closed."""
    with _lock:
        at = _cache.get("at")
        if at is None or _clock() - float(at) >= CHECK_EVERY_S:
            try:
                ok = run_once(store, now)
            except Exception:
                log.exception("guardian pass failed; outbound held until the next pass")
                ok = False
            _cache.update(at=_clock(), ok=ok)
        ok = bool(_cache["ok"])
    if agent_log.outbound_halted(store):
        return False
    return ok


_default_store: Store | None = None


def default_store() -> Store | None:
    """A Store from SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY for senders that don't carry one."""
    global _default_store
    if _default_store is None:
        env = supabase_env()
        if env is not None:
            _default_store = Store(*env)
    return _default_store
