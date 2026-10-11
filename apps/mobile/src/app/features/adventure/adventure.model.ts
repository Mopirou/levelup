/**
 * Libellés, glyphes et accès au contenu statique de l'onglet « Aventure » (spec docs/DONJONS.md).
 * Les types viennent de l'API réelle (`core/api/types`) ; les noms et glyphes d'objets viennent de `items.fr.json`.
 */
import items from '@levelup/content/items.fr.json';
import sets from '@levelup/content/sets.fr.json';
import spells from '@levelup/content/spells.fr.json';
import classes from '@levelup/content/classes.fr.json';
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

// ───────────────────────── Grimoire et classes (V4, docs/CLASSES.md) ─────────────────────────

interface SpellTemplate { id: string; name: string; glyph: string; blurb: string; classId: string; rarity: ItemRarity; family: string; ability: string }
const SPELL_TEMPLATES = new Map<string, SpellTemplate>((spells as SpellTemplate[]).map((t) => [t.id, t]));

/** Nom, glyphe et description d'une capacité (contenu statique `spells.fr.json`). */
export function spellInfo(id: string): SpellTemplate {
  return SPELL_TEMPLATES.get(id) ?? { id, name: 'Capacité mystérieuse', glyph: '📖', blurb: '', classId: '', rarity: 'commun', family: 'xp', ability: 'FOR' };
}

/** Toutes les capacités d'une classe (8), de la plus commune à la plus rare. */
export function classSpells(classId: string): SpellTemplate[] {
  return (spells as SpellTemplate[]).filter((s) => s.classId === classId);
}

interface ClassTemplate { id: string; name: string; icon: string }
const CLASS_TEMPLATES = new Map<string, ClassTemplate>((classes as ClassTemplate[]).map((c) => [c.id, c]));

/** Nom et icône d'une classe D&D (contenu statique `classes.fr.json`). */
export function classInfo(id: string | null | undefined): ClassTemplate {
  return (id ? CLASS_TEMPLATES.get(id) : undefined) ?? { id: id ?? '', name: 'Universel', icon: '🎒' };
}

export const FAMILY_LABEL: Record<string, string> = { xp: 'XP', stat: 'Score', raid: 'Raid', gold: 'Or', chest: 'Butin', dungeon: 'Donjon' };
export const FAMILY_GLYPH: Record<string, string> = { xp: '📈', stat: '💪', raid: '🐉', gold: '🪙', chest: '🎁', dungeon: '🏰' };

/** Rareté à partir de laquelle une capacité obtenue dans un coffre est annoncée en grand. */
const ANNOUNCED: readonly ItemRarity[] = ['rare', 'epique', 'legendaire'];
export const isBigSpell = (r: ItemRarity): boolean => ANNOUNCED.includes(r);

/** Phrase d'ambiance d'une capacité obtenue (rare ou mieux). */
export const SPELL_FLAVOR: Partial<Record<ItemRarity, string>> = {
  rare: 'Un nouveau sort rejoint ton grimoire.',
  epique: 'Une magie puissante répond à ton appel.',
  legendaire: 'Les légendes parlent de ce pouvoir : il est à toi.',
};
