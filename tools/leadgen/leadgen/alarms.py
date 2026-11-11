"""Alarms: tell Eris when a recurring worker job keeps failing, once, and again when it recovers.

The worker's loops swallow their own errors so one bad pass never kills a thread. The cost is that
a job can fail on every pass with nobody told: a stale MS_CLIENT_SECRET (Outlook sync got 401 from
Microsoft on every pass) and a missing AUTOMATION_SECRET on the CRM (every campaign call got 401)
both went unnoticed that way. Each watched job now reports every pass here:

    alarms.record(store, alarms.CAMPAIGNS, exc_or_None)

After FAIL_THRESHOLD consecutive failures one notice goes out naming the job, the error class (HTTP
status and host, or exception type, plus an OAuth/Graph error code when there is one; never a
response body, token or secret) and the likely fix, in plain words. No repeat while it keeps
failing. The first success after an alarm sends one short "working again" notice.

State is one worker_heartbeats row per job, named "alarm:<job>", so a worker restart neither
re-alerts nor forgets an open alarm. Mission Control skips these rows when it looks for stopped
loops (they are written on change, not on a beat). State is cached in memory too, so a database
outage still alarms (the write is best effort). A notice that fails to send is retried on the
next failing pass; "no response" from Graph counts as sent, like notify.deliver.

Sending reuses notify's Mailer (Graph sendMail from MS_APP_MAILBOX). The gap: when the Microsoft
app credentials themselves are broken, that path is broken too, so the alarm also goes to the log
at ERROR on every pass past the threshold until it is delivered.
"""

from __future__ import annotations

import json
import logging
import re
import threading
from dataclasses import dataclass, replace
from datetime import UTC, datetime
from typing import TYPE_CHECKING, Any
from urllib.parse import urlsplit

import httpx

from leadgen.copy_rules import scrub_time_words
from leadgen.store import Store, StoreError

if TYPE_CHECKING:
    from leadgen.notify import Mailer

log = logging.getLogger(__name__)

FAIL_THRESHOLD = 3
PREFIX = "alarm:"
TABLE = "worker_heartbeats"

# Job keys. Per-mailbox jobs use outlook_job() / gmail_job().
CAMPAIGNS = "campaigns"
FOLLOW_UPS = "follow-ups"
MEETINGS = "meetings"

TOKEN_HOSTS = {"login.microsoftonline.com": "microsoft", "oauth2.googleapis.com": "google"}
_SAFE_CODE = re.compile(r"^[A-Za-z0-9_.\-]{1,60}$")
_AADSTS = re.compile(r"AADSTS\d{4,7}")
_BEARER = re.compile(r"(?i)bearer\s+\S+")
_LONG_TOKEN = re.compile(r"[A-Za-z0-9_\-.~+/=]{24,}")
_STORE_STATUS = re.compile(r"-> (\d{3})")


def outlook_job(address: str) -> str:
    return f"outlook:{(address or 'unknown').strip().lower()}"


def gmail_job(address: str) -> str:
    return f"gmail:{(address or 'unknown').strip().lower()}"


# --- what went wrong ------------------------------------------------------------------------------

@dataclass(frozen=True)
class Failure:
    """A failed pass, reduced to what is safe to email: never a response body, token or secret."""

    category: str  # auth | forbidden | not_found | server | http | network | config | database | other
    error_class: str  # "HTTP 401 from crm.golaunchcontrol.com", "ConnectTimeout", ...
    status: int | None = None
    host: str = ""
    code: str = ""


def _safe(text: str, limit: int = 120) -> str:
    text = _BEARER.sub("Bearer [redacted]", text)
    return _LONG_TOKEN.sub("[redacted]", text).strip()[:limit]


def _error_code(resp: httpx.Response) -> str:
    """An OAuth error ('invalid_client', plus the AADSTS number) or a Graph error code, if any."""
    try:
        body = resp.json()
    except (ValueError, UnicodeDecodeError):
        return ""
    if not isinstance(body, dict):
        return ""
    err = body.get("error")
    parts: list[str] = []
    if isinstance(err, str):
        parts.append(err)
        aad = _AADSTS.search(str(body.get("error_description") or ""))
        if aad:
            parts.append(aad.group(0))
    elif isinstance(err, dict) and isinstance(err.get("code"), str):
        parts.append(err["code"])
    return " ".join(p for p in parts if _SAFE_CODE.match(p))


def classify(exc: BaseException) -> Failure:
    if isinstance(exc, httpx.HTTPStatusError):
        status = exc.response.status_code
        host = (urlsplit(str(exc.request.url)).hostname or "").lower()
        code = _error_code(exc.response)
        label = f"HTTP {status} from {host}" + (f" ({code})" if code else "")
        if host in TOKEN_HOSTS and status in (400, 401):
            cat = "auth"
        elif status == 401:
            cat = "auth"
        elif status == 403:
            cat = "forbidden"
        elif status == 404:
            cat = "not_found"
        elif status >= 500:
            cat = "server"
        else:
            cat = "http"
        return Failure(cat, label, status, host, code)
    if isinstance(exc, httpx.TransportError):
        host = ""
        try:
            host = (urlsplit(str(exc.request.url)).hostname or "").lower()
        except RuntimeError:  # no request attached
            pass
        return Failure("network", type(exc).__name__ + (f" reaching {host}" if host else ""), host=host)
    if isinstance(exc, StoreError):
        m = _STORE_STATUS.search(str(exc))
        return Failure("database", f"Supabase error ({m.group(1) if m else 'no response'})",
                       int(m.group(1)) if m else None)
    if isinstance(exc, RuntimeError) and "CRM_URL" in str(exc):
        return Failure("config", "CRM_URL is not set")
    return Failure("other", _safe(f"{type(exc).__name__}: {exc}"))


# --- plain-English copy ---------------------------------------------------------------------------

@dataclass(frozen=True)
class JobCopy:
    broken: str  # the headline: what is broken
    what: str  # which call failed
    means: str  # what it means for the business


def _job_copy(job: str) -> JobCopy:
    kind, _, who = job.partition(":")
    if kind == CAMPAIGNS:
        return JobCopy("Campaign emails are not sending.",
                       "the worker's call to the CRM's campaign sender (/api/automation/send-campaigns)",
                       "Campaigns that are scheduled or sending are stuck. No campaign email and no campaign "
                       "follow-up goes out until this is fixed.")
    if kind == FOLLOW_UPS:
        return JobCopy("Automatic follow-up emails are not sending.",
                       "the worker's call to the CRM's follow-up sender (/api/automation/send-follow-ups)",
                       "Approved follow-ups that are due stay queued. None go out until this is fixed.")
    if kind == MEETINGS:
        return JobCopy("Outlook calendar meetings are not reaching the CRM.",
                       "the worker's read of the Outlook calendar",
                       "New meetings with leads won't appear on their pages in the CRM.")
    if kind == "outlook":
        return JobCopy(f"New mail in {who} is not reaching the CRM.",
                       f"the worker's Outlook sync for {who}",
                       "Prospect replies don't show in the CRM Inbox, reply alerts and drafted answers stop, "
                       "and bounce reports aren't read, so dead addresses aren't blocked.")
    if kind == "gmail":
        return JobCopy(f"Replies in the Gmail account {who} are not reaching the CRM.",
                       f"the worker's Gmail sync for {who}",
                       "Replies to emails sent from that Gmail account won't show on the lead in the CRM.")
    return JobCopy(f"A worker job ({job}) keeps failing.", f"the worker job {job}", "That job is not doing its work.")


_DB_FIX = ("The worker can't use the database. Check that the Supabase project is up and that SUPABASE_URL and "
           "SUPABASE_SERVICE_ROLE_KEY on Railway are right.")
_MS_SECRET_FIX = ("Microsoft refused the worker's sign-in. The MS_CLIENT_SECRET on Railway is most likely expired "
                  "or wrong. Make a new client secret in Azure (App registrations, Certificates & secrets), put it "
                  "in MS_CLIENT_SECRET on Railway, and on Vercel too if the CRM uses the same app.")


def _crm_fix(f: Failure, route: str) -> str:
    if f.category == "auth" or f.category == "forbidden":
        return ("The CRM refused the worker's key. The AUTOMATION_SECRET on Vercel (the CRM project) is missing or "
                "does not match the one on Railway (the worker). Set both to the same value, then redeploy the CRM.")
    if f.category == "not_found":
        return ("The worker is calling an address the CRM doesn't answer. Check CRM_URL on Railway; it should be "
                "the CRM's address, such as https://crm.golaunchcontrol.com.")
    if f.category == "server":
        return f"The CRM hit an error of its own. Look at the CRM's logs on Vercel for {route}."
    if f.category == "network":
        return "The worker can't reach the CRM. Check that the CRM is up and that CRM_URL on Railway is right."
    if f.category == "config":
        return "CRM_URL is not set on Railway. Set it to the CRM's address, such as https://crm.golaunchcontrol.com."
    return f"Look at the worker's logs on Railway and the CRM's logs on Vercel for {route}."


def _fix(job: str, f: Failure) -> str:
    kind = job.partition(":")[0]
    if f.category == "database":
        return _DB_FIX
    if kind == CAMPAIGNS:
        return _crm_fix(f, "/api/automation/send-campaigns")
    if kind == FOLLOW_UPS:
        return _crm_fix(f, "/api/automation/send-follow-ups")
    if kind in (MEETINGS, "outlook"):
        if f.category == "auth":
            return _MS_SECRET_FIX
        if f.category == "forbidden":
            perm = "Calendars.ReadWrite" if kind == MEETINGS else "Mail.ReadWrite"
            return (f"Microsoft refused access to the mailbox. In Azure (App registrations, API permissions) the app "
                    f"needs the {perm} application permission with admin consent, and MS_APP_MAILBOX on Railway must "
                    f"be a mailbox the app is allowed to read.")
        if f.category in ("server", "network"):
            return ("Microsoft's side is failing or unreachable. If it doesn't clear up by itself, check the "
                    "Microsoft 365 status page.")
        return "Look at the worker's logs on Railway for the Outlook sync."
    if kind == "gmail":
        if f.category in ("auth", "forbidden"):
            return ("Google refused the sign-in. Reconnect the Gmail account in the CRM's settings; if that doesn't "
                    "help, check GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET on Railway.")
        return "Look at the worker's logs on Railway for the Gmail sync."
    return "Look at the worker's logs on Railway."


def _ops_link() -> str:
    from leadgen.notify import crm_url

    return f"{crm_url()}/admin/ops"


def alarm_notice(job: str, f: Failure, failures: int) -> tuple[str, str]:
    from leadgen.notify import FOOTER

    c = _job_copy(job)
    lines = [
        c.broken, "",
        f"What failed: {c.what}, {failures} times in a row. Error: {f.error_class}.", "",
        f"What it means: {c.means}", "",
        f"Likely fix: {_fix(job, f)}", "",
        "You'll get one more email when it works again. No repeats until then.",
        f"Ops board: {_ops_link()}",
    ]
    body, _removed = scrub_time_words("\n".join(lines))
    return f"Alarm: {c.broken.rstrip('.')}", f"{body}\n\n{FOOTER}"


def recovered_notice(job: str) -> tuple[str, str]:
    from leadgen.notify import FOOTER

    c = _job_copy(job)
    body, _removed = scrub_time_words(f"Working again: {c.what} succeeded after the earlier alarm. "
                                      f"Nothing else to do.\n\nOps board: {_ops_link()}")
    return f"Recovered: {c.broken.rstrip('.').replace(' not ', ' ')}", f"{body}\n\n{FOOTER}"


# --- state ----------------------------------------------------------------------------------------

@dataclass(frozen=True)
class State:
    failures: int = 0
    alerted: bool = False
    last_error: str = ""
    first_failed_at: str = ""

    def detail(self) -> dict[str, Any]:
        return {"kind": "alarm", "failures": self.failures, "alerted": self.alerted,
                "last_error": self.last_error, "first_failed_at": self.first_failed_at or None}


_lock = threading.Lock()
_cache: dict[str, State] = {}


def reset() -> None:
    """Forget the in-memory state (tests)."""
    with _lock:
        _cache.clear()


def _load(store: Store, job: str) -> State:
    with _lock:
        if job in _cache:
            return _cache[job]
    state = State()
    try:
        rows = store._req("GET", TABLE, params={"name": f"eq.{PREFIX}{job}", "select": "detail"}).json()
        d = (rows[0].get("detail") or {}) if rows else {}
        if isinstance(d, str):
            d = json.loads(d)
        state = State(int(d.get("failures") or 0), bool(d.get("alerted")), str(d.get("last_error") or ""),
                      str(d.get("first_failed_at") or ""))
    except Exception:
        log.warning("alarm state for %s unreadable; starting from zero", job, exc_info=True)
    with _lock:
        return _cache.setdefault(job, state)


def _save(store: Store, job: str, state: State) -> None:
    with _lock:
        _cache[job] = state
    try:
        store._req("POST", TABLE, params={"on_conflict": "name"}, prefer="resolution=merge-duplicates,return=minimal",
                   json={"name": f"{PREFIX}{job}", "beat_at": datetime.now(UTC).isoformat(), "detail": state.detail()})
    except Exception:
        log.warning("alarm state for %s not saved (kept in memory)", job, exc_info=True)


def _send(mailer: Mailer | None, subject: str, body: str) -> bool:
    """True when the notice went out (or may have: no response from Graph is never resent)."""
    from leadgen.notify import SendUnknown, default_mailer

    mailer = mailer or default_mailer()
    if mailer is None:
        return False
    try:
        mailer.send(subject, body)
    except SendUnknown:
        log.warning("alarm notice %r: no response from Graph; may have gone out, not resent", subject)
        return True
    except Exception as exc:
        log.warning("alarm notice %r failed to send: %s", subject, classify(exc).error_class)
        return False
    log.info("alarm notice sent: %s", subject)
    return True


# --- the entry point ------------------------------------------------------------------------------

def record(store: Store, job: str, error: BaseException | None, mailer: Mailer | None = None) -> str | None:
    """Report one pass of a job: error=None for a success. Returns 'alerted', 'recovered' or None.
    Never raises: an alarm problem must not stop the job it watches."""
    try:
        return _record(store, job, error, mailer)
    except Exception:
        log.exception("alarm bookkeeping failed for %s", job)
        return None


def _record(store: Store, job: str, error: BaseException | None, mailer: Mailer | None) -> str | None:
    state = _load(store, job)
    if error is None:
        if state.failures == 0 and not state.alerted:
            return None
        _save(store, job, State())
        if not state.alerted:
            return None
        subject, body = recovered_notice(job)
        _send(mailer, subject, body)
        return "recovered"

    f = classify(error)
    state = replace(state, failures=state.failures + 1, last_error=f.error_class,
                    first_failed_at=state.first_failed_at or datetime.now(UTC).isoformat())
    outcome = None
    if state.failures >= FAIL_THRESHOLD and not state.alerted:
        subject, body = alarm_notice(job, f, state.failures)
        log.error("ALARM %s: %s (%d in a row). %s", job, f.error_class, state.failures, _fix(job, f))
        if _send(mailer, subject, body):
            state = replace(state, alerted=True)
            outcome = "alerted"
    _save(store, job, state)
    return outcome
