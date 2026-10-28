"""Notify: gets the crew's output to Eris by email instead of leaving it on the /admin/ops board.

Three internal notices, each plain text and short:

1. brief  - Mission Control's daily brief, once it is written (the newest finished mission-control
            agent_runs row, if it is under BRIEF_MAX_AGE old).
2. halt   - the Guardian (or anyone) set system_flags.outbound_halt: what tripped it, in plain words,
            and that Eris clears it on /admin/ops.
3. reply  - a real prospect reply arrived: an inbound message on a lead with source 'lead-gen' that
            is not an auto-reply (metrics.py's rule) and not a bounce notice (BOUNCE_SUBJECT, a notify-only
            filter). Business name, subject and a link to the lead. Never the message body.

These are not outreach. They go out through Graph sendMail from MS_APP_MAILBOX (the app-only
client the Outlook sync already uses, Mail.Send application permission) to NOTIFY_TO, skip the
Guardian and the send caps, and are never written to email_messages (saveToSentItems is off, so
the Outlook sync never sees a Sent copy either). Without credentials the pass logs once and skips.

Idempotency lives in public.sent_notices: the key ('brief:<agent_run id>', 'halt:<updated_at>',
'reply:<message id>') is inserted before the send, so a unique conflict means it was already
handled. An explicit HTTP error from Graph is recorded 'failed' and retried on later passes up to
MAX_ATTEMPTS. No response at all (a timeout or dropped connection on sendMail) means Graph may have
accepted it, so the row stays 'pending' with a note and is never retried, same as a crash
mid-send: a missed notice beats a double one. On its first
run the pass seeds a reply watermark, so replies received before notify existed are not alerted.

Notify is plumbing, not a crew member, so it does not write agent_runs rows (the board and the
brief list the five agents); it logs normally and the notices table is its record.
"""

from __future__ import annotations

import logging
import os
import re
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from typing import Any

import httpx

from leadgen import agent_log, metrics, mission_control
from leadgen.automation import TEAM_TZ
from leadgen.copy_rules import scrub_time_words
from leadgen.outlook_sync import GRAPH, GraphClient, app_mailbox, ms_credentials
from leadgen.store import Store, StoreError

log = logging.getLogger(__name__)

TABLE = "sent_notices"
DEFAULT_TO = "eris@golaunchcontrol.com"
DEFAULT_CRM_URL = "https://crm.golaunchcontrol.com"
MAX_ATTEMPTS = 3
# Only the newest brief is a candidate, and only while it is fresh: a redeploy never mails an old one.
BRIEF_MAX_AGE = timedelta(hours=20)
# Replies are looked for after the watermark, and never further back than this (bounds the query
# and the retries of a failed alert).
REPLY_LOOKBACK = timedelta(days=3)
WATERMARK_KEY = "watermark:reply"
_CHUNK = 80
FOOTER = "Internal notice from the Launch Control worker."
# Delivery reports filed on a lead's thread. Not a prospect reply, though metrics.py's rule counts them.
BOUNCE_SUBJECT = re.compile(
    r"^\s*(undeliverable|undelivered mail|delivery status notification|delivery (has )?failed|"
    r"delivery failure|mail delivery (failed|failure|subsystem)|returned mail|failure notice|"
    r"mail system error|non[- ]?delivery)",
    re.I,
)

# What each halting Guardian check means, for someone who didn't write the Guardian.
PLAIN_CHECKS = {
    "bounce_rate": "Too many emails from one mailbox bounced or failed",
    "mailbox_cap": "A mailbox went over its send cap",
    "follow_up_cap": "Automatic follow-ups went over their cap",
    "suppressions": "A live campaign still has recipients who opted out or bounced",
    "footer_address": "There is no postal address for the email footer",
}


class SendUnknown(Exception):
    """sendMail got no HTTP response: Graph may or may not have accepted the message."""


@dataclass(frozen=True)
class Notice:
    key: str
    kind: str
    subject: str
    body: str


# --- config + sending ----------------------------------------------------------------------------

def recipients() -> list[str]:
    raw = os.environ.get("NOTIFY_TO", "").strip() or DEFAULT_TO
    return [a.strip() for a in raw.split(",") if "@" in a.strip()]


def crm_url() -> str:
    return (os.environ.get("CRM_URL", "").strip() or DEFAULT_CRM_URL).rstrip("/")


class Mailer:
    """Graph sendMail from the app mailbox. Raises on a non-2xx (retryable) and SendUnknown when the
    request got no response (not retryable: it may have gone out)."""

    def __init__(self, graph: GraphClient, mailbox: str, to: list[str]) -> None:
        self.graph, self.mailbox, self.to = graph, mailbox, to

    def send(self, subject: str, body: str) -> None:
        token = self.graph.app_token()  # a failure here never reached sendMail, so it is retryable
        try:
            resp = self._post(token, subject, body)
        except httpx.TransportError as exc:
            raise SendUnknown(type(exc).__name__) from exc
        if resp.status_code >= 300:
            try:
                why = resp.json().get("error", {}).get("message") or resp.status_code
            except ValueError:
                why = resp.status_code
            raise RuntimeError(f"Graph sendMail {resp.status_code}: {str(why)[:200]}")

    def _post(self, token: str, subject: str, body: str) -> httpx.Response:
        return self.graph.http.post(
            f"{GRAPH}/users/{self.mailbox}/sendMail",
            headers={"Authorization": f"Bearer {token}", "Content-Type": "application/json"},
            json={
                "message": {
                    "subject": subject,
                    "body": {"contentType": "Text", "content": body},
                    "toRecipients": [{"emailAddress": {"address": a}} for a in self.to],
                },
                # No Sent copy: the Outlook sync would mirror it into the CRM's messages table.
                "saveToSentItems": False,
            },
        )


_mailer: Mailer | None = None
_warned = False


def default_mailer() -> Mailer | None:
    """The app-only mailer from env, built once. None (logged once) when anything is missing."""
    global _mailer, _warned
    if _mailer is not None:
        return _mailer
    creds, box, to = ms_credentials(), app_mailbox(), recipients()
    if creds is None or not box or not to:
        if not _warned:
            log.warning("notify off: needs MS_CLIENT_ID / MS_CLIENT_SECRET / MS_TENANT_ID, MS_APP_MAILBOX "
                        "and a valid NOTIFY_TO")
            _warned = True
        return None
    _mailer = Mailer(GraphClient(*creds, http=httpx.Client(timeout=30)), box, to)
    return _mailer


# --- the notices table ---------------------------------------------------------------------------

def _now() -> str:
    return datetime.now(UTC).isoformat()


def _parse(ts: str) -> datetime:
    return datetime.fromisoformat(ts.replace("Z", "+00:00"))


def _row(store: Store, key: str) -> dict[str, Any] | None:
    rows = store._req("GET", TABLE, params={"key": f"eq.{key}", "select": "*"}).json()
    return rows[0] if rows else None


def claim(store: Store, notice: Notice) -> bool:
    """True when this pass owns the send: the key is new, or it failed before and has retries left."""
    rows = store._req("POST", TABLE, params={"on_conflict": "key"},
                      prefer="resolution=ignore-duplicates,return=representation",
                      json={"key": notice.key, "kind": notice.kind, "status": "pending", "attempts": 1}).json()
    if rows:
        return True
    row = _row(store, notice.key)
    if not row or row.get("status") != "failed" or int(row.get("attempts") or 0) >= MAX_ATTEMPTS:
        return False
    attempts = int(row["attempts"])
    # Conditional on the attempts we read, so two passes can't both take the retry.
    taken = store._req("PATCH", TABLE, params={"key": f"eq.{notice.key}", "status": "eq.failed",
                                               "attempts": f"eq.{attempts}"},
                       prefer="return=representation",
                       json={"status": "pending", "attempts": attempts + 1, "updated_at": _now()}).json()
    return bool(taken)


def deliver(store: Store, mailer: Mailer, notice: Notice) -> bool:
    """Claim, send, record. True when it was sent on this call."""
    if not claim(store, notice):
        return False
    try:
        mailer.send(notice.subject, notice.body)
    except SendUnknown as exc:
        # Left 'pending' on purpose: claim() never retries a pending row.
        log.warning("notice %s: no response from Graph (%s); may have gone out, not retried", notice.key, exc)
        store._req("PATCH", TABLE, params={"key": f"eq.{notice.key}"}, prefer="return=minimal",
                   json={"last_error": f"sent-unknown: no response from Graph ({exc}); not retried",
                         "updated_at": _now()})
        return False
    except Exception as exc:
        log.warning("notice %s failed to send: %s", notice.key, str(exc)[:200])
        store._req("PATCH", TABLE, params={"key": f"eq.{notice.key}"}, prefer="return=minimal",
                   json={"status": "failed", "last_error": f"{type(exc).__name__}: {exc}"[:300], "updated_at": _now()})
        return False
    store._req("PATCH", TABLE, params={"key": f"eq.{notice.key}"}, prefer="return=minimal",
               json={"status": "sent", "sent_at": _now(), "last_error": None, "updated_at": _now()})
    log.info("notice %s sent", notice.key)
    return True


def reply_watermark(store: Store, now: datetime) -> datetime:
    """When notify first ran. Seeded on the first call; replies received before it are never alerted."""
    row = _row(store, WATERMARK_KEY)
    if row is None:
        store._req("POST", TABLE, params={"on_conflict": "key"}, prefer="resolution=ignore-duplicates,return=minimal",
                   json={"key": WATERMARK_KEY, "kind": "watermark", "status": "sent", "attempts": 0,
                         "created_at": now.isoformat()})
        row = _row(store, WATERMARK_KEY)
        log.info("notify: reply watermark seeded; earlier replies will not be alerted")
    return _parse(row["created_at"]) if row and row.get("created_at") else now


# --- 1. the brief --------------------------------------------------------------------------------

def brief_notice(row: dict[str, Any]) -> Notice | None:
    text, _removed = scrub_time_words(row.get("decision") or "")
    if not text:
        return None
    date = _parse(row["started_at"]).astimezone(TEAM_TZ).date().isoformat()
    body = f"{text}\n\nThe full board: {crm_url()}/admin/ops\n\n{FOOTER}"
    return Notice(f"brief:{row['id']}", "brief", f"Mission Control brief, {date}", body)


def send_brief(store: Store, mailer: Mailer | None = None, now: datetime | None = None) -> bool:
    """Mail the newest finished brief once. Called by the worker after the Mission Control pass."""
    mailer = mailer or default_mailer()
    if mailer is None:
        return False
    now = now or datetime.now(UTC)
    row = mission_control.last_row(store, mission_control.AGENT, finished_only=True)
    if row is None or now - _parse(row["started_at"]) > BRIEF_MAX_AGE:
        return False
    notice = brief_notice(row)
    return notice is not None and deliver(store, mailer, notice)


# --- 2. the halt ---------------------------------------------------------------------------------

def _plain_reason(check: dict[str, Any]) -> str:
    name = check.get("check") or ""
    base = PLAIN_CHECKS.get(name, "A safety check failed")
    if name == "bounce_rate":
        bad = int(check.get("failed") or 0) + int(check.get("bounced_after_send") or 0)
        return f"{base}: {bad} of the last {check.get('sends')} ({float(check.get('rate') or 0):.1%}; the limit is " \
               f"{float(check.get('halt_rate') or 0):.0%})."
    if name in ("mailbox_cap", "follow_up_cap"):
        return f"{base}: {check.get('count')} sent against a cap of {check.get('cap')}."
    if name == "suppressions":
        return f"{base}: {check.get('suppressed_pending')} of {check.get('pending_recipients')} pending recipients."
    return f"{base}."


def halt_reasons(store: Store) -> list[str]:
    """Plain-words reasons from the Guardian's newest row that actually tripped the halt."""
    rows = store._req("GET", "agent_runs", params={
        "select": "decision,evidence", "agent": "eq.guardian", "status": "eq.halted",
        "order": "started_at.desc", "limit": "10",
    }).json()
    tripped = next((r for r in rows if (r.get("evidence") or {}).get("halted_by")), None)
    if tripped is None:
        return []
    checks = [c for c in (tripped["evidence"].get("checks") or []) if c.get("halts") and not c.get("ok")]
    reasons = [_plain_reason(c) for c in checks]
    if not reasons:
        clean, _removed = scrub_time_words(tripped.get("decision") or "")
        reasons = [clean] if clean else []
    return reasons


def halt_notice(store: Store, flag: dict[str, Any]) -> Notice:
    by = str(flag.get("updated_by") or "")
    reasons = halt_reasons(store) if by in ("", "guardian") else []
    who = "The Guardian stopped all outbound email." if by in ("", "guardian") else \
        f"Outbound email was stopped (set by {by})."
    lines = [who, ""]
    if reasons:
        lines += ["What tripped it:", *[f"- {r}" for r in reasons], ""]
    else:
        lines += ["The reason is in the Guardian's latest row on the board.", ""]
    lines += ["Nothing goes out until you clear the halt. Review it and clear it on the ops board:",
              f"{crm_url()}/admin/ops"]
    body, _removed = scrub_time_words("\n".join(lines))
    return Notice(f"halt:{flag.get('updated_at') or 'unknown'}", "halt", "Outbound halted", f"{body}\n\n{FOOTER}")


def check_halt(store: Store, mailer: Mailer) -> bool:
    rows = store._req("GET", "system_flags", params={
        "key": f"eq.{agent_log.HALT_KEY}", "select": "value,updated_at,updated_by"}).json()
    if not rows or rows[0].get("value") is not True:
        return False
    return deliver(store, mailer, halt_notice(store, rows[0]))


# --- 3. prospect replies -------------------------------------------------------------------------

def is_bounce(subject: str | None) -> bool:
    return bool(BOUNCE_SUBJECT.match(subject or ""))


def _prospect_names(store: Store, lead_ids: list[str]) -> dict[str, str]:
    """lead id -> business name, for the ids that are lead-gen prospects."""
    out: dict[str, str] = {}
    ids = sorted(set(lead_ids))
    for i in range(0, len(ids), _CHUNK):
        rows = store._req("GET", "leads", params={
            "select": "id,business_name", "id": f"in.({','.join(ids[i:i + _CHUNK])})",
            "source": f"eq.{metrics.PROSPECT_SOURCE}",
        }).json()
        out.update({str(r["id"]): (r.get("business_name") or "").strip() for r in rows})
    return out


def reply_notice(message: dict[str, Any], business: str) -> Notice:
    # The business name and subject are the prospect's own words, not generated copy: not scrubbed.
    name = business or "A prospect"
    subject = (message.get("subject") or "").strip() or "(no subject)"
    body = (f"{name} replied.\n\nSubject: {subject}\n\nOpen the lead in the CRM to read it and answer:\n"
            f"{crm_url()}/admin/leads/{message['lead_id']}\n\n{FOOTER}")
    return Notice(f"reply:{message['id']}", "reply", f"Prospect reply: {name}", body)


def prospect_replies(store: Store, since: datetime) -> list[tuple[dict[str, Any], str]]:
    """(message, business name) for each real prospect reply received at or after `since`, oldest first.
    Same rule as metrics.snapshot (inbound, on a lead-gen lead, not an auto-reply), minus bounce notices."""
    msgs = metrics._all(store, "email_messages", {
        "select": "id,lead_id,direction,subject,created_at", "direction": "eq.in", "lead_id": "not.is.null",
        "created_at": f"gte.{since.isoformat()}",
    })
    msgs = [m for m in msgs if not metrics.is_auto_reply(m.get("subject")) and not is_bounce(m.get("subject"))]
    names = _prospect_names(store, [str(m["lead_id"]) for m in msgs]) if msgs else {}
    hits = [(m, names[str(m["lead_id"])]) for m in msgs if str(m["lead_id"]) in names]
    return sorted(hits, key=lambda h: str(h[0].get("created_at") or ""))


def check_replies(store: Store, mailer: Mailer, now: datetime) -> int:
    since = max(reply_watermark(store, now), now - REPLY_LOOKBACK)
    return sum(deliver(store, mailer, reply_notice(m, name)) for m, name in prospect_replies(store, since))


# --- the crew-pass entry point -------------------------------------------------------------------

def check_alerts(store: Store, mailer: Mailer | None = None, now: datetime | None = None) -> dict[str, int]:
    """The halt and reply checks, each isolated so one failing never blocks the other."""
    mailer = mailer or default_mailer()
    if mailer is None:
        return {}
    now = now or datetime.now(UTC)
    sent = {"halt": 0, "reply": 0}
    try:
        sent["halt"] = int(check_halt(store, mailer))
    except (StoreError, httpx.HTTPError, KeyError, ValueError):
        log.exception("notify: halt check failed")
    try:
        sent["reply"] = check_replies(store, mailer, now)
    except (StoreError, httpx.HTTPError, KeyError, ValueError):
        log.exception("notify: reply check failed")
    return sent
