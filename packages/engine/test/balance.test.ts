import { describe, expect, it } from 'vitest';
import {
  ABILITIES,
  EQUIP_SLOTS,
  ITEMS,
  ITEM_AFFINITY_BONUS,
  SETS,
  SPELL_DEFS,
  SPELL_FAMILIES,
  SPELL_MAX_LEVEL,
  SPELL_POINTS,
  SPELL_SLOTS,
  SPELL_XP_CAP,
  abilityScores,
  classEnvelope,
  emptyAbilityRecord,
  heroPowerBreakdown,
  itemPower,
  masteriesOf,
  setBonusTotals,
  spellBonuses,
  withItemClass,
  type AbilityId,
  type ClassDef,
  type InventoryItem,
  type ItemRarity,
  type SpellKnown,
} from '../src';
import classesJson from '../../content/data/classes.fr.json';

// Test d'équilibre obligatoire (docs/CLASSES.md §6) : les 7 classes ont la même structure de butin et la même enveloppe de puissance.
// Les différences viennent de la saveur (quelle caractéristique, quelle famille d'effet), jamais de la puissance totale.

const CLASSES = classesJson as unknown as ClassDef[];
const CLASS_IDS = ['guerrier', 'paladin', 'rodeur', 'clerc', 'barde', 'roublard', 'magicien'];
const EXPECTED_MASTERIES: Record<string, [AbilityId, AbilityId]> = {
  guerrier: ['FOR', 'CON'],
  paladin: ['FOR', 'CHA'],
  rodeur: ['DEX', 'SAG'],
  clerc: ['SAG', 'CON'],
  barde: ['CHA', 'DEX'],
  roublard: ['DEX', 'INT'],
  magicien: ['INT', 'CON'],
};
/** Écart maximal toléré entre la meilleure et la moins bonne classe, sur chaque critère. */
const MAX_GAP = 0.05;
const gap = (values: number[]) => (Math.max(...values) - Math.min(...values)) / Math.max(...values);

/** Même héros de référence pour toutes les classes : seul le butin de classe diffère. */
const hero = {
  level: 20,
  baseScores: { FOR: 10, DEX: 10, CON: 10, INT: 10, SAG: 10, CHA: 10 },
  improvements: emptyAbilityRecord(0),
  abilityXp: emptyAbilityRecord(0),
};

/** Équipement de classe au maximum : 6 pièces légendaires niveau 10. */
function maxGear(classId: string): InventoryItem[] {
  return withItemClass(
    EQUIP_SLOTS.map((slot): InventoryItem => {
      const t = ITEMS.find((i) => i.classId === classId && i.slot === slot)!;
      return { id: `${classId}-${slot}`, templateId: t.id, rarity: 'legendaire', slot, ability: t.ability, level: 10, equipped: true, createdAt: '' };
    }),
  );
}

/** Les 3 meilleures capacités de la classe, niveau 5, dans le Grimoire. */
function maxGrimoire(classId: string): SpellKnown[] {
  return SPELL_DEFS.filter((s) => s.classId === classId)
    .sort((a, b) => SPELL_POINTS[b.rarity] - SPELL_POINTS[a.rarity])
    .slice(0, SPELL_SLOTS)
    .map((s, i) => ({ spellId: s.id, level: SPELL_MAX_LEVEL, equippedSlot: i + 1 }));
}

const SPELL_BY_ID = new Map(SPELL_DEFS.map((s) => [s.id, s]));

function envelope(classId: string) {
  const masteries = masteriesOf(CLASSES, classId);
  const gear = maxGear(classId);
  const sets = setBonusTotals(SETS, gear);
  const spells = spellBonuses(maxGrimoire(classId), SPELL_BY_ID, classId, masteries);
  const power = heroPowerBreakdown(hero, gear, classId, sets, spells);
  return { classId, masteries, power, env: classEnvelope(classId, SPELL_DEFS, masteries), spells };
}

describe('équilibre des 7 classes', () => {
  const rows = CLASS_IDS.map(envelope);

  it('les maîtrises de classes.fr.json sont celles de la spécification', () => {
    for (const c of CLASS_IDS) expect(masteriesOf(CLASSES, c)).toEqual(EXPECTED_MASTERIES[c]);
  });

  it('même structure : 6 pièces d’équipement et 8 capacités (2-2-2-1-1) par classe', () => {
    for (const c of CLASS_IDS) {
      const items = ITEMS.filter((i) => i.classId === c);
      expect(items.map((i) => i.slot).sort()).toEqual([...EQUIP_SLOTS].sort());
      const rarities = SPELL_DEFS.filter((s) => s.classId === c).map((s) => s.rarity);
      expect(rarities).toEqual<ItemRarity[]>(['commun', 'commun', 'peu_commun', 'peu_commun', 'rare', 'rare', 'epique', 'legendaire']);
    }
    expect(SPELL_DEFS).toHaveLength(56);
    expect(SETS).toHaveLength(7);
    for (const set of SETS) expect(Object.keys(set.pieces)).toHaveLength(6);
  });

  it('chaque caractéristique est maîtrisée par 2 ou 3 classes (14 places)', () => {
    const count = emptyAbilityRecord(0);
    for (const c of CLASS_IDS) for (const m of masteriesOf(CLASSES, c)) count[m]++;
    for (const a of ABILITIES) expect(count[a], a).toBeGreaterThanOrEqual(2);
    for (const a of ABILITIES) expect(count[a], a).toBeLessThanOrEqual(3);
    expect(ABILITIES.reduce((n, a) => n + count[a], 0)).toBe(14);
  });

  it('chaque caractéristique est couverte par des capacités et des objets ; l’équipement d’une classe sert ses deux maîtrises', () => {
    for (const a of ABILITIES) {
      expect(SPELL_DEFS.some((s) => s.ability === a), a).toBe(true);
      expect(ITEMS.some((i) => i.ability === a), a).toBe(true);
    }
    for (const c of CLASS_IDS) {
      const masteries = masteriesOf(CLASSES, c);
      const mine = ITEMS.filter((i) => i.classId === c);
      for (const m of masteries) expect(mine.filter((i) => i.ability === m), `${c} ${m}`).toHaveLength(3);
      // l’XP des capacités ne vise que les maîtrises de la classe
      for (const s of SPELL_DEFS.filter((x) => x.classId === c && x.family === 'xp' && x.ability !== 'all')) expect(masteries).toContain(s.ability);
    }
  });

  it('critère 1 : PP maximale (équipement de classe au maximum + capacités de classe) à moins de 5 % d’écart', () => {
    const pp = rows.map((r) => r.power.total);
    expect(gap(pp)).toBeLessThanOrEqual(MAX_GAP);
    // l'affinité de classe : +20 % sur chaque pièce de la classe
    for (const r of rows) {
      expect(r.power.items).toBe(6 * itemPower({ rarity: 'legendaire', level: 10, classId: r.classId }, r.classId));
      expect(itemPower({ rarity: 'legendaire', level: 10, classId: r.classId }, r.classId)).toBe(Math.round(130 * 2 * (1 + ITEM_AFFINITY_BONUS)));
      expect(r.power.sets).toBe(25);
    }
  });

  it('critère 2 : somme des points d’effet des capacités, par famille et au total, à moins de 5 % d’écart', () => {
    expect(gap(rows.map((r) => r.env.totalPoints))).toBeLessThanOrEqual(MAX_GAP);
    expect(gap(rows.map((r) => r.env.topThreePoints))).toBeLessThanOrEqual(MAX_GAP);
    expect(gap(rows.map((r) => r.env.spellPp))).toBeLessThanOrEqual(MAX_GAP);
    for (const r of rows) {
      expect(r.env.totalPoints).toBe(62);
      // une classe garde sa saveur : au moins 4 familles d'effet, et aucune ne représente plus de la moitié de ses points
      const used = SPELL_FAMILIES.filter((f) => r.env.familyPoints[f] > 0);
      expect(used.length, r.classId).toBeGreaterThanOrEqual(4);
      for (const f of SPELL_FAMILIES) expect(r.env.familyPoints[f], `${r.classId} ${f}`).toBeLessThanOrEqual(r.env.totalPoints / 2);
    }
    // toutes les familles existent chez au moins une classe
    for (const f of SPELL_FAMILIES) expect(rows.some((r) => r.env.familyPoints[f] > 0), f).toBe(true);
  });

  it('critère 3 : XP bonus maximal (3 emplacements, niveau 5, avant et après plafond) à moins de 5 % d’écart', () => {
    expect(gap(rows.map((r) => r.env.xpMaxRaw))).toBeLessThanOrEqual(MAX_GAP);
    expect(gap(rows.map((r) => r.env.xpMax))).toBeLessThanOrEqual(MAX_GAP);
    for (const r of rows) {
      expect(r.env.xpMax).toBeLessThanOrEqual(SPELL_XP_CAP);
      // le Grimoire maximal reste sous les plafonds
      for (const a of ABILITIES) expect(r.spells.xp[a] ?? 0).toBeLessThanOrEqual(SPELL_XP_CAP);
      expect(r.spells.raid).toBeLessThanOrEqual(30);
      expect(r.spells.gold).toBeLessThanOrEqual(30);
      expect(r.spells.dungeon).toBeLessThanOrEqual(30);
      expect(r.spells.chest).toBeLessThanOrEqual(30);
    }
  });

  it('les scores de référence ne changent pas la comparaison (le héros est le même pour toutes les classes)', () => {
    const s = abilityScores(hero);
    expect(Object.values(s).every((v) => v === s.FOR)).toBe(true);
  });
});
