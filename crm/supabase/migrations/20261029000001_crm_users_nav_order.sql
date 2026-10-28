-- Per-user sidebar order: a JSON array of nav keys ("today", "inbox", ...). Null = default order.
-- NOT applied yet. After applying, set NAV_ORDER_DB=1 on the CRM so it reads and writes this column;
-- until then the order lives in each browser's localStorage only.
alter table public.crm_users add column if not exists nav_order jsonb
  check (nav_order is null or jsonb_typeof(nav_order) = 'array');

-- The client-demo deployment keeps its own copy of the tables in the demo schema.
do $$
begin
  if to_regclass('demo.crm_users') is not null then
    execute 'alter table demo.crm_users add column if not exists nav_order jsonb check (nav_order is null or jsonb_typeof(nav_order) = ''array'')';
  end if;
end $$;
