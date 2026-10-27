from __future__ import annotations

from typing import Any

import pytest

from leadgen import metrics, overrides
from leadgen import prospector as pr
from leadgen.config import Config


def _lead(kw: str, usable: bool, *, call: bool = False, phone: str = "") -> dict[str, Any]:
    signals: dict[str, Any] = {"discovered_by": f"{kw} near Sebring International Raceway"}
    if call:
        signals["call_list"] = True
    else:
        signals["pages_crawled"] = ["/"]
    return {"email": "a@b.com" if usable else "", "score": 70, "signals": signals, "phone": phone}


def _run(*groups: tuple[str, int, int]) -> list[dict[str, Any]]:
    """(keyword, usable, not usable) groups -> lead rows."""
    out: list[dict[str, Any]] = []
    for kw, good, bad in groups:
        out += [_lead(kw, True) for _ in range(good)] + [_lead(kw, False) for _ in range(bad)]
    return out


class Harness:
    def __init__(self, monkeypatch: pytest.MonkeyPatch, leads: list[dict[str, Any]],
                 current: overrides.Overrides | None = None, rows: list[dict[str, Any]] | None = None) -> None:
        self.saved: list[overrides.Overrides] = []
        self.dispatched: list[dict[str, Any]] = []
        monkeypatch.setattr(metrics, "prospects", lambda store, run_id=None: leads)
        monkeypatch.setattr(overrides, "load", lambda store: current or overrides.Overrides())
        monkeypatch.setattr(overrides, "save", lambda store, o, by: self.saved.append(o))
        monkeypatch.setattr(pr, "_recent", lambda store: rows or [])
        monkeypatch.setattr(pr, "escalate", lambda p: self.dispatched.append(p) or "dispatched")

    def review(self, cfg: Config) -> tuple[str, dict[str, Any]]:
        return pr.review(object(), "r1", cfg)  # type: ignore[arg-type]


def _applied(kw: str, rate_before: float) -> dict[str, Any]:
    return {"id": "a", "evidence": {"judged": 40, "usable_rate": rate_before,
                                    "applied": {"paused": kw, "rate_before": rate_before}}}


def test_keyword_of_strips_place_prefix_and_spacing() -> None:
    assert pr.keyword_of(_lead("Race  Prep Shop", True)) == "race prep shop"
    assert pr.keyword_of({"signals": {"discovered_by": "gmaps: racing school in Miami, FL"}}) == "racing school"
    assert pr.keyword_of({"signals": {}}) == ""


def test_yields_leave_the_call_list_out() -> None:
    leads = _run(("racing school", 3, 1)) + [_lead("racing school", False, call=True)]
    (y,) = pr.keyword_yields(leads)
    assert (y.keyword, y.leads, y.usable) == ("racing school", 4, 3)


def test_on_target_changes_nothing(monkeypatch: pytest.MonkeyPatch, cfg: Config) -> None:
    h = Harness(monkeypatch, _run(("racing school", 30, 6)))
    decision, ev = h.review(cfg)
    assert decision.startswith("On target") and ev["usable_rate"] == 0.833
    assert not h.saved and not h.dispatched


def test_small_run_is_not_judged(monkeypatch: pytest.MonkeyPatch, cfg: Config) -> None:
    h = Harness(monkeypatch, _run(("race prep shop", 1, 9)))
    decision, _ = h.review(cfg)
    assert "too small" in decision and not h.saved


def test_mostly_call_list_escalates_as_crawler_suspect(monkeypatch: pytest.MonkeyPatch, cfg: Config) -> None:
    leads = _run(("racing school", 5, 2)) + [_lead("racing school", False, call=True) for _ in range(30)]
    h = Harness(monkeypatch, leads)
    decision, ev = h.review(cfg)
    assert "crawler is the suspect" in decision and h.dispatched[0]["cause"] == "crawler_suspect"


def test_dead_keyword_is_paused_and_logged(monkeypatch: pytest.MonkeyPatch, cfg: Config) -> None:
    leads = _run(("racing school", 12, 8), ("race car fabrication", 0, 12), ("race prep shop", 8, 8))
    h = Harness(monkeypatch, leads)
    decision, ev = h.review(cfg)
    assert "Paused keyword 'race car fabrication'" in decision
    assert h.saved[-1].paused_keywords == ["race car fabrication"]
    assert ev["applied"]["rate_before"] < ev["applied"]["rate_without"]


def test_never_pauses_a_segments_last_keyword(monkeypatch: pytest.MonkeyPatch, cfg: Config) -> None:
    leads = _run(("racing school", 0, 20), ("race prep shop", 10, 10))
    current = overrides.Overrides(paused_keywords=["performance driving school"])
    h = Harness(monkeypatch, leads, current=current)
    decision, _ = h.review(cfg)
    assert "no keyword to pause" in decision and not h.saved and h.dispatched


def test_never_pauses_a_label_that_is_not_a_config_keyword(cfg: Config) -> None:
    yields = [pr.KeywordYield("seed list", 20, 0), pr.KeywordYield("race prep shop", 20, 10)]
    assert pr.pick_pause(yields, cfg, 0.4) is None


def test_rejected_and_max_paused_are_respected(cfg: Config) -> None:
    yields = [pr.KeywordYield("race car fabrication", 20, 0)]
    assert pr.pick_pause(yields, cfg, 0.4, ["Race Car Fabrication"]) is None
    full = overrides.apply(cfg, overrides.Overrides(paused_keywords=["a", "b", "c"]))
    assert pr.pick_pause(yields, full, 0.4) is None


def test_unconfirmed_change_is_rolled_back_and_rejected(monkeypatch: pytest.MonkeyPatch, cfg: Config) -> None:
    leads = _run(("racing school", 10, 15), ("race prep shop", 2, 13))
    current = overrides.Overrides(paused_keywords=["race car fabrication"])
    h = Harness(monkeypatch, leads, current=current, rows=[_applied("race car fabrication", 0.5)])
    decision, ev = h.review(cfg)
    assert decision.startswith("Rolled back")
    assert h.saved[-1].paused_keywords == [] and h.saved[-1].rejected_keywords == ["race car fabrication"]


def test_noise_within_margin_keeps_the_change(monkeypatch: pytest.MonkeyPatch, cfg: Config) -> None:
    leads = _run(("racing school", 19, 21))  # 0.475, within 0.05 of 0.5
    h = Harness(monkeypatch, leads, current=overrides.Overrides(paused_keywords=["race car fabrication"]),
                rows=[_applied("race car fabrication", 0.5)])
    decision, _ = h.review(cfg)
    assert not decision.startswith("Rolled back")


def test_no_knob_escalates_once(monkeypatch: pytest.MonkeyPatch, cfg: Config) -> None:
    leads = _run(("racing school", 10, 15), ("race prep shop", 10, 15))
    h = Harness(monkeypatch, leads)
    decision, ev = h.review(cfg)
    assert "30 no email" in decision and h.dispatched[0]["run_id"] == "r1"
    pending = [{"id": "x", "evidence": {"judged": 40, "usable_rate": 0.4, "escalation": "dispatched"}}]
    h2 = Harness(monkeypatch, leads, rows=pending)
    _, ev2 = h2.review(cfg)
    assert not h2.dispatched and ev2["escalation"].endswith("already pending")


def test_form_only_shortfall_is_a_sales_decision(monkeypatch: pytest.MonkeyPatch, cfg: Config) -> None:
    leads = _run(("racing school", 10, 0)) + [_lead("racing school", False, phone="555") for _ in range(25)]
    h = Harness(monkeypatch, leads)
    decision, ev = h.review(cfg)
    assert "form-only" in decision and not h.dispatched


def test_escalate_without_token_is_a_noop(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.delenv("GITHUB_DISPATCH_TOKEN", raising=False)
    assert pr.escalate({"run_id": "r"}).startswith("not dispatched")


def test_escalate_uses_workflow_dispatch(monkeypatch: pytest.MonkeyPatch) -> None:
    import httpx
    import respx

    monkeypatch.setenv("GITHUB_DISPATCH_TOKEN", "t")
    with respx.mock(assert_all_called=True) as mock:
        route = mock.post("https://api.github.com/repos/erisdothard/Launch-Control/actions/workflows/"
                          "prospector-review.yml/dispatches").mock(return_value=httpx.Response(204))
        assert pr.escalate({"run_id": "r"}) == "dispatched"
    import json

    body = json.loads(route.calls[0].request.content)
    assert body["ref"] == "main" and json.loads(body["inputs"]["payload"]) == {"run_id": "r"}


def test_only_the_next_judged_pass_confirms_a_change() -> None:
    small = {"id": "s", "evidence": {"judged": 3}}
    plain = {"id": "p", "evidence": {"judged": 40}}
    assert pr.last_change([small, _applied("x", 0.4)])["paused"] == "x"  # type: ignore[index]
    assert pr.last_change([plain, _applied("x", 0.4)]) is None
    assert pr.last_change([]) is None


def test_overrides_layer_over_config(cfg: Config) -> None:
    out = overrides.apply(cfg, overrides.Overrides(paused_keywords=["Race  Prep Shop"]))
    assert "race prep shop" in out.filters.paused_keywords
    assert cfg.filters.paused_keywords == []  # original untouched
