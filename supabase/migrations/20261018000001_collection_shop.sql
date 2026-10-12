-- Collection « Bestiaire & Reliques » et boutique de coffres (docs/COLLECTION.md). Migration idempotente : elle peut être rejouée sans erreur.
-- Toutes les écritures passent par la fonction « game » (rôle service) ; le joueur ne peut que lire ses propres lignes.

-- ═══════════════════════════ Cartes possédées ═══════════════════════════

create table if not exists public.cards_owned (
  profile_id uuid not null references public.profiles (id) on delete cascade,
  -- Identifiant de la carte (cards.fr.json), ex. « mimique ».
  card_id text not null,
  -- Exemplaires obtenus : 1 pour la première fois, +1 par doublon (chaque doublon rend aussi des fragments).
  copies int not null default 1 check (copies >= 1),
  created_at timestamptz not null default now(),
  primary key (profile_id, card_id)
);

alter table public.cards_owned enable row level security;
drop policy if exists cards_owned_select on public.cards_owned;
create policy cards_owned_select on public.cards_owned for select to authenticated using (profile_id = auth.uid());
revoke insert, update, delete on public.cards_owned from anon, authenticated;

-- ═══════════════════════════ Source de coffre « shop » ═══════════════════════════
-- Un coffre acheté en boutique porte la source 'shop' (sa clé d'idempotence est un identifiant unique par achat).

alter table public.chests drop constraint if exists chests_source_check;
alter table public.chests add constraint chests_source_check
  check (source in ('quest', 'rung', 'streak', 'dungeon', 'merge', 'raid', 'season', 'daily', 'shop'));
