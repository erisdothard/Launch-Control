"""LLM factor ratings (Claude, structured JSON output) -> deterministic weighted 0-100 score."""

from __future__ import annotations

import asyncio
import hashlib
import json
import logging
import re
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

import anthropic
from pydantic import BaseModel, ValidationError

from leadgen.config import FACTOR_KEYS, ScoreCfg
from leadgen.models import Contact, FactorRating, Lead, ScoreResult
from leadgen.prompt import PROMPT_VERSION, SYSTEM_PROMPT, output_schema, user_payload

log = logging.getLogger(__name__)

FALLBACK_BETA = "server-side-fallback-2026-07-01"


class ScoreError(RuntimeError):
    pass


class _DM(BaseModel):
    name: str = ""
    title: str = ""


class LLMScore(BaseModel):
    factors: dict[str, FactorRating]
    segment: str
    decision_maker: _DM
    reason: str
    outreach_hook: str
    exclude: bool
    exclude_why: str = ""


def weighted_score(breakdown: dict[str, FactorRating], weights: dict[str, float]) -> int:
    """sum(w_i * rating_i) / (5 * sum(w_i)) * 100, rounded. Missing factors count as 0."""
    total_w = sum(weights.values())
    raw = sum(weights[k] * max(0.0, min(5.0, breakdown[k].rating)) for k in weights if k in breakdown)
    return round(raw / (5 * total_w) * 100)


def _name_in_evidence(name: str, lead: Lead) -> bool:
    e = lead.enrichment
    hay = " ".join([e.page_text if e else "", json.dumps(e.signals.get("people", []) if e else [])]).lower()
    return bool(name) and name.lower() in hay


def to_result(parsed: LLMScore, lead: Lead, cfg: ScoreCfg, segment_labels: list[str]) -> ScoreResult:
    missing = set(FACTOR_KEYS) - set(parsed.factors)
    if missing:
        raise ScoreError(f"model omitted factors: {sorted(missing)}")
    breakdown = {k: parsed.factors[k] for k in FACTOR_KEYS}
    dm = parsed.decision_maker
    contact = Contact(name=dm.name.strip(), title=dm.title.strip()) if _name_in_evidence(dm.name.strip(), lead) else None
    segment = parsed.segment if parsed.segment in segment_labels else "Other"
    return ScoreResult(
        score=weighted_score(breakdown, cfg.weights),
        breakdown=breakdown,
        segment=segment,
        decision_maker=contact,
        reason=parsed.reason.strip(),
        outreach_hook=parsed.outreach_hook.strip(),
        exclude=parsed.exclude,
        exclude_why=parsed.exclude_why.strip(),
        model=cfg.model,
        scored_at=datetime.now(UTC).isoformat(),
    )


def _cache_path(cache_dir: Path, lead: Lead) -> Path:
    slug = re.sub(r"[^a-z0-9.-]+", "-", lead.key.lower()).strip("-")[:80] or "unknown"
    return cache_dir / f"{slug}.json"


def _input_hash(payload: str, cfg: ScoreCfg) -> str:
    return hashlib.sha256(f"{PROMPT_VERSION}|{cfg.model}|{payload}".encode()).hexdigest()[:20]


def _cache_tag(cfg: ScoreCfg) -> str:
    return f"{PROMPT_VERSION}|{cfg.model}"


class Scorer:
    def __init__(self, cfg: ScoreCfg, segment_labels: list[str], cache_dir: Path,
                 client: anthropic.AsyncAnthropic | None = None, rescore: bool = False) -> None:
        self.cfg = cfg
        self.labels = segment_labels
        self.cache_dir = cache_dir
        self.cache_dir.mkdir(parents=True, exist_ok=True)
        self.client = client or anthropic.AsyncAnthropic(max_retries=4)
        self.sem = asyncio.Semaphore(cfg.concurrency)
        self.use_fallbacks = cfg.use_fallbacks
        self.schema = output_schema(segment_labels)
        self.rescore = rescore
        self.stats = {"cached": 0, "scored": 0, "failed": 0}

    def _read_cache(self, lead: Lead) -> ScoreResult | None:
        """Per-domain cache, valid while prompt version, model and weights are unchanged."""
        f = _cache_path(self.cache_dir, lead)
        if self.rescore or not f.is_file():
            return None
        try:
            data = json.loads(f.read_text(encoding="utf-8"))
            if data.get("tag") != _cache_tag(self.cfg):
                return None
            cached = ScoreResult.model_validate(data["result"])
            # Weights may have changed since caching: the score is always recomputed.
            return cached.model_copy(update={"score": weighted_score(cached.breakdown, self.cfg.weights)})
        except (json.JSONDecodeError, KeyError, ValidationError):
            return None

    def _write_cache(self, lead: Lead, h: str, result: ScoreResult) -> None:
        payload = {"tag": _cache_tag(self.cfg), "input_hash": h, "result": result.model_dump(mode="json")}
        _cache_path(self.cache_dir, lead).write_text(json.dumps(payload, indent=1), encoding="utf-8")

    async def _call(self, user: str) -> Any:
        kwargs: dict[str, Any] = {
            "model": self.cfg.model,
            "max_tokens": self.cfg.max_tokens,
            "system": [{"type": "text", "text": SYSTEM_PROMPT, "cache_control": {"type": "ephemeral"}}],
            "messages": [{"role": "user", "content": user}],
            "output_config": {"effort": self.cfg.effort, "format": {"type": "json_schema", "schema": self.schema}},
        }
        if self.use_fallbacks:
            try:
                return await self.client.beta.messages.create(
                    **kwargs, betas=[FALLBACK_BETA], fallbacks="default"
                )
            except anthropic.BadRequestError as exc:
                log.warning("refusal fallbacks rejected (%s); continuing without them", exc.message[:160])
                self.use_fallbacks = False
        return await self.client.messages.create(**kwargs)

    async def score(self, lead: Lead) -> ScoreResult | None:
        user = user_payload(lead, self.labels, self.cfg.max_text_chars)
        h = _input_hash(user, self.cfg)
        cached = self._read_cache(lead)
        if cached:
            self.stats["cached"] += 1
            return cached
        async with self.sem:
            try:
                resp = await self._call(user)
            except anthropic.AuthenticationError as exc:
                raise ScoreError("Anthropic authentication failed; check ANTHROPIC_API_KEY") from exc
            except anthropic.RateLimitError:
                log.warning("rate limited scoring %s after retries", lead.key)
                self.stats["failed"] += 1
                return None
            except anthropic.APIStatusError as exc:
                log.warning("API error %s scoring %s: %s", exc.status_code, lead.key, exc.message[:200])
                self.stats["failed"] += 1
                return None
            except anthropic.APIConnectionError:
                log.warning("network error scoring %s", lead.key)
                self.stats["failed"] += 1
                return None
        if resp.stop_reason in ("refusal", "max_tokens"):
            log.warning("scoring %s stopped: %s", lead.key, resp.stop_reason)
            self.stats["failed"] += 1
            return None
        text = next((b.text for b in resp.content if getattr(b, "type", "") == "text"), "")
        try:
            parsed = LLMScore.model_validate_json(text)
            result = to_result(parsed, lead, self.cfg, self.labels)
        except (ValidationError, ScoreError) as exc:
            log.warning("unparseable score for %s: %s", lead.key, str(exc)[:200])
            self.stats["failed"] += 1
            return None
        self._write_cache(lead, h, result)
        self.stats["scored"] += 1
        return result
