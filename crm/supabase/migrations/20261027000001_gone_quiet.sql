-- Gone quiet (Max, 2026-10-27): "Seven days after a final follow-up is too rigid as a universal
-- rule. We need a nurture/gone-quiet status separate from lost."
--
-- Additive only: a new allowed status value ('nurture', shown as "Gone quiet"), a new setting for
-- what happens after the last follow-up, and the two lead triggers taught that a quiet lead who
-- writes back or books a meeting is live again. No existing row changes.
--   after_last_follow_up  'nurture' (default) moves a silent lead to Gone quiet;
--                         'lost' keeps the old behaviour (closed as gone cold);
--                         'none' leaves it where it is for a person to decide.
-- The worker (tools/leadgen/leadgen/automation.py close_gone_cold) reads it.

-- 1. The status value, in the real CRM and in the client demo's copy of the table.
alter table public.leads drop constraint if exists leads_status_check;
alter table public.leads add constraint leads_status_check
  check (status in ('new', 'contacted', 'replied', 'meeting', 'proposal', 'negotiation', 'converted', 'lost', 'nurture'));

do $$
begin
  if to_regclass('demo.leads') is not null then
    alter table demo.leads drop constraint if exists leads_status_check;
    alter table demo.leads add constraint leads_status_check
      check (status in ('new', 'contacted', 'replied', 'meeting', 'proposal', 'negotiation', 'converted', 'lost', 'nurture'));
  end if;
end $$;

-- 2. The setting.
alter table public.automation_settings
  add column if not exists after_last_follow_up text not null default 'nurture'
  check (after_last_follow_up in ('nurture', 'lost', 'none'));

do $$
begin
  if to_regclass('demo.automation_settings') is not null then
    alter table demo.automation_settings
      add column if not exists after_last_follow_up text not null default 'nurture'
      check (after_last_follow_up in ('nurture', 'lost', 'none'));
  end if;
end $$;

-- 3. Email in/out (same as 20261021000040 except 'nurture' wakes up like 'contacted' on a reply).
create or replace function public.stamp_lead_contacted()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_latest timestamptz;
begin
  if new.lead_id is null then return new; end if;
  select greatest(coalesce(last_contacted_at, '-infinity'::timestamptz), coalesce(last_reply_at, '-infinity'::timestamptz))
    into v_latest
    from public.leads where id = new.lead_id for update;
  if not found then return new; end if;

  if new.direction = 'in' and public.is_opt_out(new.body_text) then
    update public.leads set
      do_not_contact = true,
      awaiting = null,
      status = case when status = 'converted' then status else 'lost' end,
      status_reason = 'Asked not to be contacted',
      follow_up_on = null,
      next_action = '',
      last_reply_at = greatest(coalesce(last_reply_at, new.created_at), new.created_at)
      where id = new.lead_id;
    update public.email_drafts set status = 'discarded', updated_at = now()
      where lead_id = new.lead_id and status = 'pending';
    return new;
  end if;

  -- Older than what the lead already knows about: stored for the thread, but the lead stays put.
  if new.created_at < v_latest then return new; end if;

  if new.direction = 'out' and new.status = 'sent' then
    update public.leads set
      last_contacted_at = greatest(coalesce(last_contacted_at, new.created_at), new.created_at),
      awaiting = case when status in ('converted', 'lost') then null else 'them' end,
      status = case when status = 'new' then 'contacted' else status end,
      status_reason = case when status = 'new' then 'First email sent' else status_reason end,
      -- Our move is done: the next nudge is due in 3 business days unless a meeting already set the date.
      -- A quiet lead gets no automatic chase: a check-in email keeps it quiet until they answer.
      follow_up_on = case when status in ('new', 'contacted', 'replied')
        then public.add_business_days(public.team_today(), 3) else follow_up_on end,
      next_action = case when status in ('new', 'contacted', 'replied') then 'Follow up if no reply' else next_action end
      where id = new.lead_id;

  elsif new.direction = 'in' then
    update public.leads set
      last_reply_at = greatest(coalesce(last_reply_at, new.created_at), new.created_at),
      awaiting = 'us',
      status = case when status in ('new', 'contacted', 'lost', 'nurture') and not do_not_contact then 'replied' else status end,
      status_reason = case when status in ('new', 'contacted', 'lost', 'nurture') and not do_not_contact then 'They replied' else status_reason end,
      follow_up_count = 0,
      follow_up_on = public.team_today(),
      next_action = 'Reply to them'
      where id = new.lead_id;
    update public.email_drafts set status = 'discarded', updated_at = now()
      where lead_id = new.lead_id and kind = 'follow_up' and status = 'pending';
  end if;
  return new;
end $$;

-- 4. Meetings: a quiet lead who books one is in play again.
create or replace function public.stamp_lead_meeting()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.lead_id is null then return new; end if;
  if tg_op = 'UPDATE' and old.lead_id is not distinct from new.lead_id and old.starts_at = new.starts_at then return new; end if;
  update public.leads set
    status = case when status in ('new', 'contacted', 'replied', 'nurture') then 'meeting' else status end,
    status_reason = case when status in ('new', 'contacted', 'replied', 'nurture')
      then 'Meeting ' || to_char(new.starts_at at time zone 'America/Chicago', 'Mon FMDD') else status_reason end,
    follow_up_on = (new.starts_at at time zone 'America/Chicago')::date + 1,
    next_action = 'Send the proposal'
    where id = new.lead_id and status not in ('converted', 'lost');
  return new;
end $$;
