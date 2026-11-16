"""Public research on one prospect before the Outreach Writer drafts to them.

Max's own process for cold email (2026-11-16): have AI find everything publicly available on the
company and the person, then write with that in mind. This does the first half: one Claude call with
the web search tool returns a few specific, checkable facts about what the business does and who the
contact is. The writer opens on one of them.

Facts are about what they do and have done (programs, cars, series, tracks, history, results, the
person's role). Never guesses about their problems: Max doesn't want emails that presume pain points.
Any failure returns no facts, and the writer falls back to what lead gen observed.
"""

from __future__ import annotations

import json
import logging
import re
from typing import Any, Protocol

import anthropic

log = logging.getLogger(__name__)

MODEL = "claude-sonnet-5-5"
MAX_FACTS = 5
TIMEOUT_S = 120.0

SYSTEM = (
    "You research a motorsport business before a first email to it. Search the web for public, "
    "specific facts about the business and, if a contact name is given, that person: what they offer "
    "(programs, cars, series, tracks, schools, events), notable history or results, and the person's "
    "role. Only include facts you found on a page you read; never guess. Never describe problems, "
    "weaknesses, gaps or what they lack. Each fact is one plain sentence with no links, email "
    "addresses or phone numbers, and no dates or durations. Reply with ONLY a JSON object: "
    '{"facts": ["...", "..."]} with at most 5 facts, most specific first. If you find nothing reliable, '
    'reply {"facts": []}.'
)

_LINKISH = re.compile(r"(https?://|www\.|@|\b[\w-]+\.(com|net|org|io|co)\b)", re.I)


class Researcher(Protocol):
    def research(self, lead: dict[str, Any]) -> list[str]: ...


def lead_query(lead: dict[str, Any]) -> str:
    parts = [f'Business: "{lead.get("business_name") or "unknown"}"']
    for key, label in (("contact_name", "Contact"), ("contact_title", "Their title"), ("website", "Website"),
                       ("city", "City"), ("state", "State"), ("segment", "Industry")):
        if lead.get(key):
            parts.append(f"{label}: {lead[key]}")
    return "\n".join(parts)


def parse_facts(text: str) -> list[str]:
    m = re.search(r"\{.*\}", text, re.S)
    if not m:
        return []
    try:
        data = json.loads(m.group(0))
    except json.JSONDecodeError:
        return []
    raw = data.get("facts") if isinstance(data, dict) else None
    if not isinstance(raw, list):
        return []
    out = []
    for f in raw:
        s = " ".join(str(f).split())
        if s and len(s) <= 300 and not _LINKISH.search(s):
            out.append(s)
    return out[:MAX_FACTS]


class ClaudeResearch:
    def __init__(self, client: anthropic.Anthropic | None = None, model: str = MODEL) -> None:
        self.client = client or anthropic.Anthropic(max_retries=2, timeout=TIMEOUT_S)
        self.model = model

    def research(self, lead: dict[str, Any]) -> list[str]:
        try:
            msg = self.client.messages.create(
                model=self.model, max_tokens=2000, system=SYSTEM,
                tools=[{"type": "web_search_20250305", "name": "web_search", "max_uses": 4}],
                messages=[{"role": "user", "content": lead_query(lead)}],
            )
        except anthropic.APIError as exc:
            log.warning("research failed for lead %s: %s", lead.get("id"), type(exc).__name__)
            return []
        text = "".join(getattr(b, "text", "") for b in msg.content if getattr(b, "type", "") == "text")
        return parse_facts(text)
