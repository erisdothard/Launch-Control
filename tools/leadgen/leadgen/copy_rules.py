"""The copy rules every agent's generated text is held to, in one place.

No time or speed claims in any form (docs/agents/CONVENTIONS.md, WHY.md rule 4). The Outreach
Writer rejects a draft that has one; Mission Control and the Strategist drop the sentence. A
business's own name may carry a banned word ("FastLane Karting"), so callers can pass names to
blank out first; only whole-word matches of names of MIN_NAME_LEN or more characters are blanked,
so a short name like "A" or "Go" can't strip letters out of the real words around it.
"""

from __future__ import annotations

import re
from collections.abc import Iterable

MIN_NAME_LEN = 3

TIME_WORDS = re.compile(
    r"\b("
    # durations and calendar words
    r"hours?|hrs?|minutes?|mins?|seconds?|secs?|days?|weeks?|months?|daily|weekly|monthly|"
    r"today|tomorrow|overnight|24h|24/7|round[- ]the[- ]clock|same[- ]day|turnaround|"
    # speed
    r"fast(er|est)?|quick(er|est|ly)?|speed(s|y|ier|ily|ing)?|sped|speedier|rapid(ly)?|"
    r"instant(ly)?|immediately|swift(ly)?|real[- ]time|asap|right\s+away|in\s+no\s+time|"
    # time saved
    r"time[- ]sav(ed|ing)|time\s+saved|sav(e|es|ed|ing)\s+(you\s+)?time|free[sd]?\s+up|freeing\s+up"
    r")\b",
    re.I,
)


def strip_names(text: str, names: Iterable[str]) -> str:
    """Blank whole-word occurrences of each name (MIN_NAME_LEN+ characters, case-insensitive)."""
    for name in sorted({n.strip() for n in names if n and len(n.strip()) >= MIN_NAME_LEN}, key=len, reverse=True):
        text = re.sub(rf"(?<!\w){re.escape(name)}(?!\w)", " ", text, flags=re.I)
    return text


def time_word_hits(text: str, names: Iterable[str] = ()) -> list[str]:
    """Every banned word in text (lowercased, sorted, unique), with the given names blanked first."""
    return sorted({m.group(0).lower() for m in TIME_WORDS.finditer(strip_names(text, names))})


def has_time_words(text: str, names: Iterable[str] = ()) -> bool:
    return bool(TIME_WORDS.search(strip_names(text, names)))


def scrub_time_words(text: str) -> tuple[str, list[str]]:
    """Drop every sentence or line that contains a time/speed word. Returns (clean text, removed)."""
    kept: list[str] = []
    removed: list[str] = []
    for line in text.splitlines():
        parts = re.split(r"(?<=[.!?])\s+", line)
        good = [p for p in parts if not TIME_WORDS.search(p)]
        removed += [p for p in parts if TIME_WORDS.search(p)]
        if good or not line.strip():
            kept.append(" ".join(good))
    clean = re.sub(r"\n{3,}", "\n\n", "\n".join(kept)).strip()
    return clean, removed
