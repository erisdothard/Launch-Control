"""The crew's logbook and the one switch that stops outbound mail.

Every agent pass writes one agent_runs row (docs/agents/WHY.md: "every decision is a row"), and
the Guardian's halt lives in system_flags.outbound_halt. Senders call outbound_halted() before
sending anything; clearing a halt is a person's job, never an agent's.
"""

from __future__ import annotations

import logging
from collections.abc import Iterator
from contextlib import contextmanager
from dataclasses import dataclass, field
from datetime import UTC, datetime, timedelta
from typing import Any

from leadgen.store import Store, StoreError

log = logging.getLogger(__name__)

AGENTS = frozenset({"mission-control", "guardian", "prospector", "outreach-writer", "strategist"})
HALT_KEY = "outbound_halt"


@dataclass
class Run:
    """What an agent fills in during its pass; written to agent_runs when the pass ends."""

    agent: str
    id: str
    status: str = "done"
    decision: str = ""
    evidence: dict[str, Any] = field(default_factory=dict)


def _now() -> str:
    return datetime.now(UTC).isoformat()


@contextmanager
def agent_run(store: Store, agent: str) -> Iterator[Run]:
    """One logged pass. An exception inside marks the row failed and re-raises."""
    if agent not in AGENTS:
        raise ValueError(f"unknown agent {agent!r}")
    resp = store._req("POST", "agent_runs", prefer="return=representation", json={"agent": agent})
    run = Run(agent=agent, id=str(resp.json()[0]["id"]))
    try:
        yield run
    except Exception as exc:
        _finish(store, run, "failed", error=f"{type(exc).__name__}: {exc}"[:500])
        raise
    _finish(store, run, run.status)


def _finish(store: Store, run: Run, status: str, error: str | None = None) -> None:
    try:
        store._req("PATCH", "agent_runs", params={"id": f"eq.{run.id}"}, prefer="return=minimal",
                   json={"status": status, "finished_at": _now(), "decision": run.decision[:2000],
                         "evidence": run.evidence, "error": error})
    except StoreError:
        log.exception("could not close agent_runs row %s", run.id)


def fail_stale_runs(store: Store, older_than_minutes: int = 60) -> int:
    """A worker restart leaves its passes 'running' forever. Mark those older than the cutoff failed.
    Returns how many were closed."""
    cutoff = (datetime.now(UTC) - timedelta(minutes=older_than_minutes)).isoformat()
    rows = store._req("PATCH", "agent_runs", params={"status": "eq.running", "started_at": f"lt.{cutoff}"},
                      prefer="return=representation",
                      json={"status": "failed", "finished_at": _now(), "error": "worker restarted mid-run"}).json()
    return len(rows or [])


def last_runs(store: Store) -> dict[str, dict[str, Any]]:
    """Newest agent_runs row per agent (agents that never ran are absent). One query per agent, so the
    Guardian's frequent passes can't crowd the others out."""
    out: dict[str, dict[str, Any]] = {}
    for agent in sorted(AGENTS):
        rows = store._req("GET", "agent_runs", params={
            "select": "*", "agent": f"eq.{agent}", "order": "started_at.desc", "limit": "1",
        }).json()
        if rows:
            out[agent] = rows[0]
    return out


def outbound_halted(store: Store) -> bool:
    """True when the Guardian has stopped outbound. Fails closed: if the flag can't be read, don't send."""
    try:
        rows = store._req("GET", "system_flags", params={"key": f"eq.{HALT_KEY}", "select": "value"}).json()
    except StoreError:
        log.exception("could not read %s; treating outbound as halted", HALT_KEY)
        return True
    # Same rule as crm/src/lib/agents/halt.ts: only an explicit false lets mail out.
    return not (rows and rows[0]["value"] is False)


def set_halt(store: Store, by: str) -> None:
    """Halt outbound. There is deliberately no unhalt here: a person clears it in the CRM."""
    store._req("PATCH", "system_flags", params={"key": f"eq.{HALT_KEY}"}, prefer="return=minimal",
               json={"value": True, "updated_at": _now(), "updated_by": by})
