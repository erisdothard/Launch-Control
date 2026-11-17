-- Limits for an AI connected to the CRM (ChatGPT through the CRM's MCP connection, 2026-11-17).
-- Its access token comes from Supabase's OAuth server and carries a client_id claim; a person's own
-- CRM session does not. The existing "crm team full access" policies still decide who gets in;
-- these RESTRICTIVE policies add, for AI tokens only: no writes anywhere except
--   * leads: update (notes, follow-up date, next step)
--   * activity_log: insert (the CRM logs each change)
--   * email_drafts: insert or update a 'reply' draft. Never a 'follow_up' draft, which automation
--     can send on its own, and never delete.
-- Reads are unchanged. Service-role and normal sessions have no client_id, so nothing else changes.

create or replace function public.is_ai_client()
 returns boolean
 language sql
 stable
 set search_path to ''
as $$ select coalesce(auth.jwt() ->> 'client_id', '') <> '' $$;

do $$
declare
  t text;
begin
  for t in
    select tablename from pg_tables where schemaname = 'public' and rowsecurity
  loop
    execute format('drop policy if exists "no ai insert" on public.%I', t);
    execute format('drop policy if exists "no ai update" on public.%I', t);
    execute format('drop policy if exists "no ai delete" on public.%I', t);

    if t not in ('activity_log', 'email_drafts') then
      execute format('create policy "no ai insert" on public.%I as restrictive for insert to authenticated with check (not public.is_ai_client())', t);
    end if;
    if t not in ('leads', 'email_drafts') then
      execute format('create policy "no ai update" on public.%I as restrictive for update to authenticated using (not public.is_ai_client())', t);
    end if;
    execute format('create policy "no ai delete" on public.%I as restrictive for delete to authenticated using (not public.is_ai_client())', t);
  end loop;
end $$;

create policy "no ai insert" on public.email_drafts as restrictive for insert to authenticated
  with check (not public.is_ai_client() or kind = 'reply');
create policy "no ai update" on public.email_drafts as restrictive for update to authenticated
  using (not public.is_ai_client() or kind = 'reply')
  with check (not public.is_ai_client() or kind = 'reply');
