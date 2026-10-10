-- `daily_quest_count` compte désormais les suggestions « Pour aller plus loin » proposées chaque jour (0 à 4 côté moteur, défaut 2),
-- et non plus les quêtes du jour imposées (ancien défaut : 6). La contrainte « between 0 and 6 » est conservée.
-- Idempotente : rejouée, elle ne change rien (les lignes à 6 ont déjà été ramenées à 2).
alter table public.settings alter column daily_quest_count set default 2;
update public.settings set daily_quest_count = 2 where daily_quest_count = 6;
