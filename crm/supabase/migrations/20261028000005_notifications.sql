-- Internal notices the worker emails Eris (tools/leadgen/leadgen/notify.py): the daily brief, an
-- outbound halt, a real prospect reply. One row per notice, keyed so a notice is never sent twice
-- across worker restarts: 'brief:<agent_runs id>', 'halt:<system_flags.updated_at>',
-- 'reply:<email_messages id>'. The worker inserts the key before sending (a unique conflict means
-- it was already handled), then marks it sent, or failed for a bounded retry.
-- 'watermark:reply' is a single seed row: replies received before its created_at are never alerted.
-- Holds keys and status only, never message content.

create table public.sent_notices (
  key text primary key,
  kind text not null check (kind in ('brief', 'halt', 'reply', 'watermark')),
  status text not null default 'pending' check (status in ('pending', 'sent', 'failed')),
  attempts integer not null default 0 check (attempts >= 0),
  last_error text,
  created_at timestamptz not null default now(),
  sent_at timestamptz,
  updated_at timestamptz not null default now()
);
create index sent_notices_kind_created on public.sent_notices (kind, created_at desc);

-- Written by the worker only (service role bypasses RLS); CRM users can read it, like agent_runs.
alter table public.sent_notices enable row level security;
create policy "crm team read" on public.sent_notices
  for select to authenticated using ((select public.is_crm_user()));
