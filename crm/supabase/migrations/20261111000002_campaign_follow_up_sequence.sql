-- A campaign can follow up more than once. follow_up_after_days / _subject / _body stay the first
-- follow-up; more_follow_ups holds the ones after it, in order, as [{days, subject, body}], where
-- days counts from the follow-up before. campaign_recipients.step is 1 after the first email and
-- k + 1 after follow-up k. Anyone who replies, opts out or hears from us another way leaves it.
alter table public.email_campaigns add column if not exists more_follow_ups jsonb not null default '[]'::jsonb
  check (jsonb_typeof(more_follow_ups) = 'array' and jsonb_array_length(more_follow_ups) <= 2);

do $$
begin
  if to_regclass('demo.email_campaigns') is not null then
    execute $q$alter table demo.email_campaigns add column if not exists more_follow_ups jsonb not null default '[]'::jsonb check (jsonb_typeof(more_follow_ups) = 'array' and jsonb_array_length(more_follow_ups) <= 2)$q$;
  end if;
end $$;
