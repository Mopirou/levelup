-- Parcours de discipline : un joueur active jusqu'à 3 parcours (une activité d'une discipline), gravit 10 échelons,
-- et reçoit chaque jour la quête de son échelon (instance `origin = 'track'`). Voir docs/PARCOURS.md.
-- Migration idempotente : elle peut être rejouée sans erreur.

-- ═══════════════════════════ État des parcours d'un joueur ═══════════════════════════

create table if not exists public.tracks (
  profile_id uuid not null references public.profiles (id) on delete cascade,
  -- Identifiant statique de la définition (`@levelup/content/tracks.fr.json`), ex. « musculation-muscu-haut-du-corps ».
  track_id text not null,
  status text not null default 'active' check (status in ('active', 'paused')),
  rung int not null default 1 check (rung >= 1),
  -- Jours validés à l'échelon courant depuis la dernière montée ou descente.
  hits int not null default 0 check (hits >= 0),
  last_done_date date,
  last_checked_date date,
  best_rung int not null default 1 check (best_rung >= 1),
  started_at timestamptz not null default now(),
  primary key (profile_id, track_id)
);

alter table public.tracks enable row level security;

-- Lecture par le propriétaire seulement ; l'écriture est réservée au rôle service (fonction `game`), comme `quest_instances`.
drop policy if exists tracks_select on public.tracks;
create policy tracks_select on public.tracks for select to authenticated using (profile_id = auth.uid());
revoke insert, update, delete on public.tracks from anon, authenticated;

-- ═══════════════════════════ Échelons : gabarits et instances ═══════════════════════════

-- Gabarit d'échelon : `source = 'catalog'`, id `{trackId}-r{NN}`, jamais tiré ni proposé dans le catalogue libre.
alter table public.quest_templates add column if not exists track_id text;
alter table public.quest_templates add column if not exists rung int;

-- Parcours et échelon vont ensemble, et seuls les gabarits du catalogue peuvent en porter un
-- (un joueur ne peut ainsi pas squatter un couple (parcours, échelon) avec une quête personnalisée).
alter table public.quest_templates drop constraint if exists quest_templates_track_rung;
alter table public.quest_templates add constraint quest_templates_track_rung
  check ((track_id is null and rung is null) or (track_id is not null and rung is not null and rung >= 1 and source = 'catalog'));

-- Un seul gabarit par (parcours, échelon) ; sert aussi à retrouver l'échelon d'un parcours.
create unique index if not exists quest_templates_track_rung_unique on public.quest_templates (track_id, rung) where track_id is not null;

-- Instance d'un échelon : parcours et échelon au moment de la proposition (l'état courant vit dans `tracks`).
alter table public.quest_instances add column if not exists track_id text;
alter table public.quest_instances add column if not exists rung int;

create index if not exists quest_instances_track on public.quest_instances (profile_id, track_id, period_start) where track_id is not null;

-- Nouvelle origine : la quête du jour d'un parcours.
alter table public.quest_instances drop constraint if exists quest_instances_origin_check;
alter table public.quest_instances add constraint quest_instances_origin_check check (origin in ('draw', 'chosen', 'redo', 'track'));
