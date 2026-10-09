-- Quêtes guidées : discipline (danse, cuisine…) et caractéristiques secondaires qui reçoivent une part de l'XP.
alter table public.quest_templates add column if not exists theme text;
alter table public.quest_templates add column if not exists secondary jsonb not null default '[]'::jsonb;
