import { CARD_KINDS, ITEM_RARITIES, type CardDef, type CardKind, type CardOwned, type ChestRarity, type ItemRarity } from './types';

// ───────────────────────── Collection « Bestiaire & Reliques » : logique pure ─────────────────────────
//
// Des cartes sans effet de jeu, tirées dans les coffres à la place d'un objet ou d'une capacité. Une carte déjà possédée
// devient un doublon qui rend des fragments. Voir docs/COLLECTION.md.

/** Part (en %) des coffres qui donnent une carte, par rareté de coffre (le reste : objet ou capacité). */
export const CARD_CHANCE: Record<ChestRarity, number> = { bois: 20, bronze: 20, argent: 18, or: 15, mythique: 12 };

/** Part (en %) des tirages qui visent d'abord une carte encore inconnue de la rareté tirée (s'il en reste). */
export const CARD_NEW_BIAS = 50;

/** Fragments rendus par un doublon, par rareté de carte (toujours moins que démonter un objet de même rareté). */
export const CARD_DUPLICATE_FRAGMENTS: Record<ItemRarity, number> = { commun: 1, peu_commun: 3, rare: 8, epique: 20, legendaire: 50 };

/** Fragments rendus par un doublon de carte. */
export function cardDuplicateFragments(rarity: ItemRarity): number {
  return CARD_DUPLICATE_FRAGMENTS[rarity];
}

/**
 * Choisit une carte dans `pool` : une carte inconnue d'abord (`CARD_NEW_BIAS` % des tirages, s'il en reste), sinon n'importe laquelle.
 * `rng` est consommé deux fois au plus, toujours dans le même ordre (déterministe pour une graine).
 */
export function pickCard(pool: readonly CardDef[], rng: () => number, owned: ReadonlySet<string> = new Set()): CardDef | null {
  if (!pool.length) return null;
  const fresh = pool.filter((c) => !owned.has(c.id));
  const preferFresh = rng() * 100 < CARD_NEW_BIAS && fresh.length > 0;
  const list = preferFresh ? fresh : pool;
  return list[Math.min(Math.floor(rng() * list.length), list.length - 1)];
}

export interface CollectionProgress {
  owned: number;
  total: number;
  byRarity: Record<ItemRarity, { owned: number; total: number }>;
  byKind: Record<CardKind, { owned: number; total: number }>;
}

/** Avancement de la collection : cartes différentes possédées, au total, par rareté et par type. */
export function collectionProgress(defs: readonly CardDef[], owned: readonly Pick<CardOwned, 'cardId'>[]): CollectionProgress {
  const have = new Set(owned.map((o) => o.cardId));
  const byRarity = Object.fromEntries(ITEM_RARITIES.map((r) => [r, { owned: 0, total: 0 }])) as CollectionProgress['byRarity'];
  const byKind = Object.fromEntries(CARD_KINDS.map((k) => [k, { owned: 0, total: 0 }])) as CollectionProgress['byKind'];
  let count = 0;
  for (const c of defs) {
    byRarity[c.rarity].total++;
    byKind[c.kind].total++;
    if (have.has(c.id)) {
      byRarity[c.rarity].owned++;
      byKind[c.kind].owned++;
      count++;
    }
  }
  return { owned: count, total: defs.length, byRarity, byKind };
}
