-- Coffre quotidien offert : nouvelle source de coffre 'daily' (idempotent).
alter table public.chests drop constraint if exists chests_source_check;
alter table public.chests add constraint chests_source_check
  check (source in ('quest', 'rung', 'streak', 'dungeon', 'merge', 'raid', 'season', 'daily'));
