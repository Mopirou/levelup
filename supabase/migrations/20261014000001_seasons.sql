-- Saisons (V3) : classement de puissance entre amis et récompense de fin de saison. Voir docs/DONJONS.md §9.
-- Migration idempotente : elle peut être rejouée sans erreur.
-- Toutes les écritures passent par la fonction `game` (rôle service) ; le joueur ne lit que ses propres lignes et le
-- classement passe par `season_leaderboard` (amis qui acceptent le classement, comme `weekly_leaderboard`).

-- ═══════════════════════════ Personnage : puissance publiée et cadre de portrait ═══════════════════════════

-- Puissance (PP) à la dernière synchronisation : lue par les amis (carte de compagnon) via la lecture de `characters`.
alter table public.characters add column if not exists power int not null default 0 check (power >= 0);
-- Cadre de portrait cosmétique gagné en fin de saison, « S1:or » ; modifiable par le serveur seulement.
alter table public.characters add column if not exists frame_style text
  check (frame_style is null or frame_style ~ '^S[0-9]+:(or|argent|bronze|laurier)$');
-- (Les colonnes ne sont pas dans la liste de mise à jour accordée au joueur : voir 20261008000002_security.sql.)

-- Le coffre d'or de fin de saison a pour source « season » (clé d'idempotence : la saison, ex. « S1 »).
alter table public.chests drop constraint if exists chests_source_check;
alter table public.chests add constraint chests_source_check
  check (source in ('quest', 'rung', 'streak', 'dungeon', 'merge', 'raid', 'season'));

-- ═══════════════════════════ Tables ═══════════════════════════

-- Puissance publiée par saison : la dernière valeur de la saison fait foi (la clôture est paresseuse, il faut donc la figer).
create table if not exists public.season_scores (
  profile_id uuid not null references public.profiles (id) on delete cascade,
  season_key text not null check (season_key ~ '^S[0-9]+$'),
  power int not null check (power >= 0),
  first_day date not null,
  last_day date not null,
  primary key (profile_id, season_key),
  check (last_day >= first_day)
);

-- Résultat d'une saison pour un joueur : écrit une seule fois (idempotence de la récompense).
create table if not exists public.season_results (
  profile_id uuid not null references public.profiles (id) on delete cascade,
  season_key text not null check (season_key ~ '^S[0-9]+$'),
  rank int check (rank is null or rank >= 1),
  participants int not null default 0 check (participants >= 0),
  power int not null check (power >= 0),
  frame text check (frame is null or frame in ('or', 'argent', 'bronze', 'laurier')),
  created_at timestamptz not null default now(),
  primary key (profile_id, season_key)
);

-- ═══════════════════════════ Sécurité : lecture propriétaire, écriture rôle service ═══════════════════════════

alter table public.season_scores enable row level security;
alter table public.season_results enable row level security;

drop policy if exists season_scores_select on public.season_scores;
create policy season_scores_select on public.season_scores for select to authenticated using (profile_id = auth.uid());
drop policy if exists season_results_select on public.season_results;
create policy season_results_select on public.season_results for select to authenticated using (profile_id = auth.uid());

revoke insert, update, delete on public.season_scores from anon, authenticated;
revoke insert, update, delete on public.season_results from anon, authenticated;

-- ═══════════════════════════ Publication de la puissance (service) ═══════════════════════════

-- Garde le premier jour, met à jour le dernier jour et la puissance.
create or replace function public.record_season_power(p_profile uuid, p_season text, p_power int, p_day date)
returns void language sql security definer set search_path = public as $$
  insert into public.season_scores (profile_id, season_key, power, first_day, last_day)
  values (p_profile, p_season, greatest(p_power, 0), p_day, p_day)
  on conflict (profile_id, season_key) do update
    set power = excluded.power,
        first_day = least(public.season_scores.first_day, excluded.first_day),
        last_day = greatest(public.season_scores.last_day, excluded.last_day);
$$;

revoke all on function public.record_season_power(uuid, text, int, date) from public, anon, authenticated;
grant execute on function public.record_season_power(uuid, text, int, date) to service_role;

-- ═══════════════════════════ Classement de saison ═══════════════════════════

-- Le joueur et ses amis acceptés (non bloqués) qui acceptent le classement, avec la puissance publiée pour la saison.
-- Comme `weekly_leaderboard` : un joueur qui refuse le classement n'en voit aucun et n'y figure pas.
create or replace function public._season_rows(p_viewer uuid, p_season text)
returns table (profile_id uuid, username text, name text, level int, class_id text, portrait_id text, frame_color text, frame_style text, power int)
language sql stable security definer set search_path = public as $$
  with members as (
    select p_viewer as id
    union
    select case when f.requester_id = p_viewer then f.addressee_id else f.requester_id end
    from public.friendships f
    where f.status = 'accepted' and (f.requester_id = p_viewer or f.addressee_id = p_viewer)
  ), eligible as (
    select m.id from members m
    left join public.settings s on s.profile_id = m.id
    where p_viewer is not null
      and p_season ~ '^S[0-9]+$'
      and coalesce((select s2.leaderboard_opt_in from public.settings s2 where s2.profile_id = p_viewer), true)
      and coalesce(s.leaderboard_opt_in, true)
      and (m.id = p_viewer or not public.is_blocked_either(p_viewer, m.id))
  )
  select p.id, p.username::text, c.name, c.level, c.class_id, c.portrait_id, c.frame_color, c.frame_style, coalesce(sc.power, 0)
  from eligible el
  join public.profiles p on p.id = el.id and p.deleted_at is null
  left join public.characters c on c.profile_id = p.id
  left join public.season_scores sc on sc.profile_id = p.id and sc.season_key = p_season
  where sc.profile_id is not null or el.id = p_viewer
  order by coalesce(sc.power, 0) desc, p.username;
$$;

revoke all on function public._season_rows(uuid, text) from public, anon, authenticated;
grant execute on function public._season_rows(uuid, text) to service_role;

-- Classement de puissance de la saison `p_season` (« S1 »…) entre le joueur et ses amis qui l'acceptent.
create or replace function public.season_leaderboard(p_season text)
returns table (profile_id uuid, username text, name text, level int, class_id text, portrait_id text, frame_color text, frame_style text, power int)
language sql stable security definer set search_path = public as $$
  select * from public._season_rows(auth.uid(), p_season);
$$;

revoke all on function public.season_leaderboard(text) from public, anon;
grant execute on function public.season_leaderboard(text) to authenticated;

-- Même classement pour un joueur donné (clôture paresseuse côté serveur), en jsonb.
create or replace function public.season_ranking(p_viewer uuid, p_season text)
returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object('profile_id', r.profile_id, 'power', r.power)), '[]'::jsonb)
  from public._season_rows(p_viewer, p_season) r;
$$;

revoke all on function public.season_ranking(uuid, text) from public, anon, authenticated;
grant execute on function public.season_ranking(uuid, text) to service_role;

-- ═══════════════════════════ Équipement visible sur la fiche d'un compagnon ═══════════════════════════

-- Les 6 objets équipés (emplacement, modèle, rareté, niveau), la puissance et le cadre : pour soi-même et pour un ami
-- accepté non bloqué (règle `can_view_owner`). Aucun autre profil n'obtient rien (null).
create or replace function public.get_profile_gear(p_username text)
returns jsonb language sql stable security definer set search_path = public as $$
  select case when public.can_view_owner(auth.uid(), p.id) then
    jsonb_build_object(
      'power', coalesce(c.power, 0),
      'frameStyle', c.frame_style,
      'items', coalesce((
        select jsonb_agg(jsonb_build_object('slot', i.slot, 'templateId', i.template_id, 'rarity', i.rarity, 'level', i.level) order by i.slot)
        from public.inventory_items i where i.profile_id = p.id and i.equipped
      ), '[]'::jsonb))
  end
  from public.profiles p
  left join public.characters c on c.profile_id = p.id
  where p.username = p_username and p.deleted_at is null;
$$;

revoke all on function public.get_profile_gear(text) from public, anon;
grant execute on function public.get_profile_gear(text) to authenticated;
