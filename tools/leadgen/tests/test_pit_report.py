from __future__ import annotations

import json
from datetime import UTC, date, datetime
from pathlib import Path
from typing import Any

import httpx
import pytest
import respx
from test_guardian import BASE, FakeRest, rest  # noqa: F401  (fixture)

from leadgen import pit_report as pr
from leadgen import worker
from leadgen.copy_rules import has_time_words
from leadgen.store import Store

NOW = datetime(2026, 10, 27, 18, 0, tzinfo=UTC)
PANEL_RIGHT = pr.PANEL_X + pr.PANEL_W

# Invented businesses only (public repo).
READ = {"pages_crawled": 4}


def lead(i: str, name: str, score: int, reason: str, **kw: Any) -> dict[str, Any]:
    return {"id": i, "business_name": name, "email": f"{i}@example.com", "score": score, "score_reason": reason,
            "signals": READ, "segment": "race_prep", "status": "new", "source": "lead-gen", "run_id": "R",
            "created_at": "2026-10-01", **kw}


def full_tables() -> dict[str, list[dict[str, Any]]]:
    return {
        "leads": [
            lead("a", "Gridline Track Days", 95, "Runs track days every weekend."),  # reason has a time word
            lead("b", "Torque Theory Racing", 88, "Race prep shop. Contact page is a form only, no booking step."),
            lead("c", "Low Score Motors", 40, "Not a fit."),
            lead("d", "No Email Garage", 99, "Great fit.", email=""),
        ],
        "lead_gen_runs": [{"found": 120, "kept": 40, "status": "completed"}],
        "email_messages": [
            {"lead_id": "b", "direction": "out", "status": "sent", "subject": "Hello", "sent_by": "max@x.com"},
            {"lead_id": "b", "direction": "in", "status": "received", "subject": "Automatic reply: away"},
        ],
        "calendar_events": [], "email_drafts": [],
        "email_campaigns": [{"id": "camp-1", "status": "draft", "created_by": "agent:outreach-writer",
                             "created_at": "2026-10-27T10:00:00Z"}],
        "campaign_recipients": [
            {"id": "r1", "campaign_id": "camp-1", "merge": {"company": "Hairpin Karting"}, "subject_override": "Seats",
             "body_override": "Hi Sam,\n\nYour calendar lists eight school weekends. That is a lot of seats.\n\nEris"},
            {"id": "r2", "campaign_id": "camp-1", "merge": {"company": "Apex Lane"}, "subject_override": "x",
             "body_override": "Hi Jo,\nok."},
        ],
        "agent_runs": [
            {"id": 1, "agent": "guardian", "status": "done", "started_at": "2026-10-27T17:00:00Z",
             "decision": "Outbound may proceed.", "evidence": {"checks": [
                 {"check": "bounce_rate", "ok": True, "halts": False, "sends": 35, "failed": 0, "bounced_after_send": 0},
                 {"check": "mailbox_cap", "ok": True, "halts": False, "count": 1, "cap": 400, "ratio": 0.0025},
                 {"check": "follow_up_cap", "ok": True, "halts": False, "count": 0, "cap": 25, "ratio": 0.0},
                 {"check": "suppressions", "ok": True, "halts": False, "suppressed_pending": 0},
                 {"check": "footer_address", "ok": False, "halts": False}]}},
            {"id": 2, "agent": "strategist", "status": "done", "started_at": "2026-10-27T17:00:00Z",
             "decision": "insufficient data: n=1, replies=0; keep sending"},
            {"id": 3, "agent": "mission-control", "status": "done", "started_at": "2026-10-27T17:00:00Z",
             "decision": "Totals: ...\nDecision: Review what is waiting for approval: 1 campaign draft(s) and "
                         "3 email draft(s)."},
        ],
    }


def text_ops(card: pr.Card) -> list[pr.Op]:
    return [op for op in pr.layout(card) if op.kind == "text"]


def all_text(facts: pr.PitFacts) -> list[str]:
    return [op.text for c in pr.cards(facts) for op in text_ops(c)]


# --- collect -------------------------------------------------------------------------------------

def test_collect_with_no_data_says_so_plainly(rest: FakeRest) -> None:  # noqa: F811
    facts = pr.collect(rest.store(), NOW)
    assert (facts.scanned, facts.kept, facts.usable, facts.sent, facts.replies) == (0, 0, 0, 0, 0)
    assert facts.top is None and facts.draft is None and facts.drafts_waiting == 0
    assert not facts.guardian_ran and facts.strategist is None and facts.decision is None
    text = " ".join(all_text(facts))
    for plain in ("No good fits yet.", "No drafts yet.", "No Guardian checks logged yet.",
                  "Strategist: no review logged yet.", "No brief written yet."):
        assert plain in text


def test_collect_reads_live_rows(rest: FakeRest) -> None:  # noqa: F811
    rest.tables.update(full_tables())
    facts = pr.collect(rest.store(), NOW)
    assert (facts.scanned, facts.kept, facts.usable, facts.sent, facts.contacted, facts.replies) == (120, 4, 2, 1, 1, 0)
    # The best-scored usable lead's reason has a time word, so the next one is quoted.
    assert facts.top == pr.TopFind("Torque Theory Racing", 88, "Race prep shop. Contact page is a form only, no booking step.")
    assert facts.drafts_waiting == 2
    assert facts.draft == pr.DraftLine("Hairpin Karting", "Seats", "Your calendar lists eight school weekends.")
    assert [(c.label, c.value, c.state) for c in facts.checks] == [
        ("Bounces", "0 of the last 35", "ok"), ("Mailbox limit", "1 of 400 used", "ok"),
        ("Opt-outs", "nobody on the do-not-email list", "ok")]
    assert facts.strategist == "Not enough data to judge yet: 1 contacted, 0 replies. Keep sending."
    assert facts.decision == "Review what is waiting for approval: 1 campaign draft and 3 email drafts."
    assert facts.as_of == date(2026, 10, 27)


def test_opening_line_skips_the_greeting() -> None:
    assert pr.opening_line("Hello Max,\n\nYou run 40 events. Next.\n") == "You run 40 events."
    assert pr.opening_line("Your site is a form only. Hi.") == "Your site is a form only."
    # The second sentence leans on the first, so a dropped first sentence means no quote from this draft.
    assert pr.opening_line("Hi Sam,\n\nWe can help today. Your shop has six bays.") == ""
    assert pr.opening_line("") == ""


# --- copy rules ----------------------------------------------------------------------------------

def facts_with(**kw: Any) -> pr.PitFacts:
    base = dict(as_of=date(2026, 10, 27), scanned=10, kept=5, usable=2, sent=3, contacted=3, replies=1,
                top=pr.TopFind("FastLane Karting", 80, "Kart track with a form-only site."),
                drafts_waiting=1, draft=pr.DraftLine("FastLane Karting", "Seats", "Your track runs leagues."),
                guardian_ran=True, checks=[pr.GuardCheck("Bounces", "0 of the last 3", "ok")],
                strategist="Keep sending.", decision="Approve the drafts.")
    base.update(kw)
    return pr.PitFacts(**base)


def test_no_time_words_anywhere_and_names_are_not_dropped() -> None:
    facts = facts_with(strategist="Aim at karting. Do it quickly.", decision="Approve these today.")
    facts.strategist = pr._clean_sentences(facts.strategist)
    text = all_text(facts)
    assert not [t for t in text if has_time_words(t, facts.names)]
    joined = " ".join(text)
    assert "Aim at karting." in joined and "quickly" not in joined
    assert "Approve these today." not in joined  # the row is dropped
    assert "FASTLANE KARTING" in joined  # a name with a banned word stays
    assert "YOUR GARAGE, BY THE NUMBERS" in joined and "THIS WEEK" not in joined
    assert "Live rows from the CRM  ·  Oct 27 2026" in joined


def test_static_copy_is_clean() -> None:
    facts = facts_with()
    for card in pr.cards(facts):
        for op in text_ops(card):
            assert not has_time_words(op.text, facts.names), op.text


# --- fit -----------------------------------------------------------------------------------------

def test_long_text_stays_inside_the_panel() -> None:
    long = "Founder-led race prep and team management shop with high-ticket clients " * 6
    facts = facts_with(
        scanned=123456, kept=98765, usable=54321, sent=100000, contacted=99999, replies=12345,
        top=pr.TopFind("The Extremely Long Named Motorsport Performance And Restoration Company LLC", 99, long),
        draft=pr.DraftLine("Another Very Long Business Name Racing Academy", "A very long subject line " * 4,
                           "Supercalifragilisticexpialidociousandthensomeevenlongerwordwithoutanyspaces " + long),
        drafts_waiting=250,
        checks=[pr.GuardCheck("Bounces", "12345 of the last 99999 and some more words", "stop")] * 6,
        automatic_sends=7, strategist=long, decision=long)
    for card in pr.cards(facts):
        ops = pr.layout(card)
        for op in ops:
            if not op.generated:
                continue
            left, top, right, bottom = pr.bbox(op)
            assert left >= pr.PANEL_X and right <= PANEL_RIGHT <= pr.PANEL_EDGE, (card.title, op.text, right)
            assert bottom <= pr.CONTENT_BOTTOM, (card.title, op.text, bottom)
        foot = [op for op in ops if op.text.startswith("Live rows")]
        assert foot and pr.bbox(foot[0])[2] <= PANEL_RIGHT


# --- frames + video ------------------------------------------------------------------------------

def test_frames_render_at_1280x720() -> None:
    parts = pr.render_frames(facts_with())
    assert len(parts) == 6
    for plate_index, ov in parts:
        assert ov.size == (1280, 720) and ov.mode == "RGBA"
        frame = pr.compose(ov, plate_index, 0.5)
        assert frame.size == (1280, 720) and frame.mode == "RGB"
    frames = list(pr.video_frames(parts, fps=2))
    assert len(frames) == round((6 * pr.CARD_S - 5 * pr.FADE_S) * 2)
    assert all(f.size == (1280, 720) for f in frames)


def test_push_in_moves_the_plate_only() -> None:
    plate = pr.plate(0)
    assert pr.pushed(plate, 0.0).size == plate.size == (1280, 720)
    assert pr.pushed(plate, 1.0).tobytes() != pr.pushed(plate, 0.0).tobytes()


def test_build_writes_mp4_and_poster(tmp_path: Path) -> None:
    built = pr.build(facts_with(), tmp_path, save_frames=True, fps=2)
    assert built.video.stat().st_size > 0 and built.video.read_bytes()[4:8] == b"ftyp"
    assert built.poster.read_bytes()[:2] == b"\xff\xd8"
    assert len(built.frames) == 6 and built.seconds == pytest.approx(24.0)


# --- storage + schedule --------------------------------------------------------------------------

@pytest.fixture
def storage() -> Any:
    with respx.mock(assert_all_called=False) as mock:
        yield mock


def store() -> Store:
    return Store(BASE, "service-key", client=httpx.Client())


def test_upload_writes_latest_and_dated_copies(storage: respx.MockRouter, tmp_path: Path) -> None:
    route = storage.post(url__regex=rf"{BASE}/storage/v1/object/ops-private/.*").mock(return_value=httpx.Response(200, json={}))
    video, poster = tmp_path / "v.mp4", tmp_path / "p.jpg"
    video.write_bytes(b"mp4")
    poster.write_bytes(b"jpg")
    paths = pr.upload(store(), pr.Built(video, poster, [], 24.0), date(2026, 10, 27))
    assert paths == ["ops-private/pit-report-latest.mp4", "ops-private/pit-report-latest.jpg",
                     "ops-private/pit-report-2026-10-27.mp4"]
    calls = [c.request for c in route.calls]
    assert [c.url.path for c in calls] == [f"/storage/v1/object/{p}" for p in paths]
    assert [c.headers["content-type"] for c in calls] == ["video/mp4", "image/jpeg", "video/mp4"]
    assert all(c.headers["x-upsert"] == "true" and c.headers["authorization"] == "Bearer service-key" for c in calls)
    assert calls[1].content == b"jpg"


def test_upload_failure_raises(storage: respx.MockRouter, tmp_path: Path) -> None:
    storage.post(url__regex=r".*/storage/v1/object/.*").mock(return_value=httpx.Response(403, json={"error": "nope"}))
    (tmp_path / "v").write_bytes(b"x")
    with pytest.raises(Exception, match="403"):
        pr.upload(store(), pr.Built(tmp_path / "v", tmp_path / "v", [], 1.0), date(2026, 10, 27))


@pytest.mark.parametrize(("names", "expected"), [
    ([], True),
    (["pit-report-latest.mp4", "pit-report-latest.jpg"], True),
    (["pit-report-latest.mp4", "pit-report-2026-10-21.mp4"], False),
    (["pit-report-2026-10-20.mp4", "pit-report-2026-10-14.mp4"], True),
])
def test_due_once_a_week_or_when_missing(storage: respx.MockRouter, names: list[str], expected: bool) -> None:
    pr._state.clear()
    route = storage.post(f"{BASE}/storage/v1/object/list/ops-private").mock(
        return_value=httpx.Response(200, json=[{"name": n} for n in names]))
    assert pr.due(store(), NOW) is expected
    assert json.loads(route.calls[0].request.content)["prefix"] == "pit-report-"


def test_failed_build_backs_off_in_process(storage: respx.MockRouter, monkeypatch: pytest.MonkeyPatch) -> None:
    pr._state.clear()
    storage.post(f"{BASE}/storage/v1/object/list/ops-private").mock(return_value=httpx.Response(200, json=[]))
    monkeypatch.setattr(pr, "collect", lambda s, n: (_ for _ in ()).throw(RuntimeError("boom")))
    with pytest.raises(RuntimeError):
        pr.run_weekly(store(), NOW)
    assert pr.run_weekly(store(), NOW) is None
    pr._state.clear()


def test_worker_swallows_a_pit_report_failure(monkeypatch: pytest.MonkeyPatch) -> None:
    for mod, fn in ((worker.outreach_writer, "due"), (worker.mission_control, "run_daily"),
                    (worker.notify, "send_brief"), (worker.strategist, "run_weekly"), (worker.notify, "check_alerts")):
        monkeypatch.setattr(mod, fn, lambda *a, **k: False)
    called: list[bool] = []

    def boom(store: Any) -> None:
        called.append(True)
        raise RuntimeError("render failed")

    monkeypatch.setattr(worker.pit_report, "run_weekly", boom)
    worker.crew_pass(object(), check_due=True)  # type: ignore[arg-type]
    assert called == [True]
    called.clear()
    worker.crew_pass(object(), check_due=False)  # type: ignore[arg-type]
    assert called == []
