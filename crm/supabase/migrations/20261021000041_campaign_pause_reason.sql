-- Review fixes, part two (NOT applied by the builder; the lead applies migrations).
-- When the sender pauses a campaign on its own (the mailbox was blocked, throttled, over a size
-- limit, or hit its daily cap), it records why here so the campaign page can say so. Cleared on
-- resume. Additive and nullable; the send route tolerates it missing until this is applied.
alter table public.email_campaigns add column if not exists pause_reason text;
