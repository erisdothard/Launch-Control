from __future__ import annotations

import json

import httpx
import pytest
import respx
from conftest import make_lead

from leadgen.config import Config
from leadgen.record import lead_row
from leadgen.store import Store, StoreError, insert_payload, update_payload

URL = "https://proj.supabase.co"
REST = f"{URL}/rest/v1"


def test_insert_payload_sets_source_and_status(cfg: Config) -> None:
    row = lead_row(make_lead(), cfg)
    p = insert_payload(row, "run-1")
    assert p["source"] == "lead-gen" and p["status"] == "new" and p["run_id"] == "run-1"
    assert p["domain"] == "apexendurance.com" and p["state"] == "FL"
    assert p["signals"]["review_count"] == 40 and p["signals"]["maps_url"]


def test_update_payload_never_touches_status_or_notes(cfg: Config) -> None:
    row = {**lead_row(make_lead(), cfg), "email": "new@apex.com", "contact_name": "Mike"}
    existing = {"id": "1", "email": "human@apex.com", "contact_name": None, "phone": ""}
    patch = update_payload(row, existing, "run-2")
    assert "status" not in patch and "notes" not in patch and "source" not in patch
    assert "email" not in patch  # human-set value kept
    assert patch["contact_name"] == "Mike" and patch["phone"] == row["phone"]
    assert patch["run_id"] == "run-2" and "signals" in patch


@respx.mock
def test_upsert_inserts_new_and_patches_existing(cfg: Config) -> None:
    new = lead_row(make_lead(website="https://new.com", name="New Co"), cfg)
    old = lead_row(make_lead(website="https://old.com", name="Old Co"), cfg)
    nosite = lead_row(make_lead(website="", name="Phone Only", phone="(404) 829-6475"), cfg)

    def lookup(request: httpx.Request) -> httpx.Response:
        q = request.url.params
        if "domain" in q:
            assert '"new.com"' in q["domain"] and '"old.com"' in q["domain"]
            return httpx.Response(200, json=[{"id": "o1", "domain": "old.com", "email": "", "phone": "x"}])
        return httpx.Response(200, json=[])

    respx.get(f"{REST}/leads").mock(side_effect=lookup)
    patch = respx.patch(f"{REST}/leads").mock(return_value=httpx.Response(204))
    post = respx.post(f"{REST}/leads").mock(return_value=httpx.Response(201))
    counts = Store(URL, "service-key").upsert_leads([new, old, nosite], "run-9")
    assert counts == {"inserted": 2, "updated": 1, "skipped": 0}
    assert patch.calls[0].request.url.params["id"] == "eq.o1"
    body = json.loads(post.calls[0].request.content)
    assert {b["business_name"] for b in body} == {"New Co", "Phone Only"}
    assert all(b["status"] == "new" and b["source"] == "lead-gen" for b in body)
    req = post.calls[0].request
    assert "resolution=ignore-duplicates" in req.headers["prefer"]
    assert req.headers["apikey"] == "service-key"


@respx.mock
def test_runs_lifecycle_and_errors() -> None:
    respx.post(f"{REST}/lead_gen_runs").mock(return_value=httpx.Response(201, json=[{"id": "r1"}]))
    fin = respx.patch(f"{REST}/lead_gen_runs").mock(return_value=httpx.Response(204))
    store = Store(URL, "k")
    assert store.start_run({"a": 1}) == "r1"
    store.finish_run("r1", "completed", {"found": 3, "kept": 2})
    body = json.loads(fin.calls[0].request.content)
    assert body["status"] == "completed" and body["found"] == 3 and body["excluded"] == 0
    respx.get(f"{REST}/leads").mock(return_value=httpx.Response(401, json={"message": "bad key"}))
    with pytest.raises(StoreError):
        store.known_domains(["a.com"])


@respx.mock
def test_network_error_wrapped_and_fetch() -> None:
    route = respx.get(f"{REST}/leads")
    route.side_effect = httpx.ConnectError("down")
    with pytest.raises(StoreError):
        Store(URL, "k").fetch_leads(50)
    route.side_effect = None
    route.return_value = httpx.Response(200, json=[{"business_name": "A", "score": 70}])
    rows = Store(URL, "k").fetch_leads(50)
    assert rows[0]["score"] == 70
    assert route.calls[-1].request.url.params["score"] == "gte.50"


def test_backfill_patches() -> None:
    from leadgen.backfill import contact_patch, score_patch
    from leadgen.config import FACTOR_KEYS
    from leadgen.models import Contact, Enrichment

    weights = {k: 1.0 for k in FACTOR_KEYS}
    breakdown = {k: {"rating": 5, "evidence": ""} for k in FACTOR_KEYS}
    breakdown["weak_backend"] = {"rating": 1, "evidence": "runs HubSpot"}
    row = {"score": 93, "score_breakdown": breakdown, "signals": {"phrases": ["x"]}}
    patch = score_patch(row, weights)
    assert patch["score"] == 64
    assert patch["signals"] == {"phrases": ["x"], "score_capped_by": ["already runs a CRM or booking system"]}
    assert score_patch({**row, **patch}, weights) == {}  # already current
    assert score_patch({"score": None, "score_breakdown": None}, weights) == {}

    e = Enrichment(ok=True, email="ross@k.com", phone="(561) 818-8186",
                   people=(Contact(name="Ross Bentley", title="Owner"),), signals={"emails": ["ross@k.com"]})
    filled = contact_patch({"email": "", "phone": "(919) 741-7151", "contact_name": None}, e, {"a": 1})
    assert filled == {"email": "ross@k.com", "contact_name": "Ross Bentley", "contact_title": "Owner",
                      "signals": {"a": 1, "emails": ["ross@k.com"]}}
    assert contact_patch({"email": "x@y.com", "phone": "1", "contact_name": "Max"}, e, {}) == {}


@respx.mock
def test_in_lists_quote_odd_addresses_and_a_bad_chunk_does_not_stall() -> None:
    odd = 'o"brien,jr@x.com'
    route = respx.get(f"{REST}/leads").mock(return_value=httpx.Response(200, json=[{"id": "l1", "email": odd}]))
    store = Store(URL, "k")
    assert store.leads_by_emails([odd]) == {odd: "l1"}
    # Each value is a JSON string, so the comma and quote stay inside one list item.
    assert route.calls[0].request.url.params["email"] == f"in.({json.dumps(odd)})"

    route.return_value = httpx.Response(400, json={"message": "bad filter"})
    assert store.leads_by_emails([odd]) == {}

    threads = respx.get(f"{REST}/email_messages").mock(return_value=httpx.Response(400, json={"message": "bad"}))
    assert store.leads_for_threads(['t"1,2']) == {}
    assert threads.calls[0].request.url.params["provider_thread_id"] == 'in.("t\\"1,2")'


@respx.mock
def test_heartbeat_upserts_one_row_per_loop() -> None:
    route = respx.post(f"{REST}/worker_heartbeats").mock(return_value=httpx.Response(201))
    Store(URL, "key").heartbeat("automation", {"last_pass": {"follow_ups": 2}})
    req = route.calls.last.request
    assert "merge-duplicates" in req.headers["Prefer"]
    body = json.loads(req.content)
    assert body["name"] == "automation" and body["detail"] == {"last_pass": {"follow_ups": 2}} and body["beat_at"]
