"""Bounce notices that arrive as mail, after a send looked fine.

A send that the provider accepts is stored as "sent". When the recipient's server later refuses it,
the only trace is a delivery report in the mailbox, and Outlook often files that report in Junk,
which the mail sync never stores. Without this, a dead address stays "sent", is never blocked, and
the Guardian's bounce rate reads zero.

What a hard bounce does here:
- the address goes on email_suppressions (reason "bounce"), so nothing emails it again;
- the newest "sent" message to it becomes "failed" with the reason, so the thread shows it bounced.

Only an address the CRM actually sent to is ever blocked, and only on an address-is-dead code
(5.1.1 / 5.1.10, or the server's plain-words equivalent). Policy blocks and throttling (5.7.x, 4.x)
say nothing about the address and never block it. Pure apart from `record`; no Graph calls here.
"""
from __future__ import annotations

import logging
import re
from typing import Any, Protocol

log = logging.getLogger(__name__)

# Delivery reports, by subject. Also used by notify.py so a report is never announced as a reply.
BOUNCE_SUBJECT = re.compile(
    r"^\s*(undeliverable|undelivered mail|delivery status notification|delivery (has )?failed|"
    r"delivery failure|mail delivery (failed|failure|subsystem)|returned mail|failure notice|"
    r"mail system error|non[- ]?delivery)",
    re.I,
)
_SYSTEM_SENDER = re.compile(r"^(mailer-daemon|postmaster|microsoftexchange[0-9a-f]*)@", re.I)
# Status codes stand alone: "10.4.2.1" in a Received line is an IP, not a 4.2.1.
_DEAD_ADDRESS = re.compile(
    r"(?<![\d.])5\.1\.(1|10)(?![\d.])|user unknown|recipient not found|no such user|"
    r"address (could not|couldn't) be found|(account|address|mailbox|user) .{0,40}does(n't| not) exist|wasn't found at",
    re.I,
)
_OUR_SIDE = re.compile(r"(?<![\d.])(5\.7|4\.\d)\.\d+(?![\d.])")
_ADDR = r"<?([A-Za-z0-9._%+'-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)+)>?"
_EMAIL = re.compile(_ADDR)
# Where a report names the address that failed. Anything else in it (the original recipient of a
# forward, our own To and Cc lines) is a live address and must never be blocked.
_FAILED_SLOTS = (
    re.compile(r"^\s*final-recipient:\s*rfc822;\s*" + _ADDR, re.I | re.M),
    re.compile(r"your message to\s+" + _ADDR, re.I),
    re.compile(r"(?:wasn't|was not|couldn't be|could not be) delivered to\s+" + _ADDR, re.I),
    re.compile(r"delivery has failed to these recipients or groups:\s*(?:[^\n@]*\()?" + _ADDR, re.I),
)
# Reports quote the original message below this; nothing there says which address failed.
_QUOTED = re.compile(
    r"^\s*-*\s*(original message( headers| details)?|forwarded message|message headers|reporting-mta|return-path|received)\b",
    re.I | re.M,
)
MAX_REASON = 300


class BounceStore(Protocol):
    def sends_to(self, email: str) -> list[dict[str, Any]]: ...
    def suppress_bounce(self, email: str) -> None: ...
    def mark_bounced(self, message_id: str, reason: str) -> None: ...


def _sender(message: dict[str, Any]) -> str:
    return str(((message.get("from") or {}).get("emailAddress") or {}).get("address") or "").lower()


def is_report(message: dict[str, Any]) -> bool:
    """A delivery report from a mail system. A person can type "Undeliverable:" as a subject, so the
    subject alone is never enough to block an address."""
    return bool(_SYSTEM_SENDER.match(_sender(message)))


def _head(message: dict[str, Any]) -> str:
    text = str((message.get("body") or {}).get("content") or "")
    quoted = _QUOTED.search(text)
    return text[: quoted.start()] if quoted else text


def dead_address(message: dict[str, Any], own: set[str]) -> str | None:
    """The one address a report says doesn't exist. None unless it is a hard bounce that names it."""
    if not is_report(message):
        return None
    head = _head(message)
    if not _DEAD_ADDRESS.search(head) or _OUR_SIDE.search(head):
        return None
    for slot in _FAILED_SLOTS:
        hit = slot.search(head)
        if hit:
            email = hit.group(1).strip(".'").lower()
            return None if email in own or _SYSTEM_SENDER.match(email) else email
    return None


def reason_for(message: dict[str, Any]) -> str:
    code = re.search(r"\b5\d\d[ -]5\.1\.(?:1|10)(?![\d.])|(?<![\d.])5\.1\.(?:1|10)(?![\d.])", _head(message))
    detail = f" ({code.group(0)})" if code else ""
    return f"Bounced: the address doesn't exist{detail}. It's blocked from further email."[:MAX_REASON]


def _bounced_send(sends: list[dict[str, Any]], received: str) -> dict[str, Any] | None:
    """The send a report answers: the newest one made before the report arrived."""
    before = [s for s in sends if not received or str(s.get("created_at") or "") <= received]
    return max(before, key=lambda s: str(s.get("created_at") or ""), default=None)


def record(store: BounceStore, messages: list[dict[str, Any]], own: set[str]) -> list[str]:
    """Block every address these reports say is dead, if the CRM sent to it. Returns the blocked ones.
    Safe to run on the same report again: the send it answers is already failed, so nothing changes."""
    blocked: list[str] = []
    for m in messages:
        email = dead_address(m, own)
        if not email:
            continue
        sends = store.sends_to(email)
        if not sends:
            # Never emailed from here: a report about someone else's send, or spam posing as one.
            log.warning("bounce report names an address the CRM never emailed (@%s); left alone", email.split("@")[-1])
            continue
        store.suppress_bounce(email)
        send = _bounced_send(sends, str(m.get("receivedDateTime") or ""))
        if send and send.get("status") == "sent":
            store.mark_bounced(str(send["id"]), reason_for(m))
        if email not in blocked:
            blocked.append(email)
    return blocked
