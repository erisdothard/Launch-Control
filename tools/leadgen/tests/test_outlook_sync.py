from __future__ import annotations

import json
from datetime import UTC, datetime
from typing import Any

from leadgen import outlook_sync


def test_reply_text_drops_outlook_quote_block() -> None:
    text = "Tuesday works.\n\nFrom: Launch Control <maxwell@golaunchcontrol.com>\nSent: Monday\nTo: Paul\n\nHi Paul"
    assert outlook_sync.reply_text(text) == "Tuesday works."


class FakeResp:
    def __init__(self, body: dict[str, Any], status: int = 200) -> None:
        self._body, self.status_code = body, status

    def json(self) -> dict[str, Any]:
        return self._body

    def raise_for_status(self) -> None:
        return None


def msg(mid: str, conv: str, sender: str, to: str, body: str, header: str, **extra: Any) -> dict[str, Any]:
    return {"id": mid, "conversationId": conv, "internetMessageId": header, "subject": "Re: hello",
            "from": {"emailAddress": {"address": sender, "name": extra.pop("name", sender)}},
            "toRecipients": [{"emailAddress": {"address": to}}],
            "body": {"content": body}, "receivedDateTime": "2026-10-19T20:00:00Z", "isDraft": False, **extra}


class FakeGraph:
    def __init__(self) -> None:
        self.urls: list[str] = []

    def refresh(self, refresh: str, scope: str = "Mail.ReadWrite") -> dict[str, Any]:
        return {"access_token": "tok", "refresh_token": "rotated"}

    def get(self, token: str, url: str) -> FakeResp:
        self.urls.append(url)
        if "/attachments" in url:
            return FakeResp({"value": [
                {"id": "att-1", "name": "menu.pdf", "size": 2048, "contentType": "application/pdf", "isInline": False},
                {"id": "att-2", "name": "logo.png", "size": 90, "contentType": "image/png", "isInline": True},
            ]})
        if "/inbox/" in url:
            return FakeResp({"value": [
                msg("in-1", "c-crm", "paul@sebring.com", "maxwell@golaunchcontrol.com", "Yes!\n\nFrom: Max\nSent: x", "<a@s>"),
                msg("in-2", "c-x", "newsletter@shop.com", "maxwell@golaunchcontrol.com", "buy", "<b@s>", name="Shop News",
                    isRead=True, hasAttachments=True, ccRecipients=[{"emailAddress": {"address": "Eris@golaunchcontrol.com"}}]),
                msg("in-3", "c-new", "doug@zfever.com", "eris@golaunchcontrol.com", "Call me", "<c@s>"),
            ], "@odata.deltaLink": "inbox-delta-2"})
        return FakeResp({"value": [
            msg("sent-1", "c-crm", "maxwell@golaunchcontrol.com", "paul@sebring.com", "Sent from CRM", "<crm@lc>"),
            msg("sent-2", "c-out", "eris@golaunchcontrol.com", "doug@zfever.com", "Sent from Outlook", "<o@lc>"),
        ], "@odata.deltaLink": "sent-delta-2"})


class FakeStore:
    def __init__(self) -> None:
        self.rows: list[dict[str, Any]] = []
        self.cursor: str | None = None
        self.saved_token: str | None = None

    def mail_refresh_token(self, account_id: str) -> str:
        return "old"

    def save_refresh_token(self, account_id: str, token: str) -> None:
        self.saved_token = token

    def own_addresses(self) -> set[str]:
        return {"maxwell@golaunchcontrol.com", "eris@golaunchcontrol.com"}

    def leads_for_threads(self, threads: list[str]) -> dict[str, str]:
        return {"c-crm": "lead-paul"} if "c-crm" in threads else {}

    def leads_by_emails(self, emails: list[str]) -> dict[str, str]:
        assert "maxwell@golaunchcontrol.com" not in emails
        return {"doug@zfever.com": "lead-doug"} if "doug@zfever.com" in emails else {}

    def known_message_ids(self, headers: list[str]) -> set[str]:
        return {"<crm@lc>"}

    def attach_provider_ids(self, header: str, message_id: str, thread_id: str | None) -> None:
        self.attached = (header, message_id, thread_id)

    def insert_message(self, row: dict[str, Any]) -> int:
        self.rows.append(row)
        return 1

    def set_sync_cursor(self, account_id: str, cursor: str) -> None:
        self.cursor = cursor

    def mark_mailbox_reconnect(self, account_id: str) -> None:
        raise AssertionError("not expected")


def test_sync_stores_every_message_and_skips_crm_sends() -> None:
    store, graph = FakeStore(), FakeGraph()
    account = {"id": "acc", "address": "maxwell@golaunchcontrol.com", "sync_cursor": None}
    n = outlook_sync.sync_account(store, graph, account, now=datetime(2026, 10, 19, tzinfo=UTC))  # type: ignore[arg-type]

    by_id = {r["provider_message_id"]: r for r in store.rows}
    assert n == 4 and set(by_id) == {"in-1", "in-2", "in-3", "sent-2"}
    assert store.attached == ("<crm@lc>", "sent-1", "c-crm")
    assert by_id["in-1"]["lead_id"] == "lead-paul" and by_id["in-1"]["body_text"] == "Yes!"
    assert by_id["in-3"]["direction"] == "in" and by_id["in-3"]["lead_id"] == "lead-doug"
    assert by_id["sent-2"]["direction"] == "out" and by_id["sent-2"]["lead_id"] == "lead-doug"
    assert json.loads(store.cursor or "{}") == {"v": 2, "inbox": "inbox-delta-2", "sentitems": "sent-delta-2"}
    assert store.saved_token == "rotated"
    assert "receivedDateTime+ge+2026-09-19T00:00:00Z" in graph.urls[0]


def test_mail_that_isnt_a_leads_is_stored_with_no_lead() -> None:
    store, graph = FakeStore(), FakeGraph()
    outlook_sync.sync_account(store, graph, {"id": "acc", "address": "maxwell@golaunchcontrol.com", "sync_cursor": None})  # type: ignore[arg-type]
    row = next(r for r in store.rows if r["provider_message_id"] == "in-2")
    assert row["lead_id"] is None
    assert row["folder"] == "inbox" and row["conversation_id"] == "c-x"
    assert row["from_name"] == "Shop News" and row["cc_address"] == "eris@golaunchcontrol.com"
    # Read in Outlook already, so it doesn't arrive unread; lead mail always does.
    assert row["read_at"] == "2026-10-19T20:00:00Z"
    assert next(r for r in store.rows if r["provider_message_id"] == "in-1")["read_at"] is None
    # Real attachments only: the inline signature image is skipped, bytes are never fetched.
    assert row["attachments"] == [{"name": "menu.pdf", "size": 2048, "type": "application/pdf", "provider_id": "att-1"}]
    assert sum("/attachments" in u for u in graph.urls) == 1


def test_sent_items_land_in_the_sent_folder_with_every_recipient() -> None:
    rows = outlook_sync.to_rows(
        {"id": "acc"},
        [{**msg("s", "c", "maxwell@golaunchcontrol.com", "a@x.com", "hi", "<h>"), "_folder": "sentitems",
          "toRecipients": [{"emailAddress": {"address": "a@x.com"}}, {"emailAddress": {"address": "b@y.com"}}]}],
        {"maxwell@golaunchcontrol.com"}, {}, {},
    )
    assert rows[0]["folder"] == "sent" and rows[0]["direction"] == "out"
    assert rows[0]["to_address"] == "a@x.com, b@y.com" and rows[0]["from_name"] == ""


def test_old_cursors_are_dropped_once_so_the_lookback_is_walked_again() -> None:
    store, graph = FakeStore(), FakeGraph()
    account = {"id": "acc", "address": "maxwell@golaunchcontrol.com",
               "sync_cursor": json.dumps({"inbox": "https://graph/inbox/d1", "sentitems": "https://graph/sent/d1"})}
    outlook_sync.sync_account(store, graph, account, now=datetime(2026, 10, 19, tzinfo=UTC))  # type: ignore[arg-type]
    assert "receivedDateTime+ge+" in graph.urls[0]


def test_sync_resumes_from_saved_delta_links() -> None:
    store, graph = FakeStore(), FakeGraph()
    account = {"id": "acc", "address": "maxwell@golaunchcontrol.com",
               "sync_cursor": json.dumps({"v": 2, "inbox": "https://graph/inbox/d1", "sentitems": "https://graph/sent/d1"})}
    outlook_sync.sync_account(store, graph, account)  # type: ignore[arg-type]
    assert [u for u in graph.urls if "/attachments" not in u] == ["https://graph/inbox/d1", "https://graph/sent/d1"]


def test_app_only_mode_reads_the_mailbox_as_the_app(monkeypatch):
    # App-only: no stored sign-in is touched; Graph paths address the mailbox, not /me.
    monkeypatch.setenv("MS_APP_MAILBOX", "Maxwell@GoLaunchControl.com")
    assert outlook_sync.me() == f"{outlook_sync.GRAPH}/users/maxwell@golaunchcontrol.com"

    class Graph:
        def app_token(self):
            return "app-token"

    class Store:
        def mail_refresh_token(self, _id):
            raise AssertionError("app-only mode must not read the user's refresh token")

    assert outlook_sync.access_token(Store(), Graph(), {"id": "a", "address": "maxwell@golaunchcontrol.com"}) == "app-token"


def test_user_mode_records_microsofts_reason(monkeypatch):
    monkeypatch.delenv("MS_APP_MAILBOX", raising=False)
    assert outlook_sync.me() == f"{outlook_sync.GRAPH}/me"
    flagged = {}

    class Graph:
        def refresh(self, _rt, scope="Mail.ReadWrite"):
            raise outlook_sync.ReconnectNeeded("AADSTS50076: MFA required")

    class Store:
        def mail_refresh_token(self, _id):
            return "rt"

        def mark_mailbox_reconnect(self, account_id, reason=""):
            flagged[account_id] = reason

    assert outlook_sync.access_token(Store(), Graph(), {"id": "a", "address": "x@y.z"}) is None
    assert flagged == {"a": "AADSTS50076: MFA required"}
