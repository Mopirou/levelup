import type { ChestRarity } from './types';

// ───────────────────────── Boutique : coffres contre fragments ─────────────────────────
//
// Les fragments (expéditions, donjons, doublons, démontage) achètent des coffres de bois, de bronze et d'argent. Les prix
// suivent la fusion (3 coffres → 1 de rang supérieur, soit un prix × 3). Il n'y a plus de plafond d'ouverture : chaque jour,
// 2 coffres sont offerts (`DAILY_FREE_CHESTS`), tous les autres s'obtiennent par le jeu ou s'achètent ici.

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

/** Pack de fragments vendu contre de l'or (l'or ne s'obtient pas en échange : l'échange ne va que dans un sens). */
export interface FragmentPack {
  id: string;
  fragments: number;
  /** Prix en or */
  gold: number;
}

/** Du plus petit au plus gros : 15 or le fragment, un peu moins cher en gros (14 puis 13). */
export const FRAGMENT_PACKS: readonly FragmentPack[] = [
  { id: 'petit', fragments: 10, gold: 150 },
  { id: 'moyen', fragments: 50, gold: 700 },
  { id: 'grand', fragments: 200, gold: 2600 },
];

/** Pack de fragments par identifiant, `null` s'il n'existe pas. */
export function fragmentPack(id: string): FragmentPack | null {
  return FRAGMENT_PACKS.find((p) => p.id === id) ?? null;
}
