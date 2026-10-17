from conftest import make_place

from leadgen.dedupe import dedupe, drop_known, normalize_domain, normalize_phone


def test_normalize_domain() -> None:
    assert normalize_domain("https://www.Foo-Racing.com/contact?x=1") == "foo-racing.com"
    assert normalize_domain("shop.example.co.uk") == "example.co.uk"
    assert normalize_domain("https://www.facebook.com/apex") is None
    assert normalize_domain("https://linktr.ee/apex") is None
    assert normalize_domain("") is None
    assert normalize_domain("not a url") is None


def test_normalize_phone() -> None:
    assert normalize_phone("(404) 829-6475") == "+14048296475"
    assert normalize_phone("+1 404.829.6475") == "+14048296475"
    assert normalize_phone("555") == ""
    assert normalize_phone("") == ""


def test_dedupe_by_domain_phone_and_name() -> None:
    a = make_place(name="Apex Racing", website="https://apex.com", phone="(404) 829-6475", review_count=10)
    b = make_place(name="Apex Racing LLC", website="http://www.apex.com/about", phone="", review_count=50)
    c = make_place(name="Apex (no site)", website="", phone="404-829-6475")
    d = make_place(name="Solo Garage", website="", phone="", city="Tampa")
    e = make_place(name="solo garage ", website="", phone="", city="Tampa")
    leads = dedupe([d, c, b, a, e])
    names = sorted(lead.place.name for lead in leads)
    assert names == ["Apex Racing", "Solo Garage"]
    apex = next(lead for lead in leads if lead.domain == "apex.com")
    assert apex.phone_e164 == "+14048296475"  # richest record wins


def test_drop_known() -> None:
    leads = dedupe([make_place(website="https://a.com", name="A"), make_place(website="", name="B", phone="")])
    kept, skipped = drop_known(leads, {"a.com"})
    assert skipped == 1 and [x.place.name for x in kept] == ["B"]


def test_lead_key_fallbacks() -> None:
    lead = dedupe([make_place(website="", phone="", name="Zed")])[0]
    assert lead.key == "zed"
