"""Orchestration: discover -> dedupe -> pre-filter -> enrich -> post-filter -> score -> store/export."""

from __future__ import annotations

import asyncio
import logging
from collections import Counter
from collections.abc import Callable
from dataclasses import dataclass, field
from datetime import UTC, date, datetime
from pathlib import Path
from typing import Any

from leadgen.config import Config, supabase_env
from leadgen.dedupe import dedupe, drop_known
from leadgen.discover import directories, gmaps
from leadgen.discover.queries import build_queries
from leadgen.discover.seeds import load_seeds
from leadgen.enrich.crawl import Crawler, CrawlResult
from leadgen.enrich.extract import build_enrichment
from leadgen.export import write_csv, write_jsonl
from leadgen.filters import post_crawl_reasons, pre_crawl_reasons, with_reasons
from leadgen.models import Enrichment, Lead
from leadgen.record import email_first_name, lead_row
from leadgen.score import Scorer
from leadgen.store import Store

log = logging.getLogger(__name__)


@dataclass(frozen=True)
class RunOptions:
    limit: int | None = None
    dry_run: bool = False
    states: list[str] | None = None
    segments: list[str] | None = None
    no_score: bool = False
    max_queries: int | None = None
    rescore: bool = False
    refresh_existing: bool = False
    seed: str | None = None


class RunCancelled(Exception):
    """Raised by a progress callback when the CRM cancelled the run."""


Progress = Callable[[str], None]


def _no_progress(_stage: str) -> None:
    return None


@dataclass
class RunSummary:
    run_dir: Path
    counts: dict[str, int] = field(default_factory=dict)
    exclusions: Counter[str] = field(default_factory=Counter)
    rows: list[dict[str, Any]] = field(default_factory=list)
    store_counts: dict[str, int] = field(default_factory=dict)


async def _enrich_one(crawler: Crawler, lead: Lead, sem: asyncio.Semaphore, today: date, max_chars: int) -> Lead:
    target = lead.place.website
    if not target or not lead.domain:
        crawl = CrawlResult(start_url=target, error="no_website" if not target else "non_business_domain")
    else:
        async with sem:
            crawl = await crawler.crawl(target)
    enrichment: Enrichment = build_enrichment(crawl, lead.place.emails, today, max_chars)
    return lead.model_copy(update={"enrichment": enrichment})


async def enrich_all(cfg: Config, leads: list[Lead], today: date) -> list[Lead]:
    e = cfg.enrich
    crawler = Crawler(cfg.user_agent, e.max_pages, e.per_host_delay_s, e.timeout_s, e.max_bytes)
    sem = asyncio.Semaphore(e.concurrency)
    try:
        return list(await asyncio.gather(
            *(_enrich_one(crawler, lead, sem, today, cfg.score.max_text_chars) for lead in leads)
        ))
    finally:
        await crawler.aclose()


async def score_all(cfg: Config, leads: list[Lead], rescore: bool) -> tuple[list[Lead], dict[str, int]]:
    scorer = Scorer(cfg.score, cfg.segment_labels, cfg.out_path() / "cache" / "scores", rescore=rescore)
    results = await asyncio.gather(*(scorer.score(lead) for lead in leads))
    out: list[Lead] = []
    for lead, res in zip(leads, results, strict=True):
        updated = lead.model_copy(update={"score": res}) if res else lead
        if res and res.exclude:
            updated = with_reasons(updated, [f"llm:{res.exclude_why or 'not a fit'}"[:160]])
        out.append(updated)
    return out, scorer.stats


def _reason_key(reason: str) -> str:
    return reason.split(":", 1)[0]


async def run(cfg: Config, opts: RunOptions, run_id: str | None = None,
              progress: Progress = _no_progress) -> RunSummary:
    """Run the pipeline. `run_id` is a run the worker already claimed; otherwise one is started.
    `progress(stage)` is called between stages and may raise RunCancelled."""
    today = datetime.now(UTC).date()
    out_root = cfg.out_path()
    run_dir = out_root / "runs" / datetime.now(UTC).strftime("%Y%m%dT%H%M%SZ")
    summary = RunSummary(run_dir=run_dir)
    store: Store | None = None
    if not opts.dry_run:
        env = supabase_env()
        if env is None:
            raise RuntimeError("SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY not set (tools/leadgen/.env). Use --dry-run.")
        store = Store(*env)
        if run_id is None:
            run_id = store.start_run({"options": opts.__dict__, "max_queries": opts.max_queries or cfg.max_queries})
    try:
        summary = await _run(cfg, opts, today, out_root, summary, store, run_id, progress)
    except RunCancelled:
        if store and run_id:
            store.finish_run(run_id, "cancelled", summary.counts)
        raise
    except Exception as exc:
        if store and run_id:
            store.finish_run(run_id, "failed", summary.counts, error=f"{type(exc).__name__}: {exc}"[:500])
        raise
    if store and run_id:
        store.finish_run(run_id, "completed", summary.counts)
    return summary


async def _run(cfg: Config, opts: RunOptions, today: date, out_root: Path, summary: RunSummary,
               store: Store | None, run_id: str | None, progress: Progress = _no_progress) -> RunSummary:
    c = summary.counts
    progress("searching")
    if opts.seed:
        places = load_seeds(opts.seed, cfg)
        c["queries"] = 0
    else:
        queries = build_queries(cfg, opts.states, opts.segments, opts.max_queries)
        c["queries"] = len(queries)
        places = await asyncio.to_thread(gmaps.discover, queries, cfg.gmaps, out_root)
    if any(d.enabled for d in cfg.directories):
        crawler = Crawler(cfg.user_agent, 1, cfg.enrich.per_host_delay_s, cfg.enrich.timeout_s, cfg.enrich.max_bytes)
        try:
            places += await directories.discover(cfg, crawler.client, crawler.robots)
        finally:
            await crawler.aclose()
    c["raw_rows"] = len(places)
    leads = dedupe(places)
    c["found"] = len(leads)
    c["with_website"] = sum(1 for lead in leads if lead.domain)

    if store and not opts.refresh_existing:
        known = store.known_domains([lead.domain for lead in leads if lead.domain])
        leads, c["already_in_crm"] = drop_known(leads, known)

    leads = [with_reasons(lead, pre_crawl_reasons(lead, cfg.filters)) for lead in leads]
    excluded = [lead for lead in leads if lead.excluded]
    candidates = [lead for lead in leads if not lead.excluded]
    if opts.limit is not None:
        candidates = candidates[: opts.limit]
    log.info("found %d unique, %d pre-excluded, enriching %d", len(leads), len(excluded), len(candidates))
    progress("reading websites")

    enriched = await enrich_all(cfg, candidates, today)
    c["enriched"] = sum(1 for lead in enriched if lead.enrichment and lead.enrichment.ok)
    enriched = [with_reasons(lead, post_crawl_reasons(lead, cfg.filters, today)) for lead in enriched]

    to_score = [lead for lead in enriched if not lead.excluded]
    progress("scoring")
    if not opts.no_score and to_score:
        scored, stats = await score_all(cfg, to_score, opts.rescore)
        c.update({f"score_{k}": v for k, v in stats.items()})
        by_key = {lead.key: lead for lead in scored}
        enriched = [by_key.get(lead.key, lead) for lead in enriched]

    final = enriched + excluded
    kept = [lead for lead in final if not lead.excluded]
    c["kept"] = len(kept)
    c["excluded"] = len(final) - len(kept)
    c["same_domain_email"] = sum(
        1 for lead in enriched if lead.enrichment and lead.enrichment.email_kind in ("personal", "role")
    )
    c["any_email"] = sum(1 for lead in enriched if lead.enrichment and lead.enrichment.email)
    c["named_decision_maker"] = sum(1 for lead in enriched if lead.contact)
    c["first_name_from_email"] = sum(1 for lead in enriched if not lead.contact and email_first_name(lead))
    summary.exclusions.update(_reason_key(r) for lead in final for r in lead.exclude_reasons)

    rows = [{**lead_row(lead, cfg), "excluded": lead.excluded} for lead in final]
    summary.rows = rows
    write_jsonl(rows, summary.run_dir / "leads.jsonl")
    write_csv([r for r in rows if not r["excluded"]], summary.run_dir / "leads.csv")
    write_csv([r for r in rows if r["excluded"]], summary.run_dir / "excluded.csv")

    if store:
        progress("saving")
        kept_rows = [{k: v for k, v in r.items() if k != "excluded"} for r in rows if not r["excluded"]]
        summary.store_counts = store.upsert_leads(kept_rows, run_id)
    return summary
