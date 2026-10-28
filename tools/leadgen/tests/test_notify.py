from __future__ import annotations

import json
import logging
from datetime import UTC, datetime, timedelta
from typing import Any

import httpx
import pytest
import respx
from test_guardian import FakeRest, healthy, sends

from leadgen import guardian, notify, outreach_writer, worker
from leadgen.copy_rules import has_time_words
from leadgen.outlook_sync import GraphClient

NOW = datetime(2026, 10, 27, 18, 0, tzinfo=UTC)
TOKEN_URL = "https://login.microsoftonline.com/tenant-x/oauth2/v2.0/token"
SEND_URL = "https://graph.microsoft.com/v1.0/users/box@example.test/sendMail"


class NoticeRest(FakeRest):
    """FakeRest plus the one database rule notify depends on: sent_notices.key is unique."""

    def handler(self, request: httpx.Request) -> httpx.Response:
        table = request.url.path.rsplit("/", 1)[-1]
        if request.method == "POST" and table == notify.TABLE:
            body = json.loads(request.content)
            if any(r["key"] == body["key"] for r in self.tables.setdefault(table, [])):
                self.requests.append((request.method, table))
                return httpx.Response(201, json=[])
            body.setdefault("created_at", datetime.now(UTC).isoformat())
            self.tables[table].append(body)
            self.requests.append((request.method, table))
            return httpx.Response(201, json=[body])
        return super().handler(request)

    def notice(self, key: str) -> dict[str, Any]:
        return next(r for r in self.tables[notify.TABLE] if r["key"] == key)


@pytest.fixture
def rest() -> Any:
    fake = NoticeRest()
    with respx.mock(assert_all_called=False) as mock:
        mock.route(host="sb.test").mock(side_effect=fake.handler)
        mock.post(TOKEN_URL).mock(return_value=httpx.Response(200, json={"access_token": "app-token", "expires_in": 3600}))
        fake.mock = mock
        yield fake


@pytest.fixture(autouse=True)
def _clean(monkeypatch: pytest.MonkeyPatch) -> None:
    guardian.reset_cache()
    for k in ("NOTIFY_TO", "CRM_URL", "MS_CLIENT_ID", "MS_CLIENT_SECRET", "MS_TENANT_ID", "MS_APP_MAILBOX"):
        monkeypatch.delenv(k, raising=False)
    monkeypatch.setattr(notify, "_mailer", None)
    monkeypatch.setattr(notify, "_warned", False)


def mailer(to: list[str] | None = None) -> notify.Mailer:
    return notify.Mailer(GraphClient("client-x", "secret-x", "tenant-x", http=httpx.Client()), "box@example.test",
                         to or ["ops@example.test"])


def graph(rest: NoticeRest, status: int = 202) -> respx.Route:
    assert rest.mock is not None
    return rest.mock.post(SEND_URL).mock(return_value=httpx.Response(status, json={} if status < 300 else
                                                                     {"error": {"message": "nope"}}))


def sent_mail(route: respx.Route) -> list[dict[str, Any]]:
    return [json.loads(c.request.content) for c in route.calls]


# --- the brief -----------------------------------------------------------------------------------

def brief_row(rest: NoticeRest, decision: str, started: datetime = NOW - timedelta(minutes=5)) -> None:
    rest.tables["agent_runs"].append({"id": "run-1", "agent": "mission-control", "status": "done",
                                      "started_at": started.isoformat(), "decision": decision})


def test_brief_is_mailed_once_without_a_sent_copy(rest: NoticeRest) -> None:
    route = graph(rest)
    brief_row(rest, "Latest window: 3 emails sent to 3 prospects, 0 prospect replies.\nDecision: Nothing needs a decision.")
    store = rest.store()
    assert notify.send_brief(store, mailer(), NOW) is True
    assert notify.send_brief(store, mailer(), NOW) is False  # same agent_run: never twice
    [mail] = sent_mail(route)
    assert mail["saveToSentItems"] is False
    msg = mail["message"]
    assert msg["subject"] == "Mission Control brief, 2026-10-27"
    assert msg["toRecipients"] == [{"emailAddress": {"address": "ops@example.test"}}]
    assert msg["body"]["contentType"] == "Text"
    assert "Decision: Nothing needs a decision." in msg["body"]["content"]
    assert "https://crm.golaunchcontrol.com/admin/ops" in msg["body"]["content"]
    assert route.calls[0].request.headers["authorization"] == "Bearer app-token"
    assert rest.notice("brief:run-1")["status"] == "sent"
    # Internal mail: nothing in the CRM's messages table, no agent rows, no Guardian pass.
    assert ("POST", "email_messages") not in rest.requests and ("PATCH", "email_messages") not in rest.requests
    assert [r["agent"] for r in rest.tables["agent_runs"]] == ["mission-control"]


def test_brief_drops_time_words_and_skips_stale_briefs(rest: NoticeRest) -> None:
    route = graph(rest)
    brief_row(rest, "We moved faster this week.\nDecision: Review 2 drafts.", started=NOW - timedelta(hours=30))
    assert notify.send_brief(rest.store(), mailer(), NOW) is False  # older than BRIEF_MAX_AGE
    rest.tables["agent_runs"][0]["started_at"] = (NOW - timedelta(hours=1)).isoformat()
    assert notify.send_brief(rest.store(), mailer(), NOW) is True
    body = sent_mail(route)[0]["message"]["body"]["content"]
    assert "faster" not in body and "Decision: Review 2 drafts." in body


# --- the halt ------------------------------------------------------------------------------------

def test_guardian_halt_alerts_once_in_plain_words(rest: NoticeRest) -> None:
    route = graph(rest)
    healthy(rest, email_messages=sends(25) + sends(5, status="failed", start=25))
    store = rest.store()
    assert guardian.run_once(store, NOW) is False and rest.halted()
    rest.tables["system_flags"][0]["updated_at"] = NOW.isoformat()

    assert notify.check_alerts(store, mailer(), NOW) == {"halt": 1, "reply": 0}
    assert notify.check_alerts(store, mailer(), NOW) == {"halt": 0, "reply": 0}
    [mail] = sent_mail(route)
    body = mail["message"]["body"]["content"]
    assert mail["message"]["subject"] == "Outbound halted"
    assert "The Guardian stopped all outbound email." in body
    assert "Too many emails from one mailbox bounced or failed: 5 of the last 30 (16.7%; the limit is 3%)." in body
    assert "clear it on the ops board" in body and "https://crm.golaunchcontrol.com/admin/ops" in body
    assert not has_time_words(body)

    # Cleared and tripped again: a new halt, a new alert.
    rest.tables["system_flags"][0]["updated_at"] = (NOW + timedelta(minutes=30)).isoformat()
    assert notify.check_alerts(store, mailer(), NOW)["halt"] == 1


def test_cap_halt_reason_survives_the_time_word_scrub(rest: NoticeRest) -> None:
    """The Guardian's own detail says 'daily cap', which the scrub would drop; the plain reason doesn't."""
    route = graph(rest)
    rest.tables["system_flags"][0].update(value=True, updated_at=NOW.isoformat(), updated_by="guardian")
    rest.tables["agent_runs"].append({"id": "g1", "agent": "guardian", "status": "halted", "started_at": NOW.isoformat(),
                                      "decision": "Halted outbound: mailbox a sends vs its daily cap: 410/400 (103%), over cap",
                                      "evidence": {"halted_by": ["x"], "checks": [
                                          {"check": "mailbox_cap", "ok": False, "halts": True, "count": 410, "cap": 400}]}})
    notify.check_alerts(rest.store(), mailer(), NOW)
    body = sent_mail(route)[0]["message"]["body"]["content"]
    assert "A mailbox went over its send cap: 410 sent against a cap of 400." in body
    assert "daily" not in body


def test_open_outbound_sends_no_halt_alert(rest: NoticeRest) -> None:
    route = graph(rest)
    assert notify.check_alerts(rest.store(), mailer(), NOW) == {"halt": 0, "reply": 0}
    assert not route.calls


# --- prospect replies ----------------------------------------------------------------------------

def leads() -> list[dict[str, Any]]:
    return [{"id": "L1", "business_name": "Apex Karting", "source": "lead-gen"},
            {"id": "L2", "business_name": "Site Visitor", "source": "website"}]


def inbound(mid: str, lead: str, subject: str, at: datetime) -> dict[str, Any]:
    return {"id": mid, "lead_id": lead, "direction": "in", "subject": subject, "body_text": "private words",
            "status": "received", "created_at": at.isoformat()}


def test_real_prospect_reply_alerts_once_without_the_body(rest: NoticeRest) -> None:
    route = graph(rest)
    store = rest.store()
    rest.tables["leads"] = leads()
    rest.tables["email_messages"] = [inbound("m-old", "L1", "Re: hello", NOW - timedelta(hours=2))]
    # First run seeds the watermark: the reply that came before notify existed is not alerted.
    assert notify.check_alerts(store, mailer(), NOW)["reply"] == 0
    wm = rest.notice(notify.WATERMARK_KEY)
    assert wm["kind"] == "watermark" and wm["created_at"] == NOW.isoformat()

    later = NOW + timedelta(minutes=10)
    rest.tables["email_messages"] += [
        inbound("m1", "L1", "Re: your car prep", later),
        inbound("m2", "L1", "Automatic reply: away", later),  # auto-reply: metrics.is_auto_reply
        inbound("m3", "L2", "Question", later),  # not a lead-gen prospect
        inbound("m5", "L1", "Undeliverable: Re: your car prep", later),  # bounce notices on the lead
        inbound("m6", "L1", "Delivery Status Notification (Failure)", later),
        inbound("m7", "L1", "Mail delivery failed: returning message to sender", later),
        inbound("m8", "L1", "Returned mail: see transcript", later),
        inbound("m9", "L1", "Delivery has failed to these recipients", later),
        {**inbound("m4", "L1", "Hi", later), "direction": "out"},
    ]
    assert notify.check_alerts(store, mailer(), later + timedelta(minutes=1))["reply"] == 1
    assert notify.check_alerts(store, mailer(), later + timedelta(minutes=2))["reply"] == 0
    [mail] = sent_mail(route)
    msg = mail["message"]
    assert msg["subject"] == "Prospect reply: Apex Karting"
    assert "Subject: Re: your car prep" in msg["body"]["content"]
    assert "https://crm.golaunchcontrol.com/admin/leads/L1" in msg["body"]["content"]
    assert "private words" not in json.dumps(mail) and not has_time_words(msg["body"]["content"])
    assert {r["key"] for r in rest.tables[notify.TABLE]} == {notify.WATERMARK_KEY, "reply:m1"}
    assert ("POST", "email_messages") not in rest.requests


def test_reply_alert_goes_out_even_while_outbound_is_halted(rest: NoticeRest, monkeypatch: pytest.MonkeyPatch) -> None:
    """Internal notices skip the Guardian gate and the caps entirely."""
    route = graph(rest)
    monkeypatch.setenv("CRM_URL", "https://crm.example.test/")
    rest.tables["system_flags"][0].update(value=True, updated_at=NOW.isoformat(), updated_by="eris")
    rest.tables["leads"] = leads()
    rest.tables[notify.TABLE] = [{"key": notify.WATERMARK_KEY, "kind": "watermark", "status": "sent", "attempts": 0,
                                  "created_at": (NOW - timedelta(days=1)).isoformat()}]
    rest.tables["email_messages"] = [inbound("m1", "L1", "Interested", NOW - timedelta(minutes=3))]
    monkeypatch.setattr(guardian, "allow_outbound", lambda *_a, **_k: pytest.fail("notify must not call the Guardian"))
    assert notify.check_alerts(rest.store(), mailer(), NOW) == {"halt": 1, "reply": 1}
    subjects = [m["message"]["subject"] for m in sent_mail(route)]
    assert subjects == ["Outbound halted", "Prospect reply: Apex Karting"]
    halt_body = sent_mail(route)[0]["message"]["body"]["content"]
    assert "set by eris" in halt_body and "https://crm.example.test/admin/ops" in halt_body


# --- idempotency + failures ----------------------------------------------------------------------

def test_failed_send_is_recorded_and_retried_a_bounded_number_of_times(rest: NoticeRest) -> None:
    route = graph(rest, status=500)
    brief_row(rest, "Decision: Nothing needs a decision.")
    store = rest.store()
    for _ in range(notify.MAX_ATTEMPTS + 2):
        assert notify.send_brief(store, mailer(), NOW) is False
    assert len(route.calls) == notify.MAX_ATTEMPTS
    row = rest.notice("brief:run-1")
    assert row["status"] == "failed" and row["attempts"] == notify.MAX_ATTEMPTS and "nope" in row["last_error"]


def test_failed_send_succeeds_on_retry(rest: NoticeRest) -> None:
    route = graph(rest, status=503)
    brief_row(rest, "Decision: Nothing needs a decision.")
    store = rest.store()
    assert notify.send_brief(store, mailer(), NOW) is False
    route.mock(return_value=httpx.Response(202))
    assert notify.send_brief(store, mailer(), NOW) is True
    row = rest.notice("brief:run-1")
    assert row["status"] == "sent" and row["attempts"] == 2 and row["last_error"] is None


def test_pending_row_from_a_crash_is_never_resent(rest: NoticeRest) -> None:
    route = graph(rest)
    brief_row(rest, "Decision: Nothing needs a decision.")
    rest.tables[notify.TABLE] = [{"key": "brief:run-1", "kind": "brief", "status": "pending", "attempts": 1}]
    assert notify.send_brief(rest.store(), mailer(), NOW) is False
    assert not route.calls


# --- config --------------------------------------------------------------------------------------

def test_missing_credentials_skip_quietly_and_log_once(rest: NoticeRest, caplog: pytest.LogCaptureFixture) -> None:
    brief_row(rest, "Decision: x")
    store = rest.store()
    with caplog.at_level(logging.WARNING, logger="leadgen.notify"):
        assert notify.check_alerts(store) == {}
        assert notify.send_brief(store) is False
        assert notify.check_alerts(store) == {}
    assert sum("notify off" in r.message for r in caplog.records) == 1
    assert rest.requests == []  # not even the watermark: it seeds once mail can actually go


def test_default_mailer_reads_env(monkeypatch: pytest.MonkeyPatch) -> None:
    for k, v in {"MS_CLIENT_ID": "c", "MS_CLIENT_SECRET": "s", "MS_TENANT_ID": "t",
                 "MS_APP_MAILBOX": "Box@Example.test", "NOTIFY_TO": "a@example.test, b@example.test,,bad"}.items():
        monkeypatch.setenv(k, v)
    m = notify.default_mailer()
    assert m is not None and m.mailbox == "box@example.test" and m.to == ["a@example.test", "b@example.test"]
    assert notify.default_mailer() is m


def test_recipients_default_to_eris() -> None:
    assert notify.recipients() == [notify.DEFAULT_TO]


# --- worker wiring -------------------------------------------------------------------------------

def test_crew_pass_sends_the_brief_after_mission_control_and_checks_alerts_every_pass(
        monkeypatch: pytest.MonkeyPatch) -> None:
    calls: list[str] = []
    monkeypatch.setattr(worker.outreach_writer, "STATE", outreach_writer.WriterState(last_pass=datetime.now(UTC)))
    monkeypatch.setattr(worker.mission_control, "run_daily", lambda *_a, **_k: calls.append("mission"))
    monkeypatch.setattr(worker.strategist, "run_weekly", lambda *_a, **_k: calls.append("strategist"))
    monkeypatch.setattr(worker.notify, "send_brief", lambda *_a, **_k: calls.append("brief"))

    def alerts(*_a: Any, **_k: Any) -> None:
        calls.append("alerts")
        raise RuntimeError("graph down")  # a notify failure never stops the crew

    monkeypatch.setattr(worker.notify, "check_alerts", alerts)
    worker.crew_pass(object(), check_due=True)  # type: ignore[arg-type]
    assert calls == ["mission", "brief", "strategist", "alerts"]
    calls.clear()
    worker.crew_pass(object(), check_due=False)  # type: ignore[arg-type]
    assert calls == ["alerts"]


def test_bounce_subjects_are_not_replies() -> None:
    for s in ("Undeliverable: Hi", "Delivery Status Notification (Failure)", "Mail delivery failed", "Returned mail",
              "Delivery has failed to these recipients", "Mail Delivery Subsystem"):
        assert notify.is_bounce(s), s
    for s in ("Re: delivery of the trailer", "Returned from the track", "Re: Undeliverable?"):
        assert not notify.is_bounce(s), s


def test_timeout_after_send_is_never_retried(rest: NoticeRest) -> None:
    assert rest.mock is not None
    route = rest.mock.post(SEND_URL).mock(side_effect=httpx.ReadTimeout("slow"))
    brief_row(rest, "Decision: Nothing needs a decision.")
    store = rest.store()
    assert notify.send_brief(store, mailer(), NOW) is False
    route.mock(return_value=httpx.Response(202))
    assert notify.send_brief(store, mailer(), NOW) is False
    assert len(route.calls) == 1
    row = rest.notice("brief:run-1")
    assert row["status"] == "pending" and row["last_error"].startswith("sent-unknown")


def test_token_failure_is_retryable(rest: NoticeRest) -> None:
    """The token call failing means sendMail was never reached: an ordinary failure, retried."""
    assert rest.mock is not None
    rest.mock.post(TOKEN_URL).mock(side_effect=httpx.ConnectError("down"))
    route = graph(rest)
    brief_row(rest, "Decision: Nothing needs a decision.")
    store = rest.store()
    assert notify.send_brief(store, mailer(), NOW) is False
    assert rest.notice("brief:run-1")["status"] == "failed"
    rest.mock.post(TOKEN_URL).mock(return_value=httpx.Response(200, json={"access_token": "t", "expires_in": 3600}))
    assert notify.send_brief(store, mailer(), NOW) is True and len(route.calls) == 1
