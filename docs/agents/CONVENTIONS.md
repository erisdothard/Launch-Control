# Agent build conventions

- Read WHY.md and PLAN.md first.
- Every agent pass: `with agent_log.agent_run(store, "<agent>") as run:` then set run.decision / run.evidence / run.status.
- Every number comes from `leadgen/metrics.py`. Never redefine usable-rate, replies, sends.
- Anything that sends checks `agent_log.outbound_halted(store)` first and fails closed.
- Agents never call each other; the worker schedules them. Nothing irreversible without a person:
  agents draft and propose, they never send, never change score weights, never clear a halt.
- LLM: Anthropic SDK, model `claude-sonnet-5-5` (same as automation.py), only where judgment is needed.
- No time or speed words in any generated copy ("faster", "hours", "quick", "overnight"...).
- Python style: match automation.py (module docstring explaining the job, dataclasses, `log = logging.getLogger`).
- Tests: pytest + respx in tools/leadgen/tests, `uv run pytest`. Never send email or write to the live database in tests.
