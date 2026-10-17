"""Hand-made seed list discovery (`--seed seeds.csv`): businesses we already know about.

CSV columns: name, website, city, state, segment (config key or label).
Optional: phone, address, category, review_count, rating, maps_url, source_note.
Used when Google Maps is unavailable, or to push known prospects through enrich + score.
"""

from __future__ import annotations

import csv
from pathlib import Path

from leadgen.config import Config
from leadgen.geo import to_code
from leadgen.models import Place

REQUIRED = ("name", "website")


def _segment_key(value: str, cfg: Config) -> str:
    v = value.strip()
    if v in cfg.segments:
        return v
    for key, seg in cfg.segments.items():
        if seg.label.lower() == v.lower():
            return key
    return "other"


def _num(value: str | None, kind: type) -> int | float | None:
    try:
        return kind(value) if value not in (None, "") else None
    except ValueError:
        return None


def load_seeds(path: str | Path, cfg: Config) -> list[Place]:
    p = Path(path)
    if not p.is_file():
        raise FileNotFoundError(f"seed file not found: {p}")
    with p.open(newline="", encoding="utf-8") as fh:
        reader = csv.DictReader(fh)
        missing = [c for c in REQUIRED if c not in (reader.fieldnames or [])]
        if missing:
            raise ValueError(f"seed file {p.name} is missing columns: {missing}")
        places = []
        for row in reader:
            name = (row.get("name") or "").strip()
            if not name:
                continue
            places.append(Place(
                name=name,
                website=(row.get("website") or "").strip(),
                phone=(row.get("phone") or "").strip(),
                address=(row.get("address") or "").strip(),
                category=(row.get("category") or "").strip(),
                review_count=_num(row.get("review_count"), int),  # type: ignore[arg-type]
                rating=_num(row.get("rating"), float) or None,  # type: ignore[arg-type]
                maps_url=(row.get("maps_url") or "").strip(),
                city=(row.get("city") or "").strip(),
                state=to_code(row.get("state")),
                segment_key=_segment_key(row.get("segment") or "", cfg),
                query=(row.get("source_note") or "").strip() or f"seed:{p.name}",
                source="seed",
            ))
    return places
