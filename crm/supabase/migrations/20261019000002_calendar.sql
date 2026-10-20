-- Shared team calendar. Meetings and calls live here; the calendar page also overlays lead follow-ups
-- (leads.follow_up_on) and tasks due (tasks.due_date) so one view shows everything with a date.
-- outlook_event_id is set once the event is mirrored to the shared Outlook calendar.

create table public.calendar_events (
  id uuid primary key default gen_random_uuid(),
  title text not null check (length(title) between 1 and 200),
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  all_day boolean not null default false,
  location text not null default '',
  notes text not null default '',
  lead_id uuid references public.leads (id) on delete set null,
  created_by text not null,
  outlook_event_id text,
  created_at timestamptz not null default now(),
  check (ends_at >= starts_at)
);

create index calendar_events_starts_idx on public.calendar_events (starts_at);
create index calendar_events_lead_idx on public.calendar_events (lead_id) where lead_id is not null;

alter table public.calendar_events enable row level security;
create policy "crm team full access" on public.calendar_events for all to authenticated
  using ((select public.is_crm_user())) with check ((select public.is_crm_user()));
