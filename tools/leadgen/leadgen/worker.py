"""Queue worker: the CRM's "Find leads" button inserts a queued lead_gen_runs row; this loop claims
one at a time, runs the pipeline with the row's params, and reports stages back to the row.

Runs on Railway (see Dockerfile / railway.json). One job at a time; the database refuses a second
queued or running row, so there is nothing to coordinate between workers.
"""

from __future__ import annotations

import asyncio
import logging
import time
from typing import Any

from leadgen.config import Config, supabase_env
from leadgen.filters import CONTACT_FIELDS
from leadgen.gmail_sync import start_background_sync
from leadgen.pipeline import RunCancelled, RunOptions, run
from leadgen.store import Store

log = logging.getLogger(__name__)

# Upper bounds on what the CRM may ask for, whatever lands in params.
MAX_QUERIES_CAP = 400
LIMIT_CAP = 500


def _str_list(value: Any, allowed: set[str]) -> list[str] | None:
    if not isinstance(value, list):
        return None
    picked = [v for v in value if isinstance(v, str) and v in allowed]
    return picked or None


def _bounded_int(value: Any, cap: int) -> int | None:
    if isinstance(value, bool) or not isinstance(value, int) or value <= 0:
        return None
    return min(value, cap)


def options_from_params(params: dict[str, Any], cfg: Config) -> RunOptions:
    """Validate the CRM's params against config: unknown states/segments are dropped, sizes capped."""
    return RunOptions(
        states=_str_list(params.get("states"), set(cfg.states)),
        segments=_str_list(params.get("segments"), set(cfg.segments)),
        max_queries=_bounded_int(params.get("max_queries"), MAX_QUERIES_CAP),
        limit=_bounded_int(params.get("limit"), LIMIT_CAP),
        require=_str_list(params.get("require"), set(CONTACT_FIELDS)),
    )


def _progress(store: Store, run_id: str):
    def report(stage: str) -> None:
        if store.run_status(run_id) == "cancelled":
            raise RunCancelled
        store.set_stage(run_id, stage)
        log.info("run %s: %s", run_id, stage)

    return report


def process_one(cfg: Config, store: Store) -> bool:
    """Claim and run one queued job. Returns False when the queue was empty."""
    job = store.claim_run()
    if job is None:
        return False
    run_id = str(job["id"])
    opts = options_from_params(job.get("params") or {}, cfg)
    log.info("claimed run %s: %s", run_id, opts)
    try:
        summary = asyncio.run(run(cfg, opts, run_id=run_id, progress=_progress(store, run_id)))
        log.info("run %s done: %s", run_id, summary.counts)
    except RunCancelled:
        log.info("run %s cancelled", run_id)
    except Exception:
        # run() already marked the row failed with the error text; keep the worker alive.
        log.exception("run %s failed", run_id)
    return True


def serve(cfg: Config, poll_seconds: float = 20.0) -> None:
    env = supabase_env()
    if env is None:
        raise RuntimeError("SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY not set")
    store = Store(*env)
    orphaned = store.fail_orphaned_runs()
    if orphaned:
        log.warning("marked %d run(s) left over from a previous worker as failed", orphaned)
    start_background_sync(lambda: Store(*env))
    log.info("worker ready, polling every %.0fs", poll_seconds)
    while True:
        try:
            busy = process_one(cfg, store)
        except Exception:
            log.exception("queue poll failed")
            busy = False
        if not busy:
            time.sleep(poll_seconds)
