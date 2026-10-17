-- Launch Control CRM core: the essentials kept from the Hyper Racer CRM
-- (leads, customers, deals, tasks, activity, company info) plus the prospect
-- fields the lead-gen pipeline (tools/leadgen) writes.

create extension if not exists pgcrypto;

create table public.lead_gen_runs (
  id uuid primary key default gen_random_uuid(),
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  status text not null default 'running' check (status in ('running', 'completed', 'failed')),
  config jsonb not null default '{}'::jsonb,
  found integer not null default 0,
  enriched integer not null default 0,
  kept integer not null default 0,
  excluded integer not null default 0,
  error text
);

create table public.leads (
  id uuid primary key default gen_random_uuid(),
  business_name text not null,
  email text not null default '',
  phone text not null default '',
  status text not null default 'new'
    check (status in ('new', 'contacted', 'qualified', 'proposal', 'negotiation', 'converted', 'lost')),
  source text not null default 'Manual entry',
  notes text not null default '',
  preferred_service text not null default '',
  created_at timestamptz not null default now(),

  -- Prospect fields (written by tools/leadgen, editable in the CRM)
  segment text,
  city text,
  state text,
  website text,
  domain text unique,
  contact_name text,
  contact_title text,
  score integer check (score between 0 and 100),
  score_breakdown jsonb,
  score_reason text,
  outreach_hook text,
  signals jsonb,
  run_id uuid references public.lead_gen_runs (id) on delete set null,
  scored_at timestamptz
);

create index leads_status_idx on public.leads (status);
create index leads_score_idx on public.leads (score desc nulls last);
create index leads_source_idx on public.leads (source);

create table public.customers (
  id uuid primary key default gen_random_uuid(),
  business_name text not null,
  email text not null default '',
  phone text not null default '',
  notes text not null default '',
  from_lead_id uuid references public.leads (id) on delete set null,
  created_at timestamptz not null default now()
);

create table public.deals (
  id uuid primary key default gen_random_uuid(),
  business_name text not null,
  value numeric not null default 0,
  stage text not null default 'inquiry' check (stage in ('inquiry', 'proposal', 'negotiation', 'won', 'lost')),
  notes text not null default '',
  from_lead_id uuid references public.leads (id) on delete set null,
  created_at timestamptz not null default now()
);

create table public.tasks (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  due_date date,
  done boolean not null default false,
  related_type text check (related_type in ('lead', 'deal')),
  related_id uuid,
  related_label text,
  created_at timestamptz not null default now()
);

create table public.activity_log (
  id uuid primary key default gen_random_uuid(),
  entity_type text not null,
  entity_id text not null,
  entity_label text not null,
  action text not null,
  detail text,
  created_at timestamptz not null default now()
);

create index activity_log_created_idx on public.activity_log (created_at desc);

-- Singleton row (id is always true).
create table public.company_info (
  id boolean primary key default true check (id),
  name text not null default 'Launch Control',
  email text not null default '',
  phone text not null default '',
  address text not null default '',
  logo_url text default '/brand/launch-control-mark-light-v1.svg'
);
insert into public.company_info (id) values (true);

-- RLS: any signed-in user (Eris, Max) has full access. The lead-gen CLI uses
-- the service-role key, which bypasses RLS; it never ships to a browser.
do $$
declare t text;
begin
  foreach t in array array['lead_gen_runs', 'leads', 'customers', 'deals', 'tasks', 'activity_log', 'company_info'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format(
      'create policy "authenticated full access" on public.%I for all to authenticated using (true) with check (true)', t
    );
  end loop;
end $$;
