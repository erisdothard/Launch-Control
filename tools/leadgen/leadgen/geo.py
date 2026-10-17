"""US state names <-> USPS codes and address parsing."""

from __future__ import annotations

import re

STATE_CODES: dict[str, str] = {
    "alabama": "AL", "alaska": "AK", "arizona": "AZ", "arkansas": "AR", "california": "CA",
    "colorado": "CO", "connecticut": "CT", "delaware": "DE", "district of columbia": "DC",
    "florida": "FL", "georgia": "GA", "hawaii": "HI", "idaho": "ID", "illinois": "IL",
    "indiana": "IN", "iowa": "IA", "kansas": "KS", "kentucky": "KY", "louisiana": "LA",
    "maine": "ME", "maryland": "MD", "massachusetts": "MA", "michigan": "MI", "minnesota": "MN",
    "mississippi": "MS", "missouri": "MO", "montana": "MT", "nebraska": "NE", "nevada": "NV",
    "new hampshire": "NH", "new jersey": "NJ", "new mexico": "NM", "new york": "NY",
    "north carolina": "NC", "north dakota": "ND", "ohio": "OH", "oklahoma": "OK", "oregon": "OR",
    "pennsylvania": "PA", "rhode island": "RI", "south carolina": "SC", "south dakota": "SD",
    "tennessee": "TN", "texas": "TX", "utah": "UT", "vermont": "VT", "virginia": "VA",
    "washington": "WA", "west virginia": "WV", "wisconsin": "WI", "wyoming": "WY",
    "puerto rico": "PR",
}
VALID_CODES = frozenset(STATE_CODES.values())

# "..., Sebring, FL 33876" or "..., Sebring, FL 33876, United States"
_ADDR_RE = re.compile(r",\s*([^,]+?),\s*([A-Z]{2})\s+\d{5}(?:-\d{4})?(?:\s*,|\s*$)")


def to_code(state: str | None) -> str:
    """'Florida' / 'fl' / 'FL' -> 'FL'; unknown -> ''."""
    if not state:
        return ""
    s = state.strip()
    if s.upper() in VALID_CODES:
        return s.upper()
    return STATE_CODES.get(s.lower(), "")


def parse_city_state(address: str) -> tuple[str, str]:
    """Best-effort (city, USPS) from a one-line US address."""
    m = _ADDR_RE.search(address or "")
    if not m or m.group(2) not in VALID_CODES:
        return "", ""
    return m.group(1).strip(), m.group(2)
