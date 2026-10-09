-- Centres d'intérêt du joueur (disciplines et activités) et ajustement « trop dur / trop facile » mémorisé par quête.
alter table public.settings add column if not exists interests text[] not null default '{}';
alter table public.quest_preferences add column if not exists tune smallint not null default 0 check (tune between -1 and 1);
