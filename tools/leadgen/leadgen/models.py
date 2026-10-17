"""Data carried through the pipeline. Each stage returns a new object (model_copy)."""

from __future__ import annotations

from typing import Any

from pydantic import BaseModel, ConfigDict, Field


class Place(BaseModel):
    """One business as discovered (Google Maps row or directory entry)."""

    model_config = ConfigDict(frozen=True)

    name: str
    phone: str = ""
    website: str = ""
    address: str = ""
    city: str = ""
    state: str = ""  # 2-letter USPS code when known
    category: str = ""
    categories: tuple[str, ...] = ()
    review_count: int | None = None
    rating: float | None = None
    status: str = ""  # e.g. "Permanently closed"
    maps_url: str = ""
    emails: tuple[str, ...] = ()
    query: str = ""
    segment_key: str = ""  # config segment that produced the query
    source: str = "gmaps"


class Contact(BaseModel):
    model_config = ConfigDict(frozen=True)

    name: str
    title: str
    source_url: str = ""


class Enrichment(BaseModel):
    """Everything learned from the business's own website."""

    model_config = ConfigDict(frozen=True)

    ok: bool = False
    error: str | None = None  # robots_disallowed | unreachable | http_404 | ...
    final_url: str = ""
    pages: tuple[str, ...] = ()
    signals: dict[str, Any] = Field(default_factory=dict)
    page_text: str = ""
    email: str = ""
    email_kind: str = ""  # personal | role | offsite | freemail | gmaps
    people: tuple[Contact, ...] = ()


class FactorRating(BaseModel):
    model_config = ConfigDict(frozen=True)

    rating: float
    evidence: str


class ScoreResult(BaseModel):
    model_config = ConfigDict(frozen=True)

    score: int
    breakdown: dict[str, FactorRating]
    segment: str
    decision_maker: Contact | None = None
    reason: str = ""
    outreach_hook: str = ""
    exclude: bool = False
    exclude_why: str = ""
    model: str = ""
    scored_at: str = ""


class Lead(BaseModel):
    model_config = ConfigDict(frozen=True)

    place: Place
    domain: str | None = None
    phone_e164: str = ""
    enrichment: Enrichment | None = None
    exclude_reasons: tuple[str, ...] = ()
    score: ScoreResult | None = None

    @property
    def key(self) -> str:
        """Stable identity: the domain, else phone, else name."""
        return self.domain or self.phone_e164 or self.place.name.lower()

    @property
    def excluded(self) -> bool:
        return bool(self.exclude_reasons)

    @property
    def contact(self) -> Contact | None:
        if self.score and self.score.decision_maker:
            return self.score.decision_maker
        if self.enrichment and self.enrichment.people:
            return self.enrichment.people[0]
        return None
