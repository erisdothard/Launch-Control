"""Google Maps discovery via gosom/google-maps-scraper: its Docker image locally, or the binary
directly when leadgen already runs inside that image (the Railway worker).

One container runs a batch of queries; each query line carries its own id
("text #!# qid") so gosom tags every result row with `input_id`. Rows are cached
per query in out/cache/gmaps/<qid>.json, so reruns only scrape new queries.
"""

from __future__ import annotations

import json
import logging
import shutil
import subprocess
import time
from collections import defaultdict
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

from leadgen.config import GmapsCfg
from leadgen.discover.queries import Query
from leadgen.geo import parse_city_state, to_code
from leadgen.models import Place

log = logging.getLogger(__name__)

# Heavy fields we never use; dropped before caching to keep the cache small.
_DROP_KEYS = ("images", "user_reviews", "user_reviews_extended", "popular_times", "thumbnail", "menu")


class GmapsError(RuntimeError):
    pass


def _run(cmd: list[str], timeout: float | None = None) -> subprocess.CompletedProcess[str]:
    return subprocess.run(cmd, capture_output=True, text=True, timeout=timeout, check=False)  # noqa: S603


def _probe(cmd: list[str], timeout: float) -> bool:
    try:
        return _run(cmd, timeout=timeout).returncode == 0
    except subprocess.TimeoutExpired:
        return False


def ensure_docker(cfg: GmapsCfg) -> None:
    if shutil.which("docker") is None:
        raise GmapsError("docker CLI not found on PATH")
    if not _probe(["docker", "info", "--format", "{{.ServerVersion}}"], 90):
        raise GmapsError("Docker daemon is not responding (docker info failed or timed out). Start Docker Desktop.")
    if not _probe(["docker", "image", "inspect", cfg.image], 60):
        log.info("pulling %s", cfg.image)
        pulled = _run(["docker", "pull", "--platform", cfg.platform, cfg.image], timeout=1800)
        if pulled.returncode != 0:
            raise GmapsError(f"docker pull {cfg.image} failed: {pulled.stderr.strip()[-400:]}")


def cache_file(cache_dir: Path, q: Query) -> Path:
    return cache_dir / f"{q.qid}.json"


def read_cache(cache_dir: Path, q: Query) -> list[dict[str, Any]] | None:
    f = cache_file(cache_dir, q)
    if not f.is_file():
        return None
    try:
        return json.loads(f.read_text(encoding="utf-8"))["rows"]
    except (json.JSONDecodeError, KeyError) as exc:
        log.warning("corrupt gmaps cache %s (%s); will re-scrape", f.name, exc)
        return None


def write_cache(cache_dir: Path, q: Query, rows: list[dict[str, Any]]) -> None:
    payload = {"query": q.text, "fetched_at": datetime.now(UTC).isoformat(), "rows": rows}
    cache_file(cache_dir, q).write_text(json.dumps(payload), encoding="utf-8")


def parse_results(raw: str) -> dict[str, list[dict[str, Any]]]:
    """gosom -json output is JSON Lines; group rows by input_id."""
    grouped: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for line in raw.splitlines():
        line = line.strip()
        if not line:
            continue
        try:
            row = json.loads(line)
        except json.JSONDecodeError:
            continue
        if not isinstance(row, dict):
            continue
        slim = {k: v for k, v in row.items() if k not in _DROP_KEYS}
        grouped[str(row.get("input_id", ""))].append(slim)
    return dict(grouped)


def _docker_cmd(cfg: GmapsCfg, name: str, mount_src: str) -> list[str]:
    return [
        "docker", "run", "--rm", "--name", name,
        "--platform", cfg.platform,
        "-e", f"PLAYWRIGHT_DRIVER_PATH={cfg.driver_path}",
        "-v", f"{mount_src}:/work",
        cfg.image,
        "-input", "/work/queries.txt",
        "-results", "/work/results.json",
        "-json",
        "-depth", str(cfg.depth),
        "-lang", cfg.lang,
        "-c", str(cfg.concurrency),
        "-exit-on-inactivity", cfg.exit_on_inactivity,
    ]  # fmt: skip


def _native_cmd(cfg: GmapsCfg, work: Path) -> list[str]:
    return [
        cfg.binary,
        "-input", str(work / "queries.txt"),
        "-results", str(work / "results.json"),
        "-json",
        "-depth", str(cfg.depth),
        "-lang", cfg.lang,
        "-c", str(cfg.concurrency),
        "-exit-on-inactivity", cfg.exit_on_inactivity,
    ]  # fmt: skip


def _scrape_batch(cfg: GmapsCfg, batch: list[Query], work: Path, out_root: Path) -> dict[str, list[dict]]:
    work.mkdir(parents=True, exist_ok=True)
    (work / "queries.txt").write_text("".join(f"{q.text} #!# {q.qid}\n" for q in batch), encoding="utf-8")
    mount_src = str(work)
    if cfg.host_out_dir:  # leadgen inside Docker: the daemon needs the host path
        mount_src = str(Path(cfg.host_out_dir) / work.relative_to(out_root))
    name = f"leadgen-gmaps-{work.name}"
    started = time.monotonic()
    try:
        cmd = _native_cmd(cfg, work) if cfg.runner == "native" else _docker_cmd(cfg, name, mount_src)
        proc = _run(cmd, timeout=cfg.timeout_minutes * 60)
        (work / "gosom.log").write_text(proc.stdout[-200_000:] + proc.stderr[-200_000:], encoding="utf-8")
        if proc.returncode != 0:
            tail = " | ".join(proc.stderr.strip().splitlines()[-3:])
            raise GmapsError(f"gosom exited {proc.returncode}: {tail[:400]}")
    except subprocess.TimeoutExpired:
        if cfg.runner == "docker":
            _run(["docker", "rm", "-f", name], timeout=60)
        log.warning("gosom batch timed out after %d min; keeping partial results", cfg.timeout_minutes)
    results = work / "results.json"
    raw = results.read_text(encoding="utf-8") if results.is_file() else ""
    grouped = parse_results(raw)
    log.info("gosom batch: %d queries -> %d rows in %.0fs", len(batch),
             sum(len(v) for v in grouped.values()), time.monotonic() - started)
    return grouped


def discover(queries: list[Query], cfg: GmapsCfg, out_root: Path) -> list[Place]:
    """Return Places for all queries, scraping only the ones not already cached."""
    cache_dir = out_root / "cache" / "gmaps"
    cache_dir.mkdir(parents=True, exist_ok=True)
    rows_by_q: dict[str, list[dict[str, Any]]] = {}
    todo: list[Query] = []
    for q in queries:
        cached = read_cache(cache_dir, q)
        if cached is None:
            todo.append(q)
        else:
            rows_by_q[q.qid] = cached
    log.info("gmaps: %d queries (%d cached, %d to scrape)", len(queries), len(rows_by_q), len(todo))

    if todo and cfg.runner == "docker":
        ensure_docker(cfg)
    elif todo and shutil.which(cfg.binary) is None:
        raise GmapsError(f"{cfg.binary} not found on PATH (gmaps.runner is native)")
    for i in range(0, len(todo), cfg.batch_size):
        batch = todo[i : i + cfg.batch_size]
        work = out_root / "cache" / "gmaps-runs" / datetime.now(UTC).strftime("%Y%m%dT%H%M%S%f")
        grouped = _scrape_batch(cfg, batch, work, out_root)
        for q in batch:
            rows = grouped.get(q.qid, [])
            rows_by_q[q.qid] = rows
            write_cache(cache_dir, q, rows)

    return [row_to_place(r, q) for q in queries for r in rows_by_q.get(q.qid, [])]


def row_to_place(row: dict[str, Any], q: Query) -> Place:
    addr = row.get("complete_address") or {}
    city, state = parse_city_state(str(row.get("address") or ""))
    state = to_code(addr.get("state")) or state
    city = (addr.get("city") or city or "").strip()
    emails = tuple(e for e in (row.get("emails") or []) if isinstance(e, str))
    count = row.get("review_count")
    rating = row.get("review_rating")
    return Place(
        name=str(row.get("title") or "").strip(),
        phone=str(row.get("phone") or "").strip(),
        website=str(row.get("web_site") or "").strip(),
        address=str(row.get("address") or "").strip(),
        city=city,
        state=state,
        category=str(row.get("category") or "").strip(),
        categories=tuple(str(c) for c in (row.get("categories") or [])),
        review_count=int(count) if isinstance(count, (int, float)) else None,
        rating=float(rating) if isinstance(rating, (int, float)) and rating else None,
        status=str(row.get("status") or "").strip(),
        maps_url=str(row.get("link") or ""),
        emails=emails,
        query=q.text,
        segment_key=q.segment_key,
        source="gmaps",
    )
