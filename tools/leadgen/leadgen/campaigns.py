"""Mass email pacing: ask the CRM to send what's due from its campaigns, once a minute.

The CRM owns everything about the sending (merge fields, suppressions, the per-minute pace,
follow-ups, reply tracking: crm/src/app/api/automation/send-campaigns). This module only keeps the
clock: Microsoft flags mailboxes that burst, so campaigns go out a few a minute, which needs a
caller every minute rather than every automation pass (five minutes).

The Guardian gates every call (guardian.allow_outbound): while outbound is halted, or when the
gate can't be checked, the CRM route isn't called at all.
"""

from __future__ import annotations

import logging
import os
import threading
import time
from collections.abc import Callable
from typing import Any

import httpx

from leadgen import guardian
from leadgen.store import Store

log = logging.getLogger(__name__)

RUN_EVERY_S = 60
# The CRM route stops starting sends after 45s and is capped at 60s; leave room for the response.
TIMEOUT_S = 90


def send_due_campaigns(http: httpx.Client | None = None) -> dict[str, int]:
    """One call to the CRM's campaign sender. Returns its counts; {} when not configured.
    CRM_URL is required: a missing one must fail loudly, never fall back to production."""
    secret = os.environ.get("AUTOMATION_SECRET", "").strip()
    if not secret:
        return {}
    base = os.environ.get("CRM_URL", "").strip().rstrip("/")
    if not base:
        raise RuntimeError("CRM_URL is not set; the campaign sender needs the CRM's base URL")
    client = http or httpx.Client(timeout=TIMEOUT_S)
    resp = client.post(f"{base}/api/automation/send-campaigns", headers={"Authorization": f"Bearer {secret}"})
    resp.raise_for_status()
    body: Any = resp.json()
    if not isinstance(body, dict):
        return {}
    return {k: int(v) for k, v in body.items() if isinstance(v, int) and not isinstance(v, bool)}


def run_once(http: httpx.Client | None = None, store: Store | None = None) -> dict[str, int]:
    """send_due_campaigns behind the Guardian, never raising: a CRM outage must not kill the
    worker's thread. No store means the halt can't be checked, so nothing is sent (fails closed)."""
    if store is None:
        log.error("campaign send skipped: no store to check the outbound halt")
        return {}
    try:
        if not guardian.allow_outbound(store):
            log.warning("campaign send skipped: outbound halted by the Guardian")
            return {}
        return send_due_campaigns(http)
    except Exception:
        log.exception("campaign send call failed")
        return {}


def beat(store: Store, every_s: float, counts: dict[str, int]) -> None:
    """Check in for Mission Control, like automation.beat. A blip must never stop the loop."""
    try:
        store.heartbeat("campaigns", {"every_s": every_s, "last_pass": counts})
    except Exception:
        log.warning("campaigns heartbeat failed", exc_info=True)


def start_background(store_factory: Callable[[], Store] | None = None,
                     every_s: float = RUN_EVERY_S) -> threading.Thread | None:
    """Start the once-a-minute caller. Returns None (and starts nothing) without AUTOMATION_SECRET,
    CRM_URL, or a store for the Guardian's halt check."""
    if not os.environ.get("AUTOMATION_SECRET", "").strip():
        log.info("mass email sender off: AUTOMATION_SECRET not set")
        return None
    if not os.environ.get("CRM_URL", "").strip():
        log.error("mass email sender off: CRM_URL not set")
        return None
    if store_factory is None:
        log.error("mass email sender off: no store for the Guardian's halt check")
        return None
    http = httpx.Client(timeout=TIMEOUT_S)
    store = store_factory()

    def loop() -> None:
        while True:
            started = time.monotonic()
            counts = run_once(http, store)
            if any(counts.values()):
                log.info("campaigns: %s", counts)
            beat(store, every_s, counts)
            # Keep a steady minute between call starts, however long the call took.
            time.sleep(max(1.0, every_s - (time.monotonic() - started)))

    thread_ = threading.Thread(target=loop, name="crm-campaigns", daemon=True)
    thread_.start()
    log.info("mass email sender on, every %.0fs", every_s)
    return thread_
