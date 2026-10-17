"""CSV export for Max: from a run's local rows, or from Supabase."""

from __future__ import annotations

import csv
import json
from pathlib import Path
from typing import Any

from leadgen.record import top_signals

COLUMNS = (
    "score", "business_name", "segment", "city", "state", "contact_name", "contact_title",
    "email", "phone", "website", "score_reason", "outreach_hook", "top_signals",
)


def csv_row(row: dict[str, Any]) -> dict[str, Any]:
    out = {c: row.get(c) for c in COLUMNS if c != "top_signals"}
    out["top_signals"] = top_signals(row)
    return {k: ("" if v is None else v) for k, v in out.items()}


def sort_rows(rows: list[dict[str, Any]]) -> list[dict[str, Any]]:
    return sorted(rows, key=lambda r: (r.get("score") is None, -(r.get("score") or 0), r.get("business_name", "")))


def write_csv(rows: list[dict[str, Any]], path: Path, min_score: int | None = None) -> int:
    chosen = [r for r in rows if min_score is None or (r.get("score") or 0) >= min_score]
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", newline="", encoding="utf-8") as fh:
        w = csv.DictWriter(fh, fieldnames=list(COLUMNS))
        w.writeheader()
        for r in sort_rows(chosen):
            w.writerow(csv_row(r))
    return len(chosen)


def write_jsonl(rows: list[dict[str, Any]], path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8") as fh:
        for r in rows:
            fh.write(json.dumps(r, default=str) + "\n")


def read_jsonl(path: Path) -> list[dict[str, Any]]:
    with path.open(encoding="utf-8") as fh:
        return [json.loads(line) for line in fh if line.strip()]


def latest_run_file(out_dir: Path) -> Path | None:
    runs = sorted((out_dir / "runs").glob("*/leads.jsonl"))
    return runs[-1] if runs else None
