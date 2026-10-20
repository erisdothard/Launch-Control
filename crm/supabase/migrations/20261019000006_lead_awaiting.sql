-- Whose move it is on a lead, so the CRM's views ("Needs reply", "Waiting on them") are a plain
-- column read, not guesswork from timestamps. Set by the email trigger: our email -> them, theirs -> us.

alter table public.leads
  add column awaiting text check (awaiting in ('us', 'them'));

create index leads_awaiting_idx on public.leads (awaiting) where awaiting is not null;

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
      awaiting = case when status in ('converted', 'lost') then null else 'them' end,
      status = case when status = 'new' then 'contacted' else status end,
      status_reason = case when status = 'new' then 'First email sent' else status_reason end,
      -- Our move is done: the next nudge is due in 3 business days unless a meeting already set the date.
      follow_up_on = case when status in ('new', 'contacted', 'replied')
        then public.add_business_days(public.team_today(), 3) else follow_up_on end,
      next_action = case when status in ('new', 'contacted', 'replied') then 'Follow up if no reply' else next_action end
      where id = new.lead_id;

  elsif new.direction = 'in' then
    if public.is_opt_out(new.body_text) then
      update public.leads set
        do_not_contact = true,
        awaiting = null,
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
  end if;
  return new;
end $$;

-- Backfill from each lead's last message.
update public.leads l set awaiting = case when m.direction = 'in' then 'us' else 'them' end
  from (
    select distinct on (lead_id) lead_id, direction
    from public.email_messages
    where lead_id is not null and (direction = 'in' or status = 'sent')
    order by lead_id, created_at desc
  ) m
  where m.lead_id = l.id and l.status not in ('converted', 'lost');
