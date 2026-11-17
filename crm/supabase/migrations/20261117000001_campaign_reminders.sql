-- Follow-up reminders (Eris, 2026-11-17): "Max needs to set a follow date when creating campaigns.
-- Everyone else gets soft small notifications."
--
-- * email_campaigns.follow_up_reminder_days: picked by Max when he sends a campaign. Each lead the
--   campaign emails gets a follow-up date that many days out, as a full reminder. Null = no reminder,
--   and the lead's date is cleared.
-- * leads.follow_up_soft: true when the date came from the automatic rule (any other email sent to a
--   lead: 3 business days). Today shows those as one small gray line, not in the main list. A date set
--   by Max, by a campaign, by a meeting or by a reply is a full reminder (false).

alter table public.email_campaigns
  add column if not exists follow_up_reminder_days integer
  check (follow_up_reminder_days is null or follow_up_reminder_days between 1 and 60);

alter table public.leads
  add column if not exists follow_up_soft boolean not null default false;

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
        else public.add_business_days(public.team_today(), 3) end,
      follow_up_soft = case
        when status not in ('new', 'contacted', 'replied') then follow_up_soft
        else not v_campaign end,
      next_action = case
        when status not in ('new', 'contacted', 'replied') then next_action
        when v_campaign and v_days is null then ''
        else 'Follow up if no reply' end
      where id = new.lead_id;

  elsif new.direction = 'in' then
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

create or replace function public.stamp_lead_meeting()
 returns trigger
 language plpgsql
 security definer
 set search_path to ''
as $function$
begin
  if new.lead_id is null then return new; end if;
  if tg_op = 'UPDATE' and old.lead_id is not distinct from new.lead_id and old.starts_at = new.starts_at then return new; end if;
  update public.leads set
    status = case when status in ('new', 'contacted', 'replied', 'nurture') then 'meeting' else status end,
    status_reason = case when status in ('new', 'contacted', 'replied', 'nurture')
      then 'Meeting ' || to_char(new.starts_at at time zone 'America/Chicago', 'Mon FMDD') else status_reason end,
    follow_up_on = (new.starts_at at time zone 'America/Chicago')::date + 1,
    follow_up_soft = false,
    next_action = 'Send the proposal'
    where id = new.lead_id and status not in ('converted', 'lost');
  return new;
end $function$;

-- Dates already set by the automatic rule become soft.
update public.leads set follow_up_soft = true
  where follow_up_on is not null and next_action = 'Follow up if no reply' and awaiting = 'them';
