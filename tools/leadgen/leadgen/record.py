"""Flatten a Lead into the `leads` row shape shared by Supabase and the CSV export."""

from __future__ import annotations

from typing import Any

from leadgen.config import Config
from leadgen.enrich.people import FIRST_NAMES
from leadgen.models import Lead


def email_first_name(lead: Lead) -> str | None:
    """'james@jzillatrackdays.com' -> 'James' when no named decision-maker was found."""
    e = lead.enrichment
    if not e or e.email_kind != "personal":
        return None
    local = e.email.split("@", 1)[0].lower()
    return local.title() if local in FIRST_NAMES else None


def segment_label(lead: Lead, cfg: Config) -> str:
    if lead.score:
        return lead.score.segment
    seg = cfg.segments.get(lead.place.segment_key)
    return seg.label if seg else "Other"


def signals_for(lead: Lead) -> dict[str, Any]:
    """Contract keys first (CRM reads these), then everything else the crawl found."""
    p = lead.place
    s = dict(lead.enrichment.signals) if lead.enrichment else {}
    base: dict[str, Any] = {
        "booking_tech": s.pop("booking_tech", []),
        "crm_tech": s.pop("crm_tech", []),
        "site_builder": s.pop("site_builder", None),
        "phrases": s.pop("phrases", []),
        "emails": s.pop("emails", list(p.emails)),
        "socials": s.pop("socials", {}),
        "copyright_year": s.pop("copyright_year", None),
        "latest_event_date": s.pop("latest_event_date", None),
        "review_count": p.review_count,
        "rating": p.rating,
        "maps_url": p.maps_url or None,
        "excluded_reason": "; ".join(lead.exclude_reasons) or None,
        "google_category": p.category or None,
        "discovered_by": p.query or p.source,
    }
    if not lead.contact and email_first_name(lead):
        base["contact_source"] = "first name from email address"
    if lead.enrichment and lead.enrichment.error:
        base["crawl_error"] = lead.enrichment.error
    return {**base, **{k: v for k, v in s.items() if k not in base}}


def lead_row(lead: Lead, cfg: Config) -> dict[str, Any]:
    p = lead.place
    sc = lead.score
    contact = lead.contact
    e = lead.enrichment
    first = None if contact else email_first_name(lead)
    return {
        "business_name": p.name,
        "email": (e.email if e else "") or (p.emails[0].lower() if p.emails else ""),
        "phone": p.phone,
        "segment": segment_label(lead, cfg),
        "city": p.city or None,
        "state": p.state or None,
        "website": (e.final_url if e and e.final_url else p.website) or None,
        "domain": lead.domain,
        "contact_name": contact.name if contact else first,
        "contact_title": contact.title if contact else None,
        "score": sc.score if sc else None,
        "score_breakdown": {k: v.model_dump() for k, v in sc.breakdown.items()} if sc else None,
        "score_reason": sc.reason if sc else None,
        "outreach_hook": sc.outreach_hook if sc else None,
        "signals": signals_for(lead),
        "scored_at": sc.scored_at if sc else None,
    }


def top_signals(row: dict[str, Any]) -> str:
    """Short human summary for the CSV."""
    s = row.get("signals") or {}
    parts = [
        f"booking: {', '.join(s.get('booking_tech') or []) or 'none'}",
        f"crm: {', '.join(s.get('crm_tech') or []) or 'none'}",
    ]
    if s.get("site_builder"):
        parts.append(f"builder: {s['site_builder']}")
    if s.get("phrases"):
        parts.append("says: " + ", ".join(s["phrases"][:3]))
    if s.get("latest_event_date"):
        parts.append(f"latest date: {s['latest_event_date']}")
    if s.get("copyright_year"):
        parts.append(f"(c){s['copyright_year']}")
    if s.get("review_count") is not None:
        parts.append(f"{s['review_count']} reviews")
    if s.get("excluded_reason"):
        parts.append(f"EXCLUDED: {s['excluded_reason']}")
    return "; ".join(parts)
