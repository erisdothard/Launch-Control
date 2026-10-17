"""Polite crawler: honest User-Agent, robots.txt, <=1 req/s per host, <=N pages per site.

Never retries around a block: 401/403/429, a robots disallow or a challenge page ends
the crawl for that site.
"""

from __future__ import annotations

import asyncio
import logging
import re
import time
from dataclasses import dataclass, field
from urllib.parse import urldefrag, urljoin, urlsplit
from urllib.robotparser import RobotFileParser

import httpx
from selectolax.lexbor import LexborHTMLParser as HTMLParser

from leadgen.dedupe import normalize_domain

log = logging.getLogger(__name__)

LINK_KEYWORDS = re.compile(
    r"contact|about|team|staff|people|leadership|event|schedule|calendar|pricing|price|rates|"
    r"rental|program|arrive|book|services|coaching|school",
    re.I,
)
# Tried when the home page links to no contact page (menus built by JavaScript hide them from us).
FALLBACK_CONTACT_PATHS = ("/contact", "/contact-us", "/about")
_CONTACTISH = re.compile(r"contact|about", re.I)
_SKIP_EXT = re.compile(r"\.(pdf|jpe?g|png|gif|webp|svg|zip|mp4|mov|docx?|xlsx?)(\?|$)", re.I)
_CHALLENGE = re.compile(r"cf-chl|challenge-platform|Just a moment\.\.\.|captcha", re.I)


@dataclass(frozen=True)
class Page:
    url: str
    status: int
    html: str


@dataclass(frozen=True)
class CrawlResult:
    start_url: str
    pages: tuple[Page, ...] = ()
    error: str | None = None


@dataclass
class HostThrottle:
    """At most one request per `delay` seconds per host."""

    delay: float
    _locks: dict[str, asyncio.Lock] = field(default_factory=dict)
    _last: dict[str, float] = field(default_factory=dict)

    async def wait(self, host: str) -> None:
        lock = self._locks.setdefault(host, asyncio.Lock())
        async with lock:
            gap = self.delay - (time.monotonic() - self._last.get(host, 0.0))
            if gap > 0:
                await asyncio.sleep(gap)
            self._last[host] = time.monotonic()


class RobotsCache:
    def __init__(self, user_agent: str, throttle: HostThrottle | None = None) -> None:
        self.user_agent = user_agent
        self.throttle = throttle
        self._parsers: dict[str, RobotFileParser] = {}

    async def _load(self, client: httpx.AsyncClient, origin: str) -> RobotFileParser:
        rp = RobotFileParser()
        try:
            if self.throttle:
                await self.throttle.wait(urlsplit(origin).netloc)
            resp = await client.get(f"{origin}/robots.txt")
        except httpx.HTTPError:
            rp.parse([])  # unreachable robots.txt: the site fetch itself will fail or succeed
            return rp
        if resp.status_code in (401, 403):
            rp.disallow_all = True
        elif resp.status_code >= 500:
            rp.disallow_all = True  # RFC 9309: treat server errors as "complete disallow"
        elif resp.status_code >= 400 or "html" in resp.headers.get("content-type", ""):
            rp.parse([])  # no robots.txt (or an HTML soft-404): allowed
        else:
            rp.parse(resp.text.splitlines())
        return rp

    async def allowed(self, client: httpx.AsyncClient, url: str) -> bool:
        parts = urlsplit(url)
        origin = f"{parts.scheme}://{parts.netloc}"
        if origin not in self._parsers:
            self._parsers[origin] = await self._load(client, origin)
        return self._parsers[origin].can_fetch(self.user_agent, url)


def _page_key(url: str) -> str:
    """Same page regardless of scheme, www. or trailing slash."""
    p = urlsplit(urldefrag(url)[0])
    return f"{p.netloc.lower().removeprefix('www.')}{p.path.rstrip('/')}?{p.query}"


def pick_links(base_url: str, html: str, site_domain: str | None, limit: int) -> list[str]:
    """Same-site links whose text or href looks like contact/about/events/pricing/etc."""
    tree = HTMLParser(html)
    picked: list[tuple[str, str]] = []
    seen = {_page_key(base_url)}
    for a in tree.css("a[href]"):
        href = (a.attributes.get("href") or "").strip()
        if not href or href.startswith(("mailto:", "tel:", "javascript:", "#")) or _SKIP_EXT.search(href):
            continue
        url = urldefrag(urljoin(base_url, href))[0]
        if not url.startswith("http") or normalize_domain(url) != site_domain:
            continue
        key = _page_key(url)
        if key in seen:
            continue
        text = a.text(strip=True)
        if LINK_KEYWORDS.search(text) or LINK_KEYWORDS.search(urlsplit(url).path):
            seen.add(key)
            picked.append((text, url))
    # Contact/about pages first: they hold the email, phone and names, and the page budget is small.
    picked.sort(key=lambda tu: not (_CONTACTISH.search(tu[0]) or _CONTACTISH.search(urlsplit(tu[1]).path)))
    return [url for _, url in picked[:limit]]


class Crawler:
    def __init__(self, user_agent: str, max_pages: int, delay: float, timeout: float, max_bytes: int) -> None:
        self.max_pages = max_pages
        self.max_bytes = max_bytes
        self.throttle = HostThrottle(delay)
        self.robots = RobotsCache(user_agent, self.throttle)
        self.client = httpx.AsyncClient(
            headers={"User-Agent": user_agent, "Accept": "text/html,application/xhtml+xml"},
            timeout=httpx.Timeout(timeout),
            follow_redirects=True,
            max_redirects=5,
        )

    async def aclose(self) -> None:
        await self.client.aclose()

    async def _get(self, url: str) -> Page | str:
        """A Page, or an error code string."""
        if not await self.robots.allowed(self.client, url):
            return "robots_disallowed"
        await self.throttle.wait(urlsplit(url).netloc)
        try:
            async with self.client.stream("GET", url) as resp:
                ctype = resp.headers.get("content-type", "")
                if resp.status_code in (401, 403, 429):
                    return f"blocked_{resp.status_code}"
                if resp.status_code >= 400:
                    return f"http_{resp.status_code}"
                if "html" not in ctype and "xml" not in ctype:
                    return "not_html"
                body = bytearray()
                async for chunk in resp.aiter_bytes():
                    body.extend(chunk)
                    if len(body) > self.max_bytes:
                        break
                html = body.decode(resp.encoding or "utf-8", errors="replace")
                if _CHALLENGE.search(html[:5000]) and len(html) < 20_000:
                    return "challenge_page"
                return Page(url=str(resp.url), status=resp.status_code, html=html)
        except httpx.TimeoutException:
            return "timeout"
        except httpx.HTTPError as exc:
            return f"unreachable:{type(exc).__name__}"

    async def crawl(self, start_url: str) -> CrawlResult:
        url = start_url if start_url.startswith("http") else f"https://{start_url}"
        first = await self._get(url)
        if isinstance(first, str) and url.startswith("https://") and first.startswith(("unreachable", "timeout")):
            first = await self._get("http://" + url[len("https://") :])
        if isinstance(first, str):
            return CrawlResult(start_url=url, error=first)
        pages = [first]
        site_domain = normalize_domain(first.url)
        links = pick_links(first.url, first.html, site_domain, self.max_pages - 1)
        if not any(_CONTACTISH.search(urlsplit(u).path) for u in links):
            seen = {_page_key(first.url), *(_page_key(u) for u in links)}
            extra = [u for u in (urljoin(first.url, p) for p in FALLBACK_CONTACT_PATHS) if _page_key(u) not in seen]
            budget = self.max_pages - 1
            links = links[: max(0, budget - len(extra))] + extra[:budget]
        for link in links:
            got = await self._get(link)
            if isinstance(got, Page):
                pages.append(got)
            elif got.startswith(("blocked", "challenge")):
                break  # the site pushed back; stop here
        return CrawlResult(start_url=url, pages=tuple(pages))
