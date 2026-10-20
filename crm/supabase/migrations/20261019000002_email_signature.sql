-- Per-address signature. The CRM renders the house signature (name, this title, logo, site) under
-- every outbound email from an account that has a sender name.
alter table public.email_accounts
  add column signature_title text not null default '';
