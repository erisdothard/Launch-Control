from __future__ import annotations

import csv
import json
from pathlib import Path
from typing import Any

import pytest
from conftest import ROOT, make_place

from leadgen import cli, pipeline
from leadgen.config import Config, load_config
from leadgen.discover.seeds import load_seeds
from leadgen.enrich.crawl import CrawlResult, Page
from leadgen.models import Contact, FactorRating, ScoreResult


def _write_seed(path: Path) -> Path:
    with path.open("w", newline="") as fh:
        w = csv.writer(fh)
        w.writerow(["name", "website", "city", "state", "segment", "phone", "category", "review_count"])
        w.writerow(["Apex Endurance", "https://apex.com", "Sebring", "Florida", "Arrive & drive", "(352) 555-0142", "Racecourse", "40"])
        w.writerow(["Gas Stop", "https://gas.com", "Tampa", "FL", "race_prep", "", "Gas station", "x"])
        w.writerow(["", "https://blank.com", "", "", "", "", "", ""])
        w.writerow(["Unknown Seg", "", "Austin", "TX", "bakery", "", "", ""])
    return path


def test_load_seeds(cfg: Config, tmp_path: Path) -> None:
    places = load_seeds(_write_seed(tmp_path / "s.csv"), cfg)
    assert [p.name for p in places] == ["Apex Endurance", "Gas Stop", "Unknown Seg"]
    assert places[0].state == "FL" and places[0].segment_key == "arrive_and_drive" and places[0].review_count == 40
    assert places[1].review_count is None and places[2].segment_key == "other"
    bad = tmp_path / "bad.csv"
    bad.write_text("title\nx\n")
    with pytest.raises(ValueError):
        load_seeds(bad, cfg)
    with pytest.raises(FileNotFoundError):
        load_seeds(tmp_path / "nope.csv", cfg)


class FakeCrawler:
    def __init__(self, *a: Any, **k: Any) -> None:
        self.client = None
        self.robots = None

    async def crawl(self, url: str) -> CrawlResult:
        html = "<html><body><p>Mike Thompson</p><p>Owner</p><p>Seats available Nov 14, 2026</p>" \
               "<a href='mailto:mike@apex.com'>e</a><p>© 2026</p></body></html>"
        return CrawlResult(start_url=url, pages=(Page(url, 200, html),))

    async def aclose(self) -> None:
        return None


class FakeScorer:
    def __init__(self, *a: Any, **k: Any) -> None:
        self.stats = {"cached": 0, "scored": 1, "failed": 0}

    async def score(self, lead: Any) -> ScoreResult:
        return ScoreResult(score=77, breakdown={"niche_fit": FactorRating(rating=5, evidence="x")},
                           segment="Arrive & drive", decision_maker=Contact(name="Mike Thompson", title="Owner"),
                           reason="Fits.", outreach_hook="Hook.", exclude=False)


@pytest.fixture
def patched(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(pipeline, "Crawler", FakeCrawler)
    monkeypatch.setattr(pipeline, "Scorer", FakeScorer)


async def test_pipeline_dry_run_with_seed(cfg: Config, tmp_path: Path, patched: None) -> None:
    opts = pipeline.RunOptions(dry_run=True, seed=str(_write_seed(tmp_path / "s.csv")))
    s = await pipeline.run(cfg, opts)
    assert s.counts["found"] == 3 and s.counts["kept"] == 1 and s.counts["excluded"] == 2
    assert s.counts["same_domain_email"] == 1 and s.counts["named_decision_maker"] == 1
    assert s.exclusions["excluded_category"] == 1 and s.exclusions["no_contact_channel"] == 1
    apex = next(r for r in s.rows if r["business_name"] == "Apex Endurance")
    assert apex["score"] == 77 and apex["email"] == "mike@apex.com" and apex["signals"]["latest_event_date"] == "2026-11-14"
    assert (s.run_dir / "leads.csv").is_file() and (s.run_dir / "excluded.csv").is_file()


async def test_pipeline_gmaps_path_and_store(cfg: Config, monkeypatch: pytest.MonkeyPatch, patched: None) -> None:
    monkeypatch.setattr(pipeline.gmaps, "discover", lambda q, c, o: [make_place(website="https://apex.com")])
    calls: dict[str, Any] = {}

    class FakeStore:
        def __init__(self, url: str, key: str) -> None:
            calls["init"] = (url, key)

        def start_run(self, snap: dict) -> str:
            json.dumps(snap)
            return "run-1"

        def known_domains(self, domains: list[str]) -> set[str]:
            return set()

        def upsert_leads(self, rows: list[dict], run_id: str) -> dict[str, int]:
            calls["rows"] = rows
            return {"inserted": len(rows), "updated": 0, "skipped": 0}

        def finish_run(self, run_id: str, status: str, counts: dict, error: str | None = None) -> None:
            calls["finish"] = (status, error)

    monkeypatch.setattr(pipeline, "Store", FakeStore)
    monkeypatch.setattr(pipeline, "supabase_env", lambda: ("https://x.supabase.co", "k"))
    s = await pipeline.run(cfg, pipeline.RunOptions(states=["FL"], segments=["race_prep"], max_queries=2, no_score=True))
    assert s.store_counts["inserted"] == 1 and calls["finish"] == ("completed", None)
    assert "excluded" not in calls["rows"][0]

    def boom(q, c, o):  # type: ignore[no-untyped-def]
        raise RuntimeError("docker down")

    monkeypatch.setattr(pipeline.gmaps, "discover", boom)
    with pytest.raises(RuntimeError):
        await pipeline.run(cfg, pipeline.RunOptions(states=["FL"], max_queries=1))
    assert calls["finish"][0] == "failed" and "docker down" in calls["finish"][1]


async def test_pipeline_requires_supabase_unless_dry_run(cfg: Config, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(pipeline, "supabase_env", lambda: None)
    with pytest.raises(RuntimeError, match="--dry-run"):
        await pipeline.run(cfg, pipeline.RunOptions())


def test_cli_run_and_export(tmp_path: Path, monkeypatch: pytest.MonkeyPatch, patched: None,
                            capsys: pytest.CaptureFixture[str]) -> None:
    raw = (ROOT / "config.yaml").read_text().replace("out_dir: out", f"out_dir: {tmp_path / 'out'}")
    conf = tmp_path / "config.yaml"
    conf.write_text(raw)
    monkeypatch.setattr(cli, "load_env", lambda: None)
    monkeypatch.setattr("leadgen.cli.supabase_env", lambda: None)
    seed = _write_seed(tmp_path / "s.csv")
    assert cli.main(["run", "--config", str(conf), "--dry-run", "--seed", str(seed), "--states", "FL"]) == 0
    out = capsys.readouterr().out
    assert "kept=1" in out and "Apex Endurance" in out
    dest = tmp_path / "e.csv"
    assert cli.main(["export", "--config", str(conf), "--min-score", "50", "--out", str(dest)]) == 0
    assert "wrote 1 leads" in capsys.readouterr().out
    assert cli.main(["export", "--config", str(conf), "--source", "supabase"]) == 1  # no env -> clean error
    assert load_config(conf).out_path() == tmp_path / "out"
