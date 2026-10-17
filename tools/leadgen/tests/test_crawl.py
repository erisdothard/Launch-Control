from __future__ import annotations

import httpx
import respx
from conftest import fixture_html

from leadgen.enrich.crawl import Crawler, pick_links

UA = "LaunchControlLeadBot/1.0 (+test; t@example.org)"


def _crawler(max_pages: int = 6) -> Crawler:
    return Crawler(UA, max_pages=max_pages, delay=0.0, timeout=5, max_bytes=500_000)


def test_pick_links_filters_offsite_files_and_irrelevant() -> None:
    links = pick_links("https://www.apexendurance.com/", fixture_html("shop_home.html"), "apexendurance.com", 10)
    paths = [link.split(".com")[1] for link in links]
    assert paths == ["/about-us", "/contact", "/rentals", "/schedule"]  # contact/about first
    assert len(pick_links("https://www.apexendurance.com/", fixture_html("shop_home.html"), "apexendurance.com", 2)) == 2


@respx.mock
async def test_crawl_follows_relevant_pages_and_obeys_robots() -> None:
    base = "https://www.apexendurance.com"
    respx.get(f"{base}/robots.txt").mock(return_value=httpx.Response(200, text="User-agent: *\nDisallow: /schedule\n"))
    html = {"content-type": "text/html; charset=utf-8"}
    respx.get(f"{base}/").mock(return_value=httpx.Response(200, text=fixture_html("shop_home.html"), headers=html))
    respx.get(f"{base}/about-us").mock(return_value=httpx.Response(200, text=fixture_html("shop_about.html"), headers=html))
    respx.get(f"{base}/rentals").mock(return_value=httpx.Response(404, headers=html))
    sched = respx.get(f"{base}/schedule").mock(return_value=httpx.Response(200, text="x", headers=html))
    respx.get(f"{base}/contact").mock(return_value=httpx.Response(200, text=fixture_html("shop_contact.html"), headers=html))
    c = _crawler()
    try:
        res = await c.crawl(f"{base}/")
    finally:
        await c.aclose()
    assert res.error is None
    assert [p.url.split(".com")[1] for p in res.pages] == ["/", "/about-us", "/contact"]
    assert not sched.called
    assert respx.calls[0].request.headers["user-agent"] == UA


@respx.mock
async def test_crawl_errors() -> None:
    respx.get("https://blocked.com/robots.txt").mock(return_value=httpx.Response(200, text="User-agent: *\nDisallow: /\n"))
    respx.get("https://forbidden.com/robots.txt").mock(return_value=httpx.Response(404))
    respx.get("https://forbidden.com/").mock(return_value=httpx.Response(403))
    respx.get("https://cf.com/robots.txt").mock(return_value=httpx.Response(404))
    respx.get("https://cf.com/").mock(return_value=httpx.Response(
        200, text="<title>Just a moment...</title><script src='/cdn-cgi/challenge-platform/x'></script>",
        headers={"content-type": "text/html"}))
    respx.get("https://pdf.com/robots.txt").mock(return_value=httpx.Response(500))
    respx.get("https://img.com/robots.txt").mock(return_value=httpx.Response(404))
    respx.get("https://img.com/").mock(return_value=httpx.Response(200, content=b"x", headers={"content-type": "image/png"}))
    respx.get("https://down.com/robots.txt").mock(side_effect=httpx.ConnectError("x"))
    respx.get("https://down.com/").mock(side_effect=httpx.ConnectError("x"))
    respx.get("http://down.com/").mock(side_effect=httpx.ConnectTimeout("x"))
    respx.get("http://down.com/robots.txt").mock(side_effect=httpx.ConnectError("x"))
    c = _crawler()
    try:
        assert (await c.crawl("https://blocked.com/")).error == "robots_disallowed"
        assert (await c.crawl("forbidden.com")).error == "blocked_403"
        assert (await c.crawl("https://cf.com/")).error == "challenge_page"
        assert (await c.crawl("https://pdf.com/")).error == "robots_disallowed"  # 5xx robots = disallow
        assert (await c.crawl("https://img.com/")).error == "not_html"
        assert (await c.crawl("https://down.com/")).error == "timeout"  # https failed, http fallback timed out
    finally:
        await c.aclose()


def test_pick_links_dedupes_scheme_and_slash_variants() -> None:
    html = '<a href="/contact/">Contact</a><a href="http://www.a.com/contact">Contact</a><a href="/about">About</a>'
    assert len(pick_links("https://a.com/", html, "a.com", 10)) == 2


@respx.mock
async def test_crawl_tries_contact_paths_when_menu_hides_them() -> None:
    base = "https://jsmenu.com"
    html = {"content-type": "text/html"}
    respx.get(f"{base}/robots.txt").mock(return_value=httpx.Response(404))
    respx.get(f"{base}/").mock(return_value=httpx.Response(
        200, text='<a href="/events">Events</a><a href="/schedule">Schedule</a><a href="/rates">Rates</a>', headers=html))
    for path in ("/events", "/schedule", "/rates", "/contact-us", "/about"):
        respx.get(f"{base}{path}").mock(return_value=httpx.Response(200, text="<p>x</p>", headers=html))
    respx.get(f"{base}/contact").mock(return_value=httpx.Response(404, headers=html))
    c = _crawler(max_pages=5)
    try:
        res = await c.crawl(f"{base}/")
    finally:
        await c.aclose()
    # 4-page budget after home: one menu link kept, then the three contact guesses (/contact 404s).
    assert [p.url.removeprefix(base) for p in res.pages] == ["/", "/events", "/contact-us", "/about"]
