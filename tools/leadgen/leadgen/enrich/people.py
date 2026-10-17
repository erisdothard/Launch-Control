"""Find named decision-makers (name + title) in page text lines.

Handles the three layouts small-business sites actually use:
  "John Smith, Owner"  /  "Owner: John Smith"  (same line)
  "John Smith" newline "Founder & Lead Instructor"  (team card: name line, then title line)
  "General Manager" newline "Jane Doe"  (title above name)
"""

from __future__ import annotations

import re

from leadgen.models import Contact

# (regex, rank) — lower rank = more senior / more likely the buyer.
TITLES: list[tuple[re.Pattern[str], int]] = [
    (re.compile(r"\b(co-?owner|owner|co-?founder|founder|president|ceo|chief executive officer|principal|proprietor|managing partner)\b", re.I), 0),
    (re.compile(r"\b(general manager|partner|team principal|vice president)\b", re.I), 1),
    (re.compile(r"\b(program director|director of [a-z ]+|director)\b", re.I), 2),
    (re.compile(r"\b(business development|sales manager|sales director|head of sales|sales)\b", re.I), 3),
    (re.compile(r"\b(operations manager|shop manager|manager)\b", re.I), 4),
]

_NAME_TOKEN = r"(?:Mc|Mac|O'|De|La)?[A-Z][a-z]+(?:[-'][A-Z][a-z]+)?"
NAME_RE = re.compile(rf"\b({_NAME_TOKEN}(?:\s+[A-Z]\.)?(?:\s+{_NAME_TOKEN}){{1,2}})\b")

NOT_NAME = frozenset("""
the our your we us and of for with meet team staff leadership about contact home owner owners founder
founders co general manager director directors sales business development program president chief
executive officer operations partner partners principal racing race motorsports motorsport track
tracks raceway speedway circuit driving driver drivers school club experience experiences events
event schedule calendar street road avenue suite performance auto autos car cars series championship
endurance sports group services service shop garage engineering customer support welcome new read
more learn call email phone book now get click here privacy policy terms copyright all rights
reserved llc inc company corporation co. motor motors center centre international national academy
pro elite premier rental rentals storage transport logistics fabrication parts tires tire fuel data
video coaching coach instructor instructors chief lead head vice monday tuesday wednesday thursday
friday saturday sunday january february march april may june july august september october november
december florida georgia carolina north south tennessee virginia west texas arizona california
michigan ohio indiana illinois wisconsin atlanta miami orlando tampa sebring daytona charlotte
houston dallas austin phoenix america american usa united states gallery news blog shop store
grand prix kart karting sim simulator simulation hpde day days office hours location locations
""".split())


# Common US first names. A candidate must start with one: on scraped marketing pages this is
# what separates "Mike Thompson" from "Social Media" or "Temperature Sensor".
FIRST_NAMES = frozenset("""
aaron adam adrian alan albert alex alexander alexis alice allen alyssa amanda amber amy andrea andrew
andy angela anna anne anthony april ashley austin barbara ben benjamin beth betty bill billy bob bobby
bonnie brad bradley brandon brenda brent brett brian brittany bruce bryan caleb carl carlos carol carrie
casey catherine chad charles charlie chase chelsea cheryl chris christian christina christine christopher
chuck cindy claire clay cody colin colleen connor courtney craig crystal curtis cynthia dale dan dana
daniel danielle danny darren dave david dawn dean debbie deborah denise dennis derek diana diane dominic
don donald donna doug douglas drew dustin dylan ed eddie edward elizabeth emily emma eric erica erik
eric ethan evan frank fred gabriel gary gavin george gerald glenn grace grant greg gregory hannah harold
heather heidi henry holly ian isaac jack jackie jacob jake james jamie jan jane janet jared jason jay jeff
jeffrey jen jenna jennifer jeremy jerry jesse jessica jill jim jimmy joan joe joel john johnny jon
jonathan jordan jose joseph josh joshua joy juan judy julia julie justin karen kate katherine kathleen
kathy katie keith kelly ken kenneth kevin kim kimberly kirk kris kristen kristin kurt kyle lance larry
laura lauren lee leslie linda lindsay lisa logan lori lucas luis luke lynn madison marc marcus maria
marie mario mark marty mary matt matthew megan melissa michael michelle mike mitch mitchell molly monica
morgan nancy nate nathan nicholas nick nicole noah pam pamela pat patrick paul paula peter phil phillip
rachel ralph randy ray raymond rebecca reagan rich richard rick ricky rob robert robin rod rodney roger
ron ronald ross roy russ russell ryan sam samantha samuel sandra sara sarah scott sean seth shane shannon
sharon shawn sheila stacy stephanie stephen steve steven stuart susan suzanne tammy tanner tara taylor
ted teresa terry thomas tim timothy tina todd tom tommy tony tracy travis trevor troy tyler valerie
vanessa vicki victor victoria vince vincent walter wayne wendy wes wesley will william zach zachary
""".split())


def _is_name(candidate: str) -> bool:
    tokens = [t for t in candidate.split() if not re.fullmatch(r"[A-Z]\.", t)]
    return (
        2 <= len(tokens) <= 3
        and tokens[0].lower() in FIRST_NAMES
        and all(t.lower() not in NOT_NAME for t in tokens)
    )


def _title_match(line: str) -> tuple[int, str] | None:
    for rx, rank in TITLES:
        m = rx.search(line)
        if m:
            return rank, m.group(0)
    return None


def _names_in(line: str) -> list[str]:
    return [m.group(1) for m in NAME_RE.finditer(line) if _is_name(m.group(1))]


def _pure_name(line: str) -> str | None:
    if len(line) > 40:
        return None
    m = NAME_RE.fullmatch(line.strip(" ,-–|"))
    return m.group(1) if m and _is_name(m.group(1)) else None


def _clean_title(line: str, name: str, fallback: str) -> str:
    rest = line.replace(name, " ") if name else line
    rest = re.sub(r"^[\s,:\-–|/]+|[\s,:\-–|/]+$", "", re.sub(r"\s+", " ", rest))
    if 0 < len(rest) <= 60 and _title_match(rest):
        return rest
    return fallback.title() if fallback.islower() else fallback


def find_people(lines: list[str], source_url: str = "") -> list[Contact]:
    """Ranked, de-duplicated contacts (most senior first)."""
    found: dict[str, tuple[int, Contact]] = {}

    def add(name: str, title: str, rank: int) -> None:
        key = name.lower()
        if key not in found or rank < found[key][0]:
            found[key] = (rank, Contact(name=name, title=title, source_url=source_url))

    for i, line in enumerate(lines):
        if len(line) > 160:
            continue
        hit = _title_match(line)
        if not hit:
            continue
        rank, phrase = hit
        same_line = _names_in(line) if len(line) <= 120 else []
        if same_line:
            add(same_line[0], _clean_title(line, same_line[0], phrase), rank)
            continue
        if len(line) > 45 or re.search(r"[.?!]", line):  # a sentence, not a title label
            continue
        for j in (i - 1, i + 1):
            if 0 <= j < len(lines):
                name = _pure_name(lines[j])
                if name:
                    add(name, _clean_title(line, "", phrase), rank)
                    break
    return [c for _, c in sorted(found.values(), key=lambda rc: rc[0])]
