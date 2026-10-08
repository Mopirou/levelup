-- Tâches planifiées (cahier des charges 5.5) — à activer une fois le projet créé.
-- Prérequis : extensions pg_cron et pg_net activées (Dashboard > Database > Extensions), puis remplacer
-- <PROJECT_REF> et <CRON_SECRET> (le même secret que `supabase secrets set CRON_SECRET=...`).
--
-- Le tirage des quêtes est idempotent et déterministe : l'app le déclenche aussi à l'ouverture (RG-01).
-- Cette tâche prépare les quêtes de chaque joueur même s'il n'ouvre pas l'app (notifications du matin, classement…).

do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') and exists (select 1 from pg_extension where extname = 'pg_net') then
    perform cron.schedule(
      'levelup-draw-quests',
      '*/15 * * * *',
      $job$
        select net.http_post(
          url := 'https://<PROJECT_REF>.supabase.co/functions/v1/game',
          headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-secret', '<CRON_SECRET>'),
          body := jsonb_build_object('action', 'draw-all')
        );
      $job$
    );
    -- Suppression effective des comptes 30 jours après la demande (RG-26).
    perform cron.schedule('levelup-purge-accounts', '17 3 * * *', $job$ select public.purge_deleted_accounts(); $job$);
  else
    raise notice 'pg_cron / pg_net non activés : tâches planifiées ignorées (activer les extensions puis relancer cette migration).';
  end if;
end $$;
