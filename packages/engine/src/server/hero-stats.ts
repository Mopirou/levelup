import classesJson from '../../../content/data/classes.fr.json';
import setsJson from '../../../content/data/sets.fr.json';
import { adventureScores, heroPowerBreakdown, type HeroPowerBreakdown } from '../adventure';
import { ClassDef, masteriesOf } from '../content-types';
import { setBonusTotals, type SetBonusTotals } from '../sets';
import { AbilityId, InventoryItem, SetDef } from '../types';
import { abilityScores } from '../xp';
import type { CharacterRecord, GameStore } from './types';

/** Panoplies (contenu statique `sets.fr.json`) : 6 sets de 6 pièces. */
export const SETS = setsJson as unknown as SetDef[];
const CLASSES = classesJson as unknown as ClassDef[];

/** Puissance et scores d'aventure d'un héros : niveau, caractéristiques, objets équipés, bonus de panoplies. */
export interface HeroSnapshot {
  items: InventoryItem[];
  equipped: InventoryItem[];
  scores: Record<AbilityId, number>;
  power: HeroPowerBreakdown;
  setBonus: SetBonusTotals;
}

export function buildSnapshot(character: CharacterRecord, items: InventoryItem[]): HeroSnapshot {
  const masteries = masteriesOf(CLASSES, character.classId);
  const equipped = items.filter((i) => i.equipped);
  const setBonus = setBonusTotals(SETS, items);
  return {
    items,
    equipped,
    setBonus,
    scores: adventureScores(abilityScores(character), equipped, masteries, setBonus),
    power: heroPowerBreakdown(character, items, masteries, setBonus),
  };
}

export async function heroSnapshot(store: GameStore, userId: string, character: CharacterRecord, known?: InventoryItem[]): Promise<HeroSnapshot> {
  return buildSnapshot(character, known ?? (await store.listItems(userId)));
}

/** PP et scores d'aventure d'un personnage (objets équipés et panoplies compris), pour les modes qui se jouent à plusieurs. */
export async function heroCombatStats(store: GameStore, userId: string, character: CharacterRecord): Promise<{ power: number; scores: Record<AbilityId, number> }> {
  const snap = await heroSnapshot(store, userId, character);
  return { power: snap.power.total, scores: snap.scores };
}
