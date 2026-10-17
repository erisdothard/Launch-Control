"""`python -m leadgen run|export ...`"""

from __future__ import annotations

import argparse
import asyncio
import logging
import sys
from datetime import UTC, datetime
from pathlib import Path

from leadgen.config import PACKAGE_ROOT, load_config, load_env, supabase_env
from leadgen.export import latest_run_file, read_jsonl, write_csv
from leadgen.pipeline import RunOptions, RunSummary, run
from leadgen.store import Store
from leadgen.worker import serve

log = logging.getLogger("leadgen")


def _csv_list(value: str) -> list[str]:
    return [v.strip() for v in value.split(",") if v.strip()]


def build_parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(prog="leadgen", description="Launch Control motorsport lead generation")
    p.add_argument("-v", "--verbose", action="store_true")
    sub = p.add_subparsers(dest="command", required=True)

    r = sub.add_parser("run", help="discover, enrich, filter, score and store leads")
    r.add_argument("--config", default=str(PACKAGE_ROOT / "config.yaml"))
    r.add_argument("--limit", type=int, help="max businesses to enrich/score after dedupe + pre-filter")
    r.add_argument("--max-queries", type=int, help="override config max_queries")
    r.add_argument("--dry-run", action="store_true", help="no Supabase reads/writes; CSV + JSONL only")
    r.add_argument("--states", type=_csv_list, help="e.g. FL,GA")
    r.add_argument("--segments", type=_csv_list, help="config segment keys, e.g. racing_school,race_prep")
    r.add_argument("--seed", help="CSV of known businesses (name,website,city,state,segment[,phone]); skips Google Maps")
    r.add_argument("--no-score", action="store_true", help="skip the Claude scoring step")
    r.add_argument("--require", type=_csv_list, help="drop leads without these: email,phone")
    r.add_argument("--rescore", action="store_true", help="ignore the per-domain score cache")
    r.add_argument("--refresh-existing", action="store_true",
                   help="re-process domains already in the CRM (updates prospect fields only)")

    w = sub.add_parser("worker", help="run queued jobs from the CRM's Find leads button, forever")
    w.add_argument("--config", default=str(PACKAGE_ROOT / "config.yaml"))
    w.add_argument("--poll", type=float, default=20.0, help="seconds between queue checks when idle")

    e = sub.add_parser("export", help="write a CSV of scored leads")
    e.add_argument("--config", default=str(PACKAGE_ROOT / "config.yaml"))
    e.add_argument("--min-score", type=int, default=None)
    e.add_argument("--source", choices=["auto", "supabase", "local"], default="auto")
    e.add_argument("--out", help="CSV path (default out/export-<timestamp>.csv)")
    return p


def _report(s: RunSummary) -> str:
    c = s.counts
    lines = [
        f"run dir: {s.run_dir}",
        "counts: " + ", ".join(f"{k}={v}" for k, v in c.items()),
    ]
    if s.exclusions:
        lines.append("excluded by reason: " + ", ".join(f"{k}={v}" for k, v in s.exclusions.most_common()))
    if s.store_counts:
        lines.append("supabase: " + ", ".join(f"{k}={v}" for k, v in s.store_counts.items()))
    top = [r for r in s.rows if not r.get("excluded") and r.get("score") is not None]
    top.sort(key=lambda r: -r["score"])
    for r in top[:10]:
        lines.append(f"  {r['score']:>3}  {r['business_name']}  [{r['segment']}]  {r.get('score_reason') or ''}")
    return "\n".join(lines) + "\n"


def cmd_run(args: argparse.Namespace) -> int:
    cfg = load_config(args.config)
    if cfg.contact_is_placeholder:
        log.warning("contact_email in config is a placeholder; set a real inbox before large runs")
    opts = RunOptions(
        limit=args.limit, dry_run=args.dry_run, states=args.states, segments=args.segments,
        no_score=args.no_score, max_queries=args.max_queries, rescore=args.rescore,
        refresh_existing=args.refresh_existing, seed=args.seed, require=args.require,
    )
    summary = asyncio.run(run(cfg, opts))
    sys.stdout.write(_report(summary))
    return 0


def cmd_export(args: argparse.Namespace) -> int:
    cfg = load_config(args.config)
    env = supabase_env()
    use_supabase = args.source == "supabase" or (args.source == "auto" and env is not None)
    if use_supabase:
        if env is None:
            raise RuntimeError("SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY not set")
        rows = Store(*env).fetch_leads(args.min_score)
    else:
        f = latest_run_file(cfg.out_path())
        if f is None:
            raise RuntimeError("no local runs found in out/runs; run the pipeline first")
        rows = [r for r in read_jsonl(f) if not r.get("excluded")]
    out = Path(args.out) if args.out else cfg.out_path() / f"export-{datetime.now(UTC):%Y%m%dT%H%M%SZ}.csv"
    n = write_csv(rows, out, args.min_score)
    sys.stdout.write(f"wrote {n} leads to {out}\n")
    return 0


def main(argv: list[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    logging.basicConfig(
        level=logging.DEBUG if args.verbose else logging.INFO,
        format="%(asctime)s %(levelname)s %(name)s: %(message)s",
    )
    for noisy in ("httpx", "httpcore", "anthropic"):
        logging.getLogger(noisy).setLevel(logging.WARNING)
    load_env()
    try:
        if args.command == "worker":
            serve(load_config(args.config), args.poll)
            return 0
        return cmd_run(args) if args.command == "run" else cmd_export(args)
    except (RuntimeError, FileNotFoundError, ValueError) as exc:
        log.error("%s", exc)
        return 1
