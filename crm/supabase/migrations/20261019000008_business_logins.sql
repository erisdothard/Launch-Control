-- The team signs in with the business addresses (Eris, 2026-10-19). The auth users' emails were
-- moved with the admin API; this keeps the allowlist matching them.
insert into public.crm_users (email) values ('eris@golaunchcontrol.com'), ('maxwell@golaunchcontrol.com')
  on conflict (email) do nothing;
delete from public.crm_users where email in ('erisdothard1@gmail.com', 'hartmann.motorsports@gmail.com');
