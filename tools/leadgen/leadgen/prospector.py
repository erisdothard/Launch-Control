"""Prospector: lead-quality gate after every lead-gen run, and the only agent that tunes discovery.

After each completed run it measures usable-rate (metrics.py, the one definition), works out which
Google Maps keywords produced the usable leads, and acts within fixed bounds:

- On target (>= USABLE_TARGET): log and stop.
- Most of the run landed on the call list: the crawler is the suspect, escalate (never "too small").
- Below target with a clearly dead keyword: pause that one keyword (system_flags override, see
  overrides.py). One change per pass, only with enough leads to judge, never a segment's last keyword,
  never a keyword a past run already rejected, at most MAX_PAUSED at once, and only when re-counting
  this run without that keyword's leads shows a gain.
- The first judged run after a change confirms it or, if usable-rate fell by more than the noise
  margin, rolls it back and marks the keyword rejected.
- Below target with no knob to turn: escalate. The decision says why. If the cause is a code problem
  (not form-only businesses, which is a sales decision) and no escalation is already pending, a
  workflow_dispatch (when GITHUB_DISPATCH_TOKEN is set) starts prospector-review.yml, which can only
  push a prospector/* branch and open a PR or an issue.

Never touches score weights, lead status, notes, or email. Every pass is one agent_runs row.
"""

from __future__ import annotations

import json
import logging
import os
import re
from collections import defaultdict
from dataclasses import dataclass
from typing import Any

import httpx

from leadgen import agent_log, metrics, overrides
from leadgen.config import PACKAGE_ROOT, Config, load_config
from leadgen.overrides import norm
from leadgen.store import Store

log = logging.getLogger(__name__)

AGENT = "prospector"
# Below this many judged leads (call list left out) a run is reported but never tuned on.
MIN_JUDGED_LEADS = 30
# A keyword needs this many judged leads before its yield means anything.
KEYWORD_MIN_LEADS = 8
# Pause a keyword only when its yield is below this AND below half the run's rate.
KEYWORD_PAUSE_BELOW = 0.15
# Run-to-run swing that counts as noise when confirming a change (different states/segments per run).
ROLLBACK_MARGIN = 0.05
MAX_PAUSED = 3
# More of the run than this on the call list means sites stopped being read, not a weak list.
CRAWLER_SUSPECT_SHARE = 0.6
WORKFLOW = "prospector-review.yml"
_PLACE_SUFFIX = re.compile(r"\s+(near|in)\s+.*$", re.I)


@dataclass(frozen=True)
class KeywordYield:
    keyword: str
    leads: int
    usable: int

    @property
    def rate(self) -> float:
        return self.usable / self.leads if self.leads else 0.0


def keyword_of(lead: dict[str, Any]) -> str:
    """'race prep shop near Sebring International Raceway' -> 'race prep shop'."""
    raw = str((lead.get("signals") or {}).get("discovered_by") or "")
    return norm(_PLACE_SUFFIX.sub("", raw.removeprefix("gmaps: ")))


def keyword_yields(leads: list[dict[str, Any]]) -> list[KeywordYield]:
    """Usable leads per keyword, over the same pool usable_rate uses (call list left out)."""
    tally: dict[str, list[int]] = defaultdict(lambda: [0, 0])
    for lead in leads:
        if metrics.call_list(lead):
            continue
        kw = keyword_of(lead)
        if kw:
            tally[kw][0] += 1
            tally[kw][1] += metrics.is_usable(lead)
    return sorted((KeywordYield(k, n, u) for k, (n, u) in tally.items()), key=lambda y: (y.rate, -y.leads))


def diagnose(leads: list[dict[str, Any]]) -> dict[str, int]:
    """Why the judged leads that aren't usable failed (a lead can fail on more than one count)."""
    pool = [x for x in leads if not metrics.call_list(x) and not metrics.is_usable(x)]
    return {
        "not_usable": len(pool),
        "site_not_read": sum(not metrics.site_read(x) for x in pool),
        "no_email": sum(not (x.get("email") or "").strip() for x in pool),
        "score_below_min": sum((x.get("score") or 0) < metrics.USABLE_MIN_SCORE for x in pool),
        # Good fits whose site takes only a form or a call: a phone lead, not a scraping failure.
        "form_only_with_phone": sum(
            not (x.get("email") or "").strip() and bool((x.get("phone") or "").strip())
            and (x.get("score") or 0) >= metrics.USABLE_MIN_SCORE for x in pool),
    }


def _segment_keywords(cfg: Config) -> dict[str, set[str]]:
    return {key: {norm(k) for k in seg.keywords} for key, seg in cfg.segments.items()}


def pick_pause(yields: list[KeywordYield], cfg: Config, run_rate: float,
               rejected: list[str] | None = None) -> KeywordYield | None:
    """The worst config keyword worth pausing, or None. Never a segment's last active keyword."""
    paused = {norm(k) for k in cfg.filters.paused_keywords}
    if len(paused) >= MAX_PAUSED:
        return None
    skip = paused | {norm(k) for k in rejected or []}
    by_segment = _segment_keywords(cfg)
    for y in yields:  # worst first
        if y.keyword in skip or y.leads < KEYWORD_MIN_LEADS:
            continue
        if y.rate >= KEYWORD_PAUSE_BELOW or y.rate >= run_rate / 2:
            return None  # sorted ascending: nothing after this is worse
        owners = [kws for kws in by_segment.values() if y.keyword in kws]
        if not owners:
            continue  # a seed list or directory label, not a query keyword we can pause
        if all(kws - paused - {y.keyword} for kws in owners):
            return y
    return None


def rate_without(leads: list[dict[str, Any]], keyword: str) -> float:
    return metrics.usable_rate([x for x in leads if keyword_of(x) != keyword])


def _recent(store: Store) -> list[dict[str, Any]]:
    return store._req("GET", "agent_runs", params={
        "select": "id,evidence", "agent": f"eq.{AGENT}", "status": "eq.done",
        "order": "started_at.desc", "limit": "20"}).json()


def last_change(rows: list[dict[str, Any]]) -> dict[str, Any] | None:
    """The change made by the previous judged pass, if it made one. Only the first judged run after a
    change gets to confirm or roll it back; later dips have other causes."""
    for r in rows:
        ev = r.get("evidence") or {}
        if (ev.get("judged") or 0) < MIN_JUDGED_LEADS:
            continue  # too small to have judged anything
        return {"run_row": r["id"], **ev["applied"]} if ev.get("applied") else None
    return None


def escalation_pending(rows: list[dict[str, Any]]) -> bool:
    """A review was dispatched and nothing has been on target since: don't start another one."""
    for r in rows:
        ev = r.get("evidence") or {}
        if ev.get("escalation") == "dispatched":
            return True
        if ev.get("usable_rate", 0) >= metrics.USABLE_TARGET:
            return False
    return False


def escalate(payload: dict[str, Any]) -> str:
    """Start the prospector-review workflow (workflow_dispatch: the token needs Actions write only)."""
    token = os.environ.get("GITHUB_DISPATCH_TOKEN", "").strip()
    repo = os.environ.get("GITHUB_REPO", "erisdothard/Launch-Control").strip()
    if not token:
        return "not dispatched: GITHUB_DISPATCH_TOKEN not set"
    try:
        resp = httpx.post(f"https://api.github.com/repos/{repo}/actions/workflows/{WORKFLOW}/dispatches",
                          timeout=15,
                          headers={"Authorization": f"Bearer {token}", "Accept": "application/vnd.github+json"},
                          json={"ref": "main", "inputs": {"payload": json.dumps(payload)}})
    except httpx.HTTPError as exc:
        return f"dispatch failed: {type(exc).__name__}"
    return "dispatched" if resp.status_code == 204 else f"dispatch failed: HTTP {resp.status_code}"


def _pct(x: float) -> str:
    return f"{round(x * 100)}%"


def _escalate_or_hold(ev: dict[str, Any], rows: list[dict[str, Any]], cause: str) -> str:
    if escalation_pending(rows):
        return "not dispatched: a review is already pending"
    # Aggregates only: the review workflow runs in a public repo with public logs.
    return escalate({**{k: ev[k] for k in (
        "run_id", "kept", "call_list", "judged", "usable", "usable_rate", "target", "keywords",
        "why_not_usable")}, "cause": cause})


def review(store: Store, run_id: str, cfg: Config) -> tuple[str, dict[str, Any]]:
    """The pass itself: (decision, evidence). Writes only to system_flags.prospector_overrides."""
    leads = metrics.prospects(store, run_id)
    judged = [x for x in leads if not metrics.call_list(x)]
    rate = round(metrics.usable_rate(leads), 3)
    current = overrides.load(store)
    cfg = overrides.apply(cfg, current)
    yields = keyword_yields(leads)
    rows = _recent(store)
    ev: dict[str, Any] = {
        "run_id": run_id,
        "kept": len(leads),
        "call_list": len(leads) - len(judged),
        "judged": len(judged),
        "usable": sum(metrics.is_usable(x) for x in judged),
        "usable_rate": rate,
        "target": metrics.USABLE_TARGET,
        "keywords": [{"keyword": y.keyword, "leads": y.leads, "usable": y.usable} for y in yields],
        "why_not_usable": diagnose(leads),
        "overrides_before": current.model_dump(),
    }
    if leads and ev["call_list"] / len(leads) > CRAWLER_SUSPECT_SHARE and len(leads) >= MIN_JUDGED_LEADS:
        ev["escalation"] = _escalate_or_hold(ev, rows, "crawler_suspect")
        return (f"{ev['call_list']} of {len(leads)} leads had no readable website: the crawler is the suspect, "
                f"not the list ({ev['escalation']})."), ev
    if len(judged) < MIN_JUDGED_LEADS:
        return f"Run too small to judge ({len(judged)} judged leads, {ev['call_list']} to call); no change.", ev

    change = last_change(rows)
    if change and rate < change.get("rate_before", 0) - ROLLBACK_MARGIN:
        kw = change["paused"]
        restored = current.model_copy(update={
            "paused_keywords": [k for k in current.paused_keywords if norm(k) != norm(kw)],
            "rejected_keywords": [*current.rejected_keywords, kw]})
        overrides.save(store, restored, by=AGENT)
        ev.update(rolled_back={"paused": kw, "rate_before": change["rate_before"], "rate_now": rate},
                  overrides_after=restored.model_dump())
        return (f"Rolled back pausing '{kw}': usable {_pct(rate)} is below the {_pct(change['rate_before'])} "
                "before that change. It won't be paused automatically again."), ev

    if rate >= metrics.USABLE_TARGET:
        return f"On target: {ev['usable']}/{len(judged)} usable ({_pct(rate)}), {ev['call_list']} to call.", ev

    pick = pick_pause(yields, cfg, rate, current.rejected_keywords)
    if pick and rate_without(leads, pick.keyword) > rate:
        after = current.model_copy(update={"paused_keywords": [*current.paused_keywords, pick.keyword]})
        overrides.save(store, after, by=AGENT)
        ev.update(applied={"paused": pick.keyword, "keyword_rate": round(pick.rate, 3), "rate_before": rate,
                           "rate_without": round(rate_without(leads, pick.keyword), 3)},
                  overrides_after=after.model_dump())
        return (f"Below target ({_pct(rate)}). Paused keyword '{pick.keyword}' "
                f"({pick.usable}/{pick.leads} usable); next run confirms or rolls it back."), ev

    why = ev["why_not_usable"]
    summary = (f"Not usable: {why['no_email']} no email, {why['score_below_min']} scored under "
               f"{metrics.USABLE_MIN_SCORE}, {why['site_not_read']} site not read; "
               f"{why['form_only_with_phone']} good fits are form-only with a phone (call them).")
    if why["not_usable"] and why["form_only_with_phone"] * 2 >= why["not_usable"]:
        ev["escalation"] = "not dispatched: mostly form-only businesses, a sales decision, not code"
        return f"Below target ({_pct(rate)}), mostly form-only businesses. {summary} Needs Eris/Max.", ev
    ev["escalation"] = _escalate_or_hold(ev, rows, "below_target")
    return f"Below target ({_pct(rate)}) and no keyword to pause. {summary} ({ev['escalation']}).", ev


def after_run(store: Store, run_id: str) -> None:
    """Called by the worker after each completed run. Logs one agent_runs row either way."""
    cfg = load_config(PACKAGE_ROOT / "config.yaml")
    with agent_log.agent_run(store, AGENT) as run:
        run.decision, run.evidence = review(store, run_id, cfg)
        log.info("prospector: %s", run.decision)
