"""Mirror the shared Microsoft 365 mailbox into the CRM's Inbox.

The team reads one Outlook mailbox (maxwell@, with aliases). Every couple of minutes this walks the
Inbox and Sent Items with Graph delta queries and stores every message, so the CRM is a full mail
client. A message is tied to a lead when it is on a conversation the CRM already knows for that
lead, or to/from an address that is a lead's email; everything else is stored with no lead
("Add as lead" in the CRM links it later). Junk, Deleted Items and drafts are never read.
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
# Graph folder -> the CRM's email_messages.folder. Junk and Deleted Items are deliberately absent.
FOLDERS = {"inbox": "inbox", "sentitems": "sent"}
# On the first run only look back this far, so connecting doesn't import years of old mail.
FIRST_RUN_LOOKBACK = timedelta(days=30)
# Bumped when the sync starts storing more than before: cursors from an older version are dropped
# once, so the lookback window is walked again and the new rows fill in (inserts are idempotent).
CURSOR_VERSION = 2
SELECT = ("id,conversationId,internetMessageId,from,toRecipients,ccRecipients,subject,body,receivedDateTime,"
          "isDraft,isRead,hasAttachments")
_PREFER = 'IdType="ImmutableId", outlook.body-content-type="text", odata.maxpagesize=50'
_SIGNATURE_START = re.compile(r"^(-- ?|_{5,})$")


class ReconnectNeeded(Exception):
    """Microsoft refused the stored sign-in. str(exc) is Microsoft's reason (e.g. AADSTS50076)."""


def app_mailbox() -> str:
    """App-only mode: the worker signs in as the app (client credentials) and reads this mailbox.
    No user sign-in, so nothing for Microsoft's MFA rules to revoke. Empty = signed-in-user mode."""
    return os.environ.get("MS_APP_MAILBOX", "").strip().lower()


def me() -> str:
    """Graph base for the mailbox: /me as a signed-in user, /users/<mailbox> as the app."""
    box = app_mailbox()
    return f"{GRAPH}/users/{box}" if box else f"{GRAPH}/me"


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
        self._app: tuple[str, float] | None = None

    def refresh(self, refresh_token: str, scope: str = "Mail.ReadWrite") -> dict[str, Any]:
        """Access token for one consented Graph scope (the calendar reader asks for Calendars.ReadWrite)."""
        resp = self.http.post(f"https://login.microsoftonline.com/{self.tenant}/oauth2/v2.0/token", data={
            "client_id": self.client_id, "client_secret": self.client_secret, "grant_type": "refresh_token",
            "refresh_token": refresh_token, "scope": f"offline_access https://graph.microsoft.com/{scope}",
        })
        if resp.status_code == 400 and "invalid_grant" in resp.text:
            raise ReconnectNeeded(str(resp.json().get("error_description", "")).split("\r\n")[0])
        resp.raise_for_status()
        return dict(resp.json())

    def app_token(self) -> str:
        """Graph token for the app itself, cached until a minute before it expires."""
        if self._app and self._app[1] > time.time():
            return self._app[0]
        resp = self.http.post(f"https://login.microsoftonline.com/{self.tenant}/oauth2/v2.0/token", data={
            "client_id": self.client_id, "client_secret": self.client_secret, "grant_type": "client_credentials",
            "scope": "https://graph.microsoft.com/.default",
        })
        resp.raise_for_status()
        body = resp.json()
        self._app = (str(body["access_token"]), time.time() + int(body.get("expires_in", 3600)) - 60)
        return self._app[0]

    def get(self, token: str, url: str) -> httpx.Response:
        return self.http.get(url, headers={"Authorization": f"Bearer {token}", "Prefer": _PREFER})


def _start_url(folder: str, since: datetime) -> str:
    stamp = since.strftime("%Y-%m-%dT%H:%M:%SZ")
    return f"{me()}/mailFolders/{folder}/messages/delta?$select={SELECT}&$filter=receivedDateTime+ge+{stamp}"


def _address(item: dict[str, Any] | None) -> str:
    return str(((item or {}).get("emailAddress") or {}).get("address") or "").lower()


def _name(item: dict[str, Any] | None) -> str:
    name = str(((item or {}).get("emailAddress") or {}).get("name") or "").strip()
    # Outlook fills the name with the address itself when it has nothing better.
    return "" if "@" in name and name.lower() == _address(item) else name


def _addresses(items: list[dict[str, Any]] | None) -> list[str]:
    return [a for a in (_address(r) for r in items or []) if a]


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
    """One email_messages row per Graph message. lead_id is None for mail that isn't a lead's."""
    rows = []
    for m in messages:
        sender = _address(m.get("from"))
        recipients = _addresses(m.get("toRecipients"))
        outbound = sender in own
        other = next((r for r in recipients if r not in own), "") if outbound else sender
        lead_id = by_thread.get(m.get("conversationId") or "") or by_email.get(other) or None
        text = str((m.get("body") or {}).get("content") or "")
        received = m.get("receivedDateTime")
        rows.append({
            "lead_id": lead_id,
            "account_id": account["id"],
            "direction": "out" if outbound else "in",
            "folder": FOLDERS.get(m.get("_folder") or "", "sent" if outbound else "inbox"),
            "from_address": sender,
            "from_name": _name(m.get("from")),
            "to_address": ", ".join(recipients),
            "cc_address": ", ".join(_addresses(m.get("ccRecipients"))),
            "subject": m.get("subject") or "",
            "body_text": text.strip() if outbound else reply_text(text),
            "provider": "outlook",
            "provider_message_id": m["id"],
            "provider_thread_id": m.get("conversationId"),
            "conversation_id": m.get("conversationId"),
            "message_id_header": m.get("internetMessageId"),
            "status": "sent" if outbound else "received",
            "sent_by": "outlook" if outbound else None,
            # Lead mail stays unread in the CRM until someone opens it there (it drives "waiting on
            # us"); other mail mirrors Outlook, so what Max already read there isn't new here.
            "read_at": received if (not outbound and lead_id is None and m.get("isRead")) else None,
            "attachments": [],
            "created_at": received,
        })
    return rows


def attachment_meta(graph: GraphClient, token: str, message_id: str) -> list[dict[str, Any]]:
    """Names and sizes of a message's real attachments (inline signature images are skipped).
    The bytes stay in Outlook; the CRM downloads one through Graph when someone clicks it."""
    url = f"{me()}/messages/{message_id}/attachments?$select=id,name,size,contentType,isInline"
    try:
        resp = graph.get(token, url)
        resp.raise_for_status()
        items = resp.json().get("value", [])
    except Exception:
        log.warning("attachment list failed for one message; storing it without")
        return []
    return [
        {"name": a.get("name") or "attachment", "size": int(a.get("size") or 0),
         "type": a.get("contentType") or "application/octet-stream", "provider_id": a["id"]}
        for a in items if a.get("id") and not a.get("isInline")
    ]


def access_token(store: Store, graph: GraphClient, account: dict[str, Any], scope: str = "Mail.ReadWrite") -> str | None:
    """A Graph token for the mailbox: the app's own in app-only mode, else the stored sign-in's.
    A refused sign-in flags the mailbox with Microsoft's reason and returns None."""
    if app_mailbox():
        return graph.app_token()
    refresh = store.mail_refresh_token(account["id"])
    if not refresh:
        return None
    try:
        tokens = graph.refresh(refresh, scope=scope)
    except ReconnectNeeded as exc:
        store.mark_mailbox_reconnect(account["id"], str(exc))
        log.warning("outlook %s needs reconnecting: %s", account["address"], str(exc)[:120])
        return None
    if tokens.get("refresh_token") and tokens["refresh_token"] != refresh:
        store.save_refresh_token(account["id"], tokens["refresh_token"])
    return str(tokens["access_token"])


def sync_account(store: Store, graph: GraphClient, account: dict[str, Any], now: datetime | None = None) -> int:
    token = access_token(store, graph, account)
    if not token:
        return 0

    saved: dict[str, Any] = json.loads(account.get("sync_cursor") or "{}")
    cursors: dict[str, Any] = saved if saved.get("v") == CURSOR_VERSION else {}
    cursors["v"] = CURSOR_VERSION
    since = (now or datetime.now(UTC)) - FIRST_RUN_LOOKBACK
    found: list[dict[str, Any]] = []
    for folder in FOLDERS:
        try:
            msgs, cursors[folder] = walk_folder(graph, token, cursors.get(folder) or _start_url(folder, since))
        except LookupError:
            msgs, cursors[folder] = walk_folder(graph, token, _start_url(folder, since))
        for m in msgs:
            m["_folder"] = folder
        found.extend(msgs)

    own = store.own_addresses()
    threads = sorted({m["conversationId"] for m in found if m.get("conversationId")})
    emails = {_address(m.get("from")) for m in found} | {_address(r) for m in found for r in m.get("toRecipients") or []}
    by_email = store.leads_by_emails(sorted(e for e in emails if e and e not in own))
    rows = to_rows(account, found, own, store.leads_for_threads(threads), by_email)
    known = store.known_message_ids([r["message_id_header"] for r in rows if r["message_id_header"]])
    with_files = {m["id"] for m in found if m.get("hasAttachments")}
    stored = 0
    for r in rows:
        if r["message_id_header"] in known:
            # The CRM's own SMTP sends: it stored them already; add the ids Outlook gave them.
            store.attach_provider_ids(r["message_id_header"], r["provider_message_id"], r["provider_thread_id"])
            continue
        if r["provider_message_id"] in with_files:
            r["attachments"] = attachment_meta(graph, token, r["provider_message_id"])
        stored += store.insert_message(r)
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
