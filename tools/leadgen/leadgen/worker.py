"""Queue worker: the CRM's "Find leads" button inserts a queued lead_gen_runs row; this loop claims
one at a time, runs the pipeline with the row's params, and reports stages back to the row.

Runs on Railway (see Dockerfile / railway.json). One job at a time; the database refuses a second
queued or running row, so there is nothing to coordinate between workers.

It also schedules the agent crew (agents never call each other; this file does): the Guardian
gates every send call (inside campaigns.py and automation.send_due_follow_ups), the Prospector
checks each finished run, and a light "crew" thread wakes every automation pass, runs the Outreach
Writer when outreach_writer.due() allows (at most every 30 minutes, backing off after a model error),
and checks every CREW_CHECK_S whether Mission Control's daily brief or the Strategist's weekly review
is due. Right after the Mission Control check, notify.send_brief emails the brief; every crew pass
also runs notify.check_alerts (a new outbound halt, a real prospect reply). Notify is internal
mail, not an agent: no Guardian, no send caps. On the same daily/weekly check, pit_report.run_weekly
rebuilds the /admin/ops Pit Report video when its newest copy in storage is a week old (or missing);
it is not an agent and logs a line, not an agent_runs row. The crew thread heartbeats as "crew" each pass.
Every agent call is wrapped: one agent failing never stops the worker.
"""

from __future__ import annotations

import asyncio
import logging
import threading
import time
from collections.abc import Callable
from typing import Any

from leadgen import (
    agent_log,
    automation,
    campaigns,
    mission_control,
    notify,
    outlook_sync,
    outreach_writer,
    pit_report,
    prospector,
    strategist,
)
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


def crew_pass(store: Store, check_due: bool) -> dict[str, bool]:
    """One crew tick: the Outreach Writer when it's due; the daily/weekly agents when check_due.
    Returns which agents were called, for the heartbeat."""
    ran = {"outreach-writer": outreach_writer.due(), "mission-control": check_due, "strategist": check_due}
    if ran["outreach-writer"]:
        run_agent("outreach-writer", lambda: outreach_writer.run_once(store))
    if check_due:
        run_agent("mission-control", lambda: mission_control.run_daily(store))
        run_agent("notify-brief", lambda: notify.send_brief(store))
        run_agent("strategist", lambda: strategist.run_weekly(store))
        # Not an agent (no agent_runs row): the weekly Pit Report video for /admin/ops.
        run_agent("pit-report", lambda: pit_report.run_weekly(store))
    run_agent("notify-alerts", lambda: notify.check_alerts(store))
    return ran


def crew_beat(store: Store, every_s: float, ran: dict[str, bool]) -> None:
    """Check in for Mission Control, like automation.beat. A blip must never stop the loop."""
    try:
        store.heartbeat("crew", {"every_s": every_s, "last_pass": ran})
    except Exception:
        log.warning("crew heartbeat failed", exc_info=True)


def close_stale_runs(store: Store) -> None:
    """Once at crew start: passes a previous worker left 'running' are marked failed."""
    try:
        closed = agent_log.fail_stale_runs(store)
    except Exception:
        log.exception("could not close stale agent_runs rows")
        return
    if closed:
        log.warning("marked %d agent run(s) left over from a previous worker as failed", closed)


def start_crew(store_factory: Callable[[], Store], every_s: float = CREW_EVERY_S,
               check_s: float = CREW_CHECK_S) -> threading.Thread:
    store = store_factory()

    sleep_s = min(every_s, check_s)

    def loop() -> None:
        close_stale_runs(store)
        last_check = float("-inf")
        while True:
            now = time.monotonic()
            check = now - last_check >= check_s
            if check:
                last_check = now
            ran: dict[str, bool] = {}
            try:
                ran = crew_pass(store, check)
            except Exception:
                log.exception("crew pass failed")
            crew_beat(store, sleep_s, ran)
            time.sleep(sleep_s)

    thread_ = threading.Thread(target=loop, name="agent-crew", daemon=True)
    thread_.start()
    log.info("agent crew on: wakes every %.0fs, writer at most every %.0fs, daily/weekly checks every %.0fs",
             sleep_s, outreach_writer.RUN_EVERY.total_seconds(), check_s)
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
