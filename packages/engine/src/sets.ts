import { EQUIP_SLOTS, EquipSlot, AbilityId, InventoryItem, SetBonusTier, SetDef } from './types';

// ───────────────────────── Panoplies : logique pure ─────────────────────────
//
// 6 sets de 6 pièces (une par emplacement). Bonus à 2 / 4 / 6 pièces équipées : le palier atteint remplace le précédent.
// Les PP du bonus s'ajoutent à la puissance ; le bonus de score s'ajoute à la caractéristique du set, en jeu d'aventure
// uniquement (comme les objets). Voir docs/DONJONS.md §9.

/** Bonus total donné par les panoplies équipées. */
export interface SetBonusTotals {
  /** PP ajoutés à la puissance */
  pp: number;
  /** Bonus de score d'aventure par caractéristique */
  abilities: Partial<Record<AbilityId, number>>;
  /** Panoplies dont au moins un palier est atteint */
  active: { setId: string; pieces: number; tier: SetBonusTier }[];
}

export const NO_SET_BONUS: SetBonusTotals = { pp: 0, abilities: {}, active: [] };

/** Palier de bonus atteint avec `pieces` pièces équipées, `null` si aucun. */
export function setTier(bonuses: readonly SetBonusTier[], pieces: number): SetBonusTier | null {
  let best: SetBonusTier | null = null;
  for (const b of bonuses) if (pieces >= b.pieces && (!best || b.pieces > best.pieces)) best = b;
  return best;
}

/** Prochain palier à atteindre, `null` si tous le sont. */
export function nextSetTier(bonuses: readonly SetBonusTier[], pieces: number): SetBonusTier | null {
  let next: SetBonusTier | null = null;
  for (const b of bonuses) if (b.pieces > pieces && (!next || b.pieces < next.pieces)) next = b;
  return next;
}

/** Bonus des panoplies pour un ensemble d'objets (seuls les objets marqués équipés comptent, chacun dans son emplacement). */
export function setBonusTotals(sets: readonly SetDef[], items: readonly Pick<InventoryItem, 'templateId' | 'slot' | 'equipped'>[]): SetBonusTotals {
  const worn = items.filter((i) => i.equipped);
  const out: SetBonusTotals = { pp: 0, abilities: {}, active: [] };
  for (const set of sets) {
    const pieces = EQUIP_SLOTS.filter((slot) => worn.some((i) => i.slot === slot && i.templateId === set.pieces[slot])).length;
    const tier = setTier(set.bonuses, pieces);
    if (!tier) continue;
    out.pp += tier.pp;
    if (tier.ability) out.abilities[set.ability] = (out.abilities[set.ability] ?? 0) + tier.ability;
    out.active.push({ setId: set.id, pieces, tier });
  }
  return out;
}

export interface SetPieceView {
  slot: EquipSlot;
  templateId: string;
  /** Au moins un exemplaire dans l'inventaire (équipé ou non) */
  owned: boolean;
  equipped: boolean;
}

export interface SetProgress {
  setId: string;
  /** Pièces équipées (0..6) et possédées */
  equipped: number;
  owned: number;
  pieces: SetPieceView[];
  /** Palier actif (le plus haut atteint), `null` si aucun */
  tier: SetBonusTier | null;
  /** Prochain palier, `null` si tous sont atteints */
  next: SetBonusTier | null;
}

/** Progression de chaque panoplie : pièces possédées et équipées, palier actif et suivant. */
export function setsProgress(sets: readonly SetDef[], items: readonly Pick<InventoryItem, 'templateId' | 'slot' | 'equipped'>[]): SetProgress[] {
  return sets.map((set) => {
    const pieces: SetPieceView[] = EQUIP_SLOTS.map((slot) => {
      const templateId = set.pieces[slot];
      const mine = items.filter((i) => i.templateId === templateId && i.slot === slot);
      return { slot, templateId, owned: mine.length > 0, equipped: mine.some((i) => i.equipped) };
    });
    const equipped = pieces.filter((p) => p.equipped).length;
    return {
      setId: set.id,
      equipped,
      owned: pieces.filter((p) => p.owned).length,
      pieces,
      tier: setTier(set.bonuses, equipped),
      next: nextSetTier(set.bonuses, equipped),
    };
  });
}
