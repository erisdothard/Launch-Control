from __future__ import annotations

from datetime import UTC, datetime, timedelta
from typing import Any

import pytest
from test_guardian import FakeRest, rest  # noqa: F401  (fixture)

from leadgen import mission_control, worker
from leadgen.config import Config
from leadgen.pipeline import RunSummary

MORNING = datetime(2026, 10, 27, 14, 0, tzinfo=UTC)  # 09:00 Chicago
EARLY = datetime(2026, 10, 27, 11, 0, tzinfo=UTC)  # 06:00 Chicago


class FakeWriter:
    def __init__(self, text: str = "", error: Exception | None = None) -> None:
        self.text, self.error, self.calls = text, error, 0

    def write(self, system: str, prompt: str) -> str:
        self.calls += 1
        if self.error:
            raise self.error
        return self.text


def seed(rest: FakeRest, **extra: list[dict[str, Any]]) -> None:  # noqa: F811
    lead = {"id": "L1", "email": "a@shop.com", "score": 70, "segment": "race_prep", "status": "contacted",
            "source": "lead-gen", "signals": {"pages_crawled": 3}, "run_id": "R1", "created_at": "2026-10-20T00:00:00+00:00"}
    rest.tables.update({
        "leads": [lead],
        "lead_gen_runs": [{"found": 120, "kept": 50, "status": "completed"}],
        "email_messages": [{"lead_id": "L1", "direction": "out", "status": "sent", "subject": "Hi",
                            "created_at": (MORNING - timedelta(hours=2)).isoformat()}],
        "calendar_events": [],
        "email_drafts": [{"id": "d1", "kind": "follow_up", "status": "pending"}],
        "email_campaigns": [{"id": "c1", "name": "Batch 3", "status": "draft"}],
        "worker_heartbeats": [
            {"name": "automation", "beat_at": (MORNING - timedelta(seconds=200)).isoformat(), "detail": {"every_s": 300}},
            {"name": "gmail", "beat_at": (MORNING - timedelta(seconds=5000)).isoformat(), "detail": {}},
        ],
    })
    rest.tables.update(extra)


def test_not_due_before_seven_team_time(rest: FakeRest) -> None:  # noqa: F811
    seed(rest)
    assert mission_control.run_daily(rest.store(), now=EARLY, use_default_writer=False) is None
    assert rest.runs("mission-control") == []


def test_not_due_twice_on_the_same_team_date(rest: FakeRest) -> None:  # noqa: F811
    seed(rest)
    rest.tables["agent_runs"].append({"id": "x", "agent": "mission-control", "status": "done",
                                      "started_at": (MORNING - timedelta(hours=1)).isoformat()})
    assert mission_control.run_daily(rest.store(), now=MORNING, use_default_writer=False) is None


def test_due_when_the_last_brief_was_yesterday(rest: FakeRest) -> None:  # noqa: F811
    seed(rest)
    rest.tables["agent_runs"].append({"id": "x", "agent": "mission-control", "status": "done",
                                      "started_at": (MORNING - timedelta(hours=20)).isoformat()})
    assert mission_control.due(rest.store(), MORNING) is True


def test_deterministic_brief_without_a_key(rest: FakeRest, monkeypatch: pytest.MonkeyPatch) -> None:  # noqa: F811
    monkeypatch.delenv("ANTHROPIC_API_KEY", raising=False)
    seed(rest)
    rest.tables["agent_runs"].append({"id": "g", "agent": "guardian", "status": "done", "started_at": MORNING.isoformat(),
                                      "decision": "Outbound may proceed."})
    brief = mission_control.run_daily(rest.store(), now=MORNING)
    assert brief is not None
    [run] = rest.runs("mission-control")
    assert run["status"] == "done" and run["decision"] == brief
    assert "Latest window: 1 emails sent to 1 prospects, 0 prospect replies" in brief
    assert "Decision: Review what is waiting for approval: 1 campaign draft(s) and 1 email draft(s)." in brief
    assert mission_control.TIME_WORDS.search(brief) is None
    ev = run["evidence"]
    assert ev["brief"]["writer"] == "deterministic"
    assert ev["totals"]["kept"] == 1 and ev["latest_window"]["sent"] == 1
    assert ev["approvals"] == {"drafts_pending": 1, "drafts_by_kind": {"follow_up": 1}, "campaign_drafts": 1}
    assert {h["name"]: h["stale"] for h in ev["heartbeats"]} == {"automation": False, "gmail": True}
    assert ev["outbound_halted"] is False


def test_halt_is_the_one_decision(rest: FakeRest) -> None:  # noqa: F811
    seed(rest)
    rest.tables["system_flags"][0]["value"] = True
    brief = mission_control.run_daily(rest.store(), now=MORNING, use_default_writer=False)
    assert brief is not None and "Decision: Outbound is halted" in brief


def test_llm_brief_drops_time_words_and_flags_them(rest: FakeRest) -> None:  # noqa: F811
    seed(rest)
    writer = FakeWriter("One email went out. The crew saved you 3 hours. Decision: review Batch 3.")
    brief = mission_control.run_daily(rest.store(), now=MORNING, writer=writer)
    assert writer.calls == 1
    assert brief == "One email went out. Decision: review Batch 3."
    notes = rest.runs("mission-control")[0]["evidence"]["brief"]
    assert notes["writer"] == "claude-sonnet-5-5"
    assert notes["time_words_removed"] == ["The crew saved you 3 hours."]


def test_llm_failure_falls_back_to_the_deterministic_brief(rest: FakeRest) -> None:  # noqa: F811
    seed(rest)
    brief = mission_control.run_daily(rest.store(), now=MORNING, writer=FakeWriter(error=RuntimeError("overloaded")))
    assert brief is not None and brief.startswith("Latest window:")
    assert rest.runs("mission-control")[0]["evidence"]["brief"]["reason"] == "llm error: RuntimeError"


def test_scrub_keeps_clean_lines() -> None:
    clean, removed = mission_control.scrub_time_words("Sent 4.\nDone overnight.\nDecision: none.")
    assert clean == "Sent 4.\nDecision: none." and removed == ["Done overnight."]


# --- worker scheduling ---------------------------------------------------------------------------

def test_crew_pass_survives_every_agent_failing(monkeypatch: pytest.MonkeyPatch) -> None:
    calls: list[str] = []

    def boom(name: str, exc: Exception):  # noqa: ANN202
        def f(*_: Any, **__: Any) -> None:
            calls.append(name)
            raise exc
        return f

    monkeypatch.setattr(worker.outreach_writer, "run_once", boom("writer", NotImplementedError()))
    monkeypatch.setattr(worker.mission_control, "run_daily", boom("mission", RuntimeError("x")))
    monkeypatch.setattr(worker.strategist, "run_weekly", boom("strategist", ValueError("y")))
    worker.crew_pass(object(), check_due=True)  # type: ignore[arg-type]
    assert calls == ["writer", "mission", "strategist"]
    calls.clear()
    worker.crew_pass(object(), check_due=False)  # type: ignore[arg-type]
    assert calls == ["writer"]


class QueueStore:
    def __init__(self, job: dict[str, Any] | None) -> None:
        self.job = job

    def claim_run(self) -> dict[str, Any] | None:
        job, self.job = self.job, None
        return job

    def run_status(self, run_id: str) -> str:
        return "running"

    def set_stage(self, run_id: str, stage: str) -> None:
        pass


def test_prospector_checks_a_finished_run_and_its_failure_is_contained(cfg: Config, monkeypatch: pytest.MonkeyPatch) -> None:
    seen: list[str] = []

    async def fake_run(cfg, opts, run_id=None, progress=None):  # noqa: ANN001
        return RunSummary(run_dir=cfg.out_path())

    def after_run(store: Any, run_id: str) -> None:
        seen.append(run_id)
        raise NotImplementedError

    monkeypatch.setattr(worker, "run", fake_run)
    monkeypatch.setattr(worker.prospector, "after_run", after_run)
    assert worker.process_one(cfg, QueueStore({"id": "R9", "params": {}})) is True  # type: ignore[arg-type]
    assert seen == ["R9"]


def test_prospector_is_not_called_for_a_failed_run(cfg: Config, monkeypatch: pytest.MonkeyPatch) -> None:
    async def failing(cfg, opts, run_id=None, progress=None):  # noqa: ANN001
        raise RuntimeError("discover failed")

    monkeypatch.setattr(worker, "run", failing)
    monkeypatch.setattr(worker.prospector, "after_run", lambda *a: pytest.fail("called"))
    assert worker.process_one(cfg, QueueStore({"id": "R9", "params": {}})) is True  # type: ignore[arg-type]
