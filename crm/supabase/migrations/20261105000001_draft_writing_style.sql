-- How drafted replies and follow-ups should sound, in the team's own words (Settings > Automation).
-- The worker adds it to the writer's instructions; empty means the default voice.
alter table public.automation_settings add column if not exists writing_style text not null default ''
  check (char_length(writing_style) <= 2000);

-- The client-demo deployment keeps its own copy of the tables in the demo schema.
do $$
begin
  if to_regclass('demo.automation_settings') is not null then
    execute 'alter table demo.automation_settings add column if not exists writing_style text not null default '''' check (char_length(writing_style) <= 2000)';
  end if;
end $$;
