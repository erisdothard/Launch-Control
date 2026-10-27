# Agent ecosystem

Runtime: Claude Code. Agents are subagent definitions in `.claude/agents/`; state is Supabase; the CRM's DB triggers own all status moves. Rules: agents never call each other directly (Mission Control dispatches), one writer per concern, everything irreversible (sends, weight changes) passes Eris, every decision logged to `agent_runs`.

| Agent | Owns | Never |
|---|---|---|
| mission-control | dispatch, daily brief | sending, bypassing halts |
| guardian | halt flag, compliance checks | drafting |
| prospector | lead_gen_runs, discovery config | score weights, lead status, email |
| outreach-writer | campaign drafts | sending, stripping compliance footer |
| strategist | proposals (weights, messaging, cohort verdicts) | applying its own changes |
| sender/inbox/scheduler | BUILT: tools/leadgen automation.py + CRM | — |
| Eris | closing calls, approvals, clearing halts | — |

Runtime (2026-10-27): each agent is code in the Railway worker (tools/leadgen/leadgen/{guardian,mission_control,prospector,outreach_writer,strategist}.py), logging to agent_runs. The .claude/agents files are the on-demand versions and describe the same rules. Metrics are defined once in leadgen/metrics.py (TS twin: crm/src/lib/agents/metrics.ts). The motorsport-vs-freight A/B is dropped until a freight list exists. See WHY.md, PLAN.md, CONVENTIONS.md.
