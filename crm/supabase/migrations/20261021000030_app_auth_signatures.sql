-- 2026-10-21: why a mailbox stopped working (Microsoft's own words, e.g. AADSTS50076 = MFA
-- required), and whether a mass email carries the sender's signature.
alter table public.email_accounts
  add column last_error text,
  add column last_error_at timestamptz;

alter table public.email_campaigns
  add column include_signature boolean not null default true;
