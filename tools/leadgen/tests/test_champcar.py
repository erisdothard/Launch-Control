from __future__ import annotations

from leadgen.config import ChampCarCfg
from leadgen.discover import champcar as cc


def page(track: str, teams: list[str]) -> str:
    rows = "".join(f'<tr data-team="{t}" data-number="{i}"><td>{t}</td></tr>' for i, t in enumerate(teams))
    return (
        '<div class="elist-meta"><div class="elist-meta-box"><span class="elist-meta-label">Event</span>'
        '<span class="elist-meta-value">The Landj&amp;auml;ger Cup</span></div>'
        '<div class="elist-meta-box"><span class="elist-meta-label">Track</span>'
        f'<span class="elist-meta-value">{track}</span></div></div>'
        f'<table><tbody id="entriesBody">{rows}</tbody></table>'
    )


def test_parse_event_reads_teams_track_and_state() -> None:
    ev = cc.parse_event(page("Road America · Elkhart Lake, WI", ["Bolt Racing", "2 Idiot&amp;#039;s"]), 560)
    assert ev is not None
    assert ev.state == "WI" and ev.name == "The Landjäger Cup"
    assert [t for t, _ in ev.entries] == ["Bolt Racing", "2 Idiot's"]


def test_a_page_with_no_entries_is_no_event() -> None:
    assert cc.parse_event(page("VIR · Alton, VA", []), 1) is None


def test_multi_car_and_frequent_teams_are_kept_seat_sellers_first() -> None:
    events = [
        cc.parse_event(page("VIR · Alton, VA", ["Bolt Racing", "bolt racing", "Bolt Racing", "Solo"]), 1),
        *[cc.parse_event(page("AMP · Dawsonville, GA", ["Regular", "Solo"]), i) for i in range(2, 6)],
        cc.parse_event(page("AMP · Dawsonville, GA", ["Once"]), 9),
    ]
    teams = cc.aggregate([e for e in events if e])
    kept = cc.pick(teams, ChampCarCfg(min_cars=2, min_events=4))
    assert [t.name for t in kept] == ["Bolt Racing", "Solo", "Regular"]
    assert kept[0].max_cars == 3 and kept[0].state == "VA"


def test_lookup_reply_drops_social_pages_and_bad_fields() -> None:
    f = cc.parse_lookup('Here: {"website": "facebook.com/team", "email": "none", "state": "Florida"}')
    assert f.website == "" and f.email == "" and f.state == ""
    g = cc.parse_lookup('{"website": "teamx.com", "email": "Hi@TeamX.com", "city": "Ocala", "state": "fl", '
                        '"sells_seats": true}')
    assert g.website == "https://teamx.com" and g.email == "hi@teamx.com" and g.state == "FL" and g.sells_seats


def test_garbage_reply_is_nothing_found() -> None:
    assert cc.parse_lookup("no idea") == cc.Found()


def test_place_is_an_endurance_team_with_the_found_contact() -> None:
    team = cc.aggregate([cc.parse_event(page("VIR · Alton, VA", ["Bolt Racing", "Bolt Racing"]), 1)])[0]  # type: ignore[list-item]
    p = cc.to_place(team, cc.Found("https://bolt.com", "a@bolt.com", "", "", True))
    assert p.segment_key == "endurance_team" and p.source == "dir:champcar"
    assert p.state == "VA" and p.emails == ("a@bolt.com",) and "sells seats" in p.category
