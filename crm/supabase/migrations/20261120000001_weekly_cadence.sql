-- Weekly follow-ups (Max, 2026-11-20): "the best cadence for a business like this would be like
-- 3 emails over 3 weeks, with a fourth email reserved for especially valuable leads", and "I should
-- change everything to a week ... I've been setting follow up reminders for 3 days".
--
-- * An email sent outside a campaign now sets the follow-up a week out (was 3 business days). A
--   campaign still uses the reminder picked when it was sent; the picker now starts on one week.
-- * Two follow-ups by default, so three emails in all; a lead rated hot gets one more
--   (tools/leadgen/leadgen/automation.py follow_up_cap).
-- * An "unsubscribe" reply also goes on email_suppressions, so the block is by address and outlives
--   the lead row (it only set the lead's do_not_contact before).
-- * Reminders already set by the automatic rule or a campaign move to a week after the last email.

create or replace function public.stamp_lead_contacted()
 returns trigger
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare
  v_latest timestamptz;
  v_campaign boolean := false;
  v_days integer;
  v_from text;
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
      follow_up_soft = false,
      next_action = '',
      last_reply_at = greatest(coalesce(last_reply_at, new.created_at), new.created_at)
      where id = new.lead_id;
    update public.email_drafts set status = 'discarded', updated_at = now()
      where lead_id = new.lead_id and status = 'pending';
    -- Only a bare address: a display name or a list is never stored as a suppression.
    v_from := lower(btrim(coalesce(new.from_address, '')));
    if v_from ~ '^[^@\s<>,]+@[^@\s<>,]+$' then
      insert into public.email_suppressions (email, reason) values (v_from, 'opt_out')
        on conflict (email) do nothing;
    end if;
    return new;
  end if;

  if new.created_at < v_latest then return new; end if;

  if new.direction = 'out' and new.status = 'sent' then
    if new.campaign_id is not null then
      select true, follow_up_reminder_days into v_campaign, v_days
        from public.email_campaigns where id = new.campaign_id;
      v_campaign := coalesce(v_campaign, false);
    end if;
    update public.leads set
      last_contacted_at = greatest(coalesce(last_contacted_at, new.created_at), new.created_at),
      awaiting = case when status in ('converted', 'lost') then null else 'them' end,
      status = case when status = 'new' then 'contacted' else status end,
      status_reason = case when status = 'new' then 'First email sent' else status_reason end,
      follow_up_on = case
        when status not in ('new', 'contacted', 'replied') then follow_up_on
        when v_campaign and v_days is null then null
        when v_campaign then public.team_today() + v_days
        else public.team_today() + 7 end,
      follow_up_soft = case
        when status not in ('new', 'contacted', 'replied') then follow_up_soft
        else not v_campaign end,
      next_action = case
        when status not in ('new', 'contacted', 'replied') then next_action
        when v_campaign and v_days is null then ''
        else 'Follow up if no reply' end
      where id = new.lead_id;

  elsif new.direction = 'in' and not public.is_auto_reply_subject(new.subject) then
    update public.leads set
      last_reply_at = greatest(coalesce(last_reply_at, new.created_at), new.created_at),
      awaiting = 'us',
      status = case when status in ('new', 'contacted', 'lost', 'nurture') and not do_not_contact then 'replied' else status end,
      status_reason = case when status in ('new', 'contacted', 'lost', 'nurture') and not do_not_contact then 'They replied' else status_reason end,
      follow_up_count = 0,
      follow_up_on = public.team_today(),
      follow_up_soft = false,
      next_action = 'Reply to them'
      where id = new.lead_id;
    update public.email_drafts set status = 'discarded', updated_at = now()
      where lead_id = new.lead_id and kind = 'follow_up' and status = 'pending';
  end if;
  return new;
end $function$;

-- Two follow-ups, a week apart: three emails in all. Only the length is read by the worker.
alter table public.automation_settings alter column follow_up_days set default '{7,7}';
update public.automation_settings set follow_up_days = '{7,7}', updated_at = now() where id;

do $$
begin
  if to_regclass('demo.automation_settings') is not null then
    execute 'alter table demo.automation_settings alter column follow_up_days set default ''{7,7}''';
    execute 'update demo.automation_settings set follow_up_days = ''{7,7}'', updated_at = now() where id';
  end if;
end $$;

-- Reminders the automatic rule or a campaign set sooner than a week after the last email move to a
-- week after it. A next step a person wrote by hand keeps its date, and so does a lead with a
-- follow-up already written and waiting in Drafts.
update public.leads l set
  follow_up_on = (l.last_contacted_at at time zone 'America/Chicago')::date + 7
  where l.awaiting = 'them'
    and l.status in ('contacted', 'replied')
    and l.follow_up_on is not null
    and l.last_contacted_at is not null
    and l.next_action = 'Follow up if no reply'
    and l.follow_up_on < (l.last_contacted_at at time zone 'America/Chicago')::date + 7
    and not exists (select 1 from public.email_drafts d where d.lead_id = l.id and d.status = 'pending');
