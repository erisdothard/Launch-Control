from __future__ import annotations

import json
from datetime import UTC, datetime, timedelta
from typing import Any

import httpx
import pytest
import respx
from test_guardian import FakeRest

from leadgen import alarms, campaigns, gmail_sync, guardian, mission_control, notify, outlook_sync
from leadgen.copy_rules import has_time_words
from leadgen.store import Store, StoreError

CRM = "https://crm.example.test"
SEND_CAMPAIGNS = f"{CRM}/api/automation/send-campaigns"
MS_TOKEN = "https://login.microsoftonline.com/tenant-x/oauth2/v2.0/token"
SECRET = "s3cr3t-automation-value-0123456789abcdef"


class HeartbeatRest(FakeRest):
    """FakeRest plus PostgREST's upsert on worker_heartbeats (merge-duplicates on the name key)."""

    def handler(self, request: httpx.Request) -> httpx.Response:
        table = request.url.path.rsplit("/", 1)[-1]
        if request.method == "POST" and table == "worker_heartbeats":
            self.requests.append((request.method, table))
            body = json.loads(request.content)
            rows = [r for r in self.tables.setdefault(table, []) if r["name"] != body["name"]]
            self.tables[table] = [*rows, body]
            return httpx.Response(201)
        return super().handler(request)

    def alarm(self, job: str) -> dict[str, Any]:
        return next(r["detail"] for r in self.tables["worker_heartbeats"] if r["name"] == f"alarm:{job}")


class FakeMailer:
    def __init__(self, fail: int = 0) -> None:
        self.sent: list[tuple[str, str]] = []
        self.fail = fail

    def send(self, subject: str, body: str) -> None:
        if self.fail:
            self.fail -= 1
            raise RuntimeError("Graph sendMail 500: nope")
        self.sent.append((subject, body))


@pytest.fixture
def rest() -> Any:
    fake = HeartbeatRest()
    with respx.mock(assert_all_called=False) as mock:
        mock.route(host="sb.test").mock(side_effect=fake.handler)
        fake.mock = mock
        yield fake


@pytest.fixture(autouse=True)
def _clean(monkeypatch: pytest.MonkeyPatch) -> FakeMailer:
    alarms.reset()
    guardian.reset_cache()
    for k in ("NOTIFY_TO", "CRM_URL", "MS_CLIENT_ID", "MS_CLIENT_SECRET", "MS_TENANT_ID", "MS_APP_MAILBOX"):
        monkeypatch.delenv(k, raising=False)
    mailer = FakeMailer()
    monkeypatch.setattr(notify, "_mailer", mailer)  # default_mailer() hands this out
    return mailer


@pytest.fixture
def mailer(_clean: FakeMailer) -> FakeMailer:
    return _clean


def crm_401(rest: HeartbeatRest) -> respx.Route:
    assert rest.mock is not None
    return rest.mock.post(SEND_CAMPAIGNS).mock(return_value=httpx.Response(401, json={"error": "unauthorized"}))


def campaign_env(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("AUTOMATION_SECRET", SECRET)
    monkeypatch.setenv("CRM_URL", CRM)
    monkeypatch.setattr(guardian, "allow_outbound", lambda store, now=None: True)


# --- the campaign caller -------------------------------------------------------------------------

def test_three_campaign_401s_send_one_plain_alarm_then_one_recovery(rest, mailer, monkeypatch) -> None:
    campaign_env(monkeypatch)
    route = crm_401(rest)
    store, http = rest.store(), httpx.Client()
    for _ in range(2):
        campaigns.run_once(http, store)
    assert mailer.sent == [] and rest.alarm("campaigns")["failures"] == 2

    campaigns.run_once(http, store)
    [(subject, body)] = mailer.sent
    assert subject == "Alarm: Campaign emails are not sending"
    assert "Campaign emails are not sending." in body
    assert "HTTP 401 from crm.example.test" in body and "3 times in a row" in body
    assert "AUTOMATION_SECRET on Vercel" in body and "Railway" in body
    assert SECRET not in body and "Bearer" not in body
    assert not has_time_words(body)
    assert body.endswith(notify.FOOTER)

    for _ in range(4):  # still failing: no repeats
        campaigns.run_once(http, store)
    assert len(mailer.sent) == 1 and rest.alarm("campaigns")["failures"] == 7

    route.mock(return_value=httpx.Response(200, json={"sent": 2}))
    assert campaigns.run_once(http, store) == {"sent": 2}
    assert [s for s, _ in mailer.sent] == ["Alarm: Campaign emails are not sending", "Recovered: Campaign emails are sending"]
    assert not has_time_words(mailer.sent[1][1])
    assert rest.alarm("campaigns") == {"kind": "alarm", "failures": 0, "alerted": False, "last_error": "",
                                       "first_failed_at": None}
    campaigns.run_once(http, store)
    assert len(mailer.sent) == 2  # a healthy job sends nothing


def test_a_restart_neither_re_alerts_nor_forgets_the_open_alarm(rest, mailer, monkeypatch) -> None:
    campaign_env(monkeypatch)
    route = crm_401(rest)
    store, http = rest.store(), httpx.Client()
    for _ in range(3):
        campaigns.run_once(http, store)
    assert len(mailer.sent) == 1 and rest.alarm("campaigns")["alerted"] is True

    alarms.reset()  # the worker restarts: memory gone, the row stays
    campaigns.run_once(http, store)
    assert len(mailer.sent) == 1 and rest.alarm("campaigns")["failures"] == 4

    alarms.reset()
    route.mock(return_value=httpx.Response(200, json={"sent": 0}))
    campaigns.run_once(http, store)
    assert mailer.sent[-1][0] == "Recovered: Campaign emails are sending"


def test_a_halt_is_not_a_failure(rest, mailer, monkeypatch) -> None:
    campaign_env(monkeypatch)
    monkeypatch.setattr(guardian, "allow_outbound", lambda store, now=None: False)
    route = crm_401(rest)
    for _ in range(5):
        campaigns.run_once(httpx.Client(), rest.store())
    assert not route.called and mailer.sent == []
    assert "worker_heartbeats" not in rest.tables


def test_an_alarm_that_fails_to_send_is_retried_on_the_next_failure(rest, monkeypatch) -> None:
    flaky = FakeMailer(fail=1)
    monkeypatch.setattr(notify, "_mailer", flaky)
    campaign_env(monkeypatch)
    crm_401(rest)
    store, http = rest.store(), httpx.Client()
    for _ in range(3):
        campaigns.run_once(http, store)
    assert flaky.sent == [] and rest.alarm("campaigns")["alerted"] is False
    campaigns.run_once(http, store)
    assert len(flaky.sent) == 1 and "4 times in a row" in flaky.sent[0][1]


def test_a_missing_crm_url_names_the_setting(rest, mailer, monkeypatch) -> None:
    campaign_env(monkeypatch)
    monkeypatch.delenv("CRM_URL")
    for _ in range(3):
        campaigns.run_once(httpx.Client(), rest.store())
    [(_, body)] = mailer.sent
    assert "Error: CRM_URL is not set." in body and "CRM_URL is not set on Railway" in body


def test_alarm_state_still_works_when_the_database_is_down(mailer) -> None:
    class DownStore(Store):
        def _req(self, *a: Any, **kw: Any) -> httpx.Response:
            raise StoreError("Supabase GET worker_heartbeats failed: ConnectError")

    store = DownStore("https://sb.test", "k", client=httpx.Client())
    exc = httpx.HTTPStatusError("x", request=httpx.Request("POST", SEND_CAMPAIGNS), response=httpx.Response(401))
    outcomes = [alarms.record(store, alarms.CAMPAIGNS, exc) for _ in range(4)]
    assert outcomes == [None, None, "alerted", None] and len(mailer.sent) == 1


# --- the Outlook and Gmail syncs -----------------------------------------------------------------

class OutlookStore(Store):
    def outlook_accounts(self) -> list[dict[str, Any]]:
        return [{"id": "acct-1", "address": "max@golaunchcontrol.com", "sync_cursor": None}]


def test_a_stale_ms_client_secret_alarms_once_with_the_fix(rest, mailer, monkeypatch) -> None:
    monkeypatch.setenv("MS_APP_MAILBOX", "max@golaunchcontrol.com")
    assert rest.mock is not None
    rest.mock.post(MS_TOKEN).mock(return_value=httpx.Response(401, json={
        "error": "invalid_client",
        "error_description": "AADSTS7000215: Invalid client secret provided. Trace ID: abc Correlation ID: def",
    }))
    store = OutlookStore("https://sb.test", "service-key", client=httpx.Client())
    graph = outlook_sync.GraphClient("client-x", "secret-x", "tenant-x", http=httpx.Client())
    for _ in range(5):
        outlook_sync.sync_all(store, graph)
    [(subject, body)] = mailer.sent
    assert subject == "Alarm: New mail in max@golaunchcontrol.com is not reaching the CRM"
    assert "HTTP 401 from login.microsoftonline.com (invalid_client AADSTS7000215)" in body
    assert "MS_CLIENT_SECRET on Railway" in body and "Certificates & secrets" in body
    assert "Trace ID" not in body and "secret-x" not in body
    assert not has_time_words(body)
    assert rest.alarm("outlook:max@golaunchcontrol.com")["failures"] == 5


def test_a_gmail_sign_in_refusal_alarms_per_account(rest, mailer) -> None:
    class GmailStore(Store):
        def gmail_accounts(self) -> list[dict[str, Any]]:
            return [{"id": "g-1", "address": "eris@gmail.example", "gmail_history_id": "1"}]

        def gmail_refresh_token(self, account_id: str) -> str | None:
            return "refresh-token"

    assert rest.mock is not None
    rest.mock.post("https://oauth2.googleapis.com/token").mock(return_value=httpx.Response(401, json={"error": "unauthorized_client"}))
    store = GmailStore("https://sb.test", "service-key", client=httpx.Client())
    gmail = gmail_sync.GmailClient("cid", "csecret", http=httpx.Client())
    for _ in range(3):
        gmail_sync.sync_all(store, gmail)
    [(subject, body)] = mailer.sent
    assert subject == "Alarm: Replies in the Gmail account eris@gmail.example are not reaching the CRM"
    assert "Reconnect the Gmail account" in body and "(unauthorized_client)" in body


# --- classify and Mission Control ----------------------------------------------------------------

def test_classify_never_carries_tokens_or_bodies() -> None:
    req = httpx.Request("GET", "https://graph.microsoft.com/v1.0/users/x/mailFolders/inbox/messages/delta?$deltatoken=abc123")
    f = alarms.classify(httpx.HTTPStatusError("x", request=req, response=httpx.Response(
        403, request=req, json={"error": {"code": "ErrorAccessDenied", "message": "lead@x.com secret body"}})))
    assert (f.category, f.error_class) == ("forbidden", "HTTP 403 from graph.microsoft.com (ErrorAccessDenied)")
    leak = alarms.classify(KeyError("Bearer eyJ0eXAiOiJKV1QiLCJhbGciOiJSUzI1NiJ9.payload token=" + "a" * 40))
    assert "eyJ0" not in leak.error_class and "a" * 40 not in leak.error_class
    db = alarms.classify(StoreError('Supabase GET leads -> 500: {"message":"lead@x.com"}'))
    assert db.error_class == "Supabase error (500)"
    net = alarms.classify(httpx.ConnectTimeout("boom", request=httpx.Request("POST", SEND_CAMPAIGNS)))
    assert (net.category, net.error_class) == ("network", "ConnectTimeout reaching crm.example.test")


def test_every_alarm_and_recovery_notice_is_free_of_time_words() -> None:
    jobs = [alarms.CAMPAIGNS, alarms.FOLLOW_UPS, alarms.MEETINGS, alarms.outlook_job("a@b.co"), alarms.gmail_job("c@d.co")]
    cats = ["auth", "forbidden", "not_found", "server", "http", "network", "config", "database", "other"]
    for job in jobs:
        for cat in cats:
            subject, body = alarms.alarm_notice(job, alarms.Failure(cat, "HTTP 500 from x"), 3)
            assert not has_time_words(subject + body), (job, cat)
            assert "Likely fix:" in body, (job, cat)
        assert not has_time_words(" ".join(alarms.recovered_notice(job)))


def test_mission_control_ignores_alarm_rows() -> None:
    now = datetime(2026, 11, 11, 18, 0, tzinfo=UTC)
    rest = FakeRest({"worker_heartbeats": [
        {"name": "automation", "beat_at": (now - timedelta(seconds=60)).isoformat(), "detail": {"every_s": 300}},
        {"name": "alarm:campaigns", "beat_at": (now - timedelta(days=9)).isoformat(), "detail": {"failures": 0}},
    ]})
    with respx.mock(assert_all_called=False) as mock:
        mock.route(host="sb.test").mock(side_effect=rest.handler)
        beats = mission_control.heartbeats(rest.store(), now)
    assert [b["name"] for b in beats] == ["automation"]
