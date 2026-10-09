-- Quêtes refaisables et quêtes choisies dans le catalogue.
-- `run` : rang d'une quête parmi celles du même modèle dans la période (1 = première, 2+ = refaite).
-- `origin` : tirage (quota), choix dans le catalogue, ou refaite après une validation.
alter table public.quest_instances add column if not exists run int not null default 1 check (run >= 1);
alter table public.quest_instances add column if not exists origin text not null default 'draw' check (origin in ('draw','chosen','redo'));

drop index if exists public.quest_instances_unique_draw;
create unique index quest_instances_unique_draw on public.quest_instances (profile_id, template_id, period, period_start, run);

-- Mode manuel : 0 quête tirée par jour, le joueur choisit lui-même dans le catalogue.
alter table public.settings drop constraint if exists settings_daily_quest_count_check;
alter table public.settings add constraint settings_daily_quest_count_check check (daily_quest_count between 0 and 6);
