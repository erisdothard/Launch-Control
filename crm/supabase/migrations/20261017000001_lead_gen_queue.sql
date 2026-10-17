-- Lead-gen runs become a job queue: the CRM inserts a 'queued' row with Max's choices in
-- `params`, the worker (tools/leadgen, `leadgen worker`, on Railway) claims it, reports its
-- `stage`, and finishes it. The CRM can cancel a queued or running job; the worker checks
-- between stages and stops.
alter table public.lead_gen_runs drop constraint lead_gen_runs_status_check;
alter table public.lead_gen_runs add constraint lead_gen_runs_status_check
  check (status in ('queued', 'running', 'completed', 'failed', 'cancelled'));

alter table public.lead_gen_runs
  add column params jsonb not null default '{}'::jsonb,
  add column requested_by text,
  add column stage text,
  add column claimed_at timestamptz;

-- At most one job waiting or running at a time; a second click is refused by the database.
create unique index lead_gen_runs_one_active on public.lead_gen_runs ((true))
  where status in ('queued', 'running');

-- The worker's atomic claim: oldest queued job -> running. Service role only.
create or replace function public.claim_lead_gen_run()
returns setof public.lead_gen_runs
language sql
security definer
set search_path = ''
as $$
  update public.lead_gen_runs
  set status = 'running', claimed_at = now(), stage = 'starting'
  where id = (
    select id from public.lead_gen_runs
    where status = 'queued'
    order by started_at
    limit 1
    for update skip locked
  )
  returning *;
$$;

revoke all on function public.claim_lead_gen_run() from public, anon, authenticated;
grant execute on function public.claim_lead_gen_run() to service_role;
