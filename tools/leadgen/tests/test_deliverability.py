from __future__ import annotations

import base64
import email
from datetime import UTC, datetime, timedelta
from email import policy
from typing import Any

import httpx
import pytest
import respx
from test_alarms import FakeMailer, HeartbeatRest

from leadgen import deliverability, dns_check, notify, outlook_sync
from leadgen.copy_rules import has_time_words
from leadgen.outlook_sync import GraphClient

NOW = datetime(2026, 11, 11, 18, 0, tzinfo=UTC)
BOX = "max@golaunchcontrol.com"
TOKEN_URL = "https://login.microsoftonline.com/tenant-x/oauth2/v2.0/token"
SEND_URL = f"https://graph.microsoft.com/v1.0/users/{BOX}/sendMail"
SENT_ITEMS = f"https://graph.microsoft.com/v1.0/users/{BOX}/mailFolders/sentitems/messages"

# The markup mail-tester's free HTML report uses (trimmed from a real report, 2026-11-11).
REPORT = """
<div id="report-total" class="subtitle clearfix mb-3">Your lovely total: {score}/10</div>
<span class="score">{score}/10</span>
<div class="test-result message-content my-3"><div class="header clearfix"><div class="status success icon-check"></div>
  <h2 class="title"><i class="icon-down"></i>Click here to view your message</h2></div></div>
<div class="test-result spamassassin"><div class="header clearfix"><div class="status warning">-0.9</div>
  <h2 class="title"><i class="icon-down"></i>SpamAssassin thinks you can improve</h2></div>
  <table class="table"><tbody>
  <tr class="sa-test"><td class="text-center sa-test-score status-warning">-0.8</td><td class="sa-test-name"><samp>FROM_FMBLA_NEWDOM28</samp></td><td class="sa-test-description">From domain was registered in last 14-28 days</td></tr>
  <tr class="sa-test"><td class="text-center sa-test-score status-warning">-0.001</td><td class="sa-test-name"><samp>HTML_MESSAGE</samp></td><td class="sa-test-description">HTML included in message</td></tr>
  <tr class="sa-test"><td class="text-center sa-test-score status-success">0.1</td><td class="sa-test-name"><samp>DKIM_VALID</samp></td><td class="sa-test-description">valid</td></tr>
  </tbody></table></div>
<div class="test-result dkim"><div class="header clearfix"><div class="status success icon-check"></div>
  <h3 class="title"><i class="icon-down"></i>Your DKIM signature is valid</h3></div></div>
<div class="test-result reverse-dns"><div class="header clearfix"><div class="status warning icon-check"></div>
  <h3 class="title"><i class="icon-down"></i>Your reverse DNS does not match with your sending domain.</h3></div></div>
<div class="test-result blacklists"><div class="header clearfix"><div class="h-100 status success icon-check"></div>
  <h2 class="title"><i class="icon-down"></i>You're not blocklisted</h2></div>
  <div class="bl-result"><span class="status-success">Not listed</span> in <a href="#">Spamhaus</a></div>
  <div class="bl-result"><span class="status-warning">Yellow listed</span> in <a href="#">Hostkarma</a></div></div>
"""


def test_parse_report_reads_the_score_and_what_cost_points() -> None:
    report = deliverability.parse_report(REPORT.format(score="7.1"))
    assert report.score == 7.1
    assert report.reasons == [
        "SpamAssassin FROM_FMBLA_NEWDOM28 (-0.8): From domain was registered in last 14-28 days",
        "Your reverse DNS does not match with your sending domain.",
        "Blocklist: Yellow listed in Hostkarma",
    ]
    assert deliverability.parse_report("<html>changed layout</html>").score is None


# --- DNS -----------------------------------------------------------------------------------------

def doh(records: dict[tuple[str, str], list[tuple[int, str]]], broken: bool = False):
    def answer(request: httpx.Request) -> httpx.Response:
        if broken:
            return httpx.Response(502)
        name, rtype = request.url.params["name"], request.url.params["type"]
        ans = records.get((name, rtype))
        if ans is None:
            return httpx.Response(200, json={"Status": 3})
        return httpx.Response(200, json={"Status": 0, "Answer": [{"type": t, "data": d} for t, d in ans]})
    return answer


def healthy_dns() -> dict[tuple[str, str], list[tuple[int, str]]]:
    key = (16, '"v=DKIM1; k=rsa; p=MIIBIjANBgkq"')
    return {
        ("golaunchcontrol.com", "TXT"): [(16, '"v=spf1 include:secureserver.net -all"'), (16, '"MS=ms123"')],
        ("secureserver.net", "TXT"): [(16, '"v=spf1 include:spf-0.secureserver.net -all"')],
        ("spf-0.secureserver.net", "TXT"): [(16, '"v=spf1 ip4:1.2.3.4 include:spf.protection.outlook.com -all"')],
        ("_dmarc.golaunchcontrol.com", "TXT"): [(16, '"v=DMARC1; p=quarantine;"')],
        ("selector1._domainkey.golaunchcontrol.com", "TXT"): [(5, "selector1-x.dkim.mail.microsoft."), key],
        ("selector2._domainkey.golaunchcontrol.com", "TXT"): [(5, "selector2-x.dkim.mail.microsoft."), key],
    }


def test_spf_is_followed_through_includes_to_microsoft() -> None:
    with respx.mock() as mock:
        mock.route(host="cloudflare-dns.com").mock(side_effect=doh(healthy_dns()))
        checks = dns_check.run_checks(httpx.Client(), "golaunchcontrol.com")
    assert [(c.name, c.ok) for c in checks] == [("spf", True), ("dmarc", True), ("dkim-selector1", True),
                                                 ("dkim-selector2", True)]


def test_a_dkim_cname_with_no_key_behind_it_fails() -> None:
    records = healthy_dns()
    records[("selector2._domainkey.golaunchcontrol.com", "TXT")] = [(5, "selector2-x.dkim.mail.microsoft.")]
    with respx.mock() as mock:
        mock.route(host="cloudflare-dns.com").mock(side_effect=doh(records))
        check = dns_check.check_dkim(httpx.Client(), "golaunchcontrol.com", "selector2")
    assert check.ok is False and "no DKIM key" in check.detail


@pytest.fixture
def rest() -> Any:
    fake = HeartbeatRest({"email_accounts": [{"address": BOX, "signature_name": "Maxwell Hartmann"}],
                          "company_info": [{"id": True, "address": "1 Track Rd, Sebring, FL 33870"}]})
    with respx.mock(assert_all_called=False) as mock:
        mock.route(host="sb.test").mock(side_effect=fake.handler)
        mock.post(TOKEN_URL).mock(return_value=httpx.Response(200, json={"access_token": "app-token", "expires_in": 3600}))
        fake.mock = mock
        yield fake


@pytest.fixture(autouse=True)
def _env(monkeypatch: pytest.MonkeyPatch) -> None:
    for k in ("DELIVERABILITY_CHECK", "MAILTESTER_CHECK", "MS_CLIENT_ID", "MS_CLIENT_SECRET", "MS_TENANT_ID", "NOTIFY_TO"):
        monkeypatch.delenv(k, raising=False)
    monkeypatch.setenv("MS_APP_MAILBOX", BOX)
    monkeypatch.setattr(notify, "_mailer", None)


def state(rest: HeartbeatRest) -> dict[str, Any]:
    return next(r["detail"] for r in rest.tables["worker_heartbeats"] if r["name"] == "deliverability")


def graph() -> GraphClient:
    return GraphClient("client-x", "secret-x", "tenant-x", http=httpx.Client())


def test_dns_regression_is_reported_once_and_a_lookup_blip_never_alerts(rest) -> None:
    mailer, records = FakeMailer(), healthy_dns()
    del records[("_dmarc.golaunchcontrol.com", "TXT")]
    route = rest.mock.route(host="cloudflare-dns.com").mock(side_effect=doh(records))
    store, http = rest.store(), httpx.Client()

    out = deliverability.run_once(store, http=http, mailer=mailer, now=NOW)
    assert out == {"dns": "regressed", "mail-tester": "off"}
    [(subject, body)] = mailer.sent
    assert subject == "Email authentication problem on golaunchcontrol.com"
    assert "DMARC" in body and "No DMARC record at _dmarc.golaunchcontrol.com." in body and "GoDaddy" in body
    assert not has_time_words(body)
    assert state(rest)["dns"] == {"spf": True, "dmarc": False, "dkim-selector1": True, "dkim-selector2": True}

    assert deliverability.run_once(store, http=http, mailer=mailer, now=NOW + timedelta(hours=1))["dns"] == "not-due"
    deliverability.run_once(store, http=http, mailer=mailer, now=NOW + timedelta(days=8))
    assert len(mailer.sent) == 1  # still missing, already reported

    route.mock(side_effect=doh({}, broken=True))  # resolvers down: unknown, keeps the last verdict
    rest.mock.route(host="dns.google").mock(side_effect=doh({}, broken=True))
    assert deliverability.run_once(store, http=http, mailer=mailer, now=NOW + timedelta(days=16))["dns"] == "ok"
    assert len(mailer.sent) == 1 and state(rest)["dns"]["dmarc"] is False


def test_mail_tester_is_opt_in(rest) -> None:
    rest.mock.route(host="cloudflare-dns.com").mock(side_effect=doh(healthy_dns()))
    send = rest.mock.post(SEND_URL).mock(return_value=httpx.Response(202))
    out = deliverability.run_once(rest.store(), http=httpx.Client(), graph=graph(), mailer=FakeMailer(), now=NOW)
    assert out == {"dns": "ok", "mail-tester": "off"} and not send.called


def test_mail_tester_round_sends_one_probe_and_reports_a_low_score(rest, monkeypatch) -> None:
    monkeypatch.setenv("MAILTESTER_CHECK", "on")
    mailer = FakeMailer()
    rest.mock.route(host="cloudflare-dns.com").mock(side_effect=doh(healthy_dns()))
    rest.mock.get("https://www.mail-tester.com/").mock(return_value=httpx.Response(
        200, text='<input type="text" id="email" data-prefix="test" data-domain="srv9.mail-tester.com" name="id"/>'))
    send = rest.mock.post(SEND_URL).mock(return_value=httpx.Response(202))
    store, http = rest.store(), httpx.Client()

    assert deliverability.run_once(store, http=http, graph=graph(), mailer=mailer, now=NOW)["mail-tester"] == "sent"
    pending = state(rest)["pending"]
    assert pending["address"].endswith("@srv9.mail-tester.com") and pending["mailbox_id"].startswith("test-")
    [call] = send.calls
    assert call.request.headers["content-type"] == "text/plain"
    assert call.request.headers["authorization"] == "Bearer app-token"
    mime = email.message_from_bytes(base64.b64decode(call.request.content), policy=policy.default)
    assert mime["To"] == pending["address"] and mime["From"] == f"Maxwell Hartmann <{BOX}>"
    assert mime["List-Unsubscribe"] == f"<mailto:{BOX}?subject=unsubscribe>"
    assert mime["Message-ID"] == pending["message_id"]
    assert {p.get_content_type() for p in mime.iter_parts()} == {"text/plain", "text/html"}
    assert "1 Track Rd, Sebring, FL 33870" in mime.get_body(("plain",)).get_content()

    mid = pending["mailbox_id"]
    json_route = rest.mock.get(f"https://www.mail-tester.com/{mid}", params={"format": "json"}).mock(
        return_value=httpx.Response(200, json={"status": False, "title": "Mail not found."}))
    rest.mock.get(SENT_ITEMS).mock(return_value=httpx.Response(200, json={"value": [{"id": "sent-1"}]}))
    move = rest.mock.post(f"https://graph.microsoft.com/v1.0/users/{BOX}/messages/sent-1/move").mock(
        return_value=httpx.Response(201, json={}))
    assert deliverability.run_once(store, http=http, graph=graph(), mailer=mailer,
                                   now=NOW + timedelta(minutes=1))["mail-tester"] == "waiting"
    assert deliverability.run_once(store, http=http, graph=graph(), mailer=mailer,
                                   now=NOW + timedelta(minutes=10))["mail-tester"] == "waiting"  # not arrived yet

    json_route.mock(return_value=httpx.Response(200, json={"status": True, "access": False}))
    rest.mock.get(f"https://www.mail-tester.com/{mid}").mock(return_value=httpx.Response(200, text=REPORT.format(score="7.1")))
    assert deliverability.run_once(store, http=http, graph=graph(), mailer=mailer,
                                   now=NOW + timedelta(minutes=20))["mail-tester"] == "scored"
    assert move.called and move.calls[0].request.content == b'{"destinationId":"deleteditems"}'
    [(subject, body)] = mailer.sent
    assert subject == "Deliverability score 7.1/10"
    assert "FROM_FMBLA_NEWDOM28" in body and "Hostkarma" in body and f"https://www.mail-tester.com/{mid}" in body
    assert not has_time_words(body.split("What mail-tester flagged:")[0])  # our words; mail-tester's are quoted
    assert state(rest)["last_score"] == 7.1 and state(rest)["pending"] is None

    assert deliverability.run_once(store, http=http, graph=graph(), mailer=mailer,
                                   now=NOW + timedelta(days=1))["mail-tester"] == "not-due"
    assert len(send.calls) == 1


def test_a_good_score_is_stored_without_a_notice(rest, monkeypatch) -> None:
    monkeypatch.setenv("MAILTESTER_CHECK", "on")
    mailer = FakeMailer()
    rest.mock.route(host="cloudflare-dns.com").mock(side_effect=doh(healthy_dns()))
    rest.mock.get("https://www.mail-tester.com/").mock(return_value=httpx.Response(500))  # falls back to defaults
    rest.mock.post(SEND_URL).mock(return_value=httpx.Response(202))
    store, http = rest.store(), httpx.Client()
    deliverability.run_once(store, http=http, graph=graph(), mailer=mailer, now=NOW)
    pending = state(rest)["pending"]
    assert pending["address"].endswith("@srv1.mail-tester.com")
    mid = pending["mailbox_id"]
    rest.mock.get(SENT_ITEMS).mock(return_value=httpx.Response(200, json={"value": []}))
    rest.mock.get(f"https://www.mail-tester.com/{mid}", params={"format": "json"}).mock(
        return_value=httpx.Response(200, json={"status": True}))
    rest.mock.get(f"https://www.mail-tester.com/{mid}").mock(return_value=httpx.Response(200, text=REPORT.format(score="9.4")))
    deliverability.run_once(store, http=http, graph=graph(), mailer=mailer, now=NOW + timedelta(minutes=5))
    assert mailer.sent == [] and state(rest)["last_score"] == 9.4


def test_a_failed_probe_send_frees_the_round(rest, monkeypatch) -> None:
    monkeypatch.setenv("MAILTESTER_CHECK", "on")
    rest.mock.route(host="cloudflare-dns.com").mock(side_effect=doh(healthy_dns()))
    rest.mock.get("https://www.mail-tester.com/").mock(return_value=httpx.Response(500))
    send = rest.mock.post(SEND_URL).mock(return_value=httpx.Response(403, json={"error": {"code": "ErrorAccessDenied"}}))
    store, http = rest.store(), httpx.Client()
    assert deliverability.run_once(store, http=http, graph=graph(), now=NOW)["mail-tester"] == "error"
    assert state(rest)["pending"] is None and "last_sent_at" not in state(rest)
    send.mock(return_value=httpx.Response(202))
    assert deliverability.run_once(store, http=http, graph=graph(), now=NOW + timedelta(minutes=10))["mail-tester"] == "sent"


def test_deliverability_check_off_does_nothing(rest, monkeypatch) -> None:
    monkeypatch.setenv("DELIVERABILITY_CHECK", "off")
    assert deliverability.run_once(rest.store(), http=httpx.Client(), now=NOW) == {"dns": "off", "mail-tester": "off"}
    assert rest.requests == []


def test_outlook_sync_never_mirrors_mail_to_mail_tester() -> None:
    def msg(*to: str) -> dict[str, Any]:
        return {"toRecipients": [{"emailAddress": {"address": a}} for a in to]}

    assert outlook_sync._to_mail_tester(msg("test-abc123@srv1.mail-tester.com"))
    assert not outlook_sync._to_mail_tester(msg("test-abc123@srv1.mail-tester.com", "lead@shop.com"))
    assert not outlook_sync._to_mail_tester(msg("owner@mail-tester-fans.com"))
    assert not outlook_sync._to_mail_tester(msg())
