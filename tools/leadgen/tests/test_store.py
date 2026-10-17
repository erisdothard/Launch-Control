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
