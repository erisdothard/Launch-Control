from __future__ import annotations

from typing import Any

import httpx
import pytest

from leadgen import campaigns


class FakeHttp:
    def __init__(self, body: Any = None, status: int = 200) -> None:
        self.body = {"sent": 3, "failed": 1, "followUps": 0} if body is None else body
        self.status = status
        self.calls: list[tuple[str, dict[str, str]]] = []

    def post(self, url: str, headers: dict[str, str]) -> httpx.Response:
        self.calls.append((url, headers))
        return httpx.Response(self.status, json=self.body, request=httpx.Request("POST", url))


def test_nothing_is_called_without_a_secret(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.delenv("AUTOMATION_SECRET", raising=False)
    http = FakeHttp()
    assert campaigns.send_due_campaigns(http=http) == {}  # type: ignore[arg-type]
    assert http.calls == []


def test_calls_the_crm_route_with_the_bearer_secret(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("AUTOMATION_SECRET", "s3cret")
    monkeypatch.setenv("CRM_URL", "https://crm.example.com/")
    http = FakeHttp()
    out = campaigns.send_due_campaigns(http=http)  # type: ignore[arg-type]
    assert http.calls == [("https://crm.example.com/api/automation/send-campaigns", {"Authorization": "Bearer s3cret"})]
    assert out == {"sent": 3, "failed": 1, "followUps": 0}


def test_defaults_to_the_production_crm(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("AUTOMATION_SECRET", "x")
    monkeypatch.delenv("CRM_URL", raising=False)
    http = FakeHttp()
    campaigns.send_due_campaigns(http=http)  # type: ignore[arg-type]
    assert http.calls[0][0] == f"{campaigns.DEFAULT_CRM_URL}/api/automation/send-campaigns"


def test_only_integer_counts_are_kept(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("AUTOMATION_SECRET", "x")
    http = FakeHttp(body={"sent": 2, "error": "nope", "flag": True})
    assert campaigns.send_due_campaigns(http=http) == {"sent": 2}  # type: ignore[arg-type]


def test_a_crm_error_raises_but_run_once_survives_it(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("AUTOMATION_SECRET", "x")
    http = FakeHttp(body={"error": "unauthorized"}, status=401)
    with pytest.raises(httpx.HTTPStatusError):
        campaigns.send_due_campaigns(http=http)  # type: ignore[arg-type]
    assert campaigns.run_once(http=http) == {}  # type: ignore[arg-type]


def test_background_sender_stays_off_without_a_secret(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.delenv("AUTOMATION_SECRET", raising=False)
    assert campaigns.start_background() is None
