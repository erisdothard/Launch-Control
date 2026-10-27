"""Config knobs the Prospector changed at runtime, kept in system_flags.prospector_overrides.

The Railway worker's disk is rebuilt on every deploy, so a fix written to config.yaml there would
vanish. Overrides live in the database instead and are layered over config.yaml at the start of each
run. Only allowlisted filter knobs can be overridden; score weights never can (Strategist proposes,
Eris applies). Clearing the row restores config.yaml exactly.
"""

from __future__ import annotations

import logging
from datetime import UTC, datetime

from pydantic import BaseModel, Field, ValidationError

from leadgen.config import Config
from leadgen.store import Store, StoreError

log = logging.getLogger(__name__)

OVERRIDES_KEY = "prospector_overrides"


def norm(keyword: str) -> str:
    """One spelling for comparing keywords: lowercase, single spaces."""
    return " ".join(keyword.lower().split())


class Overrides(BaseModel):
    """The allowlist. Anything not named here cannot be changed by an agent."""

    paused_keywords: list[str] = Field(default_factory=list)
    # Pauses the next run didn't confirm; never paused again automatically (stops pause/rollback loops).
    rejected_keywords: list[str] = Field(default_factory=list)


def load(store: Store) -> Overrides:
    """Current overrides; empty when the row is missing or unreadable (config.yaml then rules)."""
    try:
        rows = store._req("GET", "system_flags", params={"key": f"eq.{OVERRIDES_KEY}", "select": "value"}).json()
    except StoreError:
        log.exception("could not read %s; running on config.yaml alone", OVERRIDES_KEY)
        return Overrides()
    if not rows or not isinstance(rows[0].get("value"), dict):
        return Overrides()
    try:
        return Overrides.model_validate(rows[0]["value"])
    except ValidationError:
        log.warning("ignoring malformed %s row", OVERRIDES_KEY)
        return Overrides()


def save(store: Store, overrides: Overrides, by: str) -> None:
    store._req("POST", "system_flags", params={"on_conflict": "key"},
               prefer="return=minimal,resolution=merge-duplicates",
               json={"key": OVERRIDES_KEY, "value": overrides.model_dump(),
                     "updated_at": datetime.now(UTC).isoformat(), "updated_by": by})


def apply(cfg: Config, overrides: Overrides) -> Config:
    """config.yaml with the overrides layered on top. Paused keywords add to the file's own list."""
    paused = list(dict.fromkeys(norm(k) for k in [*cfg.filters.paused_keywords, *overrides.paused_keywords]))
    filters = cfg.filters.model_copy(update={"paused_keywords": paused})
    return cfg.model_copy(update={"filters": filters})
