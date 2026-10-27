-- Agent tables are written by the worker (service role) and the outcomes triggers only.
-- CRM users can read them; the one human write is the owner clearing the Guardian's halt
-- (crm/src/app/(admin)/admin/ops/actions.ts), so the database enforces that too.

drop policy if exists "crm team full access" on public.agent_runs;
drop policy if exists "crm team full access" on public.outcomes;
drop policy if exists "crm team full access" on public.system_flags;

create policy "crm team read" on public.agent_runs
  for select to authenticated using ((select public.is_crm_user()));
create policy "crm team read" on public.outcomes
  for select to authenticated using ((select public.is_crm_user()));
create policy "crm team read" on public.system_flags
  for select to authenticated using ((select public.is_crm_user()));

create policy "owner clears halt" on public.system_flags
  for update to authenticated
  using (key = 'outbound_halt' and (select auth.jwt() ->> 'email') = 'eris@golaunchcontrol.com')
  with check (key = 'outbound_halt' and value = 'false'::jsonb
              and (select auth.jwt() ->> 'email') = 'eris@golaunchcontrol.com');
