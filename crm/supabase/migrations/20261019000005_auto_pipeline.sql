-- The pipeline moves itself (Eris, 2026-10-19: "it needs to do that automatically").
-- A lead's status is set by what actually happened, recorded wherever it was recorded (the CRM, the
-- Railway worker's Outlook/Gmail sync, the Resend webhook, the calendar, a deal), never by a click:
--   email out        new -> contacted, follow-up due in 3 business days
--   email in         new/contacted -> replied, follow-ups stop, a reply is due today
--                    "unsubscribe" / "remove me" / "stop emailing" -> do not contact, lost
--   meeting booked   new/contacted/replied -> meeting, proposal due the day after
--   deal stage       inquiry/proposal -> proposal, negotiation -> negotiation, won -> converted, lost -> lost
-- "Not a fit" is the one manual move left (lost, with a reason).
-- email_drafts holds what the worker writes for a person to review: replies, and follow-ups when
-- automatic sending is off. automation_settings is the switchboard (sending starts OFF).

-- Statuses: qualified (nothing could detect it) becomes replied and meeting.
update public.leads set status = 'replied' where status = 'qualified';
alter table public.leads drop constraint leads_status_check;
alter table public.leads add constraint leads_status_check
  check (status in ('new', 'contacted', 'replied', 'meeting', 'proposal', 'negotiation', 'converted', 'lost'));

alter table public.leads
  add column status_reason text not null default '',
  add column status_changed_at timestamptz,
  add column do_not_contact boolean not null default false,
  add column follow_up_count integer not null default 0 check (follow_up_count >= 0),
  add column last_reply_at timestamptz;

-- Business days from a date (Mon-Fri), for follow-up due dates.
create or replace function public.add_business_days(d date, n integer)
returns date
language plpgsql
immutable
set search_path = ''
as $$
declare
  out_date date := d;
  added integer := 0;
begin
  while added < n loop
    out_date := out_date + 1;
    if extract(isodow from out_date) < 6 then added := added + 1; end if;
  end loop;
  return out_date;
end $$;

-- The team's local day. Follow-up dates are plain dates in that day (see lib/leads/followUp.ts).
create or replace function public.team_today()
returns date
language sql
stable
set search_path = ''
as $$ select (now() at time zone 'America/Chicago')::date $$;

-- Status changes stamp when and why, whoever made them.
create or replace function public.stamp_lead_status()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.status is distinct from old.status then
    new.status_changed_at := now();
  end if;
  return new;
end $$;

create trigger leads_stamp_status
  before update on public.leads
  for each row execute function public.stamp_lead_status();

create table public.automation_settings (
  id boolean primary key default true check (id),
  -- Off until someone has reviewed a batch: when off, due follow-ups land in Drafts instead.
  auto_send_follow_ups boolean not null default false,
  -- Business days after the last unanswered email, one entry per follow-up.
  follow_up_days integer[] not null default '{3,4,7}',
  -- Days after the last follow-up with no reply before the lead is marked lost (went cold).
  cold_after_days integer not null default 7 check (cold_after_days between 1 and 60),
  daily_send_cap integer not null default 25 check (daily_send_cap between 0 and 200),
  draft_replies boolean not null default true,
  updated_at timestamptz not null default now()
);
insert into public.automation_settings (id) values (true);

alter table public.automation_settings enable row level security;
create policy "crm team full access" on public.automation_settings for all to authenticated
  using ((select public.is_crm_user())) with check ((select public.is_crm_user()));

create table public.email_drafts (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references public.leads (id) on delete cascade,
  kind text not null check (kind in ('reply', 'follow_up')),
  -- The inbound message a reply answers (one draft per message), or the follow-up number.
  reply_to_message_id uuid references public.email_messages (id) on delete cascade,
  follow_up_number integer,
  to_address text not null,
  subject text not null,
  body_text text not null,
  status text not null default 'pending' check (status in ('pending', 'sent', 'discarded', 'failed')),
  error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  sent_at timestamptz,
  sent_by text
);

create unique index email_drafts_reply_once on public.email_drafts (reply_to_message_id) where reply_to_message_id is not null;
create unique index email_drafts_follow_up_once on public.email_drafts (lead_id, follow_up_number) where kind = 'follow_up';
create index email_drafts_pending_idx on public.email_drafts (created_at desc) where status = 'pending';

alter table public.email_drafts enable row level security;
create policy "crm team full access" on public.email_drafts for all to authenticated
  using ((select public.is_crm_user())) with check ((select public.is_crm_user()));

-- Words that mean "stop". Matched against the reply text only (quoted history is stripped upstream).
create or replace function public.is_opt_out(body text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select coalesce(body, '') ~* '(\munsubscribe\M|remove me|take me off|stop (emailing|contacting|sending)|do not (email|contact)|don''t (email|contact)|not interested)'
$$;

-- Email in / out. Replaces the 2026-10-19 contacted-only trigger function (same trigger).
create or replace function public.stamp_lead_contacted()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.lead_id is null then return new; end if;
  perform 1 from public.leads where id = new.lead_id for update;
  if not found then return new; end if;

  if new.direction = 'out' and new.status = 'sent' then
    update public.leads set
      last_contacted_at = greatest(coalesce(last_contacted_at, new.created_at), new.created_at),
      status = case when status = 'new' then 'contacted' else status end,
      status_reason = case when status = 'new' then 'First email sent' else status_reason end,
      -- Still waiting on them: the next nudge is due. Once they have replied, sending is a reply, not a chase.
      follow_up_on = case when status in ('new', 'contacted')
        then public.add_business_days(public.team_today(), 3) else follow_up_on end,
      next_action = case when status in ('new', 'contacted') then 'Follow up if no reply' else next_action end
      where id = new.lead_id;

  elsif new.direction = 'in' then
    if public.is_opt_out(new.body_text) then
      update public.leads set
        do_not_contact = true,
        status = case when status = 'converted' then status else 'lost' end,
        status_reason = 'Asked not to be contacted',
        follow_up_on = null,
        next_action = '',
        last_reply_at = new.created_at
        where id = new.lead_id;
      update public.email_drafts set status = 'discarded', updated_at = now()
        where lead_id = new.lead_id and status = 'pending';
    else
      update public.leads set
        last_reply_at = greatest(coalesce(last_reply_at, new.created_at), new.created_at),
        status = case when status in ('new', 'contacted', 'lost') and not do_not_contact then 'replied' else status end,
        status_reason = case when status in ('new', 'contacted', 'lost') and not do_not_contact then 'They replied' else status_reason end,
        follow_up_count = 0,
        follow_up_on = public.team_today(),
        next_action = 'Reply to them'
        where id = new.lead_id;
      -- A queued chase is moot once they have answered.
      update public.email_drafts set status = 'discarded', updated_at = now()
        where lead_id = new.lead_id and kind = 'follow_up' and status = 'pending';
    end if;
  end if;
  return new;
end $$;

-- Meetings: an event tied to a lead (booked from the lead, or found on the Outlook calendar).
create or replace function public.stamp_lead_meeting()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.lead_id is null then return new; end if;
  if tg_op = 'UPDATE' and old.lead_id is not distinct from new.lead_id and old.starts_at = new.starts_at then
    return new;
  end if;
  update public.leads set
    status = case when status in ('new', 'contacted', 'replied') then 'meeting' else status end,
    status_reason = case when status in ('new', 'contacted', 'replied')
      then 'Meeting ' || to_char(new.starts_at at time zone 'America/Chicago', 'Mon FMDD') else status_reason end,
    follow_up_on = (new.starts_at at time zone 'America/Chicago')::date + 1,
    next_action = 'Send the proposal'
    where id = new.lead_id and status not in ('converted', 'lost');
  return new;
end $$;

create trigger calendar_events_stamp_meeting
  after insert or update of lead_id, starts_at on public.calendar_events
  for each row execute function public.stamp_lead_meeting();

-- Deals carry their lead along: the lead's status follows the deal's stage.
create or replace function public.stamp_lead_from_deal()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.from_lead_id is null then return new; end if;
  if tg_op = 'UPDATE' and old.stage = new.stage and old.from_lead_id is not distinct from new.from_lead_id then
    return new;
  end if;
  update public.leads set
    status = case new.stage when 'negotiation' then 'negotiation' when 'won' then 'converted' when 'lost' then 'lost' else 'proposal' end,
    status_reason = case new.stage
      when 'won' then 'Deal won'
      when 'lost' then 'Deal lost'
      when 'negotiation' then 'Deal in negotiation'
      else 'Deal opened' end,
    follow_up_on = case when new.stage in ('won', 'lost') then null else follow_up_on end,
    next_action = case when new.stage in ('won', 'lost') then '' else next_action end
    where id = new.from_lead_id;
  return new;
end $$;

create trigger deals_stamp_lead
  after insert or update of stage, from_lead_id on public.deals
  for each row execute function public.stamp_lead_from_deal();

-- Backfill what the history already says.
update public.leads l set last_reply_at = m.last_in
  from (select lead_id, max(created_at) as last_in from public.email_messages where direction = 'in' group by lead_id) m
  where m.lead_id = l.id;
update public.leads set status = 'replied', status_reason = 'They replied'
  where status in ('new', 'contacted') and last_reply_at is not null;
update public.leads l set status = 'meeting', status_reason = 'Meeting booked'
  where l.status in ('new', 'contacted', 'replied')
    and exists (select 1 from public.calendar_events e where e.lead_id = l.id);
update public.leads set status_reason = 'First email sent' where status = 'contacted' and status_reason = '';
