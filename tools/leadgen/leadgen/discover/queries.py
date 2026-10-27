"""Build the Google Maps query matrix: segment keywords x places, budgeted by state weight."""

from __future__ import annotations

import hashlib
import math
from dataclasses import dataclass
from itertools import zip_longest

from leadgen.config import Config
from leadgen.overrides import norm


@dataclass(frozen=True)
class Query:
    text: str
    segment_key: str
    state: str
    place: str  # track or metro name

    @property
    def qid(self) -> str:
        """Stable id: used as gosom input_id and as the cache file name."""
        return hashlib.sha1(self.text.lower().encode()).hexdigest()[:16]


def _state_queries(cfg: Config, state: str, segment_keys: list[str]) -> list[Query]:
    """All queries for one state, interleaved so any prefix covers many segments and places."""
    places: list[tuple[str, str]] = [(t.name, f"near {t.name}") for t in cfg.tracks if t.state == state]
    places += [(m, f"in {m}, {state}") for m in cfg.states[state].metros]
    paused = {norm(k) for k in cfg.filters.paused_keywords}
    per_segment: list[list[Query]] = []
    for key in segment_keys:
        seg = cfg.segments[key]
        rows = [
            Query(text=f"{kw} {suffix}", segment_key=key, state=state, place=name)
            for kw in seg.keywords
            if norm(kw) not in paused
            for name, suffix in places
        ]
        if rows:
            per_segment.append(rows)
    # Round-robin across segments.
    return [q for group in zip_longest(*per_segment) for q in group if q is not None]


def build_queries(
    cfg: Config,
    states: list[str] | None = None,
    segments: list[str] | None = None,
    max_queries: int | None = None,
) -> list[Query]:
    """Weighted query plan. Each state's share of the budget is proportional to its weight."""
    state_list = [s for s in cfg.states if not states or s in states]
    unknown_states = set(states or []) - set(cfg.states)
    if unknown_states:
        raise ValueError(f"unknown states (not in config): {sorted(unknown_states)}")
    seg_keys = [k for k in cfg.segments if not segments or k in segments]
    unknown_segs = set(segments or []) - set(cfg.segments)
    if unknown_segs:
        raise ValueError(f"unknown segments (use config keys): {sorted(unknown_segs)}")

    budget = max_queries if max_queries is not None else cfg.max_queries
    pools = {s: _state_queries(cfg, s, seg_keys) for s in state_list}
    pools = {s: q for s, q in pools.items() if q}
    if not pools or budget <= 0:
        return []

    total_w = sum(cfg.states[s].weight for s in pools)
    shares = {s: max(1, math.floor(budget * cfg.states[s].weight / total_w)) for s in pools}
    chosen: dict[str, list[Query]] = {s: pools[s][: shares[s]] for s in pools}

    # Hand any leftover budget (rounding, or states that ran dry) to the heaviest states.
    used = sum(len(v) for v in chosen.values())
    by_weight = sorted(pools, key=lambda s: -cfg.states[s].weight)
    while used < budget:
        progressed = False
        for s in by_weight:
            if used >= budget:
                break
            if len(chosen[s]) < len(pools[s]):
                chosen[s] = pools[s][: len(chosen[s]) + 1]
                used += 1
                progressed = True
        if not progressed:
            break

    ordered = [q for s in by_weight for q in chosen[s]]
    unique: dict[str, Query] = {}
    for q in ordered:
        unique.setdefault(q.qid, q)
    return list(unique.values())[:budget]
