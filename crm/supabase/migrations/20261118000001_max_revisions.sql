-- Max's CRM notes of 2026-11-17 ("A few CRM changes"). Additive only.
--   leads.temperature     cold / warm / hot set by hand. Null means "work it out" (see
--                         src/lib/leads/temperature.ts): the CRM reads it from what happened.
--   email_messages.folder gains 'trash': Delete in the Inbox moves mail there, it never erases it.
--   crm_users.theme       each person's colours (background and highlight). Null = the default look.

alter table public.leads
  add column if not exists temperature text check (temperature in ('cold', 'warm', 'hot'));

create index if not exists leads_temperature_idx on public.leads (temperature) where temperature is not null;

alter table public.email_messages drop constraint if exists email_messages_folder_check;
alter table public.email_messages add constraint email_messages_folder_check
  check (folder in ('inbox', 'sent', 'archive', 'trash'));

alter table public.crm_users add column if not exists theme jsonb
  check (theme is null or jsonb_typeof(theme) = 'object');

-- The client-demo deployment keeps its own copy of the tables in the demo schema.
do $$
begin
  if to_regclass('demo.leads') is not null then
    execute 'alter table demo.leads add column if not exists temperature text check (temperature in (''cold'', ''warm'', ''hot''))';
  end if;
  if to_regclass('demo.email_messages') is not null then
    execute 'alter table demo.email_messages drop constraint if exists email_messages_folder_check';
    execute 'alter table demo.email_messages add constraint email_messages_folder_check check (folder in (''inbox'', ''sent'', ''archive'', ''trash''))';
  end if;
  if to_regclass('demo.crm_users') is not null then
    execute 'alter table demo.crm_users add column if not exists theme jsonb check (theme is null or jsonb_typeof(theme) = ''object'')';
  end if;
end $$;

-- The demo copy of leads never got follow_up_soft (20261117000001), so setting a follow-up date in
-- the demo failed, and the lighter list read below could not name the column.
do $$
begin
  if to_regclass('demo.leads') is not null then
    execute 'alter table demo.leads add column if not exists follow_up_soft boolean not null default false';
  end if;
end $$;
