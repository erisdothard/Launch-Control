"""config.yaml schema + loader. Secrets never live here; they come from the environment."""

from __future__ import annotations

import os
from pathlib import Path
from typing import Literal

import yaml
from dotenv import load_dotenv
from pydantic import BaseModel, Field, field_validator, model_validator

from leadgen import USER_AGENT_NAME

FACTOR_KEYS: tuple[str, ...] = (
    "high_ticket_value",
    "booking_need",
    "decision_maker_size",
    "owner_accessible",
    "recent_activity",
    "niche_fit",
    "repeat_potential",
    "weak_backend",
    "regional_expansion",
    "partnership_potential",
    "contact_findable",
)

PACKAGE_ROOT = Path(__file__).resolve().parent.parent  # tools/leadgen


class Segment(BaseModel):
    label: str
    keywords: list[str]


class StateCfg(BaseModel):
    weight: float = 1.0
    metros: list[str] = Field(default_factory=list)


class Track(BaseModel):
    name: str
    state: str


class GmapsCfg(BaseModel):
    image: str = "gosom/google-maps-scraper:v1.12.1"
    platform: str = "linux/amd64"
    # The image ships its Playwright driver in /opt/ms-playwright-go/<ver>, but sets
    # PLAYWRIGHT_DRIVER_PATH=/opt, so it tries a download from a dead CDN. Point it home.
    driver_path: str = "/opt/ms-playwright-go/1.57.0"
    depth: int = 1
    lang: str = "en"
    concurrency: int = 2
    exit_on_inactivity: str = "2m"
    timeout_minutes: int = 45
    batch_size: int = 25
    host_out_dir: str | None = None  # set when leadgen itself runs in Docker (see README)
    # "docker": run the gosom image (local dev). "native": the gosom binary is on PATH, as in the
    # Railway worker image, which is built on the gosom image itself (LEADGEN_GMAPS_RUNNER=native).
    runner: Literal["docker", "native"] = "docker"
    binary: str = "google-maps-scraper"


class DirectorySource(BaseModel):
    name: str
    url: str
    item_selector: str
    name_selector: str = ""
    link_selector: str = "a[href]"
    segment: str = "Other"
    state: str = ""
    enabled: bool = False


class EnrichCfg(BaseModel):
    max_pages: int = 6
    per_host_delay_s: float = 1.0
    timeout_s: float = 15.0
    max_bytes: int = 2_000_000
    concurrency: int = 8


class FilterCfg(BaseModel):
    max_review_count: int = 1500
    stale_years: int = 2
    blocklist: list[str] = Field(default_factory=list)
    excluded_categories: list[str] = Field(default_factory=list)
    # Factor rating at or below which a scored lead is excluded outright (not just capped).
    factor_floors: dict[str, int] = Field(default_factory=dict)
    # "drop": results outside the run's requested states are excluded. "keep": they stay.
    out_of_state: Literal["keep", "drop"] = "keep"
    # Google Maps keywords the Prospector paused for low yield; build_queries skips them.
    paused_keywords: list[str] = Field(default_factory=list)

    @field_validator("factor_floors")
    @classmethod
    def _known_factors(cls, v: dict[str, int]) -> dict[str, int]:
        unknown = set(v) - set(FACTOR_KEYS)
        if unknown:
            raise ValueError(f"factor_floors: unknown factors {sorted(unknown)}")
        if any(not 0 <= r <= 4 for r in v.values()):
            raise ValueError("factor_floors: ratings must be 0-4")
        return v


class ScoreCfg(BaseModel):
    model: str = "claude-sonnet-5-5"
    effort: str = "medium"
    concurrency: int = 4
    max_text_chars: int = 6000
    max_tokens: int = 4000
    use_fallbacks: bool = True
    weights: dict[str, float]

    @field_validator("weights")
    @classmethod
    def _all_factors(cls, v: dict[str, float]) -> dict[str, float]:
        missing = set(FACTOR_KEYS) - set(v)
        extra = set(v) - set(FACTOR_KEYS)
        if missing or extra:
            raise ValueError(f"weights must cover exactly {FACTOR_KEYS}; missing={missing} extra={extra}")
        if any(w < 0 for w in v.values()) or sum(v.values()) <= 0:
            raise ValueError("weights must be non-negative and sum > 0")
        return v


class Config(BaseModel):
    contact_email: str
    bot_url: str = ""
    out_dir: str = "out"
    max_queries: int = 200
    segments: dict[str, Segment]
    states: dict[str, StateCfg]
    tracks: list[Track] = Field(default_factory=list)
    gmaps: GmapsCfg = Field(default_factory=GmapsCfg)
    directories: list[DirectorySource] = Field(default_factory=list)
    enrich: EnrichCfg = Field(default_factory=EnrichCfg)
    filters: FilterCfg = Field(default_factory=FilterCfg)
    score: ScoreCfg

    @model_validator(mode="after")
    def _check(self) -> Config:
        if "@" not in self.contact_email:
            raise ValueError("contact_email must be a real address (it goes in the crawler User-Agent)")
        labels = {s.label for s in self.segments.values()}
        if "Other" not in labels:
            raise ValueError("segments must include one with label 'Other'")
        for t in self.tracks:
            if len(t.state) != 2:
                raise ValueError(f"track {t.name}: state must be a 2-letter code")
        return self

    @property
    def user_agent(self) -> str:
        info = "; ".join(x for x in (f"+{self.bot_url}" if self.bot_url else "", self.contact_email) if x)
        return f"{USER_AGENT_NAME} ({info})"

    @property
    def contact_is_placeholder(self) -> bool:
        return self.contact_email.endswith(".example") or "change-me" in self.contact_email.lower()

    @property
    def segment_labels(self) -> list[str]:
        return [s.label for s in self.segments.values()]

    def out_path(self) -> Path:
        p = Path(self.out_dir)
        return p if p.is_absolute() else PACKAGE_ROOT / p


def load_config(path: str | Path) -> Config:
    p = Path(path)
    if not p.is_file():
        raise FileNotFoundError(f"config not found: {p}")
    with p.open(encoding="utf-8") as fh:
        raw = yaml.safe_load(fh) or {}
    cfg = Config.model_validate(raw)
    host_out = os.environ.get("LEADGEN_HOST_OUT_DIR", "").strip()
    if host_out:
        cfg = cfg.model_copy(update={"gmaps": cfg.gmaps.model_copy(update={"host_out_dir": host_out})})
    runner = os.environ.get("LEADGEN_GMAPS_RUNNER", "").strip()
    if runner:
        gm = GmapsCfg.model_validate({**cfg.gmaps.model_dump(), "runner": runner})
        cfg = cfg.model_copy(update={"gmaps": gm})
    contact = os.environ.get("LEADGEN_CONTACT_EMAIL", "").strip()
    if contact:
        cfg = cfg.model_copy(update={"contact_email": contact})
    return cfg


def load_env() -> None:
    """Load tools/leadgen/.env (never overrides variables already exported)."""
    load_dotenv(PACKAGE_ROOT / ".env", override=False)


def supabase_env() -> tuple[str, str] | None:
    url = os.environ.get("SUPABASE_URL", "").strip()
    key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "").strip()
    return (url.rstrip("/"), key) if url and key else None
