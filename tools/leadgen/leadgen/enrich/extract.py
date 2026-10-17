"""Turn crawled pages into signals: emails, people, socials, phrases, dates, site quality."""

from __future__ import annotations

import re
from datetime import date
from urllib.parse import urlsplit

from selectolax.lexbor import LexborHTMLParser as HTMLParser

from leadgen.dedupe import normalize_domain
from leadgen.enrich import fingerprints
from leadgen.enrich.crawl import CrawlResult
from leadgen.enrich.people import find_people
from leadgen.models import Contact, Enrichment

EMAIL_RE = re.compile(r"[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}")
_OBF_AT = re.compile(r"\s*[\[\(\{]\s*at\s*[\]\)\}]\s*", re.I)
_OBF_DOT = re.compile(r"\s*[\[\(\{]\s*dot\s*[\]\)\}]\s*", re.I)
_SPELLED = re.compile(r"\b([\w.+-]+)\s+at\s+([\w-]+)\s+dot\s+(com|net|org|us|biz|info|co)\b", re.I)
_JUNK_TLD = re.compile(r"\.(png|jpe?g|gif|webp|svg|css|js|ico|mp4)$", re.I)
_HEXISH = re.compile(r"^[0-9a-f]{16,}$", re.I)
JUNK_EMAIL_DOMAINS = frozenset({
    "example.com", "sentry.io", "wixpress.com", "sentry-next.wixpress.com", "domain.com", "email.com",
    "yourdomain.com", "mysite.com", "godaddy.com", "squarespace.com", "wix.com", "company.com",
    "website.com", "yourcompany.com", "sentry.wixpress.com", "address.com",
})
FREEMAIL = frozenset({
    "gmail.com", "yahoo.com", "hotmail.com", "outlook.com", "aol.com", "icloud.com", "me.com",
    "live.com", "msn.com", "comcast.net", "att.net", "bellsouth.net", "verizon.net", "sbcglobal.net",
    "protonmail.com", "proton.me", "ymail.com", "mail.com", "gmx.com", "charter.net", "cox.net",
})
ROLE_LOCALS = frozenset({
    "info", "contact", "contactus", "sales", "office", "admin", "hello", "support", "booking",
    "bookings", "book", "events", "event", "team", "service", "services", "parts", "racing", "help",
    "inquiries", "inquiry", "enquiries", "reservations", "orders", "marketing", "media", "press",
    "accounts", "billing", "shop", "mail", "general", "registration", "register", "track", "rentals",
    "school", "noreply", "no-reply", "webmaster", "customerservice", "store", "membership",
    "members", "frontdesk", "reception", "hr", "jobs", "careers", "staff", "garage", "drive",
})
EMAIL_KIND_RANK = {"personal": 0, "role": 1, "offsite": 2, "freemail": 3}

PHRASES: dict[str, re.Pattern[str]] = {
    label: re.compile(rx, re.I)
    for label, rx in {
        "contact for pricing": r"contact (us )?for (pricing|prices|a quote|rates|availability)",
        "call for availability": r"call (us )?for (availability|pricing|prices|details|rates)",
        "call to book": r"call (us )?(today )?to (book|reserve|schedule)",
        "email for pricing": r"email (us )?for (pricing|rates|availability)",
        "DM to book": r"\b(dm|message) (us )?(to|for) (book|reserve|info|details|pricing)",
        "seats available": r"\bseats? (are )?(still )?(available|open|remaining|left)",
        "spots available": r"\bspots? (are )?(still )?(available|left|remaining|open)",
        "now booking": r"\bnow booking\b",
        "limited spots": r"\blimited (spots|seats|availability|space|spaces)\b",
        "request a quote": r"\brequest (a )?quote\b",
        "rentals available": r"\brentals? (are )?(now )?available\b|\bavailable for rent\b",
        "inquire": r"\binquire (for|about|today|now)\b",
        "sold out": r"\bsold out\b",
    }.items()
}

_MONTHS = {m: i for i, m in enumerate(
    ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"], start=1)}
_MON = r"(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sept?(?:ember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)"
_DATE_MDY_TEXT = re.compile(_MON + r"\.?\s+(\d{1,2})(?:st|nd|rd|th)?(?:\s*[-–]\s*\d{1,2}(?:st|nd|rd|th)?)?,?\s+(20\d{2})", re.I)
_DATE_NUM = re.compile(r"\b(\d{1,2})/(\d{1,2})/(20\d{2})\b")
_DATE_ISO = re.compile(r"\b(20\d{2})-(\d{2})-(\d{2})\b")
_COPYRIGHT = re.compile(r"(?:©|&copy;|copyright)\s*(?:\(c\)\s*)?((?:19|20)\d{2})(?:\s*[-–]\s*((?:19|20)\d{2}))?", re.I)

SOCIAL_HOSTS = {
    "facebook": ("facebook.com", "fb.com"),
    "instagram": ("instagram.com",),
    "youtube": ("youtube.com", "youtu.be"),
    "tiktok": ("tiktok.com",),
    "x": ("twitter.com", "x.com"),
    "linkedin": ("linkedin.com",),
}
_SHARE = re.compile(r"sharer|/share|intent/tweet|shareArticle|/plugins/", re.I)


def html_lines(html: str) -> list[str]:
    tree = HTMLParser(html)
    for tag in tree.css("script, style, noscript, svg, template, iframe"):
        tag.decompose()
    root = tree.body or tree.root
    if root is None:
        return []
    raw = root.text(separator="\n")
    return [ln for ln in (re.sub(r"\s+", " ", x).strip() for x in raw.split("\n")) if ln]


def deobfuscate(text: str) -> str:
    text = _OBF_AT.sub("@", text)
    text = _OBF_DOT.sub(".", text)
    return _SPELLED.sub(r"\1@\2.\3", text)


def _valid_email(e: str) -> bool:
    local, _, dom = e.partition("@")
    return bool(local and dom) and not _JUNK_TLD.search(e) and dom not in JUNK_EMAIL_DOMAINS \
        and not _HEXISH.match(local) and len(e) <= 80


def find_emails(html: str, text: str) -> list[str]:
    """mailto: links first, then emails in (de-obfuscated) visible text. Lower-cased, unique."""
    found: list[str] = []
    tree = HTMLParser(html)
    for a in tree.css('a[href^="mailto:"], a[href^="MAILTO:"]'):
        addr = (a.attributes.get("href") or "")[7:].split("?")[0].strip()
        found.extend(EMAIL_RE.findall(addr))
    found.extend(EMAIL_RE.findall(deobfuscate(text)))
    out: list[str] = []
    for e in (x.lower().strip(".") for x in found):
        if _valid_email(e) and e not in out:
            out.append(e)
    return out


def classify_email(email: str, site_domain: str | None) -> str:
    local, _, dom = email.partition("@")
    if dom in FREEMAIL:
        return "freemail"
    if site_domain and normalize_domain(dom) == site_domain:
        base = re.sub(r"[^a-z]", "", local)
        return "role" if local in ROLE_LOCALS or base in ROLE_LOCALS else "personal"
    return "offsite"


def best_email(emails: list[str], site_domain: str | None) -> tuple[str, str]:
    """Same-domain personal > same-domain role > other business domain > freemail."""
    ranked = sorted(
        ((EMAIL_KIND_RANK[classify_email(e, site_domain)], i, e) for i, e in enumerate(emails)),
    )
    if not ranked:
        return "", ""
    _, _, e = ranked[0]
    return e, classify_email(e, site_domain)


def find_phrases(text: str) -> list[str]:
    return [label for label, rx in PHRASES.items() if rx.search(text)]


def shift_years(d: date, years: int) -> date:
    """Same day N years away; Feb 29 falls back to Feb 28."""
    try:
        return d.replace(year=d.year + years)
    except ValueError:
        return d.replace(year=d.year + years, day=28)


def find_dates(text: str, today: date) -> list[date]:
    """Calendar dates within [today-3y, today+2y]."""
    out: list[date] = []

    def add(y: int, m: int, d: int) -> None:
        try:
            dt = date(y, m, d)
        except ValueError:
            return
        if shift_years(today, -3) <= dt <= shift_years(today, 2):
            out.append(dt)

    for m in _DATE_MDY_TEXT.finditer(text):
        add(int(m.group(3)), _MONTHS[m.group(1)[:3].lower()], int(m.group(2)))
    for m in _DATE_NUM.finditer(text):
        add(int(m.group(3)), int(m.group(1)), int(m.group(2)))
    for m in _DATE_ISO.finditer(text):
        add(int(m.group(1)), int(m.group(2)), int(m.group(3)))
    return out


def copyright_year(text: str) -> int | None:
    years = [int(y) for m in _COPYRIGHT.finditer(text) for y in m.groups() if y]
    return max(years) if years else None


def find_socials(html: str) -> dict[str, str]:
    out: dict[str, str] = {}
    for a in HTMLParser(html).css("a[href]"):
        href = (a.attributes.get("href") or "").strip()
        if not href.startswith("http") or _SHARE.search(href):
            continue
        host = urlsplit(href).netloc.lower().removeprefix("www.").removeprefix("m.")
        for platform, hosts in SOCIAL_HOSTS.items():
            if platform not in out and any(host == h or host.endswith("." + h) for h in hosts):
                out[platform] = href
    return out


def count_forms(html: str) -> int:
    return len(HTMLParser(html).css("form"))


def build_page_text(pages: list[tuple[str, list[str]]], max_chars: int) -> str:
    """Per-page text with nav/footer lines that repeat across pages removed."""
    seen: set[str] = set()
    chunks: list[str] = []
    budget = max_chars
    for url, lines in pages:
        fresh = [ln for ln in lines if ln not in seen]
        seen.update(lines)
        block = f"[{urlsplit(url).path or '/'}] " + " | ".join(fresh)
        chunks.append(block[:budget])
        budget -= len(chunks[-1])
        if budget <= 0:
            break
    return "\n".join(chunks)


def build_enrichment(crawl: CrawlResult, gmaps_emails: tuple[str, ...], today: date, max_text_chars: int) -> Enrichment:
    if crawl.error or not crawl.pages:
        emails = [e.lower() for e in gmaps_emails if _valid_email(e.lower())]
        email, kind = best_email(emails, None)
        return Enrichment(ok=False, error=crawl.error or "no_pages", email=email,
                          email_kind=kind, signals={"emails": emails, "crawl_error": crawl.error})

    home = crawl.pages[0]
    site_domain = normalize_domain(home.url)
    per_page = [(p.url, html_lines(p.html)) for p in crawl.pages]
    all_text = "\n".join(ln for _, lines in per_page for ln in lines)

    emails: list[str] = []
    for page, (_, lines) in zip(crawl.pages, per_page, strict=True):
        for e in find_emails(page.html, "\n".join(lines)):
            if e not in emails:
                emails.append(e)
    for e in gmaps_emails:
        if _valid_email(e.lower()) and e.lower() not in emails:
            emails.append(e.lower())
    email, kind = best_email(emails, site_domain)

    people: list[Contact] = []
    for url, lines in per_page:
        for c in find_people(lines, url):
            if c.name.lower() not in {p.name.lower() for p in people}:
                people.append(c)

    tech = fingerprints.detect([p.html for p in crawl.pages])
    dates = find_dates(all_text, today)
    one_year_ago = shift_years(today, -1)
    recent = [d for d in dates if d >= one_year_ago]
    latest = max(dates) if dates else None
    home_tree = HTMLParser(home.html)
    title_node = home_tree.css_first("title")

    signals = {
        "booking_tech": tech["booking"],
        "crm_tech": tech["crm"],
        "site_builder": fingerprints.primary_builder(tech),
        "phrases": find_phrases(all_text),
        "emails": emails[:10],
        "socials": find_socials(" ".join(p.html for p in crawl.pages)),
        "copyright_year": copyright_year(all_text),
        "latest_event_date": latest.isoformat() if latest else None,
        "upcoming_event": bool(latest and latest >= today),
        "recent_dates_count": len(recent),
        "ecommerce_tech": tech["ecommerce"],
        "form_tech": tech["forms"],
        "chat_tech": tech["chat"],
        "form_count": sum(count_forms(p.html) for p in crawl.pages),
        "https": home.url.startswith("https://"),
        "viewport_meta": home_tree.css_first('meta[name="viewport"]') is not None,
        "home_bytes": len(home.html.encode("utf-8", errors="ignore")),
        "title": title_node.text(strip=True)[:120] if title_node else "",
        "pages_crawled": [urlsplit(p.url).path or "/" for p in crawl.pages],
        "email_kind": kind,
        "people": [{"name": p.name, "title": p.title} for p in people[:5]],
    }
    return Enrichment(
        ok=True,
        final_url=home.url,
        pages=tuple(p.url for p in crawl.pages),
        signals=signals,
        page_text=build_page_text(per_page, max_text_chars),
        email=email,
        email_kind=kind,
        people=tuple(people[:5]),
    )
