-- Email conversations per lead. Two senders:
--   resend: a business address on golaunchcontrol.com; replies come back through Resend's inbound
--           webhook (Reply-To lead+<lead id>@reply.golaunchcontrol.com).
--   gmail:  a teammate's connected Gmail; the Railway worker pulls replies on CRM threads.
-- Gmail refresh tokens live in Supabase Vault; only the service role can read them.

create table public.email_accounts (
  id uuid primary key default gen_random_uuid(),
  provider text not null check (provider in ('resend', 'gmail')),
  address text not null check (address = lower(address)),
  display_name text not null default '',
  connected_by text not null,
  status text not null default 'active' check (status in ('active', 'needs_reconnect', 'disabled')),
  token_secret_id uuid,          -- vault.secrets id (gmail only)
  gmail_history_id text,         -- last Gmail history id the worker has seen
  created_at timestamptz not null default now(),
  unique (provider, address)
);

create table public.email_messages (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references public.leads (id) on delete cascade,
  account_id uuid references public.email_accounts (id) on delete set null,
  direction text not null check (direction in ('out', 'in')),
  from_address text not null,
  to_address text not null,
  subject text not null default '',
  body_text text not null default '',
  provider text not null check (provider in ('resend', 'gmail')),
  provider_message_id text,
  provider_thread_id text,       -- Gmail threadId
  message_id_header text,        -- RFC 5322 Message-ID, for In-Reply-To on the next send
  sent_by text,                  -- CRM user who sent it (outbound)
  status text not null default 'sent' check (status in ('sent', 'failed', 'received')),
  error text,
  read_at timestamptz,           -- inbound only; null = unread
  created_at timestamptz not null default now(),
  unique (provider, provider_message_id)
);

create index email_messages_lead_idx on public.email_messages (lead_id, created_at);
create index email_messages_unread_idx on public.email_messages (created_at desc) where direction = 'in' and read_at is null;
create index email_messages_thread_idx on public.email_messages (provider_thread_id) where provider_thread_id is not null;

alter table public.email_accounts enable row level security;
alter table public.email_messages enable row level security;

create policy "crm team full access" on public.email_messages for all to authenticated
  using ((select public.is_crm_user())) with check ((select public.is_crm_user()));
-- The team can see which accounts exist; tokens stay in Vault and accounts are written server-side.
create policy "crm team read" on public.email_accounts for select to authenticated
  using ((select public.is_crm_user()));

-- Server-side only (service role): save a connected Gmail and its refresh token.
create or replace function public.save_gmail_account(p_address text, p_display_name text, p_connected_by text, p_refresh_token text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_account uuid;
  v_secret uuid;
begin
  select token_secret_id into v_secret from public.email_accounts where provider = 'gmail' and address = lower(p_address);
  if v_secret is null then
    v_secret := vault.create_secret(p_refresh_token, 'gmail:' || lower(p_address));
  else
    perform vault.update_secret(v_secret, p_refresh_token);
  end if;
  insert into public.email_accounts (provider, address, display_name, connected_by, status, token_secret_id)
  values ('gmail', lower(p_address), p_display_name, p_connected_by, 'active', v_secret)
  on conflict (provider, address) do update
    set display_name = excluded.display_name, connected_by = excluded.connected_by,
        status = 'active', token_secret_id = excluded.token_secret_id
  returning id into v_account;
  return v_account;
end $$;

-- Server-side only: a Gmail account's refresh token.
create or replace function public.gmail_refresh_token(p_account_id uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select s.decrypted_secret
  from public.email_accounts a
  join vault.decrypted_secrets s on s.id = a.token_secret_id
  where a.id = p_account_id and a.provider = 'gmail';
$$;

revoke all on function public.save_gmail_account(text, text, text, text) from public, anon, authenticated;
revoke all on function public.gmail_refresh_token(uuid) from public, anon, authenticated;
grant execute on function public.save_gmail_account(text, text, text, text) to service_role;
grant execute on function public.gmail_refresh_token(uuid) to service_role;

-- Inbox: one row per lead with messages, newest first.
create or replace view public.email_inbox with (security_invoker = true) as
select distinct on (m.lead_id)
  m.lead_id,
  l.business_name,
  l.contact_name,
  m.direction as last_direction,
  m.subject as last_subject,
  left(m.body_text, 160) as last_snippet,
  m.created_at as last_at,
  (select count(*) from public.email_messages u where u.lead_id = m.lead_id and u.direction = 'in' and u.read_at is null) as unread
from public.email_messages m
join public.leads l on l.id = m.lead_id
order by m.lead_id, m.created_at desc;
