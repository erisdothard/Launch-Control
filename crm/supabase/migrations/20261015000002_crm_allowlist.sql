-- Supabase allows public email sign-up by default, so "authenticated" alone
-- would let anyone who signs up read the CRM. Gate every table on an
-- allowlist of team emails instead. Add a teammate:
--   insert into public.crm_users (email) values ('name@example.com');
create table public.crm_users (
  email text primary key check (email = lower(email)),
  created_at timestamptz not null default now()
);
alter table public.crm_users enable row level security;
-- No policies: only the service role / SQL editor can read or change it.

insert into public.crm_users (email) values ('erisdothard1@gmail.com'), ('hartmann.motorsports@gmail.com');

create or replace function public.is_crm_user()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.crm_users
    where email = lower(coalesce(auth.jwt() ->> 'email', ''))
  );
$$;

revoke all on function public.is_crm_user() from public, anon;
grant execute on function public.is_crm_user() to authenticated;

do $$
declare t text;
begin
  foreach t in array array['lead_gen_runs', 'leads', 'customers', 'deals', 'tasks', 'activity_log', 'company_info'] loop
    execute format('drop policy "authenticated full access" on public.%I', t);
    execute format(
      'create policy "crm team full access" on public.%I for all to authenticated using ((select public.is_crm_user())) with check ((select public.is_crm_user()))', t
    );
  end loop;
end $$;
