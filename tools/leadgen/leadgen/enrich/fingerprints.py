"""Detect booking, CRM/marketing, e-commerce, form and site-builder tech from raw HTML."""

from __future__ import annotations

import re

# category -> {product: [regex, ...]}; matched case-insensitively against raw HTML.
FINGERPRINTS: dict[str, dict[str, list[str]]] = {
    "booking": {
        "MotorsportReg": [r"motorsportreg\.com"],
        "Calendly": [r"calendly\.com"],
        "Acuity": [r"acuityscheduling\.com", r"as\.me/"],
        "FareHarbor": [r"fareharbor\.com"],
        "Peek": [r"peek\.com/", r"book\.peek\.com"],
        "Checkfront": [r"checkfront\.com"],
        "Square Appointments": [r"squareup\.com/appointments", r"square\.site/book", r"app\.squareup\.com/appointments"],
        "Bookeo": [r"bookeo\.com"],
        "Xola": [r"xola\.com"],
        "Rezdy": [r"rezdy\.com"],
        "Eventbrite": [r"eventbrite\.com"],
        "Trackday Signup": [r"trackdaysignup", r"hooked-on-driving\.com"],
        "Wix Bookings": [r"wix-bookings", r"bookings-widget"],
        "SimplyBook": [r"simplybook\.me"],
    },
    "crm": {
        "HubSpot": [r"js\.hs-scripts\.com", r"hs-analytics", r"hsforms\.(net|com)", r"hubspot\.com"],
        "Salesforce": [r"salesforce\.com", r"\.force\.com", r"pardot\.com", r"pi\.pardot"],
        "Mailchimp": [r"mailchimp\.com", r"list-manage\.com", r"chimpstatic\.com"],
        "Klaviyo": [r"klaviyo\.com"],
        "ActiveCampaign": [r"activehosted\.com", r"activecampaign\.com"],
        "Zoho": [r"zoho\.com", r"zohopublic", r"salesiq\.zoho"],
        "Constant Contact": [r"constantcontact\.com", r"ctctcdn\.com"],
        "Keap": [r"infusionsoft\.com", r"keap\.com"],
        "HighLevel": [r"leadconnectorhq\.com", r"msgsndr\.com", r"gohighlevel"],
        "Pipedrive": [r"pipedrive\.com"],
    },
    "ecommerce": {
        "Shopify": [r"cdn\.shopify\.com", r"myshopify\.com"],
        "WooCommerce": [r"woocommerce", r"wc-ajax"],
        "BigCommerce": [r"bigcommerce\.com"],
        "Square Online": [r"square\.site"],
    },
    "forms": {
        "JotForm": [r"jotform\.com"],
        "Typeform": [r"typeform\.com"],
        "Google Forms": [r"docs\.google\.com/forms", r"forms\.gle"],
        "Wufoo": [r"wufoo\.com"],
        "Gravity Forms": [r"gform_wrapper", r"gravityforms"],
        "Contact Form 7": [r"wpcf7"],
    },
    "chat": {
        "Intercom": [r"widget\.intercom\.io"],
        "Drift": [r"js\.driftt\.com"],
        "Tawk": [r"embed\.tawk\.to"],
        "Tidio": [r"code\.tidio\.co"],
        "Podium": [r"podium\.com"],
    },
    "builder": {
        "Wix": [r"static\.wixstatic\.com", r"wix\.com website builder", r"_wixCssModules|wix-code"],
        "Squarespace": [r"squarespace\.com", r"static1\.squarespace"],
        "WordPress": [r"wp-content/", r"wp-includes/", r'generator" content="wordpress'],
        "GoDaddy": [r"img1\.wsimg\.com", r"godaddy website builder", r"websites\.godaddy"],
        "Weebly": [r"weebly\.com", r"editmysite\.com"],
        "Webflow": [r"webflow\.(com|io)", r"data-wf-site"],
        "Duda": [r"dudaone|multiscreensite|dudamobile"],
        "Shopify": [r"cdn\.shopify\.com"],
    },
}

_COMPILED: dict[str, dict[str, list[re.Pattern[str]]]] = {
    cat: {name: [re.compile(p, re.I) for p in pats] for name, pats in prods.items()}
    for cat, prods in FINGERPRINTS.items()
}

# When several builders match (e.g. Shopify + WordPress blog), prefer the one listed first.
_BUILDER_PRIORITY = list(FINGERPRINTS["builder"])


def detect(html_pages: list[str]) -> dict[str, list[str]]:
    """{category: sorted product names found on any page}."""
    found: dict[str, set[str]] = {cat: set() for cat in _COMPILED}
    for html in html_pages:
        for cat, prods in _COMPILED.items():
            for name, pats in prods.items():
                if name not in found[cat] and any(p.search(html) for p in pats):
                    found[cat].add(name)
    return {cat: sorted(names) for cat, names in found.items()}


def primary_builder(found: dict[str, list[str]]) -> str | None:
    names = found.get("builder", [])
    for b in _BUILDER_PRIORITY:
        if b in names:
            return b
    return None
