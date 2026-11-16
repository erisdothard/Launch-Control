"""ChampCar entry lists as a lead source for endurance teams, which Google Maps doesn't list.

champcar.org publishes a static entry list for every event, past and upcoming
(/web/register/entrantlist.php?eventid=N; robots.txt allows /web/). Each row is a team and a car.
A team that fields two or more cars at one event, or races often, is usually a business selling
seats (arrive & drive), which is the buyer the CRM is for. Those teams are kept.

Entry lists carry no website, so each kept team is looked up with Claude's web search tool,
which returns the team's own site and a public email when one exists. Lookups are cached per
team under out_dir so a rerun doesn't search again. Teams with no site found are dropped: the
pipeline can't read or email them.
"""

from __future__ import annotations

import asyncio
import html
import json
import logging
import re
from collections import Counter
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any
from urllib.parse import urlparse

import anthropic
import httpx
from selectolax.lexbor import LexborHTMLParser as HTMLParser

from leadgen.config import ChampCarCfg
from leadgen.enrich.crawl import RobotsCache
from leadgen.models import Place

log = logging.getLogger(__name__)

BASE = "https://champcar.org/web/register/entrantlist.php?eventid={}"
SEGMENT = "endurance_team"
MISSES = 10
SOCIAL = ("facebook.com", "instagram.com", "twitter.com", "x.com", "youtube.com", "tiktok.com",
          "linkedin.com", "champcar.org", "luckydogracing.com", "wikipedia.org")
STATE_RE = re.compile(r",\s*([A-Z]{2})\s*$")


@dataclass
class Event:
    event_id: int
    name: str
    track: str
    state: str
    entries: list[tuple[str, str]]  # (team, car number)


@dataclass
class Team:
    name: str
    events: set[int] = field(default_factory=set)
    max_cars: int = 0
    states: Counter[str] = field(default_factory=Counter)
    tracks: Counter[str] = field(default_factory=Counter)

    @property
    def state(self) -> str:
        return self.states.most_common(1)[0][0] if self.states else ""


def _clean(text: str) -> str:
    # Names arrive double-escaped ("2 Idiot&amp;#039;s"); unescape twice.
    return re.sub(r"\s+", " ", html.unescape(html.unescape(text))).strip()


def parse_event(page: str, event_id: int) -> Event | None:
    tree = HTMLParser(page)
    meta: dict[str, str] = {}
    for box in tree.css(".elist-meta-box"):
        label, value = box.css_first(".elist-meta-label"), box.css_first(".elist-meta-value")
        if label and value:
            meta[label.text(strip=True).lower()] = _clean(value.text())
    entries = []
    for row in tree.css("#entriesBody tr[data-team]"):
        team = _clean(row.attributes.get("data-team") or "")
        if team:
            entries.append((team, (row.attributes.get("data-number") or "").strip()))
    if not entries:
        return None
    track = meta.get("track", "")
    m = STATE_RE.search(track)
    return Event(event_id, meta.get("event", ""), track, m.group(1) if m else "", entries)


def team_key(name: str) -> str:
    """'Rosmar Racing' and 'ROSMAR RACING ' are one team; a trailing car tag ('... 2') is not stripped."""
    return re.sub(r"[^a-z0-9]+", " ", name.lower()).strip()


def aggregate(events: list[Event]) -> list[Team]:
    teams: dict[str, Team] = {}
    for ev in events:
        per_event = Counter(team_key(t) for t, _ in ev.entries)
        for name, _ in ev.entries:
            k = team_key(name)
            team = teams.setdefault(k, Team(name=name))
            team.events.add(ev.event_id)
            team.max_cars = max(team.max_cars, per_event[k])
        for k in per_event:
            if ev.state:
                teams[k].states[ev.state] += 1
            teams[k].tracks[ev.track] += 1
    return list(teams.values())


def pick(teams: list[Team], cfg: ChampCarCfg) -> list[Team]:
    """Seat-selling teams first: most cars at one event, then most events."""
    keep = [t for t in teams if t.max_cars >= cfg.min_cars or len(t.events) >= cfg.min_events]
    keep.sort(key=lambda t: (-t.max_cars, -len(t.events), t.name.lower()))
    return keep[: cfg.max_teams]


async def fetch_events(client: httpx.AsyncClient, robots: RobotsCache, cfg: ChampCarCfg,
                       delay_s: float = 1.0) -> list[Event]:
    if not await robots.allowed(client, BASE.format(cfg.first_event)):
        log.info("champcar: robots.txt disallows entry lists; skipped")
        return []
    # Past last_event, keep going while new events turn up; stop after MISSES empty ids in a row.
    events, eid, misses = [], cfg.first_event, 0
    while eid <= cfg.last_event or misses < MISSES:
        ev = None
        try:
            resp = await client.get(BASE.format(eid))
            resp.raise_for_status()
            ev = parse_event(resp.text, eid)
        except httpx.HTTPError as exc:
            log.warning("champcar event %d: fetch failed (%s)", eid, type(exc).__name__)
        if ev:
            events.append(ev)
        misses = 0 if ev else misses + 1
        eid += 1
        await asyncio.sleep(delay_s)
    log.info("champcar: %d events with entries", len(events))
    return events


# --- website lookup ------------------------------------------------------------------------------

LOOKUP_SYSTEM = (
    "You find the official website of an amateur endurance racing team. Search the web. Only accept a "
    "site that clearly belongs to this team (the team name appears on it and it is about racing). "
    "A Facebook or Instagram page is not a website. Reply with ONLY one JSON object: "
    '{"website": "<url or empty>", "email": "<public email on the site or empty>", '
    '"city": "<home city or empty>", "state": "<2-letter US state or empty>", '
    '"sells_seats": <true if the team rents seats / offers arrive and drive, else false>}'
)


@dataclass
class Found:
    website: str = ""
    email: str = ""
    city: str = ""
    state: str = ""
    sells_seats: bool = False


def parse_lookup(text: str) -> Found:
    m = re.search(r"\{.*\}", text, re.S)
    if not m:
        return Found()
    try:
        data: dict[str, Any] = json.loads(m.group(0))
    except json.JSONDecodeError:
        return Found()
    site = str(data.get("website") or "").strip()
    if site and not site.startswith("http"):
        site = "https://" + site
    host = (urlparse(site).hostname or "").lower().removeprefix("www.")
    if not host or any(host == s or host.endswith("." + s) for s in SOCIAL):
        site = ""
    email = str(data.get("email") or "").strip().lower()
    state = str(data.get("state") or "").strip().upper()
    return Found(site, email if "@" in email else "", str(data.get("city") or "").strip(),
                 state if len(state) == 2 else "", bool(data.get("sells_seats")))


class Lookup:
    def __init__(self, cfg: ChampCarCfg, cache_dir: Path, client: anthropic.AsyncAnthropic | None = None) -> None:
        self.cfg = cfg
        self.path = cache_dir / "champcar_sites.json"
        self.cache: dict[str, dict[str, Any]] = json.loads(self.path.read_text()) if self.path.is_file() else {}
        self.client = client or anthropic.AsyncAnthropic(max_retries=3, timeout=120.0)
        self.sem = asyncio.Semaphore(cfg.concurrency)

    def save(self) -> None:
        self.path.parent.mkdir(parents=True, exist_ok=True)
        self.path.write_text(json.dumps(self.cache, indent=1, sort_keys=True))

    async def find(self, team: Team) -> Found:
        k = team_key(team.name)
        if k in self.cache:
            return Found(**self.cache[k])
        where = ", ".join(t for t, _ in team.tracks.most_common(3))
        prompt = f'Team: "{team.name}". Races in the ChampCar Endurance Series, at: {where}.'
        async with self.sem:
            try:
                msg = await self.client.messages.create(
                    model=self.cfg.lookup_model, max_tokens=1500, system=LOOKUP_SYSTEM,
                    tools=[{"type": "web_search_20250305", "name": "web_search", "max_uses": 3}],
                    messages=[{"role": "user", "content": prompt}],
                )
            except anthropic.APIError as exc:
                log.warning("champcar lookup %s failed (%s)", team.name, type(exc).__name__)
                return Found()  # not cached: a later run retries
        text = "".join(getattr(b, "text", "") for b in msg.content if getattr(b, "type", "") == "text")
        found = parse_lookup(text)
        self.cache[k] = found.__dict__
        return found


def to_place(team: Team, found: Found) -> Place:
    note = f"ChampCar: {len(team.events)} events, up to {team.max_cars} cars at one event"
    return Place(
        name=team.name, website=found.website, city=found.city, state=found.state or team.state,
        category="Endurance racing team" + (" (sells seats)" if found.sells_seats else ""),
        emails=(found.email,) if found.email else (), query=note, segment_key=SEGMENT,
        source="dir:champcar",
    )


async def discover(cfg: ChampCarCfg, client: httpx.AsyncClient, robots: RobotsCache, cache_dir: Path,
                   lookup: Lookup | None = None) -> list[Place]:
    events = await fetch_events(client, robots, cfg)
    teams = pick(aggregate(events), cfg)
    log.info("champcar: %d teams worth a lookup", len(teams))
    lookup = lookup or Lookup(cfg, cache_dir)
    try:
        found = await asyncio.gather(*(lookup.find(t) for t in teams))
    finally:
        lookup.save()
    places = [to_place(t, f) for t, f in zip(teams, found, strict=True) if f.website]
    log.info("champcar: %d teams with a website", len(places))
    return places
