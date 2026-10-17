from __future__ import annotations

import json
from pathlib import Path
from types import SimpleNamespace
from typing import Any

import anthropic
import httpx2
import pytest
from conftest import make_lead

from leadgen.config import FACTOR_KEYS, Config
from leadgen.models import Enrichment, FactorRating
from leadgen.prompt import output_schema, user_payload
from leadgen.score import LLMScore, ScoreError, Scorer, to_result, weighted_score


def _llm_json(rating: int = 4, name: str = "Mike Thompson", segment: str = "Arrive & drive", exclude: bool = False) -> str:
    return json.dumps({
        "factors": {k: {"rating": rating, "evidence": f"ev {k}"} for k in FACTOR_KEYS},
        "segment": segment,
        "decision_maker": {"name": name, "title": "Owner"},
        "reason": "Fits.",
        "outreach_hook": "Saw your seats-available post.",
        "exclude": exclude,
        "exclude_why": "",
    })


def _resp(text: str, stop: str = "end_turn") -> SimpleNamespace:
    return SimpleNamespace(stop_reason=stop, content=[SimpleNamespace(type="text", text=text)])


class FakeMessages:
    def __init__(self, outcomes: list[Any]) -> None:
        self.outcomes = outcomes
        self.calls: list[dict[str, Any]] = []

    async def create(self, **kw: Any) -> Any:
        self.calls.append(kw)
        out = self.outcomes.pop(0)
        if isinstance(out, Exception):
            raise out
        return out


class FakeClient:
    def __init__(self, beta: list[Any], plain: list[Any] | None = None) -> None:
        self.beta = SimpleNamespace(messages=FakeMessages(beta))
        self.messages = FakeMessages(plain or [])


def _status_err(cls: type[anthropic.APIStatusError], code: int) -> anthropic.APIStatusError:
    req = httpx2.Request("POST", "https://api.anthropic.com/v1/messages")
    return cls("boom", response=httpx2.Response(code, request=req), body=None)


def _lead() -> Any:
    lead = make_lead()
    return lead.model_copy(update={"enrichment": Enrichment(ok=True, page_text="Mike Thompson, Owner", signals={})})


def test_weighted_score_math() -> None:
    weights = {k: 1.0 for k in FACTOR_KEYS}
    all5 = {k: FactorRating(rating=5, evidence="") for k in FACTOR_KEYS}
    all3 = {k: FactorRating(rating=3, evidence="") for k in FACTOR_KEYS}
    assert weighted_score(all5, weights) == 100
    assert weighted_score(all3, weights) == 60
    skew = {**{k: 1.0 for k in FACTOR_KEYS}, "niche_fit": 4.0}
    mixed = {**all3, "niche_fit": FactorRating(rating=5, evidence="")}
    assert weighted_score(mixed, skew) == round((3 * 10 + 5 * 4) / (5 * 14) * 100)
    clamped = {**all3, "niche_fit": FactorRating(rating=9, evidence="")}
    assert weighted_score(clamped, weights) == weighted_score(mixed, weights)


def test_to_result_verifies_decision_maker_and_segment(cfg: Config) -> None:
    lead = _lead()
    ok = to_result(LLMScore.model_validate_json(_llm_json()), lead, cfg.score, cfg.segment_labels)
    assert ok.decision_maker and ok.decision_maker.name == "Mike Thompson"
    invented = to_result(LLMScore.model_validate_json(_llm_json(name="Ghost Person")), lead, cfg.score, cfg.segment_labels)
    assert invented.decision_maker is None
    odd = to_result(LLMScore.model_validate_json(_llm_json(segment="Bakery")), lead, cfg.score, cfg.segment_labels)
    assert odd.segment == "Other"
    partial = json.loads(_llm_json())
    del partial["factors"]["niche_fit"]
    with pytest.raises(ScoreError):
        to_result(LLMScore.model_validate(partial), lead, cfg.score, cfg.segment_labels)


def test_schema_and_payload(cfg: Config) -> None:
    schema = output_schema(cfg.segment_labels)
    assert set(schema["properties"]["factors"]["required"]) == set(FACTOR_KEYS)
    assert schema["properties"]["segment"]["enum"] == cfg.segment_labels
    payload = user_payload(_lead(), cfg.segment_labels, 100)
    assert "Apex Endurance Racing" in payload and "<website_text>" in payload


async def test_scorer_happy_path_and_cache(cfg: Config, tmp_path: Path) -> None:
    client = FakeClient(beta=[_resp(_llm_json())])
    scorer = Scorer(cfg.score, cfg.segment_labels, tmp_path, client=client)  # type: ignore[arg-type]
    res = await scorer.score(_lead())
    assert res and res.score == 80 and res.segment == "Arrive & drive"
    call = client.beta.messages.calls[0]
    assert call["fallbacks"] == "default" and call["model"] == "claude-sonnet-5-5"
    assert call["output_config"]["format"]["type"] == "json_schema"
    again = await scorer.score(_lead())  # served from disk cache, no API call
    assert again and again.score == 80 and scorer.stats == {"cached": 1, "scored": 1, "failed": 0}
    reweighted = cfg.score.model_copy(update={"weights": {**cfg.score.weights, "niche_fit": 0.0}})
    other = Scorer(reweighted, cfg.segment_labels, tmp_path, client=FakeClient(beta=[]))  # type: ignore[arg-type]
    assert (await other.score(_lead())).score == 80  # type: ignore[union-attr]  # all-4s stays 80


async def test_scorer_falls_back_when_fallbacks_rejected(cfg: Config, tmp_path: Path) -> None:
    client = FakeClient(beta=[_status_err(anthropic.BadRequestError, 400)], plain=[_resp(_llm_json(rating=5))])
    scorer = Scorer(cfg.score, cfg.segment_labels, tmp_path, client=client)  # type: ignore[arg-type]
    res = await scorer.score(_lead())
    assert res and res.score == 100 and scorer.use_fallbacks is False


async def test_scorer_error_paths(cfg: Config, tmp_path: Path) -> None:
    outcomes = [
        _status_err(anthropic.RateLimitError, 429),
        _status_err(anthropic.InternalServerError, 500),
        _resp("", stop="refusal"),
        _resp("not json"),
    ]
    scorer = Scorer(cfg.score, cfg.segment_labels, tmp_path, client=FakeClient(beta=outcomes), rescore=True)  # type: ignore[arg-type]
    for _ in range(4):
        assert await scorer.score(_lead()) is None
    assert scorer.stats["failed"] == 4


async def test_scorer_auth_error_aborts(cfg: Config, tmp_path: Path) -> None:
    client = FakeClient(beta=[_status_err(anthropic.AuthenticationError, 401)])
    scorer = Scorer(cfg.score, cfg.segment_labels, tmp_path, client=client)  # type: ignore[arg-type]
    with pytest.raises(ScoreError):
        await scorer.score(_lead())
