from __future__ import annotations

import json
from pathlib import Path

import pytest

from leadgen.config import Config
from leadgen.discover import gmaps
from leadgen.discover.queries import Query, build_queries
from leadgen.geo import parse_city_state, to_code

ROW = {
    "input_id": "q1",
    "title": "TrackPrep Performance LLC",
    "web_site": "https://www.trackprepperformance.com/",
    "phone": "(863) 555-0100",
    "address": "123 Main St, Sebring, FL 33870",
    "complete_address": {"city": "Sebring", "state": "Florida"},
    "category": "Racing car parts store",
    "categories": ["Racing car parts store"],
    "review_count": 39,
    "review_rating": 4.9,
    "status": "",
    "link": "https://www.google.com/maps/place/x",
    "emails": None,
    "user_reviews": [{"big": "x"}],
}


def test_geo() -> None:
    assert to_code("Florida") == "FL" and to_code("fl") == "FL" and to_code("Narnia") == "" and to_code(None) == ""
    assert parse_city_state("7909 US-27, Sebring, FL 33876") == ("Sebring", "FL")
    assert parse_city_state("Somewhere, United Kingdom") == ("", "")


def test_query_budget_weights(cfg: Config) -> None:
    qs = build_queries(cfg, ["FL", "GA"], ["racing_school", "race_prep"], 4)
    assert len(qs) == 4
    assert {q.state for q in qs} == {"FL", "GA"}
    assert {q.segment_key for q in qs} == {"racing_school", "race_prep"}
    assert all(" near " in q.text for q in qs)  # tracks come before metros
    big = build_queries(cfg, None, None, 300)
    by_state = {s: sum(1 for q in big if q.state == s) for s in ("FL", "WV")}
    assert by_state["FL"] > by_state["WV"]
    assert len({q.qid for q in big}) == len(big) == 300


def test_query_validation(cfg: Config) -> None:
    with pytest.raises(ValueError):
        build_queries(cfg, ["ZZ"], None, 5)
    with pytest.raises(ValueError):
        build_queries(cfg, None, ["nope"], 5)
    assert build_queries(cfg, ["FL"], ["other"], 5) == []  # 'other' has no keywords


def test_parse_results_groups_and_slims() -> None:
    raw = json.dumps(ROW) + "\n\nnot json\n" + json.dumps({**ROW, "input_id": "q2", "title": "B"}) + "\n[1]\n"
    grouped = gmaps.parse_results(raw)
    assert set(grouped) == {"q1", "q2"}
    assert "user_reviews" not in grouped["q1"][0]


def test_row_to_place() -> None:
    q = Query(text="race prep shop near Sebring", segment_key="race_prep", state="FL", place="Sebring")
    p = gmaps.row_to_place(ROW, q)
    assert p.state == "FL" and p.city == "Sebring" and p.review_count == 39 and p.rating == 4.9
    assert p.segment_key == "race_prep" and p.emails == ()
    bare = gmaps.row_to_place({"title": "X", "address": "1 A St, Austin, TX 78701", "review_rating": 0}, q)
    assert bare.state == "TX" and bare.city == "Austin" and bare.rating is None and bare.review_count is None


def test_discover_uses_cache_and_scrapes_missing(cfg: Config, tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    q_cached = Query("a near X", "race_prep", "FL", "X")
    q_new = Query("b near X", "race_prep", "FL", "X")
    cache_dir = tmp_path / "cache" / "gmaps"
    cache_dir.mkdir(parents=True)
    gmaps.write_cache(cache_dir, q_cached, [ROW])
    (cache_dir / "corrupt.json").write_text("{")

    calls: list[list[str]] = []

    def fake_batch(cfg_, batch, work, out_root):  # type: ignore[no-untyped-def]
        calls.append([q.qid for q in batch])
        return {q_new.qid: [{**ROW, "title": "Fresh"}]}

    monkeypatch.setattr(gmaps, "ensure_docker", lambda cfg_: None)
    monkeypatch.setattr(gmaps, "_scrape_batch", fake_batch)
    places = gmaps.discover([q_cached, q_new], cfg.gmaps, tmp_path)
    assert [p.name for p in places] == ["TrackPrep Performance LLC", "Fresh"]
    assert calls == [[q_new.qid]]
    places2 = gmaps.discover([q_cached, q_new], cfg.gmaps, tmp_path)  # now fully cached
    assert len(places2) == 2 and len(calls) == 1


def test_docker_cmd_has_driver_override(cfg: Config) -> None:
    cmd = gmaps._docker_cmd(cfg.gmaps, "n", "/host/work")
    assert "PLAYWRIGHT_DRIVER_PATH=/opt/ms-playwright-go/1.57.0" in cmd
    assert "gosom/google-maps-scraper:v1.12.1" in cmd and "/host/work:/work" in cmd
    assert "gmaps-playwright-cache:/opt" not in " ".join(cmd)


def test_scrape_batch_reads_results(cfg: Config, tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    q = Query("a near X", "race_prep", "FL", "X")
    work = tmp_path / "cache" / "gmaps-runs" / "w1"

    def fake_run(cmd, timeout=None):  # type: ignore[no-untyped-def]
        (work / "results.json").write_text(json.dumps({**ROW, "input_id": q.qid}) + "\n")
        return gmaps.subprocess.CompletedProcess(cmd, 0, "ok", "")

    monkeypatch.setattr(gmaps, "_run", fake_run)
    grouped = gmaps._scrape_batch(cfg.gmaps, [q], work, tmp_path)
    assert grouped[q.qid][0]["title"] == ROW["title"]
    assert (work / "queries.txt").read_text() == f"a near X #!# {q.qid}\n"

    def failing(cmd, timeout=None):  # type: ignore[no-untyped-def]
        return gmaps.subprocess.CompletedProcess(cmd, 1, "", "line1\nfatal: driver missing")

    monkeypatch.setattr(gmaps, "_run", failing)
    with pytest.raises(gmaps.GmapsError, match="driver missing"):
        gmaps._scrape_batch(cfg.gmaps, [q], tmp_path / "cache" / "gmaps-runs" / "w2", tmp_path)


def test_paused_keywords_are_skipped(cfg) -> None:  # type: ignore[no-untyped-def]
    from leadgen.discover.queries import build_queries

    paused = cfg.model_copy(update={"filters": cfg.filters.model_copy(update={"paused_keywords": ["Race Prep Shop"]})})
    qs = build_queries(paused, ["FL"], ["race_prep"], 50)
    assert qs and not any(q.text.lower().startswith("race prep shop") for q in qs)
