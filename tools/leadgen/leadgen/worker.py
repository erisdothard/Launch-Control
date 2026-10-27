"""Queue worker: the CRM's "Find leads" button inserts a queued lead_gen_runs row; this loop claims
one at a time, runs the pipeline with the row's params, and reports stages back to the row.

Runs on Railway (see Dockerfile / railway.json). One job at a time; the database refuses a second
queued or running row, so there is nothing to coordinate between workers.

It also schedules the agent crew (agents never call each other; this file does): the Guardian
gates every send call (inside campaigns.py and automation.send_due_follow_ups), the Prospector
checks each finished run, and a light "crew" thread runs the Outreach Writer every automation
pass and checks every CREW_CHECK_S whether Mission Control's daily brief or the Strategist's
weekly review is due. Every agent call is wrapped: one agent failing never stops the worker.
"""

from __future__ import annotations

import asyncio
import logging
import threading
import time
from collections.abc import Callable
from typing import Any

from leadgen import automation, campaigns, mission_control, outlook_sync, outreach_writer, prospector, strategist
from leadgen.config import Config, supabase_env
from leadgen.filters import CONTACT_FIELDS
from leadgen.gmail_sync import start_background_sync
from leadgen.pipeline import RunCancelled, RunOptions, run
from leadgen.store import Store

log = logging.getLogger(__name__)

# Upper bounds on what the CRM may ask for, whatever lands in params.
MAX_QUERIES_CAP = 400
LIMIT_CAP = 500
# The crew thread wakes every automation pass; the daily/weekly due checks run every CREW_CHECK_S.
CREW_EVERY_S = automation.RUN_EVERY_S
CREW_CHECK_S = 600


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


def run_agent(name: str, call: Callable[[], Any]) -> Any:
    """Run one agent call; log and swallow any failure so the caller's loop keeps going."""
    try:
        return call()
    except NotImplementedError:
        log.warning("agent %s is not built yet; skipped", name)
    except Exception:
        log.exception("agent %s failed", name)
    return None


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
        run_agent("prospector", lambda: prospector.after_run(store, run_id))
    except RunCancelled:
        log.info("run %s cancelled", run_id)
    except Exception:
        # run() already marked the row failed with the error text; keep the worker alive.
        log.exception("run %s failed", run_id)
    return True


def crew_pass(store: Store, check_due: bool) -> None:
    """One crew tick: the Outreach Writer always; the daily/weekly agents when check_due."""
    run_agent("outreach-writer", lambda: outreach_writer.run_once(store))
    if check_due:
        run_agent("mission-control", lambda: mission_control.run_daily(store))
        run_agent("strategist", lambda: strategist.run_weekly(store))


def start_crew(store_factory: Callable[[], Store], every_s: float = CREW_EVERY_S,
               check_s: float = CREW_CHECK_S) -> threading.Thread:
    store = store_factory()

    def loop() -> None:
        last_check = float("-inf")
        while True:
            now = time.monotonic()
            check = now - last_check >= check_s
            if check:
                last_check = now
            try:
                crew_pass(store, check)
            except Exception:
                log.exception("crew pass failed")
            time.sleep(min(every_s, check_s))

    thread_ = threading.Thread(target=loop, name="agent-crew", daemon=True)
    thread_.start()
    log.info("agent crew on: writer every %.0fs, daily/weekly checks every %.0fs", every_s, check_s)
    return thread_


def serve(cfg: Config, poll_seconds: float = 20.0) -> None:
    env = supabase_env()
    if env is None:
        raise RuntimeError("SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY not set")
    store = Store(*env)
    orphaned = store.fail_orphaned_runs()
    if orphaned:
        log.warning("marked %d run(s) left over from a previous worker as failed", orphaned)
    start_background_sync(lambda: Store(*env))
    outlook_sync.start_background_sync(lambda: Store(*env))
    automation.start_background(lambda: Store(*env))
    # Mass email goes out a few a minute, so it has its own once-a-minute caller (Guardian-gated).
    campaigns.start_background(lambda: Store(*env))
    start_crew(lambda: Store(*env))
    log.info("worker ready, polling every %.0fs", poll_seconds)
    while True:
        try:
            busy = process_one(cfg, store)
        except Exception:
            log.exception("queue poll failed")
            busy = False
        if not busy:
            time.sleep(poll_seconds)
