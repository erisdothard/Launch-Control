-- Microsoft 365 (Outlook) as a sender. The team shares one mailbox (maxwell@) with aliases on it
-- (eris@): each address gets its own email_accounts row so it shows in the From list, and they all
-- point at the same Vault secret. Microsoft rotates refresh tokens, so the server writes each new
-- one back with save_mail_refresh_token.
--   mailbox:     the signed-in mailbox an alias belongs to (null for the mailbox row itself).
--   sync_cursor: Graph delta link for the inbox; the worker resumes from it.

alter table public.email_accounts drop constraint email_accounts_provider_check;
alter table public.email_accounts add constraint email_accounts_provider_check check (provider in ('resend', 'gmail', 'outlook'));
alter table public.email_messages drop constraint email_messages_provider_check;
alter table public.email_messages add constraint email_messages_provider_check check (provider in ('resend', 'gmail', 'outlook'));

alter table public.email_accounts
  add column mailbox text,
  add column sync_cursor text;

-- Server-side only: save a connected Outlook mailbox, its aliases, and its refresh token.
create or replace function public.save_outlook_account(
  p_mailbox text, p_aliases text[], p_display_name text, p_connected_by text, p_refresh_token text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_mailbox text := lower(p_mailbox);
  v_account uuid;
  v_secret uuid;
  v_alias text;
begin
  select token_secret_id into v_secret from public.email_accounts where provider = 'outlook' and address = v_mailbox;
  if v_secret is null then
    v_secret := vault.create_secret(p_refresh_token, 'outlook:' || v_mailbox);
  else
    perform vault.update_secret(v_secret, p_refresh_token);
  end if;

  insert into public.email_accounts (provider, address, display_name, connected_by, status, token_secret_id, mailbox)
  values ('outlook', v_mailbox, p_display_name, p_connected_by, 'active', v_secret, null)
  on conflict (provider, address) do update
    set connected_by = excluded.connected_by, status = 'active', token_secret_id = excluded.token_secret_id, mailbox = null
  returning id into v_account;

  foreach v_alias in array coalesce(p_aliases, '{}') loop
    if lower(v_alias) <> v_mailbox then
      insert into public.email_accounts (provider, address, display_name, connected_by, status, token_secret_id, mailbox)
      values ('outlook', lower(v_alias), '', p_connected_by, 'active', v_secret, v_mailbox)
      on conflict (provider, address) do update
        set connected_by = excluded.connected_by, status = 'active', token_secret_id = excluded.token_secret_id, mailbox = v_mailbox;
    end if;
  end loop;
  return v_account;
end $$;

-- Server-side only: any connected account's refresh token (Gmail or Outlook, alias rows included).
create or replace function public.mail_refresh_token(p_account_id uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select s.decrypted_secret
  from public.email_accounts a
  join vault.decrypted_secrets s on s.id = a.token_secret_id
  where a.id = p_account_id;
$$;

-- Server-side only: store a rotated refresh token (shared by the mailbox and its aliases).
create or replace function public.save_mail_refresh_token(p_account_id uuid, p_refresh_token text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_secret uuid;
begin
  select token_secret_id into v_secret from public.email_accounts where id = p_account_id;
  if v_secret is not null then
    perform vault.update_secret(v_secret, p_refresh_token);
  end if;
end $$;

revoke all on function public.save_outlook_account(text, text[], text, text, text) from public, anon, authenticated;
revoke all on function public.mail_refresh_token(uuid) from public, anon, authenticated;
revoke all on function public.save_mail_refresh_token(uuid, text) from public, anon, authenticated;
grant execute on function public.save_outlook_account(text, text[], text, text, text) to service_role;
grant execute on function public.mail_refresh_token(uuid) to service_role;
grant execute on function public.save_mail_refresh_token(uuid, text) to service_role;

alter table public.calendar_events add column outlook_change_key text;
