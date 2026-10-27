-- Outcomes are recorded by the database, not by app code: every path that writes an email or a
-- meeting (CRM sends, the worker's Outlook sync, campaigns, manual calendar entries) lands here,
-- so no caller can forget. One outcome per source row and event, guarded by unique indexes.
--
--   sent      an outbound message on a lead reaches status 'sent'
--   bounced   an outbound message on a lead becomes 'failed' (meta.error holds the provider's reason;
--             it can be a sender-side failure, not only a recipient bounce)
--   replied   an inbound message linked to a lead, auto-replies excluded (same pattern as
--             crm/src/lib/email/deliverability.ts isAutoReply and tools/leadgen/leadgen/metrics.py)
--   meeting   a calendar event linked to a lead
--
-- cohort = leads.segment at the time of the event. meta.lead_source lets readers keep only
-- prospects (source = 'lead-gen'), as metrics.py does. Messages with no lead are not outcomes.
-- Only the public schema: the demo schema has no outcomes table and is left untouched.

create unique index if not exists outcomes_message_event
  on public.outcomes ((meta->>'message_id'), event) where meta ? 'message_id';
create unique index if not exists outcomes_calendar_event
  on public.outcomes ((meta->>'calendar_event_id'), event) where meta ? 'calendar_event_id';

create or replace function public.is_auto_reply_subject(subject text)
returns boolean language sql immutable as $$
  select coalesce(subject, '') ~* '^\s*(automatic reply|auto(matic)?[- ]?reply|autoreply|auto:|out of (the )?office)'
$$;

create or replace function public.record_message_outcome()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  ev text;
  lead_row record;
begin
  if new.lead_id is null then return new; end if;

  if new.direction = 'out' and new.status = 'sent' then ev := 'sent';
  elsif new.direction = 'out' and new.status = 'failed' then ev := 'bounced';
  elsif new.direction = 'in' and not public.is_auto_reply_subject(new.subject) then ev := 'replied';
  else return new;
  end if;

  -- On update, only a change that makes the row newly qualify (status moved, or a lead was linked).
  if tg_op = 'UPDATE' and old.lead_id is not distinct from new.lead_id and old.status is not distinct from new.status then
    return new;
  end if;

  select segment, source into lead_row from leads where id = new.lead_id;

  insert into outcomes (lead_id, cohort, event, occurred_at, meta)
  values (
    new.lead_id,
    coalesce(lead_row.segment, ''),
    ev,
    case when tg_op = 'UPDATE' and ev = 'bounced' then now() else new.created_at end,
    jsonb_strip_nulls(jsonb_build_object(
      'message_id', new.id::text,
      'lead_source', lead_row.source,
      'campaign_id', new.campaign_id,
      'sent_by', new.sent_by,
      'error', case when ev = 'bounced' then left(new.error, 500) end
    ))
  )
  on conflict ((meta->>'message_id'), event) where meta ? 'message_id' do nothing;
  return new;
end $$;

create or replace function public.record_meeting_outcome()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  lead_row record;
begin
  if new.lead_id is null then return new; end if;
  if tg_op = 'UPDATE' and old.lead_id is not distinct from new.lead_id then return new; end if;

  select segment, source into lead_row from leads where id = new.lead_id;

  insert into outcomes (lead_id, cohort, event, occurred_at, meta)
  values (
    new.lead_id,
    coalesce(lead_row.segment, ''),
    'meeting',
    new.created_at,
    jsonb_strip_nulls(jsonb_build_object(
      'calendar_event_id', new.id::text,
      'lead_source', lead_row.source,
      'starts_at', new.starts_at
    ))
  )
  on conflict ((meta->>'calendar_event_id'), event) where meta ? 'calendar_event_id' do nothing;
  return new;
end $$;

drop trigger if exists email_messages_record_outcome on public.email_messages;
create trigger email_messages_record_outcome
  after insert or update of status, lead_id on public.email_messages
  for each row execute function public.record_message_outcome();

drop trigger if exists calendar_events_record_outcome on public.calendar_events;
create trigger calendar_events_record_outcome
  after insert or update of lead_id on public.calendar_events
  for each row execute function public.record_meeting_outcome();

-- Backfill: the same rules over rows that existed before the triggers. Safe to re-run.
insert into public.outcomes (lead_id, cohort, event, occurred_at, meta)
select m.lead_id,
       coalesce(l.segment, ''),
       case when m.direction = 'in' then 'replied' when m.status = 'sent' then 'sent' else 'bounced' end,
       m.created_at,
       jsonb_strip_nulls(jsonb_build_object(
         'message_id', m.id::text,
         'lead_source', l.source,
         'campaign_id', m.campaign_id,
         'sent_by', m.sent_by,
         'error', case when m.direction = 'out' and m.status = 'failed' then left(m.error, 500) end,
         'backfilled', true
       ))
from public.email_messages m
left join public.leads l on l.id = m.lead_id
where m.lead_id is not null
  and (
    (m.direction = 'out' and m.status in ('sent', 'failed'))
    or (m.direction = 'in' and not public.is_auto_reply_subject(m.subject))
  )
on conflict ((meta->>'message_id'), event) where meta ? 'message_id' do nothing;

insert into public.outcomes (lead_id, cohort, event, occurred_at, meta)
select c.lead_id,
       coalesce(l.segment, ''),
       'meeting',
       c.created_at,
       jsonb_strip_nulls(jsonb_build_object(
         'calendar_event_id', c.id::text,
         'lead_source', l.source,
         'starts_at', c.starts_at,
         'backfilled', true
       ))
from public.calendar_events c
left join public.leads l on l.id = c.lead_id
where c.lead_id is not null
on conflict ((meta->>'calendar_event_id'), event) where meta ? 'calendar_event_id' do nothing;
