-- Follow-ups and contact tracking on leads (Max's "This Week" list, 2026-10-18).
--   next_action / follow_up_on: what to do next on a lead and when.
--   last_contacted_at: stamped by the trigger below whenever the team sends an email from the CRM,
--   so "who has / hasn't been contacted" never depends on someone remembering to change the status.

alter table public.leads
  add column next_action text not null default '',
  add column follow_up_on date,
  add column last_contacted_at timestamptz;

create index leads_follow_up_idx on public.leads (follow_up_on) where follow_up_on is not null;
create index leads_email_lower_idx on public.leads (lower(email)) where email <> '';

create or replace function public.stamp_lead_contacted()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.direction = 'out' and new.status = 'sent' then
    update public.leads
      set last_contacted_at = greatest(coalesce(last_contacted_at, new.created_at), new.created_at),
          status = case when status = 'new' then 'contacted' else status end
      where id = new.lead_id;
  end if;
  return new;
end $$;

create trigger email_messages_stamp_contacted
  after insert on public.email_messages
  for each row execute function public.stamp_lead_contacted();

update public.leads l
  set last_contacted_at = m.last_out
  from (
    select lead_id, max(created_at) as last_out
    from public.email_messages
    where direction = 'out' and status = 'sent'
    group by lead_id
  ) m
  where m.lead_id = l.id;
