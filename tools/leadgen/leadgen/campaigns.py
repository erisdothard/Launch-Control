"""Mass email pacing: ask the CRM to send what's due from its campaigns, once a minute.

The CRM owns everything about the sending (merge fields, suppressions, the per-minute pace,
follow-ups, reply tracking: crm/src/app/api/automation/send-campaigns). This module only keeps the
clock: Microsoft flags mailboxes that burst, so campaigns go out a few a minute, which needs a
caller every minute rather than every automation pass (five minutes).
"""

from __future__ import annotations

import logging
import os
import threading
import time
from typing import Any

import httpx

log = logging.getLogger(__name__)

RUN_EVERY_S = 60
# The CRM route stops starting sends after 45s and is capped at 60s; leave room for the response.
TIMEOUT_S = 90
DEFAULT_CRM_URL = "https://crm.golaunchcontrol.com"


def send_due_campaigns(http: httpx.Client | None = None) -> dict[str, int]:
    """One call to the CRM's campaign sender. Returns its counts; {} when not configured."""
    secret = os.environ.get("AUTOMATION_SECRET", "").strip()
    if not secret:
        return {}
    base = os.environ.get("CRM_URL", DEFAULT_CRM_URL).rstrip("/")
    client = http or httpx.Client(timeout=TIMEOUT_S)
    resp = client.post(f"{base}/api/automation/send-campaigns", headers={"Authorization": f"Bearer {secret}"})
    resp.raise_for_status()
    body: Any = resp.json()
    if not isinstance(body, dict):
        return {}
    return {k: int(v) for k, v in body.items() if isinstance(v, int) and not isinstance(v, bool)}


def run_once(http: httpx.Client | None = None) -> dict[str, int]:
    """send_due_campaigns that never raises: a CRM outage must not kill the worker's thread."""
    try:
        return send_due_campaigns(http)
    except Exception:
        log.exception("campaign send call failed")
        return {}


def start_background(every_s: float = RUN_EVERY_S) -> threading.Thread | None:
    """Start the once-a-minute caller. Returns None (and starts nothing) without AUTOMATION_SECRET."""
    if not os.environ.get("AUTOMATION_SECRET", "").strip():
        log.info("mass email sender off: AUTOMATION_SECRET not set")
        return None
    http = httpx.Client(timeout=TIMEOUT_S)

    def loop() -> None:
        while True:
            started = time.monotonic()
            counts = run_once(http)
            if any(counts.values()):
                log.info("campaigns: %s", counts)
            # Keep a steady minute between call starts, however long the call took.
            time.sleep(max(1.0, every_s - (time.monotonic() - started)))

    thread_ = threading.Thread(target=loop, name="crm-campaigns", daemon=True)
    thread_.start()
    log.info("mass email sender on, every %.0fs", every_s)
    return thread_
