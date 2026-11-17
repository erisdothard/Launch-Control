-- An out-of-office or "Automatic reply:" message is not a reply (Eris, 2026-11-17). Race Cars For You's
-- auto-reply had put the lead on Max's Today page as "waiting 11 days" and counted toward the reply
-- rate. The lead-stamping rule now ignores auto-replies, using the same subject pattern the outcome
-- events and metrics already use (is_auto_reply_subject), and the one lead it misfiled is put back.

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

-- Leads whose only inbound mail is auto-replies go back to waiting on them, with no reminder.
update public.leads l set
  status = 'contacted', status_reason = 'First email sent', awaiting = 'them',
  last_reply_at = null, follow_up_on = null, follow_up_soft = false, next_action = ''
  where l.status = 'replied' and l.awaiting = 'us'
    and exists (select 1 from public.email_messages m where m.lead_id = l.id and m.direction = 'in')
    and not exists (select 1 from public.email_messages m where m.lead_id = l.id and m.direction = 'in'
                    and not public.is_auto_reply_subject(m.subject));
