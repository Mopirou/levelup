import type { ChestRarity } from './types';

// ───────────────────────── Boutique : coffres contre fragments ─────────────────────────
//
// Les fragments (expéditions, donjons, doublons, démontage) achètent des coffres de bois, de bronze et d'argent. Les prix
// suivent la fusion (3 coffres → 1 de rang supérieur, soit un prix × 3) : acheter ne contourne jamais l'ouverture de
// `CHEST_OPENS_PER_DAY` coffres par jour, il alimente seulement le stock.

export interface ShopOffer {
  rarity: ChestRarity;
  /** Prix en fragments */
  price: number;
}

/** Coffres en vente : les trois premiers rangs. Or et mythique restent réservés au mérite (séries, échelons, donjons, saisons). */
export const SHOP_OFFERS: readonly ShopOffer[] = [
  { rarity: 'bois', price: 25 },
  { rarity: 'bronze', price: 75 },
  { rarity: 'argent', price: 225 },
];

/** Prix d'un coffre en fragments, `null` s'il n'est pas en vente. */
export function shopPrice(rarity: ChestRarity): number | null {
  return SHOP_OFFERS.find((o) => o.rarity === rarity)?.price ?? null;
}
