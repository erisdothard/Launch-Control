# Launch Control lead generation

Finds small US motorsport businesses that fit Max's prospect spec, reads their public website,
throws out the ones that are not a fit, scores the rest 0-100 with Claude, and writes them to the
CRM (`leads` table, `source = 'lead-gen'`) plus a CSV.

```
Google Maps (gosom, Docker)  ->  dedupe  ->  rule filters  ->  website crawl  ->  Claude scoring  ->  Supabase + CSV
     keyword x track/metro        domain/phone   closed, chains,    robots.txt, 1 req/s,   11 factors, 0-5 each,
     cached per query             skip CRM ones  blocklist, stale   <=6 pages per site     weighted -> 0-100
```

## Setup

Requirements: Python 3.12+, [uv](https://docs.astral.sh/uv/), Docker Desktop running.

```bash
cd tools/leadgen
uv sync
cp .env.example .env      # then fill in the values
docker pull --platform linux/amd64 gosom/google-maps-scraper:v1.12.1
```

`.env` (never committed):

| Variable | Used for |
|---|---|
| `ANTHROPIC_API_KEY` | scoring (skip with `--no-score`) |
| `SUPABASE_URL` | CRM project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | server-side writes to `leads` / `lead_gen_runs` (not needed for `--dry-run`) |

Set `contact_email` in `config.yaml` to a real inbox: it goes in the crawler's User-Agent so site
owners can reach us.

## Commands

```bash
# Full run: discover -> enrich -> score -> write to Supabase
uv run python -m leadgen run --config config.yaml

# Small test, nothing written to Supabase (CSV + JSONL in out/runs/<timestamp>/)
uv run python -m leadgen run --dry-run --states FL,GA --segments racing_school,race_prep --max-queries 4 --limit 15

# Skip Google Maps: push a known list through enrich -> filter -> score
# (columns: name,website,city,state,segment[,phone,address,category,review_count,rating,maps_url,source_note])
uv run python -m leadgen run --dry-run --seed seeds/smoke-seeds.csv --limit 15

# Without Claude (rules + website signals only)
uv run python -m leadgen run --dry-run --no-score

# CSV of everything scored 60+ (from Supabase if configured, else the latest local run)
uv run python -m leadgen export --min-score 60
```

Flags: `--limit N` caps how many businesses get crawled/scored; `--max-queries N` caps Google Maps
queries; `--states` / `--segments` narrow the plan (segment keys are in `config.yaml`);
`--rescore` ignores the score cache; `--refresh-existing` re-processes businesses already in the
CRM (refreshes score/signals only, never status or notes).

Reruns are cheap: every Google Maps query is cached in `out/cache/gmaps/`, every score in
`out/cache/scores/<domain>.json`.

## Config knobs (`config.yaml`)

| Knob | What it does |
|---|---|
| `segments` | the fixed segment list (labels the CRM shows) and the Google Maps keywords for each |
| `states.<ST>.weight` | share of the query budget; FL/GA/NC/TX/CA get 1.5 by default |
| `states.<ST>.metros`, `tracks` | places searched: `"<keyword> near <track>"`, `"<keyword> in <metro>, <ST>"` |
| `max_queries` | total Google Maps queries per run |
| `filters.max_review_count` | more Google reviews than this = chain / national scale, excluded |
| `filters.stale_years` | copyright older than this many years and no recent dates = stale, excluded |
| `filters.blocklist` | name/domain substrings always excluded (OEM experiences, national chains) |
| `filters.excluded_categories` | Google categories that are never prospects (gas stations, body shops, ...) |
| `enrich.*` | pages per site (6), seconds between requests to one host (1.0), timeouts |
| `score.model`, `score.effort` | Claude model (`claude-sonnet-5-5`) and effort |
| `score.weights` | weight of each factor in the 0-100 score |

## How scoring works (for Max)

Claude reads what we found (Google listing + up to ~6,000 characters of the business's own site +
detected tech like booking tools and CRMs) and rates 11 factors from 0 to 5, each with a one-line
piece of evidence:

| Factor | Default weight |
|---|---|
| High-ticket customer value | 1.5 |
| Clear need for more bookings / leads | 1.5 |
| Small enough that one decision-maker matters | 1.0 |
| Owner / founder accessible | 1.0 |
| Active, recent activity | 1.0 |
| Strong motorsport niche fit | 1.5 |
| Repeat-customer potential | 1.0 |
| Weak backend / inconsistent follow-up | 1.5 |
| Regional expansion potential | 0.5 |
| Partnership potential | 0.5 |
| Easy-to-find public contact | 1.0 |

The score is plain arithmetic, not the model's opinion: `sum(weight x rating) / (5 x sum(weights)) x 100`.
A business rated 5 on everything scores 100; all 3s scores 60. Change a weight in `config.yaml` and
cached scores are recomputed for free on the next run.

Claude also picks the segment, names a decision-maker (only if the name is actually on their site;
otherwise blank), writes a one-line reason and an outreach opening line, and can flag a clear
disqualifier (OEM, national chain, not motorsport), which moves the business to the excluded list.

Each row in the CRM keeps the evidence: `score_breakdown` (rating + evidence per factor) and
`signals` (booking/CRM tools found, "call for availability"-type phrases, latest event date,
copyright year, emails, socials, Google review count).

## Ground rules baked in

- Public business data only. Honest User-Agent, robots.txt obeyed, max 1 request/second per site,
  at most 6 pages per site. A block (401/403/429, robots disallow, challenge page) ends the crawl
  for that site; nothing is retried around it, no CAPTCHAs, no logins.
- Emails: business-domain addresses are preferred; free-mail addresses are only used when nothing
  else exists. Cloudflare-protected emails are not decoded.
- Existing CRM rows: status and notes are never overwritten; contact fields are only filled when empty.

## Running inside Docker

```bash
docker build -t leadgen tools/leadgen
docker run --rm --env-file tools/leadgen/.env \
  -v /var/run/docker.sock:/var/run/docker.sock \
  -v "$PWD/tools/leadgen/out:/app/out" \
  -e LEADGEN_HOST_OUT_DIR="$PWD/tools/leadgen/out" \
  leadgen run --dry-run --limit 10
```

The scraper is itself a container, so the leadgen container talks to the host's Docker daemon;
`LEADGEN_HOST_OUT_DIR` tells it the host path of `out/` for the scraper's volume mount.

## Notes / known limits

- gosom v1.12.1 sets `PLAYWRIGHT_DRIVER_PATH=/opt` but ships its driver in
  `/opt/ms-playwright-go/1.57.0`; without the override it tries a download from a dead CDN and
  exits with zero results. `gmaps.driver_path` fixes that. Do not mount a shared `/opt` volume.
  The image is amd64-only (runs under emulation on Apple Silicon).
- `discover/directories.py` is a pluggable static-listing source (ChampCar / Lucky Dog / WRL style
  pages). None ship enabled; NASA's site sits behind a Cloudflare challenge and stays off-limits.

## Tests

```bash
uv run pytest --cov=leadgen --cov-report=term-missing
```
