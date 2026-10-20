from __future__ import annotations

from datetime import UTC, date, datetime
from typing import Any

import pytest

from leadgen import automation


def test_re_subject_adds_one_re() -> None:
    assert automation.re_subject("Quick question") == "Re: Quick question"
    assert automation.re_subject("RE: Quick question") == "RE: Quick question"
    assert automation.re_subject("") == "Following up"


def test_graph_time_reads_utc_with_seven_digit_fraction() -> None:
    assert automation._graph_time({"dateTime": "2026-10-21T15:00:00.0000000", "timeZone": "UTC"}) == "2026-10-21T15:00:00+00:00"
    assert automation._graph_time(None) is None


def test_team_today_is_chicago_day() -> None:
    # 03:00 UTC on the 20th is still the evening of the 19th in Nashville.
    assert automation.team_today(datetime(2026, 10, 20, 3, 0, tzinfo=UTC)) == date(2026, 10, 19)


class RecordingWriter:
    def __init__(self) -> None:
        self.prompts: list[str] = []

    def write(self, system: str, prompt: str) -> str:
        self.prompts.append(prompt)
        return "Hi Paul, body"


LEAD = {"id": "l1", "business_name": "Acme Freight", "email": "paul@acme.com", "contact_name": "Paul Smith"}
MSGS = [{"id": "m1", "direction": "out", "from_address": "max@x.com", "to_address": "paul@acme.com",
         "subject": "Hello", "body_text": "First email", "created_at": "2026-10-15T10:00:00Z", "account_id": "a1"}]


def test_last_follow_up_closes_the_loop_and_every_one_offers_an_out() -> None:
    w = RecordingWriter()
    automation.write_follow_up(w, LEAD, MSGS, 3, last=True)
    automation.write_follow_up(w, LEAD, MSGS, 1, last=False)
    assert "close the loop" in w.prompts[0]
    assert "close the loop" not in w.prompts[1]
    assert all("If it's not a fit" in p for p in w.prompts)
    assert all("Acme Freight" in p and "First email" in p for p in w.prompts)


def test_one_failing_step_does_not_stop_the_rest(monkeypatch: pytest.MonkeyPatch) -> None:
    calls: list[str] = []
    monkeypatch.setattr(automation, "load_settings", lambda store: automation.Settings(True, 3, 7))

    def boom(*_: Any) -> int:
        calls.append("meetings")
        raise RuntimeError("graph down")

    monkeypatch.setattr(automation, "sync_meetings", boom)
    monkeypatch.setattr(automation, "draft_replies", lambda *a: calls.append("replies") or 2)
    monkeypatch.setattr(automation, "queue_follow_ups", lambda *a: calls.append("follow_ups") or 1)
    monkeypatch.setattr(automation, "send_due_follow_ups", lambda: calls.append("sent") or 1)
    monkeypatch.setattr(automation, "close_gone_cold", lambda *a: calls.append("cold") or 0)
    out = automation.run_once(object(), RecordingWriter(), graph=object())  # type: ignore[arg-type]
    assert calls == ["meetings", "replies", "follow_ups", "sent", "cold"]
    assert out == {"meetings": 0, "replies": 2, "follow_ups": 1, "sent": 1, "cold": 0}


def test_send_is_skipped_without_a_secret(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.delenv("AUTOMATION_SECRET", raising=False)
    assert automation.send_due_follow_ups(http=object()) == 0  # type: ignore[arg-type]


class FakeStore:
    """Answers the few REST reads queue_follow_ups makes, records the writes."""

    def __init__(self, leads: list[dict[str, Any]], pending: list[str]) -> None:
        self.leads, self.pending = leads, pending
        self.drafts: list[dict[str, Any]] = []
        self.patches: list[tuple[str, dict[str, Any]]] = []

    def _req(self, method: str, path: str, **kw: Any) -> Any:
        store = self

        class R:
            def json(self) -> Any:
                if method == "GET" and path == "leads":
                    return store.leads
                if method == "GET" and path == "email_drafts":
                    return [{"lead_id": x} for x in store.pending]
                if method == "GET" and path == "email_messages":
                    return list(reversed(MSGS))
                if method == "POST" and path == "email_drafts":
                    store.drafts.append(kw["json"])
                    return [kw["json"]]
                return []

        return R()

    def patch_lead(self, lead_id: str, patch: dict[str, Any]) -> None:
        self.patches.append((lead_id, patch))


def test_follow_up_is_drafted_once_and_counted() -> None:
    store = FakeStore([{**LEAD, "follow_up_count": 0}, {**LEAD, "id": "l2", "follow_up_count": 1}], pending=["l2"])
    made = automation.queue_follow_ups(store, RecordingWriter(), automation.Settings(True, 3, 7), date(2026, 10, 19))  # type: ignore[arg-type]
    assert made == 1
    assert store.drafts[0]["lead_id"] == "l1" and store.drafts[0]["follow_up_number"] == 1
    assert store.drafts[0]["subject"] == "Re: Hello" and store.drafts[0]["to_address"] == "paul@acme.com"
    assert store.patches == [("l1", {"follow_up_count": 1, "next_action": "Follow-up 1 ready in Drafts"})]
