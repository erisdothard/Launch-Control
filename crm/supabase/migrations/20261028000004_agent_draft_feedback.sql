-- What a person did with each Outreach Writer draft, so the writer learns from it
-- (tools/leadgen/leadgen/draft_feedback.py). One row per lead + campaign: the text the agent
-- wrote, the text that actually went out, and the outcome.
--
-- campaign_id has no foreign key on purpose: deleting a draft in Campaigns removes the
-- email_campaigns row (and cascades its recipients), and that deletion IS the 'removed' signal,
-- so the feedback row must outlive it. A deleted lead takes its feedback with it.
--
-- outcome:
--   pending      waiting on a person (draft, scheduled, sending or paused)
--   sent_as_is   sent (or approved and the send failed) with the agent's text, whitespace aside
--   sent_edited  sent after a person changed the subject or body
--   removed      taken off the list, the draft deleted, or the campaign cancelled
--   skipped      held back by a rule (opted out, recently contacted, do not contact); not a
--                judgment on the copy, never used as an example
--
-- Written by the worker (service role, which bypasses RLS) only. CRM users can read it.

create table if not exists public.agent_draft_feedback (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null,
  lead_id uuid not null references public.leads (id) on delete cascade,
  original_subject text not null,
  original_body text not null,
  fact text,                                  -- the observed fact the draft opened on (null when backfilled)
  final_subject text,
  final_body text,
  outcome text not null default 'pending'
    check (outcome in ('pending', 'sent_as_is', 'sent_edited', 'removed', 'skipped')),
  detail text,                                -- why, in a few words ("campaign deleted", "sent", ...)
  created_at timestamptz not null default now(),
  resolved_at timestamptz,
  unique (campaign_id, lead_id)
);

create index if not exists agent_draft_feedback_pending_idx
  on public.agent_draft_feedback (campaign_id) where outcome = 'pending';
create index if not exists agent_draft_feedback_resolved_idx
  on public.agent_draft_feedback (resolved_at desc) where outcome <> 'pending';

alter table public.agent_draft_feedback enable row level security;

drop policy if exists "crm team read" on public.agent_draft_feedback;
create policy "crm team read" on public.agent_draft_feedback
  for select to authenticated using ((select public.is_crm_user()));
