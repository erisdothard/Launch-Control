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


def test_contact_requirements_drop_leads_missing_them() -> None:
    from leadgen.filters import contact_reasons

    no_contact = make_lead(phone="")
    assert contact_reasons(no_contact, ["email", "phone"]) == ["missing_email", "missing_phone"]
    with_email = make_lead().model_copy(update={"enrichment": Enrichment(ok=True, email="max@apex.com")})
    assert contact_reasons(with_email, ["email", "phone"]) == []
    assert contact_reasons(no_contact, None) == []


def _scored(lead, **ratings):  # type: ignore[no-untyped-def]
    from leadgen.config import FACTOR_KEYS
    from leadgen.models import FactorRating, ScoreResult

    breakdown = {k: FactorRating(rating=ratings.get(k, 3), evidence="") for k in FACTOR_KEYS}
    return lead.model_copy(update={"score": ScoreResult(score=60, breakdown=breakdown, segment="Other")})


def test_blind_leads_go_to_the_call_list_only_with_a_phone() -> None:
    from leadgen.filters import call_list_reasons, is_blind

    read = _with(make_lead(), ok=True, pages=("https://www.apexendurance.com/",))
    assert not is_blind(read) and call_list_reasons(read) == []
    unreadable = _with(make_lead(), ok=False, error="robots_disallowed")
    assert is_blind(unreadable) and call_list_reasons(unreadable) == []
    no_site = make_lead(website="")
    assert is_blind(no_site)
    silent = _with(make_lead(phone=""), ok=False, error="blocked_403")
    assert call_list_reasons(silent) == ["no_readable_site_no_phone"]


def test_factor_floors_exclude_dealbreakers() -> None:
    from leadgen.filters import factor_reasons

    cfg = F.model_copy(update={"factor_floors": {"booking_need": 1, "niche_fit": 1}})
    store = _scored(make_lead(), booking_need=1)
    assert factor_reasons(store, cfg) == ["factor:booking_need<=1"]
    assert factor_reasons(_scored(make_lead(), booking_need=2, niche_fit=2), cfg) == []
    assert factor_reasons(make_lead(), cfg) == []  # unscored


def test_factor_floors_reject_unknown_factors() -> None:
    import pytest

    from leadgen.config import FilterCfg

    with pytest.raises(ValueError):
        FilterCfg(factor_floors={"vibes": 1})
    with pytest.raises(ValueError):
        FilterCfg(factor_floors={"niche_fit": 5})


def test_out_of_state_only_dropped_when_asked() -> None:
    from leadgen.filters import out_of_state_reasons

    ga = make_lead(state="GA")
    assert out_of_state_reasons(ga, ["FL"], F) == []  # default keep
    drop = F.model_copy(update={"out_of_state": "drop"})
    assert out_of_state_reasons(ga, ["FL"], drop) == ["out_of_state:GA"]
    assert out_of_state_reasons(ga, None, drop) == []
    assert out_of_state_reasons(make_lead(state="FL"), ["FL"], drop) == []
