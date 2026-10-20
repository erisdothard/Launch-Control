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


def msg(mid: str, conv: str, sender: str, to: str, body: str, header: str) -> dict[str, Any]:
    return {"id": mid, "conversationId": conv, "internetMessageId": header, "subject": "Re: hello",
            "from": {"emailAddress": {"address": sender}}, "toRecipients": [{"emailAddress": {"address": to}}],
            "body": {"content": body}, "receivedDateTime": "2026-10-19T20:00:00Z", "isDraft": False}


class FakeGraph:
    def __init__(self) -> None:
        self.urls: list[str] = []

    def refresh(self, refresh: str) -> dict[str, Any]:
        return {"access_token": "tok", "refresh_token": "rotated"}

    def get(self, token: str, url: str) -> FakeResp:
        self.urls.append(url)
        if "/inbox/" in url:
            return FakeResp({"value": [
                msg("in-1", "c-crm", "paul@sebring.com", "maxwell@golaunchcontrol.com", "Yes!\n\nFrom: Max\nSent: x", "<a@s>"),
                msg("in-2", "c-x", "newsletter@spam.com", "maxwell@golaunchcontrol.com", "buy", "<b@s>"),
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


def test_sync_stores_only_lead_mail_and_skips_crm_sends() -> None:
    store, graph = FakeStore(), FakeGraph()
    account = {"id": "acc", "address": "maxwell@golaunchcontrol.com", "sync_cursor": None}
    n = outlook_sync.sync_account(store, graph, account, now=datetime(2026, 10, 19, tzinfo=UTC))  # type: ignore[arg-type]

    by_id = {r["provider_message_id"]: r for r in store.rows}
    assert n == 3 and set(by_id) == {"in-1", "in-3", "sent-2"}
    assert store.attached == ("<crm@lc>", "sent-1", "c-crm")
    assert by_id["in-1"]["lead_id"] == "lead-paul" and by_id["in-1"]["body_text"] == "Yes!"
    assert by_id["in-3"]["direction"] == "in" and by_id["in-3"]["lead_id"] == "lead-doug"
    assert by_id["sent-2"]["direction"] == "out" and by_id["sent-2"]["lead_id"] == "lead-doug"
    assert json.loads(store.cursor or "{}") == {"inbox": "inbox-delta-2", "sentitems": "sent-delta-2"}
    assert store.saved_token == "rotated"
    assert "receivedDateTime+ge+2026-10-05T00:00:00Z" in graph.urls[0]


def test_sync_resumes_from_saved_delta_links() -> None:
    store, graph = FakeStore(), FakeGraph()
    account = {"id": "acc", "address": "maxwell@golaunchcontrol.com",
               "sync_cursor": json.dumps({"inbox": "https://graph/inbox/d1", "sentitems": "https://graph/sent/d1"})}
    outlook_sync.sync_account(store, graph, account)  # type: ignore[arg-type]
    assert graph.urls == ["https://graph/inbox/d1", "https://graph/sent/d1"]
