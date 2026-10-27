-- The worker (tools/leadgen on Railway) checks in here after every automation pass, so Agent Ops
-- can tell "running and idle" from "stopped". One row per loop; the worker writes with the
-- service-role key, the CRM team only reads.

create table public.worker_heartbeats (
  name text primary key,
  beat_at timestamptz not null default now(),
  detail jsonb not null default '{}'::jsonb
);

alter table public.worker_heartbeats enable row level security;
create policy "crm team reads" on public.worker_heartbeats for select to authenticated
  using ((select public.is_crm_user()));
