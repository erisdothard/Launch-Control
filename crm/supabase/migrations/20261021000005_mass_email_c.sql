-- Mass email (CRM v2, Builder C). Additive.
-- 1. Campaigns can be paused and resumed. The sending route skips paused campaigns; resuming puts
--    them back to "sending" (or "scheduled" if they never started).
alter table public.email_campaigns drop constraint if exists email_campaigns_status_check;
alter table public.email_campaigns
  add constraint email_campaigns_status_check
  check (status in ('draft', 'scheduled', 'sending', 'paused', 'sent', 'cancelled'));

-- 2. The sending route looks up "who replied since we wrote" by address and time every minute.
create index if not exists email_messages_inbound_from_idx
  on public.email_messages (from_address, created_at)
  where direction = 'in';

-- 3. Follow-ups waiting on their day.
create index if not exists campaign_recipients_follow_up_idx
  on public.campaign_recipients (campaign_id, sent_at)
  where status = 'sent' and step = 1 and follow_up_sent_at is null and replied_at is null;
