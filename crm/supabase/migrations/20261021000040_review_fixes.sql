-- 2026-10-21 review fixes. NOT applied by the builder; the lead applies migrations.
--
-- 1. Out-of-order mail must not rewind a lead. The worker's re-walk (CURSOR_VERSION bump) stores
--    older mail after newer, and the trigger rewrote awaiting/status/follow-up from whatever row
--    arrived last. Now a row only moves the lead when it is at least as new as the lead's latest
--    contact or reply. Exception: an opt-out is always honoured, however old the message.
--    Everything else is the 2026-10-19 lead_awaiting definition, unchanged.
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
      follow_up_on = case when status in ('new', 'contacted', 'replied')
        then public.add_business_days(public.team_today(), 3) else follow_up_on end,
      next_action = case when status in ('new', 'contacted', 'replied') then 'Follow up if no reply' else next_action end
      where id = new.lead_id;

  elsif new.direction = 'in' then
    update public.leads set
      last_reply_at = greatest(coalesce(last_reply_at, new.created_at), new.created_at),
      awaiting = 'us',
      status = case when status in ('new', 'contacted', 'lost') and not do_not_contact then 'replied' else status end,
      status_reason = case when status in ('new', 'contacted', 'lost') and not do_not_contact then 'They replied' else status_reason end,
      follow_up_count = 0,
      follow_up_on = public.team_today(),
      next_action = 'Reply to them'
      where id = new.lead_id;
    update public.email_drafts set status = 'discarded', updated_at = now()
      where lead_id = new.lead_id and kind = 'follow_up' and status = 'pending';
  end if;
  return new;
end $$;

-- 2. Attachments: the bucket enforces the same 15 MB per-file limit as the app.
update storage.buckets set file_size_limit = 15728640 where id = 'email-attachments';
