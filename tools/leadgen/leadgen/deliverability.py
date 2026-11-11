"""Deliverability check, every RUN_EVERY: the sending domain's DNS, and (opt-in) a mail-tester score.

Two halves, run from the worker's crew pass on its due checks. State lives in the worker_heartbeats
row "deliverability" (detail), so a restart neither repeats nor forgets a round.

DNS (always on; dns_check.py): SPF reaches Microsoft 365, DMARC is published, both DKIM selectors
resolve. Eris is emailed when a check newly fails. Free and needs no account.

mail-tester (MAILTESTER_CHECK=on): the test Eris runs by hand, on mail-tester's free tier.
1. A one-time address: mail-tester's homepage builds it in the browser as
   <data-prefix>-<9 random base36 chars>@<data-domain> (test-xxxxxxxxx@srv1.mail-tester.com); the
   two data attributes are read from the homepage, with those values as the fallback.
2. One realistic first-touch email to it from MS_APP_MAILBOX the way the CRM sends campaign mail:
   raw MIME, base64, to Graph /users/{mailbox}/sendMail (app-only token), text + HTML, a
   List-Unsubscribe header, the postal address in the footer. Its Sent Items copy is moved to
   Deleted Items on the result pass, and outlook_sync never mirrors mail sent to mail-tester.
3. At least RESULT_WAIT later: ?format=json says whether it arrived (the free tier withholds the
   score from JSON), then the HTML report gives the score and what cost points. Never arriving by
   GIVE_UP is reported too.
4. Eris is emailed only when the score is under MIN_SCORE, with mail-tester's reasons.
It is opt-in because it depends on scraping mail-tester's report page, which can change without
notice (an unreadable score is reported, not ignored). It is a diagnostic to a test inbox, not
outreach: like notify, it skips the Guardian and the send caps.

DELIVERABILITY_CHECK=off turns both halves off.
"""

from __future__ import annotations

import base64
import logging
import os
import re
import secrets
import string
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from email.message import EmailMessage
from email.utils import formataddr, make_msgid
from typing import TYPE_CHECKING, Any
from urllib.parse import quote

import httpx

from leadgen import dns_check
from leadgen.copy_rules import scrub_time_words
from leadgen.outlook_sync import GRAPH, GraphClient, app_mailbox, ms_credentials
from leadgen.store import Store

if TYPE_CHECKING:
    from leadgen.notify import Mailer

log = logging.getLogger(__name__)

STATE_NAME = "deliverability"
RUN_EVERY = timedelta(days=7)
RESULT_WAIT = timedelta(minutes=3)
GIVE_UP = timedelta(hours=12)
MIN_SCORE = 8.0
HOME = "https://www.mail-tester.com/"
RESULT_URL = "https://www.mail-tester.com/{id}?format=json"
REPORT_URL = "https://www.mail-tester.com/{id}"
DEFAULT_PREFIX = "test"
DEFAULT_DOMAIN = "srv1.mail-tester.com"
MAX_REASONS = 8
DEFAULT_SENDING_DOMAIN = "golaunchcontrol.com"
_ID = re.compile(r"^[a-z0-9-]{3,64}$")
_DOMAIN = re.compile(r"^[a-z0-9.-]+\.mail-tester\.com$")
_ATTR = re.compile(r'id="email"[^>]*?data-prefix="([^"]+)"[^>]*?data-domain="([^"]+)"', re.S)
_ALPHABET = string.ascii_lowercase + string.digits


def _flag(name: str) -> str:
    return os.environ.get(name, "").strip().lower()


def enabled() -> bool:
    """The whole check (DNS and mail-tester). On unless DELIVERABILITY_CHECK=off."""
    return _flag("DELIVERABILITY_CHECK") not in ("off", "0", "false", "no")


def mail_tester_enabled() -> bool:
    """The mail-tester half sends a real email, so it is opt-in: MAILTESTER_CHECK=on."""
    return _flag("MAILTESTER_CHECK") in ("on", "1", "true", "yes")


# --- 1. the one-time address ----------------------------------------------------------------------

def new_address(http: httpx.Client) -> tuple[str, str]:
    """(mailbox id, address). The prefix and domain come from mail-tester's homepage when readable."""
    prefix, domain = DEFAULT_PREFIX, DEFAULT_DOMAIN
    try:
        resp = http.get(HOME, headers={"User-Agent": "Mozilla/5.0 (deliverability check)"})
        m = _ATTR.search(resp.text) if resp.status_code == 200 else None
        if m and re.fullmatch(r"[a-z0-9]{1,20}", m.group(1)) and _DOMAIN.match(m.group(2)):
            prefix, domain = m.group(1), m.group(2)
    except httpx.HTTPError:
        log.warning("mail-tester homepage unreadable; using the default address pattern")
    mailbox_id = f"{prefix}-{''.join(secrets.choice(_ALPHABET) for _ in range(9))}"
    return mailbox_id, f"{mailbox_id}@{domain}"


# --- 2. the probe email ---------------------------------------------------------------------------

SUBJECT = "A few ideas for {business}'s website"
TEXT = "\n\n".join([
    "Hi Dana,",
    "I came across {business} while looking at race prep shops near Sebring. The build gallery on your site "
    "is strong, but a new customer has to dig to find how to book a consult.",
    "Launch Control builds websites and booking systems for motorsport businesses. Would it help if I sent "
    "over two or three ideas for your site?",
    "{sender}\nLaunch Control\nhttps://golaunchcontrol.com",
    '{address}\nNot interested? Reply "unsubscribe" and we won\'t email you again.',
]) + "\n"


@dataclass(frozen=True)
class Probe:
    mailbox_id: str
    address: str
    message_id: str
    mime: bytes


def _html(text: str) -> str:
    from html import escape

    paras = [p.strip() for p in text.strip().split("\n\n")]
    return "<html><body>" + "".join(f"<p>{escape(p).replace(chr(10), '<br>')}</p>" for p in paras) + "</body></html>"


def build_probe(mailbox_id: str, address: str, sender_address: str, sender_name: str, postal: str,
                business: str = "Apex Endurance Racing") -> Probe:
    text = TEXT.format(business=business, sender=sender_name, address=postal or "Launch Control")
    msg = EmailMessage()
    msg["From"] = formataddr((sender_name, sender_address))
    msg["To"] = address
    msg["Subject"] = SUBJECT.format(business=business)
    domain = sender_address.rpartition("@")[2] or "golaunchcontrol.com"
    message_id = make_msgid(domain=domain)
    msg["Message-ID"] = message_id
    # The CRM's mailto fallback form of the mass-email header (crm/src/lib/email/send.ts listUnsubscribe).
    msg["List-Unsubscribe"] = f"<mailto:{sender_address}?subject=unsubscribe>"
    msg.set_content(text)
    msg.add_alternative(_html(text), subtype="html")
    return Probe(mailbox_id, address, message_id, msg.as_bytes())


def send_probe(graph: GraphClient, mailbox: str, probe: Probe) -> None:
    """Graph sendMail with the MIME body, as the CRM's sendViaGraphMime does. Raises on a non-2xx."""
    token = graph.app_token()
    resp = graph.http.post(f"{GRAPH}/users/{quote(mailbox)}/sendMail",
                           headers={"Authorization": f"Bearer {token}", "Content-Type": "text/plain"},
                           content=base64.b64encode(probe.mime))
    resp.raise_for_status()


def remove_sent_copy(graph: GraphClient, mailbox: str, message_id: str) -> int:
    """Move the probe's Sent Items copy to Deleted Items (which no sync reads). Returns how many."""
    token = graph.app_token()
    escaped = message_id.replace("'", "''")
    url = (f"{GRAPH}/users/{quote(mailbox)}/mailFolders/sentitems/messages"
           f"?$filter=internetMessageId eq '{quote(escaped, safe='<>@.')}'&$select=id")
    resp = graph.http.get(url, headers={"Authorization": f"Bearer {token}"})
    resp.raise_for_status()
    moved = 0
    for m in resp.json().get("value", []):
        r = graph.http.post(f"{GRAPH}/users/{quote(mailbox)}/messages/{m['id']}/move",
                            headers={"Authorization": f"Bearer {token}"}, json={"destinationId": "deleteditems"})
        if r.status_code < 300:
            moved += 1
    return moved


# --- 3. the result --------------------------------------------------------------------------------
# The free tier's JSON (?format=json) says whether the mail has arrived ("status": false until it
# does) but holds the score back ("This account does not enable you to use the json format"). The
# HTML report, the page Eris reads by hand, is served whole on the free tier, so the score and the
# failed checks are read from it.

@dataclass(frozen=True)
class Report:
    score: float | None
    reasons: list[str]


_UA = {"User-Agent": "Mozilla/5.0 (deliverability check)"}
_SCORE = re.compile(r'class="score"[^>]*>\s*(-?\d+(?:\.\d+)?)\s*/\s*10|total:\s*(-?\d+(?:\.\d+)?)\s*/\s*10')
_SECTION = re.compile(r'class="test-result ([\w -]+)"')
_STATUS = re.compile(r'class="[^"]*?\bstatus (success|warning|failure|error|danger|info)')
_BLOCKLIST = re.compile(r'<span class="status-(\w+)">(.*?)</span>\s*in\s*<a[^>]*>(.*?)</a>', re.S)
# SpamAssassin rules smaller than this are mail-tester's informational ones (HTML_MESSAGE and the like).
SA_MIN_COST = 0.05
_TITLE = re.compile(r"<h[23][^>]*class=\"title\"[^>]*>(.*?)</h[23]>", re.S)
_SA_ROW = re.compile(r'sa-test-score[^"]*"[^>]*>\s*(-?\d+(?:\.\d+)?)\s*</td>\s*<td class="sa-test-name">(.*?)</td>'
                     r'\s*<td class="sa-test-description">(.*?)</td>', re.S)


def _check_id(mailbox_id: str) -> None:
    if not _ID.match(mailbox_id):
        raise ValueError("bad mail-tester id")


def arrived(http: httpx.Client, mailbox_id: str) -> bool:
    """True once mail-tester has the message (its free JSON reports that much)."""
    _check_id(mailbox_id)
    resp = http.get(RESULT_URL.format(id=mailbox_id), headers=_UA)
    resp.raise_for_status()
    body = resp.json()
    return isinstance(body, dict) and bool(body.get("status"))


def _text(fragment: str) -> str:
    from html import unescape

    return re.sub(r"\s+", " ", unescape(re.sub(r"<[^>]+>", " ", fragment))).strip()[:200]


def parse_report(page: str) -> Report:
    """Score and what cost points: SpamAssassin rules that subtracted, then each check mail-tester
    did not mark as a success (authentication, blocklists, body, links), in page order."""
    m = _SCORE.search(page)
    score = float(m.group(1) or m.group(2)) if m else None
    reasons: list[str] = []
    for sa_score, name, desc in _SA_ROW.findall(page):
        if float(sa_score) <= -SA_MIN_COST:
            reasons.append(f"SpamAssassin {_text(name)} ({float(sa_score):g}): {_text(desc)}")
    starts = [x.start() for x in _SECTION.finditer(page)] + [len(page)]
    for start, end in zip(starts, starts[1:], strict=False):
        block = page[start:end]
        status, title = _STATUS.search(block), _TITLE.search(block)
        if status and title and status.group(1) != "success" and "spamassassin" not in block[:60]:
            reasons.append(_text(title.group(1)))
    reasons += [f"Blocklist: {_text(what)} in {_text(where)}" for cls, what, where in _BLOCKLIST.findall(page)
                if cls != "success"]
    seen: set[str] = set()
    unique = [r for r in reasons if r and not (r in seen or seen.add(r))]  # type: ignore[func-returns-value]
    return Report(score, unique[:MAX_REASONS])


def fetch_report(http: httpx.Client, mailbox_id: str) -> Report | None:
    """The scored report, or None while the mail hasn't arrived."""
    if not arrived(http, mailbox_id):
        return None
    resp = http.get(REPORT_URL.format(id=mailbox_id), headers=_UA)
    resp.raise_for_status()
    return parse_report(resp.text)


# --- state ----------------------------------------------------------------------------------------

def _parse(ts: str) -> datetime:
    return datetime.fromisoformat(ts.replace("Z", "+00:00"))


def read_state(store: Store) -> dict[str, Any]:
    rows = store._req("GET", "worker_heartbeats", params={"name": f"eq.{STATE_NAME}", "select": "detail"}).json()
    detail = (rows[0].get("detail") if rows else None) or {}
    return dict(detail) if isinstance(detail, dict) else {}


def write_state(store: Store, state: dict[str, Any]) -> None:
    store.heartbeat(STATE_NAME, {**state, "every_s": int(RUN_EVERY.total_seconds())})


def _sender(store: Store, mailbox: str) -> tuple[str, str]:
    """(display name, postal address): the app mailbox's signature name and company_info.address."""
    name, postal = "Launch Control", ""
    try:
        rows = store._req("GET", "email_accounts", params={"address": f"eq.{mailbox}", "select": "signature_name"}).json()
        name = next((str(r["signature_name"]).strip() for r in rows if (r.get("signature_name") or "").strip()), name)
        info = store._req("GET", "company_info", params={"id": "eq.true", "select": "address"}).json()
        postal = ((info[0] if info else {}).get("address") or "").strip()
    except Exception:
        log.warning("deliverability: sender details unreadable; using defaults", exc_info=True)
    return name, postal


# --- 4. the notices ------------------------------------------------------------------------------
# Only our own sentences are scrubbed for time words; mail-tester's and DNS's text is quoted as is
# (mail-tester's own rule text says things like "registered in last 14-28 days").

def _scrubbed(text: str) -> str:
    return scrub_time_words(text)[0]


def low_score_notice(score: float | None, reasons: list[str], mailbox_id: str) -> tuple[str, str]:
    from leadgen.notify import FOOTER, crm_url

    if score is None:
        head = _scrubbed("The scheduled mail-tester check finished, but its score could not be read from the "
                         "report. Open the report to see it.")
        subject = "Deliverability check: score unreadable"
    else:
        head = _scrubbed(f"The scheduled mail-tester check scored {score:g}/10 for an outreach-style email from the "
                         f"app mailbox. Under {MIN_SCORE:g} means more campaign mail is likely landing in spam.")
        subject = f"Deliverability score {score:g}/10"
    lines = [head, ""]
    if reasons:
        lines += ["What mail-tester flagged:", *[f"- {r}" for r in reasons], ""]
    lines += [f"Full report: https://www.mail-tester.com/{mailbox_id}", f"Ops board: {crm_url()}/admin/ops"]
    return subject, "\n".join(lines) + f"\n\n{FOOTER}"


def missing_notice(address: str) -> tuple[str, str]:
    from leadgen.notify import FOOTER

    body = _scrubbed(f"The scheduled mail-tester check sent a test email to {address}, and mail-tester never "
                     "received it. Either Microsoft held or dropped it, or mail-tester was down. Send a test by "
                     "hand from https://www.mail-tester.com to see which.")
    return "Deliverability check: test email never arrived", f"{body}\n\n{FOOTER}"


def dns_notice(domain: str, failing: list[dns_check.Check]) -> tuple[str, str]:
    from leadgen.notify import FOOTER

    head = _scrubbed(f"A DNS record that keeps campaign mail out of spam is missing or wrong on {domain}.")
    means = _scrubbed("What it means: Gmail, Outlook and other receivers trust the mail less, so more of it lands "
                      "in spam or is rejected.")
    fix = _scrubbed("Likely fix: put the record back in the domain's DNS (GoDaddy). The Microsoft 365 admin "
                    "center (Settings, Domains) lists the records Microsoft expects, and Microsoft Defender's "
                    "DKIM page shows both DKIM selectors.")
    lines = [head, "", *[f"- {dns_check.PLAIN.get(c.name, c.name)}: {c.detail}" for c in failing], "", means, "", fix]
    return f"Email authentication problem on {domain}", "\n".join(lines) + f"\n\n{FOOTER}"


def _notify(mailer: Mailer | None, subject: str, body: str) -> bool:
    from leadgen.notify import default_mailer

    mailer = mailer or default_mailer()
    if mailer is None:
        log.error("deliverability notice not sent (no mailer): %s", subject)
        return False
    try:
        mailer.send(subject, body)
    except Exception as exc:
        log.error("deliverability notice failed to send: %s", type(exc).__name__)
        return False
    return True


# --- the steps ------------------------------------------------------------------------------------

def sending_domain() -> str:
    return app_mailbox().rpartition("@")[2] or DEFAULT_SENDING_DOMAIN


def dns_step(store: Store, http: httpx.Client, state: dict[str, Any], mailer: Mailer | None,
             now: datetime) -> tuple[str, dict[str, Any]]:
    """SPF / DMARC / DKIM from public DNS, every RUN_EVERY. Notifies on a check that newly fails."""
    last = state.get("dns_checked_at")
    if last and now - _parse(str(last)) < RUN_EVERY:
        return "not-due", state
    domain = sending_domain()
    checks = dns_check.run_checks(http, domain)
    before = state.get("dns") if isinstance(state.get("dns"), dict) else {}
    failing = dns_check.regressions(checks, before)
    # A lookup that failed keeps the previous verdict, so a resolver blip neither alerts nor resets.
    results = {c.name: (c.ok if c.ok is not None else before.get(c.name)) for c in checks}
    state = {**state, "dns_checked_at": now.isoformat(), "dns_domain": domain, "dns": results,
             "dns_details": {c.name: c.detail for c in checks}}
    write_state(store, state)
    if failing:
        log.error("deliverability: DNS check failing on %s: %s", domain, ", ".join(c.name for c in failing))
        _notify(mailer, *dns_notice(domain, failing))
        return "regressed", state
    return "ok", state


def mail_tester_step(store: Store, http: httpx.Client, graph: GraphClient, mailbox: str, state: dict[str, Any],
                     mailer: Mailer | None, now: datetime) -> tuple[str, dict[str, Any]]:
    """One step of the mail-tester round: send the probe when due, then read its score."""
    pending = state.get("pending")
    if isinstance(pending, dict) and pending.get("mailbox_id"):
        sent_at = _parse(str(pending["sent_at"]))
        if now - sent_at < RESULT_WAIT:
            return "waiting", state
        try:
            remove_sent_copy(graph, mailbox, str(pending.get("message_id") or ""))
        except Exception:
            log.warning("deliverability: Sent Items copy not removed", exc_info=True)
        report = fetch_report(http, str(pending["mailbox_id"]))
        if report is None:
            if now - sent_at < GIVE_UP:
                return "waiting", state
            log.error("deliverability: mail-tester never received %s", pending.get("address"))
            state = {**state, "pending": None, "last_checked_at": now.isoformat(), "last_score": None,
                     "last_result": "never arrived", "last_mailbox_id": pending["mailbox_id"]}
            write_state(store, state)
            _notify(mailer, *missing_notice(str(pending.get("address") or "")))
            return "missing", state
        log.info("deliverability: mail-tester score %s/10 (%s)", report.score, pending["mailbox_id"])
        state = {**state, "pending": None, "last_checked_at": now.isoformat(), "last_score": report.score,
                 "last_reasons": report.reasons, "last_result": "scored", "last_mailbox_id": pending["mailbox_id"]}
        write_state(store, state)
        if report.score is None or report.score < MIN_SCORE:
            _notify(mailer, *low_score_notice(report.score, report.reasons, str(pending["mailbox_id"])))
        return "scored", state

    last = state.get("last_sent_at")
    if last and now - _parse(str(last)) < RUN_EVERY:
        return "not-due", state
    mailbox_id, address = new_address(http)
    name, postal = _sender(store, mailbox)
    probe = build_probe(mailbox_id, address, mailbox, name, postal)
    before = state
    # Recorded before the send: a crash after it must not send a second probe this round.
    state = {**state, "last_sent_at": now.isoformat(),
             "pending": {"mailbox_id": mailbox_id, "address": address, "message_id": probe.message_id,
                         "sent_at": now.isoformat()}}
    write_state(store, state)
    try:
        send_probe(graph, mailbox, probe)
    except Exception:
        # Not sent: free the round so the next due check tries again.
        write_state(store, {**before, "pending": None, "last_result": "send failed"})
        raise
    log.info("deliverability: probe sent to %s", address)
    return "sent", state


# --- the entry point ------------------------------------------------------------------------------

def run_once(store: Store, http: httpx.Client | None = None, graph: GraphClient | None = None,
             mailer: Mailer | None = None, now: datetime | None = None) -> dict[str, str]:
    """One pass of both checks. Returns what each did (off | not-due | ok | regressed | waiting |
    sent | scored | missing). One failing never skips the other."""
    out = {"dns": "off", "mail-tester": "off"}
    if not enabled():
        return out
    now = now or datetime.now(UTC)
    own_http = http is None
    http = http or httpx.Client(timeout=30, follow_redirects=True)
    try:
        state = read_state(store)
        try:
            out["dns"], state = dns_step(store, http, state, mailer, now)
        except Exception:
            log.exception("deliverability: DNS check failed")
            out["dns"] = "error"
        creds, mailbox = ms_credentials(), app_mailbox()
        if mail_tester_enabled() and mailbox and (graph is not None or creds is not None):
            graph = graph or GraphClient(*creds, http=http)  # type: ignore[misc]
            try:
                out["mail-tester"], state = mail_tester_step(store, http, graph, mailbox, state, mailer, now)
            except Exception:
                log.exception("deliverability: mail-tester check failed")
                out["mail-tester"] = "error"
        return out
    finally:
        if own_http:
            http.close()
