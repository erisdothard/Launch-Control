-- 2026-10-21: small-print lines under a signature (Max: services line and "Miami, FL | Nashville, TN").
-- One line per row; empty means none.
alter table public.email_accounts add column if not exists signature_lines text not null default '';
