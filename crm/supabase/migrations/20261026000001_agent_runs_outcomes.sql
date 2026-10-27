-- Agent ecosystem state: every agent decision logged, every outreach outcome
-- recorded per cohort, plus a system flag the Guardian can set to halt outbound.

create table public.agent_runs (
  id uuid primary key default gen_random_uuid(),
  agent text not null,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  status text not null default 'running'
    check (status in ('running', 'done', 'failed', 'halted')),
  decision text not null default '',
  evidence jsonb not null default '{}'::jsonb,
  error text
);
create index agent_runs_agent_started on public.agent_runs (agent, started_at desc);

create table public.outcomes (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid references public.leads(id) on delete set null,
  cohort text not null default '',
  event text not null
    check (event in ('sent','replied','positive_reply','meeting','proposal','closed_won','closed_lost','opt_out','bounced')),
  occurred_at timestamptz not null default now(),
  meta jsonb not null default '{}'::jsonb
);
create index outcomes_cohort_event on public.outcomes (cohort, event, occurred_at desc);
create index outcomes_lead on public.outcomes (lead_id);

create table public.system_flags (
  key text primary key,
  value jsonb not null default 'false'::jsonb,
  updated_at timestamptz not null default now(),
  updated_by text not null default ''
);
insert into public.system_flags (key) values ('outbound_halt');

do $$
declare t text;
begin
  foreach t in array array['agent_runs', 'outcomes', 'system_flags'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format(
      'create policy "crm team full access" on public.%I for all to authenticated using ((select public.is_crm_user())) with check ((select public.is_crm_user()))', t
    );
  end loop;
end $$;
