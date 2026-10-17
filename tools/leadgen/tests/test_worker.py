from __future__ import annotations

from typing import Any

import pytest

from leadgen import worker
from leadgen.config import Config
from leadgen.pipeline import RunCancelled, RunSummary


class FakeStore:
    def __init__(self, job: dict[str, Any] | None, status: str = "running") -> None:
        self.job = job
        self.status = status
        self.stages: list[str] = []

    def claim_run(self) -> dict[str, Any] | None:
        job, self.job = self.job, None
        return job

    def run_status(self, run_id: str) -> str:
        return self.status

    def set_stage(self, run_id: str, stage: str) -> None:
        self.stages.append(stage)


def test_params_are_validated_against_config(cfg: Config) -> None:
    state = next(iter(cfg.states))
    segment = next(iter(cfg.segments))
    opts = worker.options_from_params(
        {"states": [state, "ZZ", 7], "segments": [segment, "nope"], "max_queries": 10_000, "limit": -3}, cfg
    )
    assert opts.states == [state]
    assert opts.segments == [segment]
    assert opts.max_queries == worker.MAX_QUERIES_CAP
    assert opts.limit is None


def test_empty_or_bad_params_fall_back_to_config_defaults(cfg: Config) -> None:
    opts = worker.options_from_params({"states": "FL", "max_queries": True}, cfg)
    assert opts.states is None and opts.max_queries is None


def test_empty_queue_returns_false(cfg: Config) -> None:
    assert worker.process_one(cfg, FakeStore(None)) is False  # type: ignore[arg-type]


def test_claimed_job_runs_with_its_id_and_reports_stages(cfg: Config, monkeypatch: pytest.MonkeyPatch) -> None:
    seen: dict[str, Any] = {}

    async def fake_run(cfg, opts, run_id=None, progress=None):  # noqa: ANN001
        seen["run_id"] = run_id
        progress("searching")
        return RunSummary(run_dir=cfg.out_path())

    monkeypatch.setattr(worker, "run", fake_run)
    store = FakeStore({"id": "abc", "params": {"max_queries": 5}})
    assert worker.process_one(cfg, store) is True  # type: ignore[arg-type]
    assert seen["run_id"] == "abc"
    assert store.stages == ["searching"]


def test_cancelled_run_stops_at_next_stage(cfg: Config) -> None:
    report = worker._progress(FakeStore(None, status="cancelled"), "abc")  # type: ignore[arg-type]
    with pytest.raises(RunCancelled):
        report("scoring")


def test_require_param_only_accepts_known_contact_fields(cfg: Config) -> None:
    assert worker.options_from_params({"require": ["email", "fax"]}, cfg).require == ["email"]
