import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  ABILITIES,
  EQUIP_SLOTS,
  ITEMS,
  SETS,
  adventureScores,
  emptyAbilityRecord,
  heroPower,
  heroPowerBreakdown,
  itemPower,
  nextSetTier,
  setBonusTotals,
  setTier,
  setsProgress,
  type InventoryItem,
  type SetDef,
} from '../src';

const data = (f: string) => JSON.parse(readFileSync(join(__dirname, '..', '..', 'content', 'data', f), 'utf8'));

const piece = (set: SetDef, slot: (typeof EQUIP_SLOTS)[number], equipped = true, rarity: InventoryItem['rarity'] = 'rare'): InventoryItem => ({
  id: `${set.id}-${slot}-${equipped}`,
  templateId: set.pieces[slot],
  rarity,
  slot,
  ability: set.ability,
  classId: set.id,
  level: 0,
  equipped,
  createdAt: '2026-10-01T00:00:00Z',
});
const wear = (set: SetDef, n: number) => EQUIP_SLOTS.slice(0, n).map((s) => piece(set, s));

const hero = {
  level: 5,
  baseScores: { FOR: 10, DEX: 12, CON: 9, INT: 8, SAG: 10, CHA: 11 },
  improvements: emptyAbilityRecord(0),
  abilityXp: emptyAbilityRecord(0),
};

describe('contenu des panoplies', () => {
  it('7 sets de 6 pièces : un par classe, une pièce par emplacement, jamais deux fois le même objet', () => {
    expect(SETS).toHaveLength(7);
    expect(SETS).toEqual(data('sets.fr.json'));
    expect(SETS.map((s) => s.id)).toEqual(['guerrier', 'paladin', 'rodeur', 'clerc', 'barde', 'roublard', 'magicien']);
    // la caractéristique du set est la première maîtrise de la classe : toutes les caractéristiques sont couvertes
    expect(new Set(SETS.map((s) => s.ability))).toEqual(new Set(['FOR', 'DEX', 'SAG', 'CHA', 'INT']));
    const used = new Set<string>();
    for (const set of SETS) {
      expect(set.name.trim().length).toBeGreaterThan(5);
      expect(set.glyph.trim()).not.toBe('');
      expect(Object.keys(set.pieces).sort()).toEqual([...EQUIP_SLOTS].sort());
      for (const slot of EQUIP_SLOTS) {
        const it = ITEMS.find((i) => i.id === set.pieces[slot])!;
        expect(it, `${set.id}/${slot}`).toBeDefined();
        expect(it.slot).toBe(slot);
        expect(it.classId).toBe(set.id);
        expect(it.setId).toBe(set.id);
        expect(used.has(it.id)).toBe(false);
        used.add(it.id);
      }
      // bonus à 2 / 4 / 6 pièces, croissants
      expect(set.bonuses.map((b) => b.pieces)).toEqual([2, 4, 6]);
      expect(set.bonuses.map((b) => b.pp)).toEqual([5, 12, 25]);
      for (let i = 1; i < set.bonuses.length; i++) expect(set.bonuses[i].ability).toBeGreaterThan(set.bonuses[i - 1].ability);
    }
  });

  it('42 objets de set (un par classe et par emplacement), 12 objets universels hors set (setId nul)', () => {
    expect(ITEMS.filter((i) => i.setId)).toHaveLength(42);
    expect(ITEMS.filter((i) => !i.setId)).toHaveLength(12);
    for (const slot of EQUIP_SLOTS) expect(ITEMS.filter((i) => i.slot === slot && !i.setId)).toHaveLength(2);
    expect(ITEMS.filter((i) => !i.setId).every((i) => !i.classId)).toBe(true);
  });
});

describe('paliers et bonus', () => {
  const tiers = SETS[0].bonuses;

  it('le palier atteint remplace le précédent', () => {
    expect(setTier(tiers, 0)).toBeNull();
    expect(setTier(tiers, 1)).toBeNull();
    expect(setTier(tiers, 2)?.pp).toBe(5);
    expect(setTier(tiers, 3)?.pp).toBe(5);
    expect(setTier(tiers, 4)?.pp).toBe(12);
    expect(setTier(tiers, 5)?.pp).toBe(12);
    expect(setTier(tiers, 6)?.pp).toBe(25);
  });

  it('prochain palier', () => {
    expect(nextSetTier(tiers, 0)?.pieces).toBe(2);
    expect(nextSetTier(tiers, 2)?.pieces).toBe(4);
    expect(nextSetTier(tiers, 5)?.pieces).toBe(6);
    expect(nextSetTier(tiers, 6)).toBeNull();
  });

  it('bonus total : 2, 4 et 6 pièces équipées', () => {
    const [titan] = SETS;
    expect(setBonusTotals(SETS, wear(titan, 1))).toEqual({ pp: 0, abilities: {}, active: [] });
    expect(setBonusTotals(SETS, wear(titan, 2))).toMatchObject({ pp: 5, abilities: { FOR: titan.bonuses[0].ability } });
    expect(setBonusTotals(SETS, wear(titan, 4))).toMatchObject({ pp: 12, abilities: { FOR: titan.bonuses[1].ability } });
    const six = setBonusTotals(SETS, wear(titan, 6));
    expect(six).toMatchObject({ pp: 25, abilities: { FOR: titan.bonuses[2].ability } });
    expect(six.active).toEqual([{ setId: 'guerrier', pieces: 6, tier: titan.bonuses[2] }]);
  });

  it('seules les pièces équipées comptent, chacune dans son emplacement ; deux sets se cumulent', () => {
    const [titan] = SETS;
    const ombre = SETS[2];
    const items = [...EQUIP_SLOTS.slice(0, 3).map((s) => piece(titan, s, false)), piece(titan, 'arme', true), piece(titan, 'tete', true)];
    // les doublons d'exemplaires non équipés ne comptent pas
    expect(setBonusTotals(SETS, items).pp).toBe(5);
    // une pièce équipée dans le mauvais emplacement ne compte pas
    expect(setBonusTotals(SETS, [{ ...piece(titan, 'arme'), slot: 'tete' }, piece(titan, 'tete')]).pp).toBe(0);
    const both = setBonusTotals(SETS, [...wear(titan, 2), ...wear(ombre, 4)]);
    expect(both.pp).toBe(5 + 12);
    expect(both.abilities).toEqual({ FOR: titan.bonuses[0].ability, DEX: ombre.bonuses[1].ability });
    expect(both.active.map((a) => a.setId)).toEqual(['guerrier', 'rodeur']);
  });

  it('la rareté de l’exemplaire ne change pas le palier', () => {
    const [titan] = SETS;
    const items = EQUIP_SLOTS.slice(0, 2).map((s) => piece(titan, s, true, 'commun'));
    expect(setBonusTotals(SETS, items).pp).toBe(5);
  });
});

describe('puissance et scores avec panoplies', () => {
  const [titan] = SETS;
  const worn = wear(titan, 6);

  it('heroPower ajoute les PP du palier atteint', () => {
    const bonus = setBonusTotals(SETS, worn);
    const items = worn.reduce((n, i) => n + itemPower(i, 'guerrier'), 0);
    const without = heroPower(hero, worn, 'guerrier');
    const withSets = heroPower(hero, worn, 'guerrier', bonus);
    expect(withSets - without).toBe(25);
    const b = heroPowerBreakdown(hero, worn, 'guerrier', bonus);
    expect(b).toMatchObject({ items, sets: 25, total: b.level + b.scores + items + 25 });
    // sans bonus passé : aucun changement pour les appels existants
    expect(heroPowerBreakdown(hero, worn, 'guerrier').sets).toBe(0);
  });

  it('adventureScores ajoute le bonus de caractéristique du set (jamais à l’XP)', () => {
    const scores = { FOR: 10, DEX: 12, CON: 9, INT: 8, SAG: 10, CHA: 11 };
    const bonus = setBonusTotals(SETS, wear(titan, 4));
    const withSets = adventureScores(scores, [], 'guerrier', bonus);
    expect(withSets.FOR).toBe(10 + titan.bonuses[1].ability);
    expect(withSets.DEX).toBe(12);
    expect(adventureScores(scores, [])).toEqual(scores);
  });
});

describe('progression des panoplies', () => {
  it('pièces possédées et équipées, palier actif et suivant', () => {
    const [titan] = SETS;
    const items = [piece(titan, 'arme', true), piece(titan, 'tete', false), { ...piece(titan, 'torse', false), id: 'x2' }];
    const [p] = setsProgress(SETS, items);
    expect(p).toMatchObject({ setId: 'guerrier', equipped: 1, owned: 3, tier: null });
    expect(p.next?.pieces).toBe(2);
    expect(p.pieces.map((x) => [x.slot, x.owned, x.equipped])).toEqual([
      ['arme', true, true],
      ['tete', true, false],
      ['torse', true, false],
      ['mains', false, false],
      ['bottes', false, false],
      ['amulette', false, false],
    ]);
    const full = setsProgress(SETS, wear(titan, 6))[0];
    expect(full).toMatchObject({ equipped: 6, owned: 6, next: null });
    expect(full.tier?.pp).toBe(25);
    expect(setsProgress(SETS, [])).toHaveLength(7);
  });
});
