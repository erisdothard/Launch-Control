# Agents: from prompt files to a running crew

Source: three read-only audits on 2026-10-27 (CRM side, lead-gen side, runtime). See WHY.md for the reason.

## What the audits found

- None of the five agents can complete a pass. `agent_runs` / `outcomes` / `system_flags` are not applied (404).
- **Guardian's halt is cosmetic:** no send path reads a halt flag. Its caps are wrong (real: 400/mailbox/24h in
  `crm/src/lib/email/send.ts:77`, 25 auto follow-ups in `automation_settings`). Late bounces are never detected.
- **The footer is off.** `SHOW_UNSUBSCRIBE_FOOTER = false` (`unsubscribe.ts:15`) and
  `company_info.address` is empty, so the opt-out and postal address need adding to every send.
- **Outreach Writer:** first emails can't go in `email_drafts` (kind is reply/follow_up only). The right path is
  `email_campaigns` (draft) + `campaign_recipients.body_override`. Follow-up and reply drafts already exist in
  `automation.py`. `demo.golaunchcontrol.com` returns 404. `outreach_hook` text contains "faster".
- **Prospector:** wrong usable-rate. The correct rule is site crawled AND email AND score >= 55 (matches Max: 31/32
  contacted, 1/13 lost). 50 leads were scored blind and nothing excludes them.
- **Strategist:** there's no freight cohort, no template tracking, and 0 prospect replies (the 3 inbound messages are our test lead). The only honest output is "insufficient data".
- **Runtime:** a stale worker on Eris's Mac (`com.launchcontrol.worker`, code from the deleted ~/Launch-Control path)
  has dead threads and 505 x 401 on send-campaigns. A live heartbeat comes from elsewhere (probably Railway, unconfirmed).

## Design

Plain code wherever the job is arithmetic. The LLM only where judgment is needed. Everything runs in the existing
Railway worker, and every pass writes an `agent_runs` row. One shared `metrics` module holds the single
definition of usable-rate, real replies (excluding test leads and auto-replies), sends and meetings, so the
Prospector, Mission Control, Strategist and the board can't disagree.

| Agent | Runtime | LLM |
|---|---|---|
| Guardian | worker job before every send pass; sets `outbound_halt`; CRM `sendEmail` + automation refuse while set | none |
| Mission Control | daily job: metrics + worker health + pending approvals | one call writes the brief |
| Outreach Writer | first-touch drafts as campaign drafts for human approval; follow-ups stay in automation.py | per draft |
| Prospector | quality gate after every run; blind-scored leads excluded; diagnosis session only when usable < 70% | only when quality drops |
| Strategist | weekly; refuses conclusions below n=50 | weekly, proposals only |

## Phases

0. **Safety.** Apply the migration (fix the duplicate `20261027000001` prefix). Halt check in `send.ts` and
   `automation.py`. CAN-SPAM footer on every send. Confirm Railway, then retire the Mac worker.
1. **Foundation.** `tools/leadgen/leadgen/metrics.py` + an `agent_runs` logging helper. Rewrite the five
   `.claude/agents/*.md` files against the real schema.
2. **Parallel builders, one owner per file set:** Guardian + Mission Control (worker). Outreach Writer first-touch
   + `outcomes` writes on send/inbound (automation). Prospector gate + blind-score exclusion (leadgen pipeline).
   Halt + footer (CRM).
3. **Review**, then tests against the demo schema. Nothing sends during testing.
4. **Board:** `/admin/ops` reads `agent_runs` + metrics live. The garage video stays as the backdrop.

## Ownership (2026-10-27)

- Lead quality (prospector.py, filters, prompt, discover, crawl, config.yaml, prospector-review workflow):
  session launch-control-56, at Eris's request. It keeps the `after_run(store, run_id)` contract and logs to agent_runs.
- Worker agents (guardian, mission_control, strategist, worker.py, campaigns.py): builder A.
- Outreach Writer first-touch (outreach_writer.py): builder B.
- CRM (halt in send paths, outcomes trigger, /admin/ops crew board): builder C.

## Needs Eris

- Approve or drop the first-email drafts in Campaigns.
- One GitHub token so the Prospector can ask for a code review on its own (optional).
