"""Pull replies on CRM email threads out of connected Gmail accounts.

The CRM sends from a teammate's Gmail and records the Gmail threadId. Every couple of minutes this
reads each account's Gmail history since the last run and stores any new message on a thread the
CRM knows about. Nothing else in the inbox is read or stored: the CRM's full Inbox mirrors the
Outlook mailbox (outlook_sync.py); Gmail stays lead-only because nobody on the team reads mail there.
"""

from __future__ import annotations

import base64
import logging
import os
import re
import threading
import time
from email.utils import getaddresses, parseaddr
from typing import Any

import httpx

from leadgen.store import Store

log = logging.getLogger(__name__)

GMAIL = "https://gmail.googleapis.com/gmail/v1/users/me"
SYNC_EVERY_S = 120
_QUOTE_START = re.compile(r"^On .+wrote:\s*$")


class ReconnectNeeded(Exception):
    pass


def google_credentials() -> tuple[str, str] | None:
    cid = os.environ.get("GOOGLE_CLIENT_ID", "").strip()
    secret = os.environ.get("GOOGLE_CLIENT_SECRET", "").strip()
    return (cid, secret) if cid and secret else None


def strip_quoted_reply(text: str) -> str:
    """Keep the new part of a reply: drop '>' lines and everything from 'On ... wrote:' down."""
    lines = text.replace("\r\n", "\n").split("\n")
    out: list[str] = []
    for i, line in enumerate(lines):
        nxt = lines[i + 1] if i + 1 < len(lines) else ""
        if _QUOTE_START.match(line) or (line.startswith("On ") and nxt.rstrip().endswith("wrote:")):
            break
        if line.startswith(">"):
            continue
        out.append(line)
    kept = "\n".join(out).strip()
    return kept or text.strip()


def _decode(data: str) -> str:
    return base64.urlsafe_b64decode(data + "=" * (-len(data) % 4)).decode("utf-8", errors="replace")


def plain_text(payload: dict[str, Any]) -> str:
    """First text/plain part of a Gmail message payload, falling back to tag-stripped HTML."""
    stack = [payload]
    html = ""
    while stack:
        part = stack.pop(0)
        mime = part.get("mimeType", "")
        data = (part.get("body") or {}).get("data")
        if mime == "text/plain" and data:
            return _decode(data)
        if mime == "text/html" and data and not html:
            html = re.sub(r"<[^>]+>", " ", _decode(data))
        stack.extend(part.get("parts") or [])
    return html


def headers_of(payload: dict[str, Any]) -> dict[str, str]:
    return {h["name"].lower(): h["value"] for h in payload.get("headers", [])}


class GmailClient:
    def __init__(self, client_id: str, client_secret: str, http: httpx.Client | None = None) -> None:
        self.client_id = client_id
        self.client_secret = client_secret
        self.http = http or httpx.Client(timeout=30)

    def access_token(self, refresh_token: str) -> str:
        resp = self.http.post("https://oauth2.googleapis.com/token", data={
            "client_id": self.client_id, "client_secret": self.client_secret,
            "grant_type": "refresh_token", "refresh_token": refresh_token,
        })
        if resp.status_code == 400 and "invalid_grant" in resp.text:
            raise ReconnectNeeded
        resp.raise_for_status()
        return str(resp.json()["access_token"])

    def get(self, token: str, path: str, **params: Any) -> httpx.Response:
        return self.http.get(f"{GMAIL}{path}", params=params, headers={"Authorization": f"Bearer {token}"})


def sync_account(store: Store, gmail: GmailClient, account: dict[str, Any]) -> int:
    """Store new messages on known threads for one account. Returns how many were stored."""
    refresh = store.gmail_refresh_token(account["id"])
    if not refresh:
        return 0
    try:
        token = gmail.access_token(refresh)
    except ReconnectNeeded:
        store.set_account_status(account["id"], "needs_reconnect")
        log.warning("gmail %s needs reconnecting", account["address"])
        return 0

    start = account.get("gmail_history_id")
    if not start:
        profile = gmail.get(token, "/profile").json()
        store.set_history_id(account["id"], str(profile["historyId"]))
        return 0

    added: dict[str, str] = {}  # message id -> thread id
    latest = start
    page: str | None = None
    while True:
        params: dict[str, Any] = {"startHistoryId": start, "historyTypes": "messageAdded"}
        if page:
            params["pageToken"] = page
        resp = gmail.get(token, "/history", **params)
        if resp.status_code == 404:  # history id too old; start over from now
            store.set_history_id(account["id"], str(gmail.get(token, "/profile").json()["historyId"]))
            return 0
        resp.raise_for_status()
        body = resp.json()
        latest = str(body.get("historyId", latest))
        for h in body.get("history", []):
            for item in h.get("messagesAdded", []):
                msg = item.get("message", {})
                if msg.get("id") and msg.get("threadId"):
                    added[msg["id"]] = msg["threadId"]
        page = body.get("nextPageToken")
        if not page:
            break

    stored = 0
    leads_by_thread = store.leads_for_threads(sorted(set(added.values())))
    for message_id, thread_id in added.items():
        lead_id = leads_by_thread.get(thread_id)
        if not lead_id:
            continue
        full = gmail.get(token, f"/messages/{message_id}", format="full").json()
        payload = full.get("payload", {})
        hdr = headers_of(payload)
        from_name, sender = parseaddr(hdr.get("from", ""))
        sender = sender.lower()
        outbound = sender == account["address"]
        text = plain_text(payload)
        stored += store.insert_message({
            "lead_id": lead_id,
            "account_id": account["id"],
            "direction": "out" if outbound else "in",
            "folder": "sent" if outbound else "inbox",
            "conversation_id": thread_id,
            "from_address": sender,
            "from_name": from_name.strip(),
            "to_address": parseaddr(hdr.get("to", ""))[1].lower(),
            "cc_address": ", ".join(a.lower() for _, a in getaddresses([hdr.get("cc", "")]) if a),
            "subject": hdr.get("subject", ""),
            "body_text": text.strip() if outbound else strip_quoted_reply(text),
            "provider": "gmail",
            "provider_message_id": message_id,
            "provider_thread_id": thread_id,
            "message_id_header": hdr.get("message-id"),
            "status": "sent" if outbound else "received",
            "sent_by": "gmail" if outbound else None,
        })
    store.set_history_id(account["id"], latest)
    return stored


def sync_all(store: Store, gmail: GmailClient) -> None:
    for account in store.gmail_accounts():
        try:
            n = sync_account(store, gmail, account)
            if n:
                log.info("gmail %s: stored %d message(s)", account["address"], n)
        except Exception:
            log.exception("gmail sync failed for %s", account.get("address"))


def start_background_sync(store_factory, every_s: float = SYNC_EVERY_S) -> threading.Thread | None:  # noqa: ANN001
    """Run sync_all forever on a daemon thread, so long lead searches don't delay replies."""
    creds = google_credentials()
    if creds is None:
        log.info("gmail sync off (GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET not set)")
        return None
    store, gmail = store_factory(), GmailClient(*creds)

    def loop() -> None:
        while True:
            sync_all(store, gmail)
            time.sleep(every_s)

    thread = threading.Thread(target=loop, name="gmail-sync", daemon=True)
    thread.start()
    log.info("gmail sync on, every %.0fs", every_s)
    return thread
