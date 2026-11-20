"""Normalise domains/phones and collapse duplicate businesses."""

from __future__ import annotations

import re
from typing import Any

import phonenumbers
import tldextract

from leadgen.models import Lead, Place

# Offline extractor: uses the bundled public-suffix snapshot, no network fetch.
_EXTRACT = tldextract.TLDExtract(suffix_list_urls=())

# Hosts that are not the business's own site; they never count as its "domain".
NON_BUSINESS_DOMAINS = frozenset({
    "facebook.com", "fb.com", "fb.me", "instagram.com", "linktr.ee", "linkin.bio", "twitter.com",
    "x.com", "youtube.com", "youtu.be", "tiktok.com", "linkedin.com", "yelp.com", "google.com",
    "goo.gl", "business.site", "sites.google.com", "wixsite.com", "square.site", "carrd.co",
    "motorsportreg.com", "eventbrite.com", "bit.ly", "tinyurl.com", "beacons.ai", "allevents.in",
})

# Mailbox providers: an address there says nothing about which business it belongs to.
FREE_MAIL_DOMAINS = frozenset({
    "gmail.com", "googlemail.com", "yahoo.com", "ymail.com", "rocketmail.com", "hotmail.com", "outlook.com",
    "live.com", "msn.com", "aol.com", "icloud.com", "me.com", "mac.com", "proton.me", "protonmail.com",
    "pm.me", "gmx.com", "mail.com", "zoho.com", "fastmail.com", "hey.com", "comcast.net", "att.net",
    "sbcglobal.net", "bellsouth.net", "verizon.net", "cox.net", "charter.net", "earthlink.net",
})


def normalize_domain(url: str) -> str | None:
    """'https://www.Foo-Racing.com/contact' -> 'foo-racing.com'; social/link hubs -> None."""
    if not url or not url.strip():
        return None
    ext = _EXTRACT(url.strip().lower())
    if not ext.domain or not ext.suffix:
        return None
    registered = f"{ext.domain}.{ext.suffix}"
    if registered in NON_BUSINESS_DOMAINS:
        return None
    return registered


def normalize_phone(raw: str, region: str = "US") -> str:
    """E.164 ('+14045551234') or '' when unparseable/invalid."""
    if not raw or not raw.strip():
        return ""
    try:
        num = phonenumbers.parse(raw, region)
    except phonenumbers.NumberParseException:
        return ""
    if not phonenumbers.is_valid_number(num):
        return ""
    return phonenumbers.format_number(num, phonenumbers.PhoneNumberFormat.E164)


def to_lead(place: Place) -> Lead:
    return Lead(place=place, domain=normalize_domain(place.website), phone_e164=normalize_phone(place.phone))


def _richness(lead: Lead) -> tuple[int, int, int]:
    p = lead.place
    return (int(bool(lead.domain)), int(bool(lead.phone_e164)), p.review_count or 0)


def dedupe(places: list[Place]) -> list[Lead]:
    """One Lead per business. Keyed by domain, then phone, then name+city.

    Output keeps discovery order. When duplicates collide the richest record wins (has domain > has phone > more reviews).
    A business with a domain and a phone is matched on either, so a no-website duplicate of
    a known phone collapses into the record that has the website.
    """
    indexed = [(i, to_lead(p)) for i, p in enumerate(places) if p.name]
    indexed.sort(key=lambda il: _richness(il[1]), reverse=True)
    seen_domains: set[str] = set()
    seen_phones: set[str] = set()
    seen_names: set[str] = set()
    winners: list[tuple[int, Lead]] = []
    for idx, lead in indexed:
        name_key = f"{lead.place.name.lower().strip()}|{lead.place.city.lower()}"
        if (
            (lead.domain and lead.domain in seen_domains)
            or (lead.phone_e164 and lead.phone_e164 in seen_phones)
            or name_key in seen_names
        ):
            continue
        if lead.domain:
            seen_domains.add(lead.domain)
        if lead.phone_e164:
            seen_phones.add(lead.phone_e164)
        seen_names.add(name_key)
        winners.append((idx, lead))
    # Keep discovery order (so --limit takes the first-found businesses, not the biggest).
    return [lead for _, lead in sorted(winners, key=lambda il: il[0])]


def drop_known(leads: list[Lead], known_domains: set[str]) -> tuple[list[Lead], int]:
    """Remove leads whose domain is already in the CRM. Returns (kept, skipped_count)."""
    kept = [lead for lead in leads if not (lead.domain and lead.domain in known_domains)]
    return kept, len(leads) - len(kept)


def company_keys(lead: dict[str, Any]) -> set[str]:
    """Every key that identifies the business behind a CRM lead row. Two rows sharing any key are
    the same company: registered website domain, the email address's domain (unless it is a mailbox
    provider), phone, or business name in the same city."""
    keys: set[str] = set()
    for site in (lead.get("website"), lead.get("domain")):
        domain = normalize_domain(str(site or ""))
        if domain:
            keys.add(f"domain:{domain}")
    mail_domain = normalize_domain(str(lead.get("email") or "").strip().rpartition("@")[2])
    if mail_domain and mail_domain not in FREE_MAIL_DOMAINS:
        keys.add(f"domain:{mail_domain}")
    phone = normalize_phone(str(lead.get("phone") or ""))
    if phone:
        keys.add(f"phone:{phone}")
    name = re.sub(r"[^a-z0-9]", "", str(lead.get("business_name") or "").lower())
    city = str(lead.get("city") or "").strip().lower()
    if name and city:
        keys.add(f"name:{name}|{city}")
    return keys


def keys_of(rows: list[dict[str, Any]]) -> set[str]:
    """Every company key across CRM lead rows or blocked-company entries."""
    out: set[str] = set()
    for row in rows:
        out |= company_keys(row)
    return out


def drop_blocked(leads: list[Lead], blocked: set[str]) -> tuple[list[Lead], int]:
    """Remove scraped businesses the team deleted from the CRM. Returns (kept, skipped_count)."""
    def keys(lead: Lead) -> set[str]:
        p = lead.place
        return company_keys({"business_name": p.name, "city": p.city, "website": p.website,
                             "domain": lead.domain, "phone": p.phone})
    kept = [lead for lead in leads if not (keys(lead) & blocked)]
    return kept, len(leads) - len(kept)
