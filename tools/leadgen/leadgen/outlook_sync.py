"""Pull lead conversations out of the shared Microsoft 365 mailbox.

The team reads one Outlook mailbox (maxwell@, with aliases). Every couple of minutes this walks the
Inbox and Sent Items with Graph delta queries and stores any message that belongs to a lead:
either on a conversation the CRM started, or to/from an address that is a lead's email. That way a
reply lands on the lead even when someone answered straight from Outlook. Nothing else is stored.
"""

from __future__ import annotations

import json
import logging
import os
import re
import threading
import time
from datetime import UTC, datetime, timedelta
from typing import Any

import httpx

from leadgen.gmail_sync import strip_quoted_reply
from leadgen.store import Store

log = logging.getLogger(__name__)

GRAPH = "https://graph.microsoft.com/v1.0"
SYNC_EVERY_S = 120
FOLDERS = ("inbox", "sentitems")
# On the first run only look back this far, so connecting doesn't import years of old mail.
FIRST_RUN_LOOKBACK = timedelta(days=14)
SELECT = "id,conversationId,internetMessageId,from,toRecipients,subject,body,receivedDateTime,isDraft"
_PREFER = 'IdType="ImmutableId", outlook.body-content-type="text", odata.maxpagesize=50'
_SIGNATURE_START = re.compile(r"^(-- ?|_{5,})$")


class ReconnectNeeded(Exception):
    pass


def ms_credentials() -> tuple[str, str, str] | None:
    vals = tuple(os.environ.get(k, "").strip() for k in ("MS_CLIENT_ID", "MS_CLIENT_SECRET", "MS_TENANT_ID"))
    return vals if all(vals) else None  # type: ignore[return-value]


def reply_text(text: str) -> str:
    """The new part of a reply: Outlook's 'From: ... Sent:' block and '>' quotes are dropped."""
    lines = text.replace("\r\n", "\n").split("\n")
    out: list[str] = []
    for line in lines:
        if line.startswith("From: ") or _SIGNATURE_START.match(line.strip()) and out:
            break
        out.append(line)
    return strip_quoted_reply("\n".join(out))


class GraphClient:
    def __init__(self, client_id: str, client_secret: str, tenant: str, http: httpx.Client | None = None) -> None:
        self.client_id, self.client_secret, self.tenant = client_id, client_secret, tenant
        self.http = http or httpx.Client(timeout=30)

    def refresh(self, refresh_token: str) -> dict[str, Any]:
        resp = self.http.post(f"https://login.microsoftonline.com/{self.tenant}/oauth2/v2.0/token", data={
            "client_id": self.client_id, "client_secret": self.client_secret, "grant_type": "refresh_token",
            "refresh_token": refresh_token, "scope": "offline_access https://graph.microsoft.com/Mail.ReadWrite",
        })
        if resp.status_code == 400 and "invalid_grant" in resp.text:
            raise ReconnectNeeded
        resp.raise_for_status()
        return dict(resp.json())

    def get(self, token: str, url: str) -> httpx.Response:
        return self.http.get(url, headers={"Authorization": f"Bearer {token}", "Prefer": _PREFER})


def _start_url(folder: str, since: datetime) -> str:
    stamp = since.strftime("%Y-%m-%dT%H:%M:%SZ")
    return f"{GRAPH}/me/mailFolders/{folder}/messages/delta?$select={SELECT}&$filter=receivedDateTime+ge+{stamp}"


def _address(item: dict[str, Any] | None) -> str:
    return str(((item or {}).get("emailAddress") or {}).get("address") or "").lower()


def walk_folder(graph: GraphClient, token: str, url: str) -> tuple[list[dict[str, Any]], str]:
    """All changed messages from a delta URL, and the deltaLink to resume from next time."""
    messages: list[dict[str, Any]] = []
    while True:
        resp = graph.get(token, url)
        if resp.status_code == 410:  # delta token expired: caller restarts the folder
            raise LookupError("delta expired")
        resp.raise_for_status()
        body = resp.json()
        messages.extend(m for m in body.get("value", []) if "@removed" not in m and not m.get("isDraft"))
        if body.get("@odata.nextLink"):
            url = body["@odata.nextLink"]
            continue
        return messages, str(body["@odata.deltaLink"])


def to_rows(account: dict[str, Any], messages: list[dict[str, Any]], own: set[str],
            by_thread: dict[str, str], by_email: dict[str, str]) -> list[dict[str, Any]]:
    rows = []
    for m in messages:
        sender = _address(m.get("from"))
        recipients = [_address(r) for r in m.get("toRecipients") or []]
        outbound = sender in own
        other = next((r for r in recipients if r not in own), "") if outbound else sender
        lead_id = by_thread.get(m.get("conversationId") or "") or by_email.get(other)
        if not lead_id:
            continue
        text = str((m.get("body") or {}).get("content") or "")
        rows.append({
            "lead_id": lead_id,
            "account_id": account["id"],
            "direction": "out" if outbound else "in",
            "from_address": sender,
            "to_address": recipients[0] if recipients else "",
            "subject": m.get("subject") or "",
            "body_text": text.strip() if outbound else reply_text(text),
            "provider": "outlook",
            "provider_message_id": m["id"],
            "provider_thread_id": m.get("conversationId"),
            "message_id_header": m.get("internetMessageId"),
            "status": "sent" if outbound else "received",
            "sent_by": "outlook" if outbound else None,
            "created_at": m.get("receivedDateTime"),
        })
    return rows


def sync_account(store: Store, graph: GraphClient, account: dict[str, Any], now: datetime | None = None) -> int:
    refresh = store.mail_refresh_token(account["id"])
    if not refresh:
        return 0
    try:
        tokens = graph.refresh(refresh)
    except ReconnectNeeded:
        store.mark_mailbox_reconnect(account["id"])
        log.warning("outlook %s needs reconnecting", account["address"])
        return 0
    if tokens.get("refresh_token") and tokens["refresh_token"] != refresh:
        store.save_refresh_token(account["id"], tokens["refresh_token"])
    token = tokens["access_token"]

    cursors: dict[str, str] = json.loads(account.get("sync_cursor") or "{}")
    since = (now or datetime.now(UTC)) - FIRST_RUN_LOOKBACK
    found: list[dict[str, Any]] = []
    for folder in FOLDERS:
        try:
            msgs, cursors[folder] = walk_folder(graph, token, cursors.get(folder) or _start_url(folder, since))
        except LookupError:
            msgs, cursors[folder] = walk_folder(graph, token, _start_url(folder, since))
        found.extend(msgs)

    own = store.own_addresses()
    threads = sorted({m["conversationId"] for m in found if m.get("conversationId")})
    emails = {_address(m.get("from")) for m in found} | {_address(r) for m in found for r in m.get("toRecipients") or []}
    by_email = store.leads_by_emails(sorted(e for e in emails if e and e not in own))
    rows = to_rows(account, found, own, store.leads_for_threads(threads), by_email)
    known = store.known_message_ids([r["message_id_header"] for r in rows if r["message_id_header"]])
    stored = sum(store.insert_message(r) for r in rows if r["message_id_header"] not in known)
    store.set_sync_cursor(account["id"], json.dumps(cursors))
    return stored


def sync_all(store: Store, graph: GraphClient) -> None:
    for account in store.outlook_accounts():
        try:
            n = sync_account(store, graph, account)
            if n:
                log.info("outlook %s: stored %d message(s)", account["address"], n)
        except Exception:
            log.exception("outlook sync failed for %s", account.get("address"))


def start_background_sync(store_factory, every_s: float = SYNC_EVERY_S) -> threading.Thread | None:  # noqa: ANN001
    creds = ms_credentials()
    if creds is None:
        log.info("outlook sync off (MS_CLIENT_ID / MS_CLIENT_SECRET / MS_TENANT_ID not set)")
        return None
    store, graph = store_factory(), GraphClient(*creds)

    def loop() -> None:
        while True:
            sync_all(store, graph)
            time.sleep(every_s)

    thread = threading.Thread(target=loop, name="outlook-sync", daemon=True)
    thread.start()
    log.info("outlook sync on, every %.0fs", every_s)
    return thread
