from conftest import TODAY, make_lead

from leadgen.config import FilterCfg
from leadgen.filters import post_crawl_reasons, pre_crawl_reasons, with_reasons
from leadgen.models import Enrichment

F = FilterCfg(max_review_count=1500, stale_years=2, blocklist=["Ferrari", "k1 speed"], excluded_categories=["Gas station"])


def test_clean_lead_passes() -> None:
    assert pre_crawl_reasons(make_lead(), F) == []


def test_pre_crawl_reasons() -> None:
    assert pre_crawl_reasons(make_lead(status="Permanently closed"), F) == ["permanently_closed"]
    assert pre_crawl_reasons(make_lead(name="Ferrari Track Days"), F) == ["blocklist:Ferrari"]
    assert pre_crawl_reasons(make_lead(website="https://www.k1speed.com"), F) == []  # substring is "k1 speed"
    assert pre_crawl_reasons(make_lead(review_count=2433), F) == ["chain_scale:2433_reviews"]
    assert pre_crawl_reasons(make_lead(category="Gas station"), F) == ["excluded_category:Gas station"]
    assert pre_crawl_reasons(make_lead(website="", phone=""), F) == ["no_contact_channel"]


def _with(lead, **enr):  # type: ignore[no-untyped-def]
    return lead.model_copy(update={"enrichment": Enrichment(**enr)})


def test_stale_site() -> None:
    stale = _with(make_lead(), ok=True, signals={"copyright_year": 2019, "recent_dates_count": 0})
    assert post_crawl_reasons(stale, F, TODAY) == ["stale_site:copyright_2019_no_recent_dates"]
    active = _with(make_lead(), ok=True, signals={"copyright_year": 2019, "recent_dates_count": 3})
    assert post_crawl_reasons(active, F, TODAY) == []
    current = _with(make_lead(), ok=True, signals={"copyright_year": 2025})
    assert post_crawl_reasons(current, F, TODAY) == []


def test_dead_site_only_without_phone() -> None:
    dead = _with(make_lead(phone=""), ok=False, error="http_404")
    assert post_crawl_reasons(dead, F, TODAY) == ["website_dead:http_404"]
    has_phone = _with(make_lead(), ok=False, error="http_404")
    assert post_crawl_reasons(has_phone, F, TODAY) == []
    robots = _with(make_lead(phone=""), ok=False, error="robots_disallowed")
    assert post_crawl_reasons(robots, F, TODAY) == []
    assert post_crawl_reasons(make_lead(), F, TODAY) == []


def test_with_reasons_merges_uniquely() -> None:
    lead = with_reasons(make_lead(), ["a"])
    lead = with_reasons(lead, ["a", "b"])
    assert lead.exclude_reasons == ("a", "b") and lead.excluded
    assert with_reasons(lead, []) is lead


def test_old_footer_on_live_store_is_not_stale() -> None:
    store = _with(make_lead(), ok=True, signals={"copyright_year": 2019, "ecommerce_tech": ["Shopify"]})
    assert post_crawl_reasons(store, F, TODAY) == []
