from __future__ import annotations

from datetime import date
from pathlib import Path

import pytest

from leadgen.config import Config, load_config
from leadgen.enrich.crawl import CrawlResult, Page
from leadgen.models import Lead, Place

ROOT = Path(__file__).resolve().parent.parent
FIXTURES = Path(__file__).resolve().parent / "fixtures"
TODAY = date(2026, 10, 15)


@pytest.fixture
def cfg(tmp_path: Path) -> Config:
    c = load_config(ROOT / "config.yaml")
    return c.model_copy(update={"out_dir": str(tmp_path / "out")})


def fixture_html(name: str) -> str:
    return (FIXTURES / name).read_text(encoding="utf-8")


@pytest.fixture
def shop_crawl() -> CrawlResult:
    pages = (
        Page("https://www.apexendurance.com/", 200, fixture_html("shop_home.html")),
        Page("https://www.apexendurance.com/about-us", 200, fixture_html("shop_about.html")),
        Page("https://www.apexendurance.com/contact", 200, fixture_html("shop_contact.html")),
    )
    return CrawlResult(start_url="https://www.apexendurance.com/", pages=pages)


def make_place(**kw: object) -> Place:
    base: dict[str, object] = {
        "name": "Apex Endurance Racing",
        "phone": "(352) 555-0142",
        "website": "https://www.apexendurance.com/",
        "address": "1 Track Rd, Sebring, FL 33870",
        "city": "Sebring",
        "state": "FL",
        "category": "Racecourse",
        "review_count": 40,
        "rating": 4.8,
        "maps_url": "https://maps.google.com/?cid=1",
        "query": "race prep shop near Sebring International Raceway",
        "segment_key": "race_prep",
    }
    base.update(kw)
    return Place(**base)  # type: ignore[arg-type]


def make_lead(**kw: object) -> Lead:
    from leadgen.dedupe import to_lead

    return to_lead(make_place(**kw))
