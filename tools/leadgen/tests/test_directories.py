from __future__ import annotations

import httpx
import respx

from leadgen.config import Config, DirectorySource
from leadgen.discover import directories
from leadgen.enrich.crawl import RobotsCache

HTML = """<ul><li class="team"><h3>Tortoise Racing</h3><a href="https://tortoise.com">site</a></li>
<li class="team"><h3>Hare Motorsports</h3><a href="/teams/hare">profile</a></li>
<li class="team"><h3></h3></li></ul>"""
SRC = DirectorySource(name="series", url="https://series.org/teams", item_selector="li.team",
                      name_selector="h3", state="FL", enabled=True)


def test_parse_listing() -> None:
    places = directories.parse_listing(HTML, SRC)
    assert [(p.name, p.website) for p in places] == [
        ("Tortoise Racing", "https://tortoise.com"), ("Hare Motorsports", "https://series.org/teams/hare")]
    assert places[0].source == "dir:series" and places[0].state == "FL"


@respx.mock
async def test_static_source_respects_robots(cfg: Config) -> None:
    respx.get("https://series.org/robots.txt").mock(return_value=httpx.Response(200, text="User-agent: *\nDisallow:\n"))
    respx.get("https://series.org/teams").mock(return_value=httpx.Response(200, text=HTML))
    respx.get("https://closed.org/robots.txt").mock(return_value=httpx.Response(200, text="User-agent: *\nDisallow: /\n"))
    respx.get("https://broken.org/robots.txt").mock(return_value=httpx.Response(404))
    respx.get("https://broken.org/teams").mock(return_value=httpx.Response(500))
    closed = SRC.model_copy(update={"name": "closed", "url": "https://closed.org/teams"})
    broken = SRC.model_copy(update={"name": "broken", "url": "https://broken.org/teams"})
    off = SRC.model_copy(update={"enabled": False})
    c = cfg.model_copy(update={"directories": [SRC, closed, broken, off]})
    async with httpx.AsyncClient() as client:
        places = await directories.discover(c, client, RobotsCache("TestBot"))
    assert len(places) == 2
