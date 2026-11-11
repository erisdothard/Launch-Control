from __future__ import annotations

from typing import Any

from leadgen import bounces

OWN = {"maxwell@golaunchcontrol.com", "eris@golaunchcontrol.com"}
EXCHANGE = "MicrosoftExchange329e71ec88ae4615bbc36ab6ce41109e@tenant.onmicrosoft.com"

OFFICE_365 = (
    "Your message to trackops@speedway.net couldn't be delivered.\n"
    "trackops wasn't found at speedway.net.\n"
    "Maxwell         Office 365      trackops\n"
    "More Info for Email Admins\nStatus code: 550 5.1.1\n"
    "Original Message Details\nError: 550 5.1.1 <trackops@speedway.net>\n"
    "Original Message Headers\nFrom: Maxwell <maxwell@golaunchcontrol.com>\nTo: trackops@speedway.net\nCc: other@speedway.net\n"
)
GMAIL = (
    "Address not found\nYour message wasn't delivered to Dana@Shop.com because the address couldn't be found.\n"
    "The response was:\n550 5.1.1 The email account that you tried to reach does not exist.\n"
)


def report(body: str, subject: str = "Undeliverable: Re: track day", sender: str = EXCHANGE,
           received: str = "2026-11-05T21:17:12Z") -> dict[str, Any]:
    return {"id": "ndr", "subject": subject, "from": {"emailAddress": {"address": sender}},
            "body": {"content": body}, "receivedDateTime": received}


def send(mid: str, at: str, status: str = "sent") -> dict[str, Any]:
    return {"id": mid, "status": status, "created_at": at}


class FakeStore:
    def __init__(self, sends: dict[str, list[dict[str, Any]]]) -> None:
        self.sends, self.suppressed, self.marked = sends, [], []

    def sends_to(self, email: str) -> list[dict[str, Any]]:
        return self.sends.get(email, [])

    def suppress_bounce(self, email: str) -> None:
        self.suppressed.append(email)

    def mark_bounced(self, message_id: str, reason: str) -> None:
        self.marked.append((message_id, reason))
        for rows in self.sends.values():
            for r in rows:
                if r["id"] == message_id:
                    r["status"] = "failed"


def test_office_365_report_names_the_dead_address() -> None:
    assert bounces.dead_address(report(OFFICE_365), OWN) == "trackops@speedway.net"


def test_gmail_report_is_lowercased() -> None:
    msg = report(GMAIL, subject="Address not found", sender="mailer-daemon@googlemail.com")
    assert bounces.dead_address(msg, OWN) == "dana@shop.com"


def test_a_forward_that_bounced_blocks_the_final_address_never_the_one_we_wrote_to() -> None:
    body = ("Delivery to the following recipient failed permanently.\n"
            "Original-Recipient: rfc822;info@shop.com\nFinal-Recipient: rfc822;old@gmail.com\nStatus: 5.1.1\n")
    assert bounces.dead_address(report(body, sender="mailer-daemon@shop.com"), OWN) == "old@gmail.com"


def test_addresses_in_quoted_headers_are_never_taken() -> None:
    body = "The recipient's mailbox does not exist. 550 5.1.1\nMessage headers:\nTo: live@shop.com\n"
    assert bounces.dead_address(report(body), OWN) is None


def test_policy_blocks_and_throttling_never_block_an_address() -> None:
    blocked = "Your message to a@b.com couldn't be delivered.\nRemote server returned '550 5.7.708 Access denied'"
    later = "Your message to a@b.com couldn't be delivered yet.\n451 4.7.0 Try again later; user unknown to this relay"
    full = "Your message to a@b.com couldn't be delivered.\n552 5.2.2 Mailbox full\nOriginal message\nthe address does not exist"
    for body in (blocked, later, full):
        assert bounces.dead_address(report(body), OWN) is None, body


def test_an_ip_address_is_not_a_status_code() -> None:
    body = "Your message to gone@shop.com couldn't be delivered.\nStatus code: 550 5.1.1\nRelay 10.4.2.1 said so."
    assert bounces.dead_address(report(body), OWN) == "gone@shop.com"


def test_a_person_typing_undeliverable_cannot_block_anyone() -> None:
    msg = report("Your message to ceo@shop.com couldn't be delivered. user unknown 5.1.1", sender="someone@evil.com")
    assert bounces.dead_address(msg, OWN) is None


def test_record_blocks_the_address_and_fails_the_send_it_answers() -> None:
    store = FakeStore({"trackops@speedway.net": [send("nov", "2026-11-05T21:17:00+00:00"), send("oct", "2026-10-22T18:48:00+00:00")]})
    assert bounces.record(store, [report(OFFICE_365)], OWN) == ["trackops@speedway.net"]
    assert store.suppressed == ["trackops@speedway.net"]
    [(message_id, reason)] = store.marked
    assert message_id == "nov"
    assert "550 5.1.1" in reason and "doesn't exist" in reason


def test_the_same_report_again_changes_nothing_more() -> None:
    store = FakeStore({"trackops@speedway.net": [send("nov", "2026-11-05T21:17:00+00:00"), send("oct", "2026-10-22T18:48:00+00:00")]})
    for _ in range(3):
        bounces.record(store, [report(OFFICE_365)], OWN)
    assert [m for m, _ in store.marked] == ["nov"]


def test_each_report_fails_its_own_send() -> None:
    store = FakeStore({"trackops@speedway.net": [send("nov", "2026-11-05T21:17:00+00:00"), send("oct", "2026-10-22T18:48:00+00:00")]})
    bounces.record(store, [report(OFFICE_365), report(OFFICE_365, received="2026-10-22T18:48:21Z")], OWN)
    assert sorted(m for m, _ in store.marked) == ["nov", "oct"]


def test_an_address_the_crm_never_emailed_is_left_alone() -> None:
    store = FakeStore({})
    assert bounces.record(store, [report(OFFICE_365)], OWN) == []
    assert store.suppressed == [] and store.marked == []


def test_ordinary_mail_touches_nothing() -> None:
    store = FakeStore({"paul@shop.com": [send("m9", "2026-11-01T00:00:00+00:00")]})
    mail = report("Sounds good, see you Tuesday. paul@shop.com", subject="Re: track day", sender="paul@shop.com")
    assert bounces.record(store, [mail], OWN) == []
    assert store.suppressed == []
