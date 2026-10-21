-- CRM v2 (2026-10-21): a full mailbox inbox, mass email (campaigns), templates, and the signature
-- phone line. Additive only: existing rows and the current app keep working.

-- 1. Full inbox. Every message in the connected mailbox is stored, not only lead mail.
--    lead_id is null for mail from someone who isn't a lead yet ("Add as lead" fills it in).
alter table public.email_messages alter column lead_id drop not null;
alter table public.email_messages
  add column folder text not null default 'inbox' check (folder in ('inbox', 'sent', 'archive')),
  add column conversation_id text,           -- Outlook conversationId / Gmail threadId: groups a thread
  add column from_name text not null default '',
  add column cc_address text not null default '',
  add column attachments jsonb not null default '[]'::jsonb,  -- [{name, path, size, type}]
  add column campaign_id uuid;

create index email_messages_conversation_idx on public.email_messages (conversation_id, created_at) where conversation_id is not null;
create index email_messages_folder_idx on public.email_messages (folder, created_at desc);

-- Lead mail keeps its existing behaviour; mail with no lead skips the lead stamp.
drop trigger if exists email_messages_stamp_contacted on public.email_messages;
create trigger email_messages_stamp_contacted
  after insert on public.email_messages
  for each row when (new.lead_id is not null) execute function public.stamp_lead_contacted();

-- One row per conversation, newest message first. Threads are keyed by conversation_id when the
-- provider gave one, else by lead, else by the message itself.
create or replace view public.email_threads with (security_invoker = true) as
with keyed as (
  select m.*, coalesce(m.conversation_id, 'lead:' || m.lead_id::text, 'msg:' || m.id::text) as thread_key
  from public.email_messages m
)
select distinct on (k.thread_key)
  k.thread_key,
  k.lead_id,
  l.business_name,
  l.contact_name,
  k.direction as last_direction,
  case when k.direction = 'in' then k.from_address else k.to_address end as other_address,
  k.from_name as last_from_name,
  k.subject as last_subject,
  left(k.body_text, 200) as last_snippet,
  k.created_at as last_at,
  k.folder,
  (select count(*) from keyed u where u.thread_key = k.thread_key and u.direction = 'in' and u.read_at is null) as unread,
  (select count(*) from keyed c where c.thread_key = k.thread_key) as message_count,
  exists (select 1 from keyed a where a.thread_key = k.thread_key and a.attachments <> '[]'::jsonb) as has_attachments
from keyed k
left join public.leads l on l.id = k.lead_id
order by k.thread_key, k.created_at desc;

-- 2. Signature phone line (Max's Gmail signature carries his number).
alter table public.email_accounts add column signature_phone text not null default '';

-- 3. Templates for single and mass email.
create table public.email_templates (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  subject text not null default '',
  body_text text not null default '',
  created_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- 4. Campaigns: one mass email, sent to each recipient individually.
create table public.email_campaigns (
  id uuid primary key default gen_random_uuid(),
  name text not null default '',
  account_id uuid references public.email_accounts (id) on delete set null,
  subject text not null,
  body_text text not null,
  attachments jsonb not null default '[]'::jsonb,
  status text not null default 'draft' check (status in ('draft', 'scheduled', 'sending', 'sent', 'cancelled')),
  scheduled_at timestamptz,              -- null with status 'scheduled' means "as soon as possible"
  per_minute integer not null default 10 check (per_minute between 1 and 30),
  skip_contacted_days integer not null default 0,   -- skip anyone emailed in the last N days (0 = off)
  follow_up_after_days integer,          -- null = no automatic follow-up
  follow_up_subject text,
  follow_up_body text,
  created_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  started_at timestamptz,
  finished_at timestamptz
);

create table public.campaign_recipients (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.email_campaigns (id) on delete cascade,
  lead_id uuid references public.leads (id) on delete set null,
  email text not null,
  merge jsonb not null default '{}'::jsonb,   -- first_name, company, ... for {{field}} merge
  subject_override text,                      -- per-person edit before sending
  body_override text,
  status text not null default 'pending' check (status in ('pending', 'sent', 'failed', 'skipped', 'cancelled')),
  skip_reason text,
  error text,
  step integer not null default 1,            -- 1 = first email, 2 = follow-up
  sent_at timestamptz,
  replied_at timestamptz,
  follow_up_sent_at timestamptz,
  created_at timestamptz not null default now(),
  unique (campaign_id, email)
);

create index campaign_recipients_pending_idx on public.campaign_recipients (campaign_id) where status = 'pending';

alter table public.email_messages
  add constraint email_messages_campaign_fk foreign key (campaign_id) references public.email_campaigns (id) on delete set null;

-- 5. Addresses never to email again (opt-outs, hard bounces). Leads' do_not_contact still applies.
create table public.email_suppressions (
  email text primary key,
  reason text not null default 'opt_out' check (reason in ('opt_out', 'bounce', 'manual')),
  created_at timestamptz not null default now()
);

alter table public.email_templates enable row level security;
alter table public.email_campaigns enable row level security;
alter table public.campaign_recipients enable row level security;
alter table public.email_suppressions enable row level security;
create policy "crm team full access" on public.email_templates for all to authenticated
  using ((select public.is_crm_user())) with check ((select public.is_crm_user()));
create policy "crm team full access" on public.email_campaigns for all to authenticated
  using ((select public.is_crm_user())) with check ((select public.is_crm_user()));
create policy "crm team full access" on public.campaign_recipients for all to authenticated
  using ((select public.is_crm_user())) with check ((select public.is_crm_user()));
create policy "crm team full access" on public.email_suppressions for all to authenticated
  using ((select public.is_crm_user())) with check ((select public.is_crm_user()));

-- 6. Attachments live in a private bucket; the team reads and writes them, the server sends them.
insert into storage.buckets (id, name, public) values ('email-attachments', 'email-attachments', false)
  on conflict (id) do nothing;
create policy "crm team attachments" on storage.objects for all to authenticated
  using (bucket_id = 'email-attachments' and (select public.is_crm_user()))
  with check (bucket_id = 'email-attachments' and (select public.is_crm_user()));
