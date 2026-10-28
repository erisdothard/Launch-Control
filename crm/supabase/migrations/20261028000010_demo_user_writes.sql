-- The demo deployment fills itself as the signed-in demo user when it has no service-role key.
-- Every other demo table already allows that; these two were read-only. Demo schema only: the
-- real CRM's tables are untouched, and demo.crm_users holds only the demo login.

create policy "crm team writes" on demo.demo_state for all to authenticated
  using ((select demo.is_crm_user())) with check ((select demo.is_crm_user()));

create policy "crm team writes" on demo.email_accounts for all to authenticated
  using ((select demo.is_crm_user())) with check ((select demo.is_crm_user()));
