"""Pit Report: a short video of the crew's results, built from live rows, shown on the CRM's /admin/ops.

The 3D garage is the stage, rendered once (assets/pit/plate_0..5.png). What changes is the card
over it, and every word and number on a card comes from the database at build time:

  0  title + legend                       static copy, the build date in the footer
  1  Prospector                           metrics.snapshot scanned > kept > usable; the best-scored
                                          usable prospect and its score_reason
  2  Outreach Writer                      the newest agent draft campaign: recipient count and the
                                          first sentence after the greeting of one body_override
  3  Guardian                             the checks in its newest agent_runs row
  4  On track                             metrics.snapshot sent / contacted / replies
  5  The brief                            the Strategist's and Mission Control's newest decisions

Anything missing says so plainly ("No drafts yet"); nothing is invented. Every generated line goes
through copy_rules: a sentence with a time or speed word is dropped, and a label that has one is
dropped with its row. Text is wrapped and shortened so it never leaves the left panel.

Output: an H.264 MP4 (1280x720, yuv420p, faststart) where each card holds with a slow push-in on
the plate and crossfades into the next, plus a JPG poster (card 0). The ffmpeg binary comes from
imageio-ffmpeg, so the worker image needs no system package. run_weekly() is what the worker calls:
at most once per BUILD_EVERY (judged by the newest dated copy in the bucket) it builds and uploads
pit-report-latest.mp4/.jpg (overwritten) and pit-report-YYYY-MM-DD.mp4 to the private bucket. It
is not an agent: it writes no agent_runs row, only a log line.
"""

from __future__ import annotations

import logging
import re
import tempfile
import time
from collections.abc import Iterable, Iterator
from dataclasses import dataclass, field
from datetime import UTC, date, datetime, timedelta
from functools import cache
from pathlib import Path
from typing import Any

from PIL import Image, ImageDraw, ImageFont

from leadgen import agent_log, metrics
from leadgen.automation import TEAM_TZ
from leadgen.config import PACKAGE_ROOT
from leadgen.copy_rules import has_time_words
from leadgen.outreach_writer import CREATED_BY as WRITER_CREATED_BY
from leadgen.store import Store, StoreError

log = logging.getLogger(__name__)

ASSETS = PACKAGE_ROOT / "assets"
PLATES = [ASSETS / "pit" / f"plate_{i}.png" for i in range(6)]
MICHROMA = ASSETS / "fonts" / "Michroma-Regular.ttf"
BODY = ASSETS / "fonts" / "Inter-Regular.ttf"
BODY_BOLD = ASSETS / "fonts" / "Inter-SemiBold.ttf"

BUCKET = "ops-private"
LATEST_MP4 = "pit-report-latest.mp4"
LATEST_JPG = "pit-report-latest.jpg"
DATED = re.compile(r"^pit-report-(\d{4}-\d{2}-\d{2})\.mp4$")
BUILD_EVERY = timedelta(days=7)
RETRY_AFTER_S = 6 * 3600  # after a failed build, in-process, so a broken build doesn't rerun every check

W, H = 1280, 720
PANEL_X, PANEL_W = 56, 600
CHECK_VALUE_X = 230  # the prototype's 300 clipped "nobody on the do-not-email list" in Inter
PANEL_EDGE = 720  # the solid part of the scrim; nothing generated may cross it
CONTENT_BOTTOM = 630  # the footer rule sits at 640
FPS = 30
CARD_S = 4.5
FADE_S = 0.6
PUSH_IN = 0.06  # plate zoom over one card
FOCUS = (0.65, 0.5)  # push toward the right of the plate, where the scene is

RED, ORANGE, YEL, GREEN = (229, 57, 53), (242, 133, 46), (240, 196, 48), (46, 182, 96)
WHITE, DIM, MUTE, RULE, INK = (245, 245, 245), (190, 194, 200), (130, 136, 145), (60, 64, 70), (7, 8, 10)
STATE_DOT = {"ok": GREEN, "warn": ORANGE, "stop": RED}
SEP = "  ·  "


# --- facts ---------------------------------------------------------------------------------------

@dataclass(frozen=True)
class TopFind:
    name: str
    score: int
    reason: str


@dataclass(frozen=True)
class DraftLine:
    company: str
    subject: str
    opening: str


@dataclass(frozen=True)
class GuardCheck:
    label: str
    value: str
    state: str  # ok | warn | stop


@dataclass
class PitFacts:
    as_of: date
    scanned: int = 0
    kept: int = 0
    usable: int = 0
    sent: int = 0
    contacted: int = 0
    replies: int = 0
    top: TopFind | None = None
    drafts_waiting: int = 0
    draft: DraftLine | None = None
    guardian_ran: bool = False
    checks: list[GuardCheck] = field(default_factory=list)
    halted: bool = False
    automatic_sends: int = 0
    strategist: str | None = None
    decision: str | None = None

    @property
    def names(self) -> tuple[str, ...]:
        """Business names that appear on a card; a name may carry a banned word ("FastLane")."""
        return tuple(n for n in ((self.top.name if self.top else ""), (self.draft.company if self.draft else "")) if n)


def _clean_sentences(text: str, names: Iterable[str] = ()) -> str:
    """Drop each sentence with a time/speed word (copy_rules), names blanked first."""
    parts = re.split(r"(?<=[.!?])\s+", " ".join((text or "").split()))
    return " ".join(p for p in parts if p and not has_time_words(p, names)).strip()


def _plural(text: str) -> str:
    """'1 campaign draft(s)' -> '1 campaign draft', '3 email draft(s)' -> '3 email drafts'."""
    return re.sub(r"\b(\d+)((?:\s+[\w-]+)*?)\s+([\w-]+)\(s\)",
                  lambda m: f"{m.group(1)}{m.group(2)} {m.group(3)}{'' if m.group(1) == '1' else 's'}", text)


def top_find(store: Store, leads: list[dict[str, Any]]) -> TopFind | None:
    """Best-scored usable prospect whose score reason survives the copy check."""
    usable = sorted((x for x in leads if metrics.is_usable(x)), key=lambda x: -(x.get("score") or 0))
    for lead in usable[:10]:
        rows = store._req("GET", "leads", params={"select": "score_reason", "id": f"eq.{lead['id']}"}).json()
        name = (lead.get("business_name") or "").strip()
        reason = _clean_sentences((rows[0] if rows else {}).get("score_reason") or "", [name])
        if name and reason and not has_time_words(name.upper()):
            return TopFind(name=name, score=int(lead.get("score") or 0), reason=reason)
    return None


_LEANS_BACK = re.compile(r"^(that|this|these|those|it|they|which)\b", re.I)
_GREETING = re.compile(r"^(hi|hello|hey|dear|good (morning|afternoon|evening))\b", re.I)


def opening_line(body: str, names: Iterable[str] = ()) -> str:
    """The first sentence after the greeting line of a draft body, or "" if it has a time word."""
    lines = [ln.strip() for ln in (body or "").strip().splitlines()]
    if lines and (_GREETING.match(lines[0]) or (lines[0].endswith(",") and len(lines[0].split()) <= 4)):
        lines = lines[1:]
    paragraph = " ".join(_paragraphs(lines)[:1])
    first = re.split(r"(?<=[.!?])\s+", paragraph)[0].strip()
    # Only the first sentence stands on its own, and only when it doesn't lean on the subject line
    # ("That caught our eye..."); otherwise the caller tries the next draft.
    if _LEANS_BACK.match(first):
        return ""
    return "" if has_time_words(first, names) else first


def _paragraphs(lines: list[str]) -> list[str]:
    out, cur = [], []
    for ln in lines:
        if ln:
            cur.append(ln)
        elif cur:
            out.append(" ".join(cur))
            cur = []
    if cur:
        out.append(" ".join(cur))
    return out


def draft_facts(store: Store) -> tuple[int, DraftLine | None]:
    """(recipients in the newest agent draft campaign, one quotable first email)."""
    rows = store._req("GET", "email_campaigns", params={
        "select": "id", "status": "eq.draft", "created_by": f"eq.{WRITER_CREATED_BY}",
        "order": "created_at.desc", "limit": "1",
    }).json()
    if not rows:
        return 0, None
    recips = metrics._all(store, "campaign_recipients", {
        "select": "id,merge,subject_override,body_override", "campaign_id": f"eq.{rows[0]['id']}",
    })
    for r in recips:
        company = ((r.get("merge") or {}).get("company") or "").strip()
        subject = " ".join((r.get("subject_override") or "").split())
        opening = opening_line(r.get("body_override") or "", [company])
        if company and opening:
            return len(recips), DraftLine(company=company, subject=subject, opening=opening)
    return len(recips), None


def guardian_checks(run: dict[str, Any] | None) -> list[GuardCheck]:
    checks = ((run or {}).get("evidence") or {}).get("checks") or []
    out: list[GuardCheck] = []
    bounces = [c for c in checks if c.get("check") == "bounce_rate"]
    if bounces:
        bad = sum(int(c.get("failed") or 0) + int(c.get("bounced_after_send") or 0) for c in bounces)
        sends = sum(int(c.get("sends") or 0) for c in bounces)
        state = "stop" if any(c.get("halts") for c in bounces) else "ok"
        out.append(GuardCheck("Bounces", f"{bad} of the last {sends}", state))
    caps = [c for c in checks if c.get("check") == "mailbox_cap"]
    if caps:
        c = max(caps, key=lambda c: c.get("ratio") or 0)
        state = "stop" if c.get("halts") else "warn" if c.get("warn") else "ok"
        out.append(GuardCheck("Mailbox limit", f"{c.get('count', 0)} of {c.get('cap', 0)} used", state))
    for c in checks:
        if c.get("check") == "suppressions":
            n = int(c.get("suppressed_pending") or 0)
            value = "nobody on the do-not-email list" if n == 0 else f"{n} waiting emails on the do-not-email list"
            out.append(GuardCheck("Opt-outs", value, "stop" if c.get("halts") else "ok" if n == 0 else "warn"))
        elif c.get("check") == "footer_address" and c.get("halts") and not c.get("ok"):
            # Eris parked the postal address; it shows only if the Guardian ever halts on it.
            out.append(GuardCheck("Footer", "no postal address set", "stop"))
        elif c.get("check") == "follow_up_cap" and (c.get("warn") or not c.get("ok")):
            out.append(GuardCheck("Follow-ups", f"{c.get('count', 0)} of {c.get('cap', 0)} used",
                                  "stop" if c.get("halts") else "warn"))
    return out


def strategist_line(decision: str) -> str:
    m = re.match(r"insufficient data: n=(\d+), replies=(\d+)", decision or "")
    if m:
        return f"Not enough data to judge yet: {m.group(1)} contacted, {m.group(2)} replies. Keep sending."
    return _plural(re.sub(r"^Proposals \(not applied\):\s*", "Proposals, not applied: ", (decision or "").strip()))


def decision_text(brief: str) -> str | None:
    if "Decision:" not in (brief or ""):
        return None
    return _plural(brief.rsplit("Decision:", 1)[1].strip().splitlines()[0].strip()) or None


def collect(store: Store, now: datetime | None = None) -> PitFacts:
    now = now or datetime.now(UTC)
    snap = metrics.snapshot(store)
    facts = PitFacts(as_of=now.astimezone(TEAM_TZ).date(), scanned=snap["scanned"], kept=snap["kept"],
                     usable=snap["usable"], sent=snap["sent"], contacted=snap["contacted"], replies=snap["replies"])
    facts.top = top_find(store, metrics.prospects(store))
    facts.drafts_waiting, facts.draft = draft_facts(store)
    runs = agent_log.last_runs(store)
    facts.guardian_ran = "guardian" in runs
    facts.checks = guardian_checks(runs.get("guardian"))
    facts.halted = agent_log.outbound_halted(store) if facts.guardian_ran else False
    auto = store._req("GET", "email_messages", params={
        "select": "id", "direction": "eq.out", "status": "eq.sent", "sent_by": "eq.automation", "limit": "1000",
    }).json()
    facts.automatic_sends = len(auto)
    if "strategist" in runs:
        facts.strategist = _clean_sentences(strategist_line(runs["strategist"].get("decision") or "")) or None
    if "mission-control" in runs:
        facts.decision = _clean_sentences(decision_text(runs["mission-control"].get("decision") or "") or "") or None
    return facts


# --- layout --------------------------------------------------------------------------------------

@dataclass(frozen=True)
class Op:
    """One drawing instruction. kind: text | rect | ellipse | line | polygon."""

    kind: str
    xy: tuple[Any, ...]
    fill: tuple[int, int, int]
    text: str = ""
    font: tuple[str, int] = ("body", 22)
    anchor: str = "la"
    width: int = 0
    generated: bool = True  # inside the panel; checked for fit and time words


@cache
def font(name: str, size: int) -> ImageFont.FreeTypeFont:
    path = {"michroma": MICHROMA, "body": BODY, "bold": BODY_BOLD}[name]
    return ImageFont.truetype(str(path), size)


_MEASURE = ImageDraw.Draw(Image.new("RGB", (8, 8)))


def text_w(text: str, f: tuple[str, int]) -> float:
    return _MEASURE.textlength(text, font=font(*f))


def bbox(op: Op) -> tuple[float, float, float, float]:
    if op.kind == "text":
        return _MEASURE.textbbox(op.xy, op.text, font=font(*op.font), anchor=op.anchor)
    pts = op.xy if op.kind == "polygon" else (op.xy[:2], op.xy[2:])
    xs, ys = [p[0] for p in pts], [p[1] for p in pts]
    return min(xs), min(ys), max(xs), max(ys)


def fit(text: str, f: tuple[str, int], width: float) -> str:
    """The text, shortened with an ellipsis at a word boundary until it fits the width."""
    if text_w(text, f) <= width:
        return text
    words = text.split()
    while words:
        words.pop()
        cand = " ".join(words).rstrip(",;:·-– ") + "…"
        if text_w(cand, f) <= width:
            return cand
    return ""


def wrap(text: str, f: tuple[str, int], width: float, max_lines: int | None = None) -> list[str]:
    lines: list[str] = []
    line = ""
    for word in text.split():
        while text_w(word, f) > width:  # a single word wider than the panel: hard break
            cut = len(word)
            while cut > 1 and text_w(word[:cut], f) > width:
                cut -= 1
            if line:
                lines.append(line)
                line = ""
            lines.append(word[:cut])
            word = word[cut:]
        cand = f"{line} {word}".strip()
        if text_w(cand, f) <= width:
            line = cand
        else:
            lines.append(line)
            line = word
    if line:
        lines.append(line)
    if max_lines is not None and len(lines) > max_lines:
        rest = " ".join(lines[max_lines - 1:])
        lines = lines[:max_lines - 1] + [fit(rest + " …", f, width) if text_w(rest, f) > width else rest]
    return lines


@dataclass
class Card:
    plate: int
    tag: str
    title: str
    job: str
    rows: list[tuple[str, str, Any]]
    foot: str
    step: str


def _row_ops(kind: str, a: str, b: Any, x: int, y: int, w: int, quote_lines: int) -> tuple[list[Op], int]:
    ops: list[Op] = []
    if kind == "big":
        cx = x
        parts = a.split(" > ")
        size = 44
        while size > 28 and sum(text_w(p, ("michroma", size)) for p in parts) + 64 * (len(parts) - 1) > w:
            size -= 2
        for i, part in enumerate(parts):
            if i:
                ay = y + 30
                ops += [Op("line", (cx + 14, ay, cx + 44, ay), YEL, width=4),
                        Op("polygon", ((cx + 44, ay - 9), (cx + 56, ay), (cx + 44, ay + 9)), YEL)]
                cx += 64
            ops.append(Op("text", (cx, y), WHITE, part, ("michroma", size)))
            cx += text_w(part, ("michroma", size))
        if b:
            ops.append(Op("text", (x, y + 68), MUTE, fit(b, ("body", 19), w), ("body", 19)))
        return ops, y + 108
    if kind == "kv":
        ops += [Op("text", (x, y), WHITE, fit(a, ("bold", 22), 200), ("bold", 22)),
                Op("text", (x + 210, y), DIM, fit(b, ("body", 22), w - 210), ("body", 22))]
        return ops, y + 36
    if kind == "check":
        label, value, state = a, b[0], b[1]
        ops += [Op("ellipse", (x, y + 5, x + 14, y + 19), STATE_DOT.get(state, MUTE)),
                Op("text", (x + 28, y), WHITE, fit(label, ("bold", 22), CHECK_VALUE_X - 40), ("bold", 22)),
                Op("text", (x + CHECK_VALUE_X, y), DIM, fit(value, ("body", 22), w - CHECK_VALUE_X), ("body", 22))]
        return ops, y + 38
    if kind == "quote":
        head = fit(a, ("bold", 19), w - 18)
        ops += [Op("rect", (x, y, x + 4, y + 4), YEL), Op("text", (x + 18, y - 8), YEL, head, ("bold", 19))]
        y += 26
        ql = wrap(b, ("body", 21), w - 18, quote_lines)
        ops.append(Op("rect", (x, y, x + 3, y + 30 * len(ql) - 6), YEL))
        for line in ql:
            ops.append(Op("text", (x + 18, y), WHITE, line, ("body", 21)))
            y += 30
        return ops, y + 14
    if kind == "note":
        for line in wrap(a, ("body", 20), w, 3):
            ops.append(Op("text", (x, y), DIM, line, ("body", 20)))
            y += 28
        return ops, y + 8
    raise ValueError(f"unknown row kind {kind!r}")


def layout(card: Card) -> list[Op]:
    """The card's drawing ops, shortened until everything sits inside the panel."""
    for quote_lines in (4, 3, 2):
        ops, bottom = _layout(card, card.rows, quote_lines)
        if bottom <= CONTENT_BOTTOM:
            return ops
    rows = list(card.rows)
    while rows:
        rows.pop()
        ops, bottom = _layout(card, rows, 2)
        if bottom <= CONTENT_BOTTOM:
            return ops
    return _layout(card, [], 2)[0]


def _layout(card: Card, rows: list[tuple[str, str, Any]], quote_lines: int) -> tuple[list[Op], int]:
    x, y, w = PANEL_X, 64, PANEL_W
    ops = [Op("text", (x, y), YEL, "PIT REPORT  ·  LAUNCH CONTROL", ("michroma", 15))]
    if card.step:
        ops.append(Op("text", (x + w, y), MUTE, card.step, ("michroma", 15), anchor="ra", generated=False))
    y += 40
    sx = x
    for color, frac in ((RED, 0.42), (ORANGE, 0.26), (YEL, 0.24), (GREEN, 0.08)):
        ops.append(Op("rect", (sx, y, sx + int(w * frac), y + 5), color))
        sx += int(w * frac)
    y += 24
    size = 30
    gap = 18 if card.tag else 0
    while size > 20 and text_w(card.tag, ("michroma", size)) + gap + text_w(card.title, ("michroma", size)) > w:
        size -= 1
    tx = x
    if card.tag:
        ops.append(Op("text", (x, y), YEL, card.tag, ("michroma", size)))
        tx = x + text_w(card.tag, ("michroma", size)) + gap
    ops.append(Op("text", (tx, y), WHITE, fit(card.title, ("michroma", size), x + w - tx), ("michroma", size)))
    y += 54
    for line in wrap(card.job, ("body", 22), w, 2):
        ops.append(Op("text", (x, y), DIM, line, ("body", 22)))
        y += 30
    y += 22
    for kind, a, b in rows:
        row, y = _row_ops(kind, a, b, x, y, w, quote_lines)
        ops += row
    if card.foot:
        ops += [Op("rect", (x, 640, x + w, 641), RULE, generated=False),
                Op("text", (x, 654), MUTE, fit(card.foot, ("body", 18), w), ("body", 18), generated=False)]
    return ops, y


def _n(n: int, one: str, many: str) -> str:
    return f"{n} {one if n == 1 else many}"


def cards(facts: PitFacts) -> list[Card]:
    """The six cards, in the approved order. Rows whose text carries a time word are dropped."""
    foot = f"Live rows from the CRM  ·  {facts.as_of:%b} {facts.as_of.day} {facts.as_of.year}"
    names = facts.names

    prospector: list[tuple[str, str, Any]] = [
        ("big", f"{facts.scanned} > {facts.kept} > {facts.usable}", "businesses scanned  ·  kept  ·  good fits you can email")]
    if facts.top:
        prospector.append(("quote", f"TOP FIND{SEP}{facts.top.name.upper()}{SEP}SCORE {facts.top.score}", facts.top.reason))
    else:
        prospector.append(("note", "No good fits yet.", None))

    writer: list[tuple[str, str, Any]] = []
    if facts.drafts_waiting:
        writer.append(("big", _n(facts.drafts_waiting, "draft", "drafts"), "first emails, waiting for your approval"))
        if facts.draft:
            subject = f"{SEP}“{facts.draft.subject.upper()}”" if facts.draft.subject else ""
            writer.append(("quote", f"TO {facts.draft.company.upper()}{subject}", facts.draft.opening))
        else:
            writer.append(("note", "No first email in this batch can be quoted.", None))
    else:
        writer.append(("note", "No drafts yet. Nothing is waiting for your approval.", None))

    guardian: list[tuple[str, str, Any]] = [("check", c.label, (c.value, c.state)) for c in facts.checks]
    if not facts.guardian_ran:
        guardian.append(("note", "No Guardian checks logged yet.", None))
    elif facts.halted:
        guardian.append(("note", "Sending is stopped. Only you restart it.", None))
    elif facts.automatic_sends:
        guardian.append(("note", f"{_n(facts.automatic_sends, 'automatic follow-up', 'automatic follow-ups')} went out "
                                 "under your caps. A person pressed send on everything else.", None))
    else:
        guardian.append(("note", "Nothing went out without a person pressing send.", None))

    track: list[tuple[str, str, Any]] = [
        ("big", _n(facts.sent, "email", "emails"), f"sent to {_n(facts.contacted, 'business', 'businesses')}"),
        ("big", _n(facts.replies, "reply", "replies"), "so far. Counted honestly: auto-replies and our own tests excluded"),
    ]

    brief: list[tuple[str, str, Any]] = [
        ("quote", "STRATEGIST", facts.strategist) if facts.strategist else ("note", "Strategist: no review logged yet.", None),
        ("quote", "YOUR ONE DECISION", facts.decision) if facts.decision else ("note", "No brief written yet.", None),
    ]

    out = [
        Card(0, "", "YOUR GARAGE, BY THE NUMBERS",
             "Five agents run your outreach. Here is what each one did, with the receipts.",
             [("kv", "The car", "one of your deals"), ("kv", "The crew", "the agents, one job each"),
              ("kv", "Race control", "safety checks, then you"), ("kv", "The board", "real results, nothing else")],
             foot, "00 / 05"),
        Card(1, "01", "THE PROSPECTOR", "Finds who is worth contacting, and writes down why.", prospector, foot, "01 / 05"),
        Card(2, "02", "THE OUTREACH WRITER",
             "Writes each first email from something true about that business. Drafts only.", writer, foot, "02 / 05"),
        Card(3, "RC", "THE GUARDIAN",
             "Checks everything before it leaves. It can stop all sending. Only you restart it.", guardian, foot, "03 / 05"),
        Card(4, "", "ON TRACK", "Approved emails go out from your own inbox, under your name.", track, foot, "04 / 05"),
        Card(5, "MC", "THE BRIEF", "The Strategist reads the numbers. Mission Control writes your one decision.",
             brief, foot, "05 / 05"),
    ]
    for card in out:
        card.rows = [r for r in card.rows if not _row_has_time_words(r, names)]
    return out


def _row_has_time_words(row: tuple[str, str, Any], names: Iterable[str]) -> bool:
    _kind, a, b = row
    texts = [a] + ([b] if isinstance(b, str) else list(b) if isinstance(b, tuple) else [])
    return any(has_time_words(t, names) for t in texts if t)


# --- paint + encode ------------------------------------------------------------------------------

def overlay(ops: list[Op]) -> Image.Image:
    """The card as RGBA: the left scrim plus every op, ready to lay over a plate."""
    alpha = Image.new("L", (W, H), 0)
    ad = ImageDraw.Draw(alpha)
    for x in range(880):
        ad.line([(x, 0), (x, H)], fill=232 if x < 720 else int(232 * (880 - x) / 160))
    img = Image.new("RGBA", (W, H), (*INK, 0))
    img.putalpha(alpha)
    d = ImageDraw.Draw(img)
    for op in ops:
        if op.kind == "text":
            d.text(op.xy, op.text, font=font(*op.font), fill=op.fill, anchor=op.anchor)
        elif op.kind == "rect":
            d.rectangle(op.xy, fill=op.fill)
        elif op.kind == "ellipse":
            d.ellipse(op.xy, fill=op.fill)
        elif op.kind == "line":
            d.line(op.xy, fill=op.fill, width=op.width)
        elif op.kind == "polygon":
            d.polygon(op.xy, fill=op.fill)
    return img


@cache
def plate(index: int) -> Image.Image:
    return Image.open(PLATES[index]).convert("RGBA").resize((W, H), Image.Resampling.LANCZOS)


def pushed(plate_img: Image.Image, progress: float) -> Image.Image:
    """The plate zoomed in by PUSH_IN * progress toward FOCUS (subpixel crop, so the move is smooth)."""
    z = 1 + PUSH_IN * max(0.0, min(1.0, progress))
    cw, ch = W / z, H / z
    left, top = FOCUS[0] * (W - cw), FOCUS[1] * (H - ch)
    return plate_img.resize((W, H), Image.Resampling.BICUBIC, box=(left, top, left + cw, top + ch))


def compose(card_overlay: Image.Image, plate_index: int, progress: float) -> Image.Image:
    return Image.alpha_composite(pushed(plate(plate_index), progress), card_overlay).convert("RGB")


def render_frames(facts: PitFacts) -> list[tuple[int, Image.Image]]:
    """(plate index, card overlay) for each card."""
    return [(c.plate, overlay(layout(c))) for c in cards(facts)]


def video_frames(parts: list[tuple[int, Image.Image]], fps: int = FPS, card_s: float = CARD_S,
                 fade_s: float = FADE_S) -> Iterator[Image.Image]:
    """Each card holds card_s seconds with the plate pushing in; neighbours overlap by fade_s."""
    step = card_s - fade_s
    total = len(parts) * card_s - (len(parts) - 1) * fade_s
    for k in range(round(total * fps)):
        t = k / fps
        i = min(int(t // step), len(parts) - 1)
        local = t - i * step
        frame = compose(parts[i][1], parts[i][0], local / card_s)
        if i > 0 and local < fade_s:  # still fading in over the previous card's tail
            prev = compose(parts[i - 1][1], parts[i - 1][0], (local + step) / card_s)
            frame = Image.blend(prev, frame, local / fade_s)
        yield frame


def encode(frames: Iterable[Image.Image], path: Path, fps: int = FPS) -> None:
    import imageio_ffmpeg

    writer = imageio_ffmpeg.write_frames(
        str(path), (W, H), fps=fps, codec="libx264", pix_fmt_in="rgb24", pix_fmt_out="yuv420p", quality=None,
        macro_block_size=16, ffmpeg_log_level="error",
        output_params=["-crf", "20", "-preset", "medium", "-movflags", "+faststart"])
    writer.send(None)
    try:
        for f in frames:
            writer.send(f.tobytes())
    finally:
        writer.close()


@dataclass(frozen=True)
class Built:
    video: Path
    poster: Path
    frames: list[Path]
    seconds: float


def build(facts: PitFacts, out_dir: Path, save_frames: bool = False, fps: int = FPS) -> Built:
    out_dir.mkdir(parents=True, exist_ok=True)
    parts = render_frames(facts)
    stills = []
    if save_frames:
        for i, (p, ov) in enumerate(parts):
            path = out_dir / f"pit_{i}.png"
            compose(ov, p, 0.0).save(path)
            stills.append(path)
    poster = out_dir / LATEST_JPG
    compose(parts[0][1], parts[0][0], 0.0).save(poster, quality=88)
    video = out_dir / LATEST_MP4
    encode(video_frames(parts, fps=fps), video, fps=fps)
    seconds = len(parts) * CARD_S - (len(parts) - 1) * FADE_S
    return Built(video=video, poster=poster, frames=stills, seconds=seconds)


# --- storage + schedule --------------------------------------------------------------------------

def _storage(store: Store) -> tuple[str, dict[str, str]]:
    base = store.base.removesuffix("/rest/v1") + "/storage/v1"
    headers = {k: v for k, v in store.headers.items() if k != "Content-Type"}
    return base, headers


def upload(store: Store, built: Built, as_of: date) -> list[str]:
    """Upsert latest mp4 + jpg and a dated mp4 copy into the private bucket. Returns the object paths."""
    base, headers = _storage(store)
    jobs = [(LATEST_MP4, built.video, "video/mp4"), (LATEST_JPG, built.poster, "image/jpeg"),
            (f"pit-report-{as_of.isoformat()}.mp4", built.video, "video/mp4")]
    done = []
    for name, path, ctype in jobs:
        resp = store.client.post(f"{base}/object/{BUCKET}/{name}", content=path.read_bytes(), headers={
            **headers, "Content-Type": ctype, "x-upsert": "true", "cache-control": "max-age=300"}, timeout=120)
        if resp.status_code >= 400:
            raise StoreError(f"storage upload {name} -> {resp.status_code}: {resp.text[:200]}")
        done.append(f"{BUCKET}/{name}")
    return done


def last_built(store: Store) -> date | None:
    """Date of the newest dated copy in the bucket, or None when there is none."""
    base, headers = _storage(store)
    resp = store.client.post(f"{base}/object/list/{BUCKET}", headers={**headers, "Content-Type": "application/json"},
                             json={"prefix": "pit-report-", "limit": 1000, "offset": 0,
                                   "sortBy": {"column": "name", "order": "desc"}})
    if resp.status_code >= 400:
        raise StoreError(f"storage list -> {resp.status_code}: {resp.text[:200]}")
    dates = [date.fromisoformat(m.group(1)) for o in resp.json() if (m := DATED.match(o.get("name") or ""))]
    return max(dates) if dates else None


_state: dict[str, float] = {}


def due(store: Store, now: datetime) -> bool:
    if time.monotonic() - _state.get("failed_at", float("-inf")) < RETRY_AFTER_S:
        return False
    last = last_built(store)
    return last is None or now.astimezone(TEAM_TZ).date() - last >= BUILD_EVERY


def run_weekly(store: Store, now: datetime | None = None) -> str | None:
    """Build and upload the report if due. Returns a summary line, or None when not due."""
    now = now or datetime.now(UTC)
    try:
        if not due(store, now):
            return None
        facts = collect(store, now)
        with tempfile.TemporaryDirectory(prefix="pit-") as tmp:
            built = build(facts, Path(tmp))
            paths = upload(store, built, facts.as_of)
    except Exception:
        _state["failed_at"] = time.monotonic()
        raise
    summary = f"pit report built: {built.seconds:.1f}s video, uploaded {', '.join(paths)}"
    log.info(summary)
    return summary

