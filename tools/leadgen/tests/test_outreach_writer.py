from __future__ import annotations

import json
from typing import Any

import httpx
import pytest
import respx

from leadgen import outreach_writer as ow
from leadgen.store import Store, StoreError

BASE = "https://x.supabase.co/rest/v1"
GOOD_BODY = (
    "Hi Mike,\n\nYour site asks people to call to book a seat, which caught our eye. We build the "
    "booking and follow-up behind a business like Apex, then run it with you.\n\n"
    f"Worth a conversation? {ow.BOOKING_URL}"
)


def _lead(i: str, **kw: Any) -> dict[str, Any]:
    base = {"id": i, "email": f"{i}@apex.com", "score": 70, "status": "new", "segment": "Race prep shop",
            "signals": {"pages_crawled": ["/"], "phrases": ["call to book"]}, "run_id": "r", "created_at": "x"}
    base.update(kw)
    return base


def _detail(i: str, **kw: Any) -> dict[str, Any]:
    base = {**_lead(i), "business_name": f"Apex {i}", "contact_name": "Mike Thompson", "do_not_contact": False,
            "score_breakdown": {"booking_need": {"rating": 5, "evidence": "Site says 'call to book' for seats"},
                                "weak_backend": {"rating": 4, "evidence": "Booking runs by phone and email only"}},
            "outreach_hook": "Their booking runs through phone calls"}
    base.update(kw)
    return base


class FakeAsker:
    def __init__(self, outputs: list[dict[str, Any]]) -> None:
        self.outputs = outputs
        self.prompts: list[str] = []

    def ask(self, system: str, prompt: str, schema: dict[str, Any]) -> dict[str, Any]:
        self.prompts.append(prompt)
        return self.outputs[min(len(self.prompts) - 1, len(self.outputs) - 1)]


class DB:
    """A respx-backed fake of the PostgREST tables the writer touches."""

    def __init__(self, prospects: list[dict[str, Any]], details: list[dict[str, Any]], *,
                 emailed: list[str] = (), live: list[dict[str, Any]] = (), suppressed: list[str] = (),
                 waiting: list[str] = (), accounts: list[dict[str, Any]] | None = None,
                 recipients_fail: bool = False) -> None:
        self.prospects, self.details = prospects, details
        self.emailed, self.live, self.suppressed, self.waiting = list(emailed), list(live), list(suppressed), list(waiting)
        self.accounts = accounts if accounts is not None else [
            {"id": "acc-eris", "address": "eris@golaunchcontrol.com", "provider": "outlook", "status": "active", "mailbox": "maxwell@x"},
            {"id": "acc-max", "address": "maxwell@golaunchcontrol.com", "provider": "outlook", "status": "active", "mailbox": None},
        ]
        self.recipients_fail = recipients_fail
        self.runs: list[dict[str, Any]] = []
        self.campaigns: list[dict[str, Any]] = []
        self.recipients: list[dict[str, Any]] = []
        self.deleted: list[str] = []
        self.calls: list[str] = []

    def handle(self, request: httpx.Request) -> httpx.Response:
        table = request.url.path.rsplit("/", 1)[-1]
        p = dict(request.url.params)
        self.calls.append(f"{request.method} {table}")
        body = json.loads(request.content) if request.content else None
        if table == "agent_runs":
            if request.method == "POST":
                self.runs.append({"id": "run-1", **body})
                return httpx.Response(201, json=[{"id": "run-1"}])
            self.runs[-1].update(body)
            return httpx.Response(204)
        if table == "email_campaigns":
            if request.method == "GET":
                return httpx.Response(200, json=[{"id": w} for w in self.waiting])
            if request.method == "DELETE":
                self.deleted.append(p["id"])
                return httpx.Response(204)
            self.campaigns.append(body)
            return httpx.Response(201, json=[{"id": "camp-1"}])
        if table == "leads":
            if "source" in p:
                return httpx.Response(200, json=self.prospects if p.get("offset") == "0" else [])
            wanted = p["id"][4:-1].split(",")
            return httpx.Response(200, json=[d for d in self.details if d["id"] in wanted and not d["do_not_contact"]])
        if table == "email_messages":
            assert p["direction"] == "eq.out"
            return httpx.Response(200, json=[{"lead_id": x} for x in self.emailed])
        if table == "campaign_recipients":
            if request.method == "GET":
                return httpx.Response(200, json=self.live)
            if self.recipients_fail:
                return httpx.Response(400, json={"message": "bad row"})
            self.recipients.extend(body)
            return httpx.Response(201)
        if table == "email_suppressions":
            return httpx.Response(200, json=[{"email": e} for e in self.suppressed])
        if table == "email_accounts":
            return httpx.Response(200, json=self.accounts)
        raise AssertionError(f"unexpected {request.method} {table}")


@pytest.fixture
def store() -> Store:
    return Store("https://x.supabase.co", "service-key")


def _run(db: DB, store: Store, asker: Any, **kw: Any) -> None:
    with respx.mock(assert_all_called=False) as mock:
        mock.route(url__startswith=BASE).mock(side_effect=db.handle)
        ow.run_once(store, asker, **kw)


# --- copy rules ----------------------------------------------------------------------------------

def test_good_copy_passes() -> None:
    assert ow.copy_problems("Booking at Apex", GOOD_BODY, "Apex", 1, 2) == []


@pytest.mark.parametrize("bad, rule", [
    ("We can get you booked faster.", "time or speed"),
    ("Save time on every booking.", "time or speed"),
    ("It works overnight.", "time or speed"),
    ("Set up in 3 days.", "time or speed"),
    ("A quick call?", "time or speed"),
    ("I'm reaching out because of your site.", "generic opener"),
    ("I hope this finds you well.", "generic opener"),
    (f"See https://demo.golaunchcontrol.com {ow.BOOKING_URL}", "demo.golaunchcontrol.com"),
])
def test_copy_rules_reject(bad: str, rule: str) -> None:
    problems = ow.copy_problems("Booking at Apex", f"{bad}\n{ow.BOOKING_URL}", "Apex")
    assert any(rule in p for p in problems), problems


def test_copy_length_link_and_fact_index() -> None:
    long = " ".join(["word"] * 95) + f" {ow.BOOKING_URL}"
    assert any("words" in p for p in ow.copy_problems("Hi", long))
    assert any("booking link" in p for p in ow.copy_problems("Hi", "No link here."))
    assert any("fact_index" in p for p in ow.copy_problems("Hi", GOOD_BODY, "", 5, 2))


def test_business_name_with_a_speed_word_can_be_named() -> None:
    body = f"FastLane Karting runs bookings by phone. {ow.BOOKING_URL}"
    assert ow.copy_problems("FastLane bookings", body, "FastLane Karting") == []


def test_sign_off_is_stripped() -> None:
    assert ow.strip_sign_off(f"{GOOD_BODY}\n\nBest,\nMax") == GOOD_BODY
    assert ow.strip_sign_off(GOOD_BODY) == GOOD_BODY


def test_observed_facts_drop_banned_words_and_rank_evidence() -> None:
    lead = _detail("a", outreach_hook="Help them book customers faster")
    facts = ow.observed_facts(lead)
    assert facts[0] == "Site says 'call to book' for seats"
    assert not any("faster" in f for f in facts)
    assert any("call to book" in f and "tells customers" in f for f in facts)


def test_prompt_numbers_the_facts() -> None:
    facts = ow.observed_facts(_detail("a"))
    prompt = ow.lead_prompt(_detail("a"), facts)
    assert "First name: Mike" in prompt and "1. Site says" in prompt and "Business: Apex a" in prompt


# --- passes --------------------------------------------------------------------------------------

def test_no_api_key_logs_a_failed_run(store: Store, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.delenv("ANTHROPIC_API_KEY", raising=False)
    db = DB([_lead("a")], [_detail("a")])
    _run(db, store, None)
    assert db.runs[0]["agent"] == "outreach-writer" and db.runs[0]["status"] == "failed"
    assert "ANTHROPIC_API_KEY" in db.runs[0]["decision"]
    assert db.calls == ["POST agent_runs", "PATCH agent_runs"]


def test_waiting_agent_draft_blocks_a_new_batch(store: Store) -> None:
    db = DB([_lead("a")], [_detail("a")], waiting=["old-camp"])
    asker = FakeAsker([{"subject": "Booking at Apex", "body": GOOD_BODY, "fact_index": 1}])
    _run(db, store, asker)
    assert db.campaigns == [] and asker.prompts == []
    assert db.runs[0]["status"] == "done" and db.runs[0]["evidence"]["waiting_campaign_ids"] == ["old-camp"]


def test_full_pass_filters_and_writes_one_draft_campaign(store: Store) -> None:
    prospects = [
        _lead("good", score=80),
        _lead("good2", score=60),
        _lead("lowscore", score=50),
        _lead("blind", signals={"crawl_error": "http_403"}),
        _lead("noemail", email=""),
        _lead("contacted", status="contacted"),
        _lead("emailed"),
        _lead("oncamp"),
        _lead("cancelledcamp"),
        _lead("supp"),
        _lead("dnc"),
    ]
    details = [_detail(x) for x in ("good", "good2", "cancelledcamp")] + [_detail("dnc", do_not_contact=True)]
    db = DB(prospects, details, emailed=["emailed"], suppressed=["supp@apex.com"], live=[
        {"lead_id": "oncamp", "status": "pending", "email_campaigns": {"status": "draft"}},
        {"lead_id": "cancelledcamp", "status": "cancelled", "email_campaigns": {"status": "cancelled"}},
    ])
    asker = FakeAsker([{"subject": "Booking at Apex", "body": GOOD_BODY + "\n\nThanks,", "fact_index": 1}])
    _run(db, store, asker)

    assert len(db.campaigns) == 1
    camp = db.campaigns[0]
    assert camp["status"] == "draft" and camp["account_id"] == "acc-max" and camp["created_by"] == ow.CREATED_BY
    assert camp["name"].startswith("Agent drafts · ") and camp["name"].endswith(" · 3 leads")
    assert "scheduled_at" not in camp
    assert [r["lead_id"] for r in db.recipients] == ["good", "good2", "cancelledcamp"]
    r0 = db.recipients[0]
    assert r0 == {**r0, "campaign_id": "camp-1", "email": "good@apex.com", "status": "pending", "step": 1,
                  "subject_override": "Booking at Apex", "body_override": GOOD_BODY}
    assert r0["merge"]["first_name"] == "Mike" and r0["merge"]["company"] == "Apex good"

    run = db.runs[0]
    assert run["status"] == "done" and run["evidence"]["drafted"] == 3 and run["evidence"]["campaign_id"] == "camp-1"
    assert run["evidence"]["skipped"] == {"not usable": 3, "already emailed": 1, "already on a campaign": 1,
                                          "suppressed": 1, "do not contact": 1}


def test_bad_copy_is_rewritten_once(store: Store) -> None:
    db = DB([_lead("a")], [_detail("a")])
    asker = FakeAsker([
        {"subject": "Quick question", "body": "I'm reaching out to help you book faster.", "fact_index": 1},
        {"subject": "Booking at Apex", "body": GOOD_BODY, "fact_index": 1},
    ])
    _run(db, store, asker)
    assert len(asker.prompts) == 2 and "broke these rules" in asker.prompts[1] and "faster" in asker.prompts[1]
    assert db.recipients[0]["body_override"] == GOOD_BODY


def test_copy_failing_twice_skips_the_lead_and_makes_no_campaign(store: Store) -> None:
    db = DB([_lead("a")], [_detail("a")])
    asker = FakeAsker([{"subject": "Quick question", "body": "We work overnight.", "fact_index": 1}])
    _run(db, store, asker)
    assert db.campaigns == [] and len(asker.prompts) == 2
    run = db.runs[0]
    assert run["status"] == "done" and run["evidence"]["drafted"] == 0
    assert run["evidence"]["lead_skips"]["a"].startswith("copy check failed twice")


def test_respects_the_per_pass_cap(store: Store) -> None:
    ids = [f"l{i}" for i in range(5)]
    db = DB([_lead(i) for i in ids], [_detail(i) for i in ids])
    asker = FakeAsker([{"subject": "Booking at Apex", "body": GOOD_BODY, "fact_index": 1}])
    _run(db, store, asker, limit=2)
    assert len(db.recipients) == 2 and db.campaigns[0]["name"].endswith(" · 2 leads")


def test_recipient_failure_removes_the_campaign(store: Store) -> None:
    db = DB([_lead("a")], [_detail("a")], recipients_fail=True)
    asker = FakeAsker([{"subject": "Booking at Apex", "body": GOOD_BODY, "fact_index": 1}])
    with pytest.raises(StoreError):
        _run(db, store, asker)
    assert db.deleted == ["eq.camp-1"] and db.runs[0]["status"] == "failed"


def test_sending_account_falls_back_like_the_crm(store: Store) -> None:
    db = DB([], [], accounts=[
        {"id": "g", "address": "a@gmail.com", "provider": "gmail", "status": "active", "mailbox": None},
        {"id": "o", "address": "eris@x.com", "provider": "outlook", "status": "needs_reconnect", "mailbox": None},
    ])
    with respx.mock() as mock:
        mock.route(url__startswith=BASE).mock(side_effect=db.handle)
        assert ow.sending_account(store) == "o"  # Outlook pool wins, first in it when none active
