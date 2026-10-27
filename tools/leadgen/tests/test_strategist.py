from __future__ import annotations

from datetime import UTC, datetime, timedelta
from typing import Any

from test_guardian import FakeRest, rest  # noqa: F401  (fixture)
from test_mission_control import FakeWriter

from leadgen import strategist

NOW = datetime(2026, 10, 27, 15, 0, tzinfo=UTC)


def leads_and_mail(contacted: dict[str, int], replied: dict[str, int]) -> dict[str, list[dict[str, Any]]]:
    leads, msgs = [], []
    for seg, n in contacted.items():
        for i in range(n):
            lid = f"{seg}-{i}"
            leads.append({"id": lid, "email": f"{lid}@x.com", "score": 60, "segment": seg, "status": "contacted",
                          "source": "lead-gen", "signals": {}, "run_id": "R", "created_at": "2026-10-01"})
            msgs.append({"lead_id": lid, "direction": "out", "status": "sent", "subject": "Hello"})
            if i < replied.get(seg, 0):
                msgs.append({"lead_id": lid, "direction": "in", "status": "received", "subject": "Re: Hello"})
                msgs.append({"lead_id": lid, "direction": "in", "status": "received", "subject": "Automatic reply: away"})
    # Not a prospect (our own test lead): never counted.
    leads.append({"id": "test", "segment": "race_prep", "source": "manual", "email": "e2e@x.com"})
    msgs.append({"lead_id": "test", "direction": "in", "status": "received", "subject": "Re: Hello"})
    return {"leads": leads, "email_messages": msgs, "calendar_events": [{"lead_id": "track_day-0"}]}


def test_insufficient_data_makes_no_llm_call(rest: FakeRest) -> None:  # noqa: F811
    rest.tables.update(leads_and_mail({"race_prep": 20, "track_day": 12}, {}))
    writer = FakeWriter(error=AssertionError("must not be called"))
    decision = strategist.run_weekly(rest.store(), now=NOW, writer=writer)
    assert decision == "insufficient data: n=32, replies=0; keep sending"
    assert writer.calls == 0
    [run] = rest.runs("strategist")
    assert run["status"] == "done" and run["decision"] == decision
    assert run["evidence"]["segments"]["race_prep"]["contacted"] == 20
    assert run["evidence"]["segments"]["track_day"]["meetings"] == 1


def test_enough_data_gets_one_proposal_call(rest: FakeRest) -> None:  # noqa: F811
    rest.tables.update(leads_and_mail({"race_prep": 40, "track_day": 20}, {"race_prep": 2, "track_day": 4}))
    writer = FakeWriter("Aim more at track_day: 4/20 replied vs 2/40. Do it quickly.")
    decision = strategist.run_weekly(rest.store(), now=NOW, writer=writer)
    assert writer.calls == 1
    assert decision == "Proposals (not applied): Aim more at track_day: 4/20 replied vs 2/40."
    ev = rest.runs("strategist")[0]["evidence"]
    assert (ev["contacted"], ev["replies"]) == (60, 6)
    assert ev["segments"]["track_day"]["reply_rate"] == 0.2
    assert ev["time_words_removed"] == ["Do it quickly."]


def test_runs_at_most_once_per_seven_days(rest: FakeRest) -> None:  # noqa: F811
    rest.tables.update(leads_and_mail({"race_prep": 1}, {}))
    rest.tables["agent_runs"].append({"id": "s", "agent": "strategist", "status": "done", "started_at": (NOW - timedelta(days=6)).isoformat()})
    assert strategist.run_weekly(rest.store(), now=NOW, use_default_writer=False) is None
    rest.tables["agent_runs"][0]["started_at"] = (NOW - timedelta(days=7, minutes=1)).isoformat()
    assert strategist.run_weekly(rest.store(), now=NOW, use_default_writer=False) is not None


def test_a_failed_or_stuck_review_does_not_hold_off_the_next(rest: FakeRest) -> None:  # noqa: F811
    rest.tables.update(leads_and_mail({"race_prep": 1}, {}))
    rest.tables["agent_runs"] += [
        {"id": "f", "agent": "strategist", "status": "failed", "started_at": (NOW - timedelta(days=1)).isoformat()},
        {"id": "r", "agent": "strategist", "status": "running", "started_at": (NOW - timedelta(days=2)).isoformat()},
    ]
    assert strategist.due(rest.store(), NOW) is True
