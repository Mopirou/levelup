-- Aventure : puissance, expédition, coffres, équipement, donjons. Voir docs/DONJONS.md.
-- Migration idempotente : elle peut être rejouée sans erreur.
-- Toutes les écritures passent par la fonction `game` (rôle service) ; le joueur ne peut que lire ses propres lignes.

-- ═══════════════════════════ Ressources du personnage ═══════════════════════════

alter table public.characters add column if not exists gold int not null default 0 check (gold >= 0);
alter table public.characters add column if not exists fragments int not null default 0 check (fragments >= 0);
-- Clés de donjon en stock (0..3)
alter table public.characters add column if not exists keys int not null default 0 check (keys between 0 and 3);
-- Compteurs de pitié : `{rareté de coffre}` et `{rareté de coffre}:legendaire`
alter table public.characters add column if not exists chest_pity jsonb not null default '{}';
-- L'expédition est toujours en cours : elle démarre à la création du personnage (et ici pour les personnages existants).
alter table public.characters add column if not exists expedition_started_at timestamptz default now();
alter table public.characters add column if not exists chest_opens_date date;
alter table public.characters add column if not exists chest_opens_today int not null default 0 check (chest_opens_today >= 0);

-- Les colonnes d'aventure ne sont pas modifiables par le joueur : `characters` n'accorde la mise à jour que de
-- name, portrait_id, frame_color et motto (voir 20261008000002_security.sql).

-- ═══════════════════════════ Équipement ═══════════════════════════

create table if not exists public.inventory_items (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles (id) on delete cascade,
  -- Identifiant du modèle (`@levelup/content/items.fr.json`), ex. « epee-du-sentier ».
  template_id text not null,
  rarity text not null check (rarity in ('commun', 'peu_commun', 'rare', 'epique', 'legendaire')),
  slot text not null check (slot in ('arme', 'tete', 'torse', 'mains', 'bottes', 'amulette')),
  ability text not null check (ability in ('FOR', 'DEX', 'CON', 'INT', 'SAG', 'CHA')),
  level int not null default 0 check (level between 0 and 10),
  equipped boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists inventory_items_profile on public.inventory_items (profile_id, created_at);
-- Un seul objet équipé par emplacement et par joueur.
create unique index if not exists inventory_items_one_equipped_per_slot on public.inventory_items (profile_id, slot) where equipped;

-- ═══════════════════════════ Coffres ═══════════════════════════

create table if not exists public.chests (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles (id) on delete cascade,
  rarity text not null check (rarity in ('bois', 'bronze', 'argent', 'or', 'mythique')),
  source text not null check (source in ('quest', 'rung', 'streak', 'dungeon', 'merge', 'raid')),
  -- Clé d'idempotence avec `source` : jour de jeu (quête), `{parcours}:{échelon}` (échelon), jalon de série, donjon…
  source_key text not null,
  -- Quête dont la validation a donné ce coffre : retiré si elle est annulée tant qu'il n'est pas ouvert.
  instance_id uuid,
  created_at timestamptz not null default now(),
  opened_at timestamptz,
  unique (profile_id, source, source_key)
);

create index if not exists chests_profile_open on public.chests (profile_id, opened_at);

-- ═══════════════════════════ Donjons ═══════════════════════════

create table if not exists public.dungeon_progress (
  profile_id uuid not null references public.profiles (id) on delete cascade,
  -- Identifiant du donjon (`@levelup/content/dungeons.fr.json`), ex. « dj-musculation ».
  dungeon_id text not null,
  -- Meilleure salle franchie : 0..5, 6 = boss vaincu.
  best_room int not null default 0 check (best_room between 0 and 6),
  -- Palier du donjon à la première victoire sur son boss (0 = jamais).
  boss_defeated_tier int not null default 0 check (boss_defeated_tier >= 0),
  last_run_date date,
  primary key (profile_id, dungeon_id)
);

-- ═══════════════════════════ Sécurité : lecture propriétaire, écriture rôle service ═══════════════════════════

alter table public.inventory_items enable row level security;
alter table public.chests enable row level security;
alter table public.dungeon_progress enable row level security;

drop policy if exists inventory_items_select on public.inventory_items;
create policy inventory_items_select on public.inventory_items for select to authenticated using (profile_id = auth.uid());
drop policy if exists chests_select on public.chests;
create policy chests_select on public.chests for select to authenticated using (profile_id = auth.uid());
drop policy if exists dungeon_progress_select on public.dungeon_progress;
create policy dungeon_progress_select on public.dungeon_progress for select to authenticated using (profile_id = auth.uid());

revoke insert, update, delete on public.inventory_items from anon, authenticated;
revoke insert, update, delete on public.chests from anon, authenticated;
revoke insert, update, delete on public.dungeon_progress from anon, authenticated;
