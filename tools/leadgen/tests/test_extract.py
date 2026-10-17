from __future__ import annotations

from datetime import date

from conftest import TODAY, fixture_html

from leadgen.enrich import extract
from leadgen.enrich.crawl import CrawlResult
from leadgen.enrich.people import find_people


def test_deobfuscate_variants() -> None:
    assert extract.deobfuscate("racing [at] apex [dot] com") == "racing@apex.com"
    assert extract.deobfuscate("bob(at)shop(dot)net") == "bob@shop.net"
    assert extract.deobfuscate("write sales at apexracing dot com today") == "write sales@apexracing.com today"


def test_find_emails_mailto_text_and_junk() -> None:
    html = fixture_html("shop_about.html")
    text = "\n".join(extract.html_lines(html))
    emails = extract.find_emails(html, text)
    assert "mike@apexendurance.com" in emails
    assert "apexracing.fl@gmail.com" in emails
    assert not any(e.endswith(".png") for e in emails)
    assert extract.find_emails("<p>x</p>", "a@example.com 0123456789abcdef0123@x.io ok@shop.com") == ["ok@shop.com"]


def test_script_emails_ignored() -> None:
    html = fixture_html("shop_home.html")
    text = "\n".join(extract.html_lines(html))
    emails = extract.find_emails(html, text)
    assert "noise@sentry.io" not in emails
    assert "racing@apexendurance.com" in emails


def test_classify_and_best_email() -> None:
    site = "apexendurance.com"
    assert extract.classify_email("mike@apexendurance.com", site) == "personal"
    assert extract.classify_email("info@apexendurance.com", site) == "role"
    assert extract.classify_email("info@mail.apexendurance.com", site) == "role"
    assert extract.classify_email("x@gmail.com", site) == "freemail"
    assert extract.classify_email("x@vendor.com", site) == "offsite"
    best = extract.best_email(["x@gmail.com", "info@apexendurance.com", "mike@apexendurance.com"], site)
    assert best == ("mike@apexendurance.com", "personal")
    assert extract.best_email(["x@gmail.com"], site) == ("x@gmail.com", "freemail")
    assert extract.best_email([], site) == ("", "")


def test_phrases() -> None:
    text = "Seats available now! Contact us for pricing. DM to book. Call for availability. Now booking."
    found = extract.find_phrases(text)
    for label in ("seats available", "contact for pricing", "DM to book", "call for availability", "now booking"):
        assert label in found
    assert extract.find_phrases("Welcome to our shop") == []


def test_dates_and_range() -> None:
    text = "Race Nov 14-16, 2026. Old 1/2/2019. ISO 2026-03-03. Far 2040-01-01. Bad Feb 30, 2026. Sept 5th 2025"
    got = extract.find_dates(text, TODAY)
    assert date(2026, 11, 14) in got
    assert date(2026, 3, 3) in got
    assert date(2025, 9, 5) in got
    assert date(2019, 1, 2) not in got  # outside window
    assert all(d.year < 2040 for d in got)


def test_shift_years_leap_day() -> None:
    assert extract.shift_years(date(2028, 2, 29), -1) == date(2027, 2, 28)


def test_copyright_year() -> None:
    assert extract.copyright_year("© 2018-2026 Apex") == 2026
    assert extract.copyright_year("Copyright 2019 Foo") == 2019
    assert extract.copyright_year("no notice") is None


def test_socials_skip_share_links() -> None:
    socials = extract.find_socials(fixture_html("shop_home.html"))
    assert socials["facebook"] == "https://www.facebook.com/apexendurance"
    assert socials["instagram"].startswith("https://www.instagram.com/apex_endurance")
    assert "x" not in socials


def test_people_layouts() -> None:
    lines = extract.html_lines(fixture_html("shop_about.html")) + extract.html_lines(fixture_html("shop_contact.html"))
    people = {p.name: p.title for p in find_people(lines)}
    assert people["Mike Thompson"] == "Owner & Lead Driver Coach"
    assert people["Sarah O'Neil"] == "Program Director"
    assert people["Dave Ruiz"] == "General Manager"
    assert people["Jessica Park"] == "Business Development Manager"
    ranked = find_people(lines)
    assert ranked[0].name == "Mike Thompson"  # owner outranks everyone


def test_people_rejects_non_names() -> None:
    lines = ["Contact Our Sales Team", "Owner Operated Since 1999", "Track Day Director", "Racing School"]
    assert find_people(lines) == []
    assert find_people(["Owner: John Smith"])[0].name == "John Smith"


def test_build_enrichment_end_to_end(shop_crawl: CrawlResult) -> None:
    e = extract.build_enrichment(shop_crawl, ("owner@apexendurance.com",), TODAY, 3000)
    assert e.ok and e.email == "mike@apexendurance.com" and e.email_kind == "personal"
    s = e.signals
    assert s["site_builder"] == "Wix"
    assert s["booking_tech"] == [] and s["crm_tech"] == []
    assert "seats available" in s["phrases"] and "call for availability" in s["phrases"]
    assert s["copyright_year"] == 2026
    assert s["latest_event_date"] == "2026-11-14"
    assert s["upcoming_event"] is True
    assert s["form_count"] == 1
    assert s["https"] is True
    assert "owner@apexendurance.com" in s["emails"]
    assert s["people"][0]["name"] == "Mike Thompson"
    assert len(e.page_text) <= 3000 and "[/about-us]" in e.page_text


def test_build_enrichment_failed_crawl_keeps_gmaps_email() -> None:
    e = extract.build_enrichment(CrawlResult(start_url="x", error="timeout"), ("Hi@Shop.com",), TODAY, 1000)
    assert not e.ok and e.error == "timeout" and e.email == "hi@shop.com"


def test_page_text_dedupes_repeated_nav() -> None:
    text = extract.build_page_text([("https://a.com/", ["Home", "Hello"]), ("https://a.com/x", ["Home", "New"])], 500)
    assert text.count("Home") == 1 and "New" in text


def test_people_rejects_product_and_marketing_text() -> None:
    assert find_people(["Temperature Sensor Kit", "GM IAT – Stainless Steel Bung"]) == []
    assert find_people(["Social Media", "Our Partner"]) == []
