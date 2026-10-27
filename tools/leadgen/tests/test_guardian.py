from __future__ import annotations

import json
import re
from datetime import UTC, datetime, timedelta
from typing import Any

import httpx
import pytest
import respx

from leadgen import automation, campaigns, guardian
from leadgen.store import Store

BASE = "https://sb.test"
NOW = datetime(2026, 10, 27, 18, 0, tzinfo=UTC)  # 13:00 in Chicago


def _s(v: Any) -> str:
    return "true" if v is True else "false" if v is False else "null" if v is None else str(v)


def _get(row: dict[str, Any], key: str) -> Any:
    val: Any = row
    for part in key.split("."):
        val = val.get(part) if isinstance(val, dict) else None
    return val


def _match(row: dict[str, Any], key: str, expr: str) -> bool:
    val = _get(row, key)
    op, _, arg = expr.partition(".")
    if op == "eq":
        return _s(val) == arg
    if op == "in":
        return _s(val) in arg.strip("()").split(",")
    if op == "gte":
        return val is not None and str(val) >= arg
    if op == "like":
        return val is not None and re.fullmatch(arg.replace("*", ".*"), str(val)) is not None
    if op == "not" and arg == "is.null":
        return val is not None
    raise AssertionError(f"unsupported filter {key}={expr}")


class FakeRest:
    """A tiny in-memory PostgREST: enough filters for the agents' reads, records every request."""

    RESERVED = {"select", "order", "limit", "offset"}

    def __init__(self, tables: dict[str, list[dict[str, Any]]] | None = None) -> None:
        self.tables: dict[str, list[dict[str, Any]]] = {"system_flags": [{"key": "outbound_halt", "value": False}],
                                                        "agent_runs": []}
        self.tables.update(tables or {})
        self.requests: list[tuple[str, str]] = []
        self.broken: set[str] = set()
        self.mock: respx.MockRouter | None = None

    def store(self) -> Store:
        return Store(BASE, "service-key", client=httpx.Client())

    def gets(self, table: str) -> int:
        return sum(1 for m, t in self.requests if m == "GET" and t == table)

    def handler(self, request: httpx.Request) -> httpx.Response:
        table = request.url.path.rsplit("/", 1)[-1]
        self.requests.append((request.method, table))
        if table in self.broken:
            return httpx.Response(404, json={"message": f"relation {table} does not exist"})
        params = dict(request.url.params)
        rows = self.tables.setdefault(table, [])
        filters = {k: v for k, v in params.items() if k not in self.RESERVED}
        if request.method == "POST":
            body = json.loads(request.content)
            row = {"id": f"{table}-{len(rows) + 1}", "started_at": datetime.now(UTC).isoformat(), **body}
            rows.append(row)
            return httpx.Response(201, json=[row])
        hit = [r for r in rows if all(_match(r, k, v) for k, v in filters.items())]
        if request.method == "PATCH":
            for r in hit:
                r.update(json.loads(request.content))
            return httpx.Response(204)
        if "order" in params:
            col, _, way = params["order"].partition(".")
            hit = sorted(hit, key=lambda r: str(r.get(col) or ""), reverse=way == "desc")
        off = int(params.get("offset", 0))
        lim = int(params.get("limit", 10_000))
        return httpx.Response(200, json=hit[off:off + lim])

    def runs(self, agent: str) -> list[dict[str, Any]]:
        return [r for r in self.tables["agent_runs"] if r["agent"] == agent]

    def halted(self) -> bool:
        return self.tables["system_flags"][0]["value"] is True


@pytest.fixture
def rest() -> Any:
    fake = FakeRest()
    with respx.mock(assert_all_called=False) as mock:
        mock.route(host="sb.test").mock(side_effect=fake.handler)
        fake.mock = mock
        yield fake


@pytest.fixture(autouse=True)
def _fresh_gate(monkeypatch: pytest.MonkeyPatch) -> None:
    guardian.reset_cache()
    monkeypatch.delenv("DAILY_SEND_CAP", raising=False)


def sends(n: int, account: str = "acct-a", status: str = "sent", start: int = 0, at: datetime = NOW,
          sent_by: str = "max@x.com") -> list[dict[str, Any]]:
    return [{"account_id": account, "to_address": f"p{start + i}@shop.com", "status": status, "direction": "out",
             "sent_by": sent_by, "created_at": (at - timedelta(minutes=i + 1)).isoformat()} for i in range(n)]


def healthy(rest: FakeRest, **extra: list[dict[str, Any]]) -> None:
    rest.tables.update({
        "email_messages": sends(30), "email_suppressions": [], "campaign_recipients": [],
        "automation_settings": [{"id": True, "daily_send_cap": 25}],
        "company_info": [{"id": True, "address": "1 Track Rd, Nashville, TN 37201"}],
    })
    rest.tables.update(extra)


def checks(run: dict[str, Any], name: str) -> list[dict[str, Any]]:
    return [c for c in run["evidence"]["checks"] if c["check"] == name]


def test_healthy_system_may_send_and_logs_one_row(rest: FakeRest) -> None:
    healthy(rest)
    assert guardian.run_once(rest.store(), NOW) is True
    [run] = rest.runs("guardian")
    assert run["status"] == "done" and not rest.halted()
    assert checks(run, "bounce_rate")[0]["sends"] == 30


def test_bounce_rate_over_three_percent_halts_with_exact_numbers(rest: FakeRest) -> None:
    msgs = sends(24) + sends(1, status="failed", start=24)
    healthy(rest, email_messages=msgs, email_suppressions=[{"email": "P3@shop.com", "reason": "bounce"},
                                                           {"email": "p4@shop.com", "reason": "opt_out"}])
    assert guardian.run_once(rest.store(), NOW) is False
    [run] = rest.runs("guardian")
    assert run["status"] == "halted" and rest.halted()
    assert rest.tables["system_flags"][0]["updated_by"] == "guardian"
    [b] = checks(run, "bounce_rate")
    assert (b["sends"], b["failed"], b["bounced_after_send"], b["rate"]) == (25, 1, 1, 0.08)
    assert "2/25" in run["decision"]


def test_bounces_are_not_judged_under_twenty_sends(rest: FakeRest) -> None:
    healthy(rest, email_messages=sends(10) + sends(5, status="failed", start=10))
    assert guardian.run_once(rest.store(), NOW) is True
    assert not rest.halted()


def test_bounce_window_is_the_last_200_per_mailbox(rest: FakeRest) -> None:
    old_failures = sends(10, status="failed", start=500, at=NOW - timedelta(days=30))
    healthy(rest, email_messages=sends(200) + old_failures + sends(25, account="acct-b", start=300))
    assert guardian.run_once(rest.store(), NOW) is True
    run = rest.runs("guardian")[0]
    by_acct = {c["account_id"]: c for c in checks(run, "bounce_rate")}
    assert by_acct["acct-a"]["sends"] == 200 and by_acct["acct-a"]["failed"] == 0
    assert by_acct["acct-b"]["sends"] == 25


def test_mailbox_cap_warns_above_90_percent_and_halts_above_100(rest: FakeRest, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("DAILY_SEND_CAP", "40")
    healthy(rest, email_messages=sends(37))
    assert guardian.run_once(rest.store(), NOW) is True
    run = rest.runs("guardian")[0]
    [cap] = checks(run, "mailbox_cap")
    assert cap["warn"] is True and cap["count"] == 37 and cap["cap"] == 40
    assert "near cap" in run["decision"]

    rest.tables["email_messages"] = sends(41)
    assert guardian.run_once(rest.store(), NOW) is False
    assert rest.halted()
    assert "41/40" in rest.runs("guardian")[1]["decision"]


def test_mailbox_cap_defaults_to_the_crm_limit(rest: FakeRest) -> None:
    healthy(rest)
    guardian.run_once(rest.store(), NOW)
    assert checks(rest.runs("guardian")[0], "mailbox_cap")[0]["cap"] == 400


def test_follow_up_cap_counts_automation_sends_since_the_team_day_began(rest: FakeRest) -> None:
    # 13:00 Chicago: 26 automation sends this morning, 30 more from yesterday evening don't count.
    today = sends(26, sent_by="automation", start=100, at=NOW - timedelta(hours=1))
    yesterday = sends(30, sent_by="automation", start=200, at=NOW - timedelta(hours=14))
    healthy(rest, email_messages=today + yesterday)
    assert guardian.run_once(rest.store(), NOW) is False
    [fu] = checks(rest.runs("guardian")[0], "follow_up_cap")
    assert (fu["count"], fu["cap"]) == (26, 25)


def test_suppressed_pending_recipient_in_a_live_campaign_halts(rest: FakeRest) -> None:
    recipients = [
        {"id": "r1", "email": "gone@shop.com", "status": "pending", "campaign_id": "c1", "email_campaigns": {"status": "sending"}},
        {"id": "r2", "email": "gone@shop.com", "status": "pending", "campaign_id": "c2", "email_campaigns": {"status": "draft"}},
        {"id": "r3", "email": "ok@shop.com", "status": "pending", "campaign_id": "c1", "email_campaigns": {"status": "sending"}},
    ]
    healthy(rest, campaign_recipients=recipients, email_suppressions=[{"email": "gone@shop.com", "reason": "opt_out"}])
    assert guardian.run_once(rest.store(), NOW) is False
    [s] = checks(rest.runs("guardian")[0], "suppressions")
    assert (s["pending_recipients"], s["suppressed_pending"]) == (2, 1)
    assert s["examples"] == [{"recipient_id": "r1", "campaign_id": "c1"}]


def test_missing_postal_address_warns_but_does_not_halt(rest: FakeRest) -> None:
    assert guardian.FOOTER_ADDRESS_HALTS is False
    healthy(rest, company_info=[{"id": True, "address": "  "}])
    assert guardian.run_once(rest.store(), NOW) is True
    run = rest.runs("guardian")[0]
    assert run["status"] == "done" and not rest.halted()
    assert "WARNING: no postal address: CAN-SPAM footer cannot be sent" in run["evidence"]["warnings"]


def test_missing_postal_address_halts_once_the_constant_is_flipped(rest: FakeRest, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(guardian, "FOOTER_ADDRESS_HALTS", True)
    healthy(rest, company_info=[{"id": True, "address": ""}])
    assert guardian.run_once(rest.store(), NOW) is False


def test_already_halted_logs_and_skips_the_checks(rest: FakeRest) -> None:
    healthy(rest)
    rest.tables["system_flags"][0]["value"] = True
    assert guardian.run_once(rest.store(), NOW) is False
    [run] = rest.runs("guardian")
    assert run["status"] == "halted" and run["evidence"] == {"already_halted": True}
    assert rest.gets("email_messages") == 0


def test_gate_caches_the_full_check_but_reads_the_halt_every_call(rest: FakeRest, monkeypatch: pytest.MonkeyPatch) -> None:
    healthy(rest)
    clock = [1000.0]
    monkeypatch.setattr(guardian, "_clock", lambda: clock[0])
    store = rest.store()
    assert guardian.allow_outbound(store, NOW) is True
    clock[0] += 60
    assert guardian.allow_outbound(store, NOW) is True
    assert len(rest.runs("guardian")) == 1
    rest.tables["system_flags"][0]["value"] = True  # a halt set elsewhere takes effect on the next call
    assert guardian.allow_outbound(store, NOW) is False
    clock[0] += guardian.CHECK_EVERY_S
    rest.tables["system_flags"][0]["value"] = False
    assert guardian.allow_outbound(store, NOW) is True
    assert len(rest.runs("guardian")) == 2


def test_gate_fails_closed_when_the_check_errors(rest: FakeRest) -> None:
    healthy(rest)
    rest.broken.add("agent_runs")  # the migration not applied yet
    assert guardian.allow_outbound(rest.store(), NOW) is False


def test_campaign_sender_skips_the_crm_call_while_halted(rest: FakeRest, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("AUTOMATION_SECRET", "x")
    monkeypatch.setenv("CRM_URL", "https://crm.example.com")
    healthy(rest)
    rest.tables["system_flags"][0]["value"] = True
    crm = rest.mock.post("https://crm.example.com/api/automation/send-campaigns").mock(return_value=httpx.Response(200, json={"sent": 1}))
    assert campaigns.run_once(httpx.Client(), rest.store()) == {}
    assert not crm.called


def test_campaign_sender_calls_the_crm_when_clear(rest: FakeRest, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("AUTOMATION_SECRET", "x")
    monkeypatch.setenv("CRM_URL", "https://crm.example.com")
    healthy(rest)
    crm = rest.mock.post("https://crm.example.com/api/automation/send-campaigns").mock(return_value=httpx.Response(200, json={"sent": 1}))
    assert campaigns.run_once(httpx.Client(), rest.store()) == {"sent": 1}
    assert crm.called


def test_campaign_sender_without_a_store_sends_nothing(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("AUTOMATION_SECRET", "x")
    monkeypatch.setenv("CRM_URL", "https://crm.example.com")

    class Boom:
        def post(self, *a: Any, **k: Any) -> None:
            raise AssertionError("must not be called")

    assert campaigns.run_once(Boom(), None) == {}  # type: ignore[arg-type]


def test_follow_up_sender_skips_the_crm_call_while_halted(rest: FakeRest, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("AUTOMATION_SECRET", "x")
    monkeypatch.setenv("CRM_URL", "https://crm.example.com")
    healthy(rest)
    rest.tables["system_flags"][0]["value"] = True
    crm = rest.mock.post("https://crm.example.com/api/automation/send-follow-ups").mock(return_value=httpx.Response(200, json={"sent": 2}))
    assert automation.send_due_follow_ups(httpx.Client(), store=rest.store()) == 0
    assert not crm.called


def test_follow_up_sender_calls_the_crm_when_clear(rest: FakeRest, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("AUTOMATION_SECRET", "x")
    monkeypatch.setenv("CRM_URL", "https://crm.example.com")
    healthy(rest)
    rest.mock.post("https://crm.example.com/api/automation/send-follow-ups").mock(return_value=httpx.Response(200, json={"sent": 2}))
    assert automation.send_due_follow_ups(httpx.Client(), store=rest.store()) == 2


def test_follow_up_sender_without_supabase_env_sends_nothing(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("AUTOMATION_SECRET", "x")
    monkeypatch.delenv("SUPABASE_URL", raising=False)
    monkeypatch.setattr(guardian, "_default_store", None)

    class Boom:
        def post(self, *a: Any, **k: Any) -> None:
            raise AssertionError("must not be called")

    assert automation.send_due_follow_ups(Boom()) == 0  # type: ignore[arg-type]
