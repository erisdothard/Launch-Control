"""Pluggable public-directory discovery (team / vendor / member listings).

A source is a static HTML page listing businesses. `StaticListSource` pulls items with
CSS selectors from config.yaml `directories:` entries. Rules:

- static pages only (no JS rendering, no logins, no pagination tricks)
- robots.txt must allow the page for our User-Agent, else the source is skipped
- disabled by default; enable one entry at a time after checking the page by hand

Checked 2026-10-15: luckydogracing.com and worldracingleague.com robots.txt allow all, but
their team/vendor listings were not verified as static. nasaproracing.com sits behind a
Cloudflare challenge, so it is off-limits (we never solve challenges). No source ships
enabled; add one under `directories:` once its page is confirmed static.
"""

from __future__ import annotations

import logging
from typing import Protocol
from urllib.parse import urljoin

import httpx
from selectolax.lexbor import LexborHTMLParser as HTMLParser

from leadgen.config import Config, DirectorySource
from leadgen.enrich.crawl import RobotsCache
from leadgen.models import Place

log = logging.getLogger(__name__)


class Source(Protocol):
    name: str

    async def fetch(self, client: httpx.AsyncClient, robots: RobotsCache) -> list[Place]: ...


def parse_listing(html: str, src: DirectorySource) -> list[Place]:
    tree = HTMLParser(html)
    places: list[Place] = []
    for item in tree.css(src.item_selector):
        name_node = item.css_first(src.name_selector) if src.name_selector else item
        name = (name_node.text(strip=True) if name_node else "").strip()
        link = item.css_first(src.link_selector)
        href = (link.attributes.get("href") or "").strip() if link else ""
        website = urljoin(src.url, href) if href.startswith(("http", "/")) else ""
        if name:
            places.append(Place(name=name, website=website, state=src.state, source=f"dir:{src.name}"))
    return places


class StaticListSource:
    def __init__(self, src: DirectorySource) -> None:
        self.src = src
        self.name = src.name

    async def fetch(self, client: httpx.AsyncClient, robots: RobotsCache) -> list[Place]:
        if not await robots.allowed(client, self.src.url):
            log.info("directory %s: robots.txt disallows %s; skipped", self.name, self.src.url)
            return []
        try:
            resp = await client.get(self.src.url)
            resp.raise_for_status()
        except httpx.HTTPError as exc:
            log.warning("directory %s: fetch failed (%s)", self.name, type(exc).__name__)
            return []
        places = parse_listing(resp.text, self.src)
        log.info("directory %s: %d entries", self.name, len(places))
        return places


async def discover(cfg: Config, client: httpx.AsyncClient, robots: RobotsCache) -> list[Place]:
    out: list[Place] = []
    for src in cfg.directories:
        if src.enabled:
            out.extend(await StaticListSource(src).fetch(client, robots))
    return out
