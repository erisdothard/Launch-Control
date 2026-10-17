from conftest import fixture_html

from leadgen.enrich import fingerprints


def test_modern_stack_detected() -> None:
    found = fingerprints.detect([fixture_html("modern_home.html")])
    assert found["booking"] == ["Calendly", "MotorsportReg"]
    assert found["crm"] == ["HubSpot", "Klaviyo"]
    assert "Shopify" in found["ecommerce"]
    assert fingerprints.primary_builder(found) == "Shopify"


def test_wix_and_no_tools() -> None:
    found = fingerprints.detect([fixture_html("shop_home.html")])
    assert fingerprints.primary_builder(found) == "Wix"
    assert found["booking"] == [] and found["crm"] == []


def test_builder_priority_and_empty() -> None:
    found = fingerprints.detect(['<link href="/wp-content/x.css"><script src="https://static.wixstatic.com/a.js">'])
    assert fingerprints.primary_builder(found) == "Wix"
    assert fingerprints.primary_builder(fingerprints.detect(["<p>plain</p>"])) is None


def test_salesforce_not_matched_by_workforce() -> None:
    assert fingerprints.detect(["visit workforce.com"])["crm"] == []
