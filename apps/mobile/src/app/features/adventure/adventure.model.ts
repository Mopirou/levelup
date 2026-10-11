/**
 * Libellés, glyphes et accès au contenu statique de l'onglet « Aventure » (spec docs/DONJONS.md).
 * Les types viennent de l'API réelle (`core/api/types`) ; les noms et glyphes d'objets viennent de `items.fr.json`.
 */
import items from '@levelup/content/items.fr.json';
import sets from '@levelup/content/sets.fr.json';
import type { PortraitGear } from '../../shared/ui';
import type { ChestRarity, EquipSlot, ItemView } from '../../core/api/types';

export type ItemRarity = ItemView['rarity'];
export type { ChestRarity, EquipSlot };

export const CHEST_RARITIES: readonly ChestRarity[] = ['bois', 'bronze', 'argent', 'or', 'mythique'];
export const ITEM_RARITIES: readonly ItemRarity[] = ['commun', 'peu_commun', 'rare', 'epique', 'legendaire'];
export const SLOTS: readonly EquipSlot[] = ['arme', 'tete', 'torse', 'mains', 'bottes', 'amulette'];

export const CHEST_LABEL: Record<ChestRarity, string> = { bois: 'Bois', bronze: 'Bronze', argent: 'Argent', or: 'Or', mythique: 'Mythique' };
export const ITEM_LABEL: Record<ItemRarity, string> = { commun: 'Commun', peu_commun: 'Peu commun', rare: 'Rare', epique: 'Épique', legendaire: 'Légendaire' };
export const SLOT_LABEL: Record<EquipSlot, string> = { arme: 'Arme', tete: 'Tête', torse: 'Torse', mains: 'Mains', bottes: 'Bottes', amulette: 'Amulette' };
export const SLOT_GLYPH: Record<EquipSlot, string> = { arme: '⚔️', tete: '🪖', torse: '🛡️', mains: '🧤', bottes: '👢', amulette: '📿' };
export const CHEST_GLYPH: Record<ChestRarity, string> = { bois: '📦', bronze: '🧰', argent: '🗃️', or: '🏆', mythique: '💎' };
export const ABILITY_NAME: Record<string, string> = { FOR: 'Force', DEX: 'Dextérité', CON: 'Constitution', INT: 'Intelligence', SAG: 'Sagesse', CHA: 'Charisme' };

export const MAX_ITEM_LEVEL = 10;

interface ItemTemplate { id: string; name: string; glyph: string; blurb: string }
const TEMPLATES = new Map<string, ItemTemplate>((items as ItemTemplate[]).map((t) => [t.id, t]));

/** Nom, glyphe et description d'un objet possédé (le modèle statique ne figure pas dans l'état). */
export function itemInfo(item: Pick<ItemView, 'templateId' | 'slot'>): ItemTemplate {
  return TEMPLATES.get(item.templateId) ?? { id: item.templateId, name: 'Objet mystérieux', glyph: SLOT_GLYPH[item.slot] ?? '❔', blurb: '' };
}

// ───────────────────────── Panoplies et équipement du portrait ─────────────────────────

interface SetTemplate { id: string; name: string; glyph: string; ability: string; blurb: string; bonuses: { pieces: number; pp: number; ability: number }[] }
const SET_TEMPLATES = new Map<string, SetTemplate>((sets as SetTemplate[]).map((s) => [s.id, s]));

/** Nom, glyphe et description d'une panoplie (contenu statique `sets.fr.json`). */
export function setInfo(id: string): SetTemplate {
  return SET_TEMPLATES.get(id) ?? { id, name: 'Panoplie inconnue', glyph: '🎽', ability: '', blurb: '', bonuses: [] };
}

/** Texte d'un palier de panoplie : « +12 PP · +3 Force ». */
export function tierLabel(tier: { pp: number; ability: number }, ability: string): string {
  return `+${tier.pp} PP${tier.ability ? ` · +${tier.ability} ${ABILITY_NAME[ability] ?? ability}` : ''}`;
}

/** Les objets équipés d'un héros, sous la forme attendue par l'anneau du portrait (un emoji et une rareté, jamais d'image). */
export function gearOf(items: readonly { slot: EquipSlot; templateId: string; rarity: ItemRarity }[]): PortraitGear[] {
  return items.map((it) => {
    const info = itemInfo(it);
    return { slot: it.slot, glyph: info.glyph, rarity: it.rarity, label: `${SLOT_LABEL[it.slot]} : ${info.name}, ${ITEM_LABEL[it.rarity].toLowerCase()}` };
  });
}
