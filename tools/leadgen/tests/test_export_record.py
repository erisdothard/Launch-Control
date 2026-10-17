from __future__ import annotations

import csv
from pathlib import Path

from conftest import make_lead

from leadgen.config import Config
from leadgen.export import COLUMNS, latest_run_file, read_jsonl, write_csv, write_jsonl
from leadgen.models import Contact, Enrichment, FactorRating, ScoreResult
from leadgen.record import lead_row, segment_label, signals_for, top_signals


def _scored(cfg: Config):  # type: ignore[no-untyped-def]
    lead = make_lead()
    sc = ScoreResult(
        score=72, breakdown={"niche_fit": FactorRating(rating=5, evidence="race prep")}, segment="Race prep shop",
        decision_maker=Contact(name="Mike Thompson", title="Owner"), reason="Fits.", outreach_hook="Hook.",
        model="m", scored_at="2026-10-15T00:00:00+00:00",
    )
    enr = Enrichment(ok=True, final_url="https://www.apexendurance.com/", email="mike@apexendurance.com",
                     email_kind="personal", signals={"booking_tech": [], "crm_tech": ["Mailchimp"],
                                                     "site_builder": "Wix", "phrases": ["seats available"],
                                                     "copyright_year": 2026, "latest_event_date": "2026-11-14",
                                                     "form_count": 1})
    return lead.model_copy(update={"score": sc, "enrichment": enr})


def test_lead_row_contract(cfg: Config) -> None:
    row = lead_row(_scored(cfg), cfg)
    assert row["score"] == 72 and row["segment"] == "Race prep shop"
    assert row["contact_name"] == "Mike Thompson" and row["email"] == "mike@apexendurance.com"
    assert row["score_breakdown"] == {"niche_fit": {"rating": 5.0, "evidence": "race prep"}}
    s = row["signals"]
    for key in ("booking_tech", "crm_tech", "site_builder", "phrases", "emails", "socials", "copyright_year",
                "latest_event_date", "review_count", "rating", "maps_url", "excluded_reason"):
        assert key in s
    assert s["form_count"] == 1 and s["excluded_reason"] is None


def test_unscored_and_excluded(cfg: Config) -> None:
    lead = make_lead(emails=("A@B.com",)).model_copy(update={"exclude_reasons": ("chain_scale:2000_reviews",)})
    assert segment_label(lead, cfg) == "Race prep shop"
    row = lead_row(lead, cfg)
    assert row["score"] is None and row["email"] == "a@b.com"
    assert signals_for(lead)["excluded_reason"] == "chain_scale:2000_reviews"
    assert "EXCLUDED" in top_signals(row)
    assert segment_label(make_lead(segment_key="missing"), cfg) == "Other"


def test_csv_and_jsonl_roundtrip(cfg: Config, tmp_path: Path) -> None:
    rows = [lead_row(_scored(cfg), cfg), {**lead_row(make_lead(name="Low"), cfg), "score": 10}]
    n = write_csv(rows, tmp_path / "x.csv", min_score=50)
    assert n == 1
    with (tmp_path / "x.csv").open() as fh:
        data = list(csv.DictReader(fh))
    assert list(data[0]) == list(COLUMNS)
    assert data[0]["score"] == "72" and "crm: Mailchimp" in data[0]["top_signals"]
    run = tmp_path / "out" / "runs" / "20261015T000000Z" / "leads.jsonl"
    write_jsonl(rows, run)
    assert latest_run_file(tmp_path / "out") == run
    assert read_jsonl(run)[0]["business_name"] == "Apex Endurance Racing"
    assert latest_run_file(tmp_path / "nothing") is None


def test_first_name_from_personal_email(cfg: Config) -> None:
    lead = make_lead().model_copy(update={"enrichment": Enrichment(
        ok=True, email="james@apexendurance.com", email_kind="personal", signals={})})
    row = lead_row(lead, cfg)
    assert row["contact_name"] == "James" and row["contact_title"] is None
    assert row["signals"]["contact_source"] == "first name from email address"
    role = lead.model_copy(update={"enrichment": Enrichment(ok=True, email="info@a.com", email_kind="role")})
    assert lead_row(role, cfg)["contact_name"] is None
