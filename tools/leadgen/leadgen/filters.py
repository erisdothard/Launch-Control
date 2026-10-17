"""Rule-based exclusions. Every exclusion carries a machine-readable reason."""

from __future__ import annotations

from datetime import date

from leadgen.config import FilterCfg
from leadgen.models import Lead

CLOSED_MARKERS = ("permanently closed", "closed permanently")
# Crawl errors that mean "the site is gone", not "the site asked us to stay out".
DEAD_SITE_ERRORS = ("http_404", "http_410", "http_5", "unreachable")


def pre_crawl_reasons(lead: Lead, cfg: FilterCfg) -> list[str]:
    """Cheap checks on discovery data, run before spending a crawl on the lead."""
    p = lead.place
    reasons: list[str] = []
    if any(m in p.status.lower() for m in CLOSED_MARKERS):
        reasons.append("permanently_closed")
    haystack = f"{p.name} {lead.domain or ''}".lower()
    for term in cfg.blocklist:
        if term.lower() in haystack:
            reasons.append(f"blocklist:{term}")
            break
    if p.review_count is not None and p.review_count > cfg.max_review_count:
        reasons.append(f"chain_scale:{p.review_count}_reviews")
    excluded = {c.lower() for c in cfg.excluded_categories}
    if p.category and p.category.lower() in excluded:
        reasons.append(f"excluded_category:{p.category}")
    if not lead.domain and not lead.phone_e164 and not p.website:
        reasons.append("no_contact_channel")
    return reasons


def post_crawl_reasons(lead: Lead, cfg: FilterCfg, today: date) -> list[str]:
    """Staleness / dead-site checks that need the crawl."""
    e = lead.enrichment
    if e is None:
        return []
    reasons: list[str] = []
    if not e.ok:
        if e.error and e.error.startswith(DEAD_SITE_ERRORS) and not lead.phone_e164:
            reasons.append(f"website_dead:{e.error}")
        return reasons
    year = e.signals.get("copyright_year")
    recent = e.signals.get("recent_dates_count", 0)
    # Live stores/booking widgets often keep an old footer year; they are not abandoned.
    live_tech = e.signals.get("ecommerce_tech") or e.signals.get("booking_tech")
    if isinstance(year, int) and year < today.year - cfg.stale_years and not recent and not live_tech:
        reasons.append(f"stale_site:copyright_{year}_no_recent_dates")
    return reasons


CONTACT_FIELDS = ("email", "phone")


def contact_reasons(lead: Lead, require: list[str] | None) -> list[str]:
    """Contact details the run was told to insist on (the CRM's "Must have" choice). Uses the same
    email/phone that lead_row writes, so a kept lead always shows them in the CRM."""
    if not require:
        return []
    e = lead.enrichment
    has = {
        "email": bool((e.email if e else "") or lead.place.emails),
        "phone": bool(lead.place.phone),
    }
    return [f"missing_{field}" for field in require if field in has and not has[field]]


def with_reasons(lead: Lead, reasons: list[str]) -> Lead:
    if not reasons:
        return lead
    merged = tuple(dict.fromkeys([*lead.exclude_reasons, *reasons]))
    return lead.model_copy(update={"exclude_reasons": merged})
