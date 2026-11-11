"""The sending domain's mail authentication records, checked from public DNS.

Part of the deliverability check (deliverability.run_once runs it every RUN_EVERY). Four checks on
the app mailbox's domain (golaunchcontrol.com):

- spf      one v=spf1 TXT record, and following its include:/redirect= chain (at most SPF's own limit
           of 10 lookups) reaches Microsoft's spf.protection.outlook.com. The domain's record today is
           "include:secureserver.net", which reaches Microsoft through GoDaddy's chain, so a flat
           string search would be wrong.
- dmarc    a v=DMARC1 TXT record at _dmarc.<domain>.
- dkim1/2  selector1._domainkey and selector2._domainkey lead to a non-empty key (Microsoft 365
           publishes them as CNAMEs to its own DKIM keys and rotates between the two, so both must).

Lookups go over DNS-over-HTTPS (Cloudflare, then Google), JSON API, no extra dependency. A lookup
that errors (network, SERVFAIL) makes that check "unknown", which never alerts: only a record
that is really missing or wrong counts as a failure.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass

import httpx

log = logging.getLogger(__name__)

RESOLVERS = ("https://cloudflare-dns.com/dns-query", "https://dns.google/resolve")
MICROSOFT_SPF = "spf.protection.outlook.com"
SPF_MAX_LOOKUPS = 10
DKIM_SELECTORS = ("selector1", "selector2")
TXT, CNAME = 16, 5
NOERROR, NXDOMAIN = 0, 3


class LookupFailed(Exception):
    """No resolver gave a usable answer."""


@dataclass(frozen=True)
class Check:
    name: str
    ok: bool | None  # None = could not tell (lookup failed)
    detail: str


def lookup(http: httpx.Client, name: str, rtype: str = "TXT") -> list[tuple[int, str]]:
    """(type, data) answers for one name. [] for a name with no such record. Raises LookupFailed."""
    for url in RESOLVERS:
        try:
            resp = http.get(url, params={"name": name, "type": rtype}, headers={"accept": "application/dns-json"})
            resp.raise_for_status()
            body = resp.json()
        except (httpx.HTTPError, ValueError):
            continue
        status = body.get("Status")
        if status in (NOERROR, NXDOMAIN):
            return [(int(a.get("type", 0)), str(a.get("data") or "")) for a in body.get("Answer") or []]
    raise LookupFailed(name)


def txt_values(answers: list[tuple[int, str]]) -> list[str]:
    """TXT strings with the quoting removed; a record split into several strings is joined."""
    out = []
    for rtype, data in answers:
        if rtype != TXT:
            continue
        parts = [p for p in data.split('"') if p.strip()] if '"' in data else [data]
        out.append("".join(parts).strip())
    return out


def _spf_record(http: httpx.Client, name: str) -> list[str]:
    return [t for t in txt_values(lookup(http, name)) if t.lower().startswith("v=spf1")]


def spf_reaches(http: httpx.Client, record: str, target: str = MICROSOFT_SPF) -> bool:
    """Does the record's include/redirect chain reach target, within SPF's lookup limit?"""
    queue, seen = [record], set()
    while queue and len(seen) <= SPF_MAX_LOOKUPS:
        terms = queue.pop(0).split()
        for term in terms:
            low = term.lower().lstrip("+?~-")
            if low.startswith("include:"):
                domain = low.split(":", 1)[1]
            elif low.startswith("redirect="):
                domain = low.split("=", 1)[1]
            else:
                continue
            if domain == target:
                return True
            if domain in seen or len(seen) >= SPF_MAX_LOOKUPS:
                continue
            seen.add(domain)
            queue += _spf_record(http, domain)
    return False


def check_spf(http: httpx.Client, domain: str) -> Check:
    records = _spf_record(http, domain)
    if not records:
        return Check("spf", False, f"No SPF record on {domain}.")
    if len(records) > 1:
        return Check("spf", False, f"{domain} has {len(records)} SPF records; receivers treat that as no SPF at all.")
    if not spf_reaches(http, records[0]):
        return Check("spf", False, f"The SPF record on {domain} does not authorize Microsoft 365 "
                                   f"({MICROSOFT_SPF}): {records[0]}")
    return Check("spf", True, records[0])


def check_dmarc(http: httpx.Client, domain: str) -> Check:
    records = [t for t in txt_values(lookup(http, f"_dmarc.{domain}")) if t.lower().startswith("v=dmarc1")]
    if not records:
        return Check("dmarc", False, f"No DMARC record at _dmarc.{domain}.")
    return Check("dmarc", True, records[0])


def dkim_key(record: str) -> str:
    """The p= tag of a DKIM record ('' when absent or revoked)."""
    tags = dict(t.strip().split("=", 1) for t in record.split(";") if "=" in t)
    return "".join(tags.get("p", "").split())


def check_dkim(http: httpx.Client, domain: str, selector: str) -> Check:
    """The selector must lead to a live key. Microsoft 365 publishes a CNAME to its own record; a CNAME
    whose target has no key (DKIM turned off at Microsoft) or an empty p= (revoked) is a failure."""
    name = f"{selector}._domainkey.{domain}"
    answers = lookup(http, name)
    keys = [dkim_key(t) for t in txt_values(answers)]
    if any(keys):
        return Check(f"dkim-{selector}", True, "key published")
    if any(rtype == CNAME for rtype, _ in answers):
        return Check(f"dkim-{selector}", False, f"{name} points at Microsoft, but no DKIM key is published there.")
    if keys:
        return Check(f"dkim-{selector}", False, f"The DKIM key at {name} is empty (revoked).")
    return Check(f"dkim-{selector}", False, f"The DKIM record {name} does not resolve.")


def run_checks(http: httpx.Client, domain: str) -> list[Check]:
    checks = [
        ("spf", lambda: check_spf(http, domain)),
        ("dmarc", lambda: check_dmarc(http, domain)),
        *[(f"dkim-{s}", lambda s=s: check_dkim(http, domain, s)) for s in DKIM_SELECTORS],
    ]
    out = []
    for name, run in checks:
        try:
            out.append(run())
        except LookupFailed as exc:
            log.warning("dns check %s: lookup failed for %s", name, exc)
            out.append(Check(name, None, "DNS lookup failed; not judged."))
    return out


PLAIN = {
    "spf": "SPF (which servers may send as the domain)",
    "dmarc": "DMARC (what receivers do with mail that fails SPF and DKIM)",
    "dkim-selector1": "DKIM key selector1 (Microsoft's signature on every email)",
    "dkim-selector2": "DKIM key selector2 (the key Microsoft rotates to)",
}


def regressions(checks: list[Check], before: dict[str, bool | None]) -> list[Check]:
    """Checks failing now that weren't known to be failing at the last check. A first run counts
    every failure; 'unknown' never does."""
    return [c for c in checks if c.ok is False and before.get(c.name) is not False]
