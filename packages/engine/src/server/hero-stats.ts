import classesJson from '../../../content/data/classes.fr.json';
import itemsJson from '../../../content/data/items.fr.json';
import setsJson from '../../../content/data/sets.fr.json';
import spellsJson from '../../../content/data/spells.fr.json';
import { adventureScores, heroPowerBreakdown, type HeroPowerBreakdown } from '../adventure';
import { ClassDef, masteriesOf } from '../content-types';
import { setBonusTotals, type SetBonusTotals } from '../sets';
import { spellBonuses, type SpellBonuses } from '../spells';
import { AbilityId, InventoryItem, ItemDef, SetDef, SpellDef, SpellKnown } from '../types';
import { abilityScores } from '../xp';
import type { CharacterRecord, GameStore } from './types';

/** Panoplies de classe (contenu statique `sets.fr.json`) : 7 sets de 6 pièces. */
export const SETS = setsJson as unknown as SetDef[];
/** Modèles d'objets (contenu statique `items.fr.json`) : 42 de classe + 12 universels. */
export const ITEM_DEFS = itemsJson as unknown as ItemDef[];
/** Capacités de classe (contenu statique `spells.fr.json`) : 8 par classe. */
export const SPELL_DEFS = spellsJson as unknown as SpellDef[];
export const SPELL_BY_ID: ReadonlyMap<string, SpellDef> = new Map(SPELL_DEFS.map((s) => [s.id, s]));
const CLASSES = classesJson as unknown as ClassDef[];
const CLASS_OF_ITEM = new Map<string, string | null>(ITEM_DEFS.map((i) => [i.id, i.classId ?? null]));

/** Ajoute à chaque objet la classe de son modèle (calculée à la lecture, jamais stockée). */
export function withItemClass<T extends InventoryItem>(items: readonly T[]): T[] {
  return items.map((i) => ({ ...i, classId: CLASS_OF_ITEM.get(i.templateId) ?? null }));
}

/** Puissance et scores d'aventure d'un héros : niveau, caractéristiques, objets équipés, panoplies, capacités. */
export interface HeroSnapshot {
  items: InventoryItem[];
  equipped: InventoryItem[];
  scores: Record<AbilityId, number>;
  power: HeroPowerBreakdown;
  setBonus: SetBonusTotals;
  /** Bonus des capacités équipées (plafonnés) */
  spellBonus: SpellBonuses;
  spells: SpellKnown[];
}

export function buildSnapshot(character: CharacterRecord, rawItems: InventoryItem[], spells: SpellKnown[] = []): HeroSnapshot {
  const masteries = masteriesOf(CLASSES, character.classId);
  const items = withItemClass(rawItems);
  const equipped = items.filter((i) => i.equipped);
  const setBonus = setBonusTotals(SETS, items);
  const spellBonus = spellBonuses(spells, SPELL_BY_ID, character.classId, masteries);
  return {
    items,
    equipped,
    setBonus,
    spellBonus,
    spells,
    scores: adventureScores(abilityScores(character), equipped, character.classId, setBonus, spellBonus),
    power: heroPowerBreakdown(character, items, character.classId, setBonus, spellBonus),
  };
}

export async function heroSnapshot(store: GameStore, userId: string, character: CharacterRecord, known?: InventoryItem[], knownSpells?: SpellKnown[]): Promise<HeroSnapshot> {
  const [items, spells] = await Promise.all([known ?? store.listItems(userId), knownSpells ?? store.listSpells(userId)]);
  return buildSnapshot(character, items, spells);
}

/** PP, scores et bonus de capacités d'un personnage (objets équipés, panoplies et capacités compris), pour les modes qui se jouent à plusieurs. */
export async function heroCombatStats(
  store: GameStore,
  userId: string,
  character: CharacterRecord,
): Promise<{ power: number; scores: Record<AbilityId, number>; raidBonus: number }> {
  const snap = await heroSnapshot(store, userId, character);
  return { power: snap.power.total, scores: snap.scores, raidBonus: snap.spellBonus.raid };
}

/** Bonus d'XP des capacités équipées (en % par caractéristique) : lu par la validation d'une quête. */
export async function heroXpBonus(store: GameStore, userId: string, character: CharacterRecord): Promise<Partial<Record<AbilityId, number>>> {
  const spells = await store.listSpells(userId);
  if (!spells.some((s) => s.equippedSlot !== null)) return {};
  return spellBonuses(spells, SPELL_BY_ID, character.classId, masteriesOf(CLASSES, character.classId)).xp;
}
