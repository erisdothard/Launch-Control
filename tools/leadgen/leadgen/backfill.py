"""Bring leads already in the CRM up to the current rules without a new Google search:
re-apply the score caps to the stored factor ratings (no Claude calls), and re-read the
websites of leads missing an email or phone. Contact fields are only filled when empty."""

from __future__ import annotations

import asyncio
import logging
from dataclasses import dataclass, field
from datetime import UTC, datetime
from typing import Any

from leadgen.config import Config
from leadgen.enrich.crawl import Crawler
from leadgen.enrich.extract import build_enrichment
from leadgen.models import Enrichment, FactorRating
from leadgen.score import final_score
from leadgen.store import Store

log = logging.getLogger(__name__)


@dataclass
class BackfillSummary:
    rescored: int = 0
    crawled: int = 0
    emails_added: int = 0
    phones_added: int = 0
    names_added: int = 0
    changes: list[str] = field(default_factory=list)


def score_patch(row: dict[str, Any], weights: dict[str, float]) -> dict[str, Any]:
    """New score + cap reasons from the stored breakdown, or {} when nothing changes."""
    raw = row.get("score_breakdown") or {}
    try:
        breakdown = {k: FactorRating.model_validate(v) for k, v in raw.items()}
    except ValueError:
        return {}
    if not breakdown:
        return {}
    score, capped_by = final_score(breakdown, weights)
    signals = dict(row.get("signals") or {})
    if score == row.get("score") and signals.get("score_capped_by", []) == capped_by:
        return {}
    signals["score_capped_by"] = capped_by
    return {"score": score, "signals": signals}


def contact_patch(row: dict[str, Any], e: Enrichment, signals: dict[str, Any]) -> dict[str, Any]:
    patch: dict[str, Any] = {}
    if not row.get("email") and e.email:
        patch["email"] = e.email
    if not row.get("phone") and e.phone:
        patch["phone"] = e.phone
    if not row.get("contact_name") and e.people:
        patch["contact_name"] = e.people[0].name
        patch["contact_title"] = e.people[0].title or None
    if patch:
        merged = dict(signals)
        for k in ("emails", "site_phones", "email_kind"):
            if e.signals.get(k):
                merged[k] = e.signals[k]
        patch["signals"] = merged
    return patch


async def _recrawl(cfg: Config, rows: list[dict[str, Any]]) -> list[tuple[dict[str, Any], Enrichment]]:
    en = cfg.enrich
    crawler = Crawler(cfg.user_agent, en.max_pages, en.per_host_delay_s, en.timeout_s, en.max_bytes)
    sem = asyncio.Semaphore(en.concurrency)
    today = datetime.now(UTC).date()

    async def one(row: dict[str, Any]) -> tuple[dict[str, Any], Enrichment]:
        async with sem:
            crawl = await crawler.crawl(row["website"])
        return row, build_enrichment(crawl, (), today, cfg.score.max_text_chars)

    try:
        return list(await asyncio.gather(*(one(r) for r in rows)))
    finally:
        await crawler.aclose()


def backfill(cfg: Config, store: Store, crawl: bool = True) -> BackfillSummary:
    summary = BackfillSummary()
    rows = store.lead_gen_rows()
    for row in rows:
        patch = score_patch(row, cfg.score.weights)
        if patch:
            store.patch_lead(row["id"], patch)
            row.update(patch)
            summary.rescored += 1
            summary.changes.append(f"score {row['business_name']}: -> {patch['score']}")
    if not crawl:
        return summary
    missing = [r for r in rows if r.get("website") and r.get("domain") and not (r.get("email") and r.get("phone"))]
    summary.crawled = len(missing)
    for row, e in asyncio.run(_recrawl(cfg, missing)):
        patch = contact_patch(row, e, row.get("signals") or {})
        if not patch:
            continue
        store.patch_lead(row["id"], patch)
        summary.emails_added += int("email" in patch)
        summary.phones_added += int("phone" in patch)
        summary.names_added += int("contact_name" in patch)
        added = ", ".join(f"{k}={patch[k]}" for k in ("email", "phone", "contact_name") if k in patch)
        summary.changes.append(f"contact {row['business_name']}: {added}")
    return summary
