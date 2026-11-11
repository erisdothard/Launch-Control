-- Campaigns go out in daily batches: at most daily_limit first emails and follow-ups a weekday,
-- spread across business hours (send-campaigns route). A new sending domain that sends a whole list
-- in one burst lands in spam; small steady batches build its reputation.
alter table public.email_campaigns add column if not exists daily_limit integer not null default 20
  check (daily_limit between 1 and 500);

-- The client-demo deployment keeps its own copy of the tables in the demo schema.
do $$
begin
  if to_regclass('demo.email_campaigns') is not null then
    execute 'alter table demo.email_campaigns add column if not exists daily_limit integer not null default 20 check (daily_limit between 1 and 500)';
  end if;
end $$;
