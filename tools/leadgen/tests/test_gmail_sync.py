from __future__ import annotations

import base64
from typing import Any

from leadgen import gmail_sync


def b64(text: str) -> str:
    return base64.urlsafe_b64encode(text.encode()).decode().rstrip("=")


def test_strip_quoted_reply_keeps_only_new_text() -> None:
    text = "Sounds good, call me Tuesday.\n\nOn Mon, Oct 17, 2026 at 3:00 PM Max <max@x.com> wrote:\n> Hi Paul"
    assert gmail_sync.strip_quoted_reply(text) == "Sounds good, call me Tuesday."


def test_plain_text_prefers_text_part() -> None:
    payload = {"mimeType": "multipart/alternative", "parts": [
        {"mimeType": "text/html", "body": {"data": b64("<p>hi</p>")}},
        {"mimeType": "text/plain", "body": {"data": b64("hi there")}},
    ]}
    assert gmail_sync.plain_text(payload) == "hi there"


class FakeResp:
    def __init__(self, body: dict[str, Any], status: int = 200) -> None:
        self._body, self.status_code = body, status

    def json(self) -> dict[str, Any]:
        return self._body

    def raise_for_status(self) -> None:
        return None


class FakeGmail:
    def access_token(self, refresh: str) -> str:
        return "tok"

    def get(self, token: str, path: str, **params: Any) -> FakeResp:
        if path == "/history":
            return FakeResp({"historyId": "200", "history": [{"messagesAdded": [
                {"message": {"id": "m-reply", "threadId": "t-known"}},
                {"message": {"id": "m-other", "threadId": "t-unrelated"}},
            ]}]})
        assert path == "/messages/m-reply", "only messages on CRM threads are fetched"
        return FakeResp({"payload": {"headers": [
            {"name": "From", "value": "Paul <paul@sebring.com>"},
            {"name": "To", "value": "max@gmail.com"},
            {"name": "Subject", "value": "Re: Corporate events"},
            {"name": "Message-ID", "value": "<abc@sebring.com>"},
        ], "mimeType": "text/plain", "body": {"data": b64("Yes, let's talk.\n\nOn Mon Max wrote:\n> hi")}}})


class FakeStore:
    def __init__(self) -> None:
        self.rows: list[dict[str, Any]] = []
        self.history: str | None = None

    def gmail_refresh_token(self, account_id: str) -> str:
        return "refresh"

    def leads_for_threads(self, ids: list[str]) -> dict[str, str]:
        return {"t-known": "lead-1"} if "t-known" in ids else {}

    def insert_message(self, row: dict[str, Any]) -> int:
        self.rows.append(row)
        return 1

    def set_history_id(self, account_id: str, history_id: str) -> None:
        self.history = history_id


def test_sync_stores_replies_on_known_threads_only() -> None:
    store = FakeStore()
    account = {"id": "acc", "address": "max@gmail.com", "gmail_history_id": "100"}
    assert gmail_sync.sync_account(store, FakeGmail(), account) == 1  # type: ignore[arg-type]
    row = store.rows[0]
    assert row["lead_id"] == "lead-1" and row["direction"] == "in"
    assert row["from_address"] == "paul@sebring.com"
    assert row["body_text"] == "Yes, let's talk."
    assert store.history == "200"
