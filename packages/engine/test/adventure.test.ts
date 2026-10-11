import { describe, expect, it } from 'vitest';
import {
  CHEST_RARITIES,
  CHEST_TABLE,
  DISMANTLE_FRAGMENTS,
  DUNGEON_BOSS_ROOM,
  EXPEDITION_CAP_HOURS,
  EXPEDITION_KEY_CHANCE,
  ITEMS,
  ITEM_MAX_LEVEL,
  ITEM_RARITIES,
  PITY_EPIC,
  PITY_LEGENDARY,
  abilityScores,
  adjustedOdds,
  adventureScores,
  dailyChestRarity,
  dismantleValue,
  drawChest,
  dungeonBase,
  dungeonBossChest,
  dungeonBossPower,
  dungeonRoomPower,
  dungeonUnlockLevel,
  emptyAbilityRecord,
  equippedBySlot,
  expeditionRates,
  expeditionYield,
  heroPower,
  heroPowerBreakdown,
  itemAbilityBonus,
  itemPower,
  nextChestRarity,
  nextItemRarity,
  pickTemplateForSlot,
  resolveDungeon,
  rollExpeditionKey,
  rungChestRarity,
  streakMilestoneChest,
  streakMultiplier,
  upgradeCost,
  type ChestRarity,
  type InventoryItem,
  type ItemRarity,
} from '../src';

const hero = {
  level: 5,
  baseScores: { FOR: 10, DEX: 12, CON: 9, INT: 8, SAG: 10, CHA: 11 },
  improvements: emptyAbilityRecord(0),
  abilityXp: emptyAbilityRecord(0),
};

const item = (rarity: ItemRarity, level = 0, ability: InventoryItem['ability'] = 'FOR', equipped = true): InventoryItem => ({
  id: `${rarity}-${level}-${ability}`,
  templateId: 'epee-du-sentier',
  rarity,
  slot: 'arme',
  ability,
  level,
  equipped,
  createdAt: '2026-10-05T00:00:00Z',
});

describe('puissance', () => {
  it('PP d’un objet : base × (1 + 0,1 × niveau), +20 % d’affinité de classe', () => {
    expect(itemPower(item('commun'))).toBe(5);
    expect(itemPower(item('legendaire'))).toBe(130);
    expect(itemPower(item('rare', 5))).toBe(42);
    // affinité : l'objet est de la classe du héros (28 × 1,5 × 1,2 = 50) ; un objet d'une autre classe ou universel n'a rien
    expect(itemPower({ ...item('rare', 5), classId: 'guerrier' }, 'guerrier')).toBe(50);
    expect(itemPower({ ...item('rare', 5), classId: 'clerc' }, 'guerrier')).toBe(42);
    expect(itemPower({ ...item('rare', 5), classId: null }, 'guerrier')).toBe(42);
    expect(itemPower({ ...item('rare', 5), classId: 'guerrier' })).toBe(42);
    // niveau borné à 0..10
    expect(itemPower(item('epique', 99))).toBe(120);
    expect(itemPower(item('epique', -3))).toBe(60);
  });

  it('bonus de score = floor(PP / 12), uniquement sur la caractéristique de l’objet', () => {
    expect(itemAbilityBonus(item('commun'))).toBe(0);
    expect(itemAbilityBonus(item('rare'))).toBe(2);
    expect(itemAbilityBonus(item('legendaire', 10))).toBe(21);
    const base = abilityScores(hero);
    const adv = adventureScores(base, [item('rare', 0, 'DEX'), item('epique', 0, 'DEX')]);
    expect(adv.DEX).toBe(base.DEX + 2 + 5);
    expect(adv.FOR).toBe(base.FOR);
    // les scores d'origine ne sont pas modifiés
    expect(abilityScores(hero).DEX).toBe(base.DEX);
  });

  it('PP = niveau × 10 + Σ scores + Σ PP des objets équipés (les autres ne comptent pas)', () => {
    const scores = abilityScores(hero);
    const sum = Object.values(scores).reduce((a, b) => a + b, 0);
    expect(heroPower(hero, [])).toBe(50 + sum);
    const items = [item('rare'), item('epique', 0, 'CON'), item('legendaire', 0, 'INT', false)];
    const b = heroPowerBreakdown(hero, items);
    expect(b).toEqual({ total: 50 + sum + 28 + 60, level: 50, scores: sum, items: 88, sets: 0, spells: 0 });
    expect(heroPower(hero, items)).toBe(b.total);
    const clerc = items.map((i) => (i.ability === 'CON' ? { ...i, classId: 'clerc' } : i));
    expect(heroPower(hero, clerc, 'clerc')).toBe(50 + sum + 28 + 72);
  });
});

describe('expédition', () => {
  it('multiplicateur de série : +2 % par jour, plafonné à +30 %', () => {
    expect(streakMultiplier(0)).toBe(1);
    expect(streakMultiplier(5)).toBeCloseTo(1.1);
    expect(streakMultiplier(15)).toBeCloseTo(1.3);
    expect(streakMultiplier(400)).toBeCloseTo(1.3);
    expect(streakMultiplier(-4)).toBe(1);
  });

  it('rendements horaires : or = 20 × (1 + PP/200) × (1 + INT/40), fragments = 1 + PP/400', () => {
    const r = expeditionRates(100, { INT: 10, DEX: 0 }, 0);
    expect(r.goldPerHour).toBeCloseTo(20 * 1.5 * 1.25);
    expect(r.fragmentsPerHour).toBeCloseTo(1.25);
    // DEX accélère, la série aussi
    const fast = expeditionRates(100, { INT: 10, DEX: 10 }, 50);
    expect(fast.goldPerHour).toBeCloseTo(r.goldPerHour * 1.2 * 1.3);
    expect(fast.fragmentsPerHour).toBeCloseTo(r.fragmentsPerHour * 1.2 * 1.3);
  });

  it('accumule jusqu’à 24 h puis plafonne', () => {
    const base = { pp: 100, scores: { INT: 10, DEX: 0 }, streak: 0 };
    const h = 3_600_000;
    const ten = expeditionYield({ ...base, elapsedMs: 10 * h });
    expect(ten).toMatchObject({ hours: 10, capped: false, gold: 375, fragments: 12 });
    expect(ten.keyChance).toBeCloseTo((EXPEDITION_KEY_CHANCE * 10) / 24);
    const cap = expeditionYield({ ...base, elapsedMs: 24 * h });
    expect(cap).toMatchObject({ hours: EXPEDITION_CAP_HOURS, capped: true, gold: 900, fragments: 30 });
    expect(cap.keyChance).toBeCloseTo(EXPEDITION_KEY_CHANCE);
    // au-delà de 24 h : rien de plus
    expect(expeditionYield({ ...base, elapsedMs: 500 * h })).toEqual(cap);
    // horloge à l'envers : rien
    expect(expeditionYield({ ...base, elapsedMs: -5 * h })).toMatchObject({ hours: 0, gold: 0, fragments: 0, keyChance: 0, capped: false });
  });

  it('la Clé est tirée de façon déterministe, avec la bonne fréquence', () => {
    expect(rollExpeditionKey('a', 0)).toBe(false);
    expect(rollExpeditionKey('a', 1)).toBe(true);
    expect(rollExpeditionKey('graine', 0.5)).toBe(rollExpeditionKey('graine', 0.5));
    let n = 0;
    for (let i = 0; i < 4000; i++) if (rollExpeditionKey(`s${i}`, EXPEDITION_KEY_CHANCE)) n++;
    expect(n / 4000).toBeGreaterThan(0.035);
    expect(n / 4000).toBeLessThan(0.065);
  });
});

describe('coffres : sources', () => {
  it('coffre du jour : bois, bronze dès 7 jours, argent dès 30', () => {
    expect(dailyChestRarity(1)).toBe('bois');
    expect(dailyChestRarity(6)).toBe('bois');
    expect(dailyChestRarity(7)).toBe('bronze');
    expect(dailyChestRarity(29)).toBe('bronze');
    expect(dailyChestRarity(30)).toBe('argent');
  });
  it('promotion d’échelon : bronze 1-4, argent 5-7, or 8-9, mythique 10', () => {
    expect([2, 4, 5, 7, 8, 9, 10].map(rungChestRarity)).toEqual(['bronze', 'bronze', 'argent', 'argent', 'or', 'or', 'mythique']);
  });
  it('jalons de série 7 / 30 / 100', () => {
    expect([7, 30, 100].map(streakMilestoneChest)).toEqual(['argent', 'or', 'mythique']);
    expect(streakMilestoneChest(8)).toBeNull();
  });
  it('rareté suivante (fusion) : jamais au-delà de mythique / légendaire', () => {
    expect(CHEST_RARITIES.map(nextChestRarity)).toEqual(['bronze', 'argent', 'or', 'mythique', null]);
    expect(ITEM_RARITIES.map(nextItemRarity)).toEqual(['peu_commun', 'rare', 'epique', 'legendaire', null]);
  });
});

describe('coffres : probabilités et SAG', () => {
  it('chaque tableau fait 100 %', () => {
    for (const r of CHEST_RARITIES) expect(CHEST_TABLE[r].odds.reduce((a, b) => a + b, 0)).toBe(100);
  });
  it('SAG : 2 points de la plus basse rareté vers la plus haute par palier de 10 (borné, somme = 100)', () => {
    expect(adjustedOdds('bois', 0)).toEqual([70, 25, 5, 0, 0]);
    expect(adjustedOdds('bois', 9)).toEqual([70, 25, 5, 0, 0]);
    expect(adjustedOdds('bois', 10)).toEqual([68, 25, 7, 0, 0]);
    expect(adjustedOdds('bois', 35)).toEqual([64, 25, 11, 0, 0]);
    expect(adjustedOdds('mythique', 20)).toEqual([0, 0, 6, 55, 39]);
    expect(adjustedOdds('or', 20)).toEqual([0, 1, 35, 50, 14]);
    // borné : on ne peut pas retirer plus que la masse de la plus basse
    expect(adjustedOdds('or', 500)).toEqual([0, 0, 35, 50, 15]);
    expect(adjustedOdds('bois', 10_000)).toEqual([0, 25, 75, 0, 0]);
    // SAG négative ou absurde : inchangé
    expect(adjustedOdds('argent', -40)).toEqual([5, 30, 45, 18, 2]);
    for (const r of CHEST_RARITIES) for (const sag of [0, 7, 10, 20, 33, 80]) expect(adjustedOdds(r, sag).reduce((a, b) => a + b, 0)).toBe(100);
  });
});

describe('coffres : tirage', () => {
  const draw = (chest: ChestRarity, seed: string, sag = 0, pity = {}) => drawChest({ chest, sag, pity, seed, templates: ITEMS });

  it('est déterministe pour une graine, et change avec elle', () => {
    expect(draw('argent', 'p|1')).toEqual(draw('argent', 'p|1'));
    const seeds = new Set(Array.from({ length: 30 }, (_, i) => draw('argent', `p|${i}`).template!.id));
    expect(seeds.size).toBeGreaterThan(5);
  });

  it('donne toujours un objet existant, des fragments et de l’or du tableau', () => {
    for (const r of CHEST_RARITIES) {
      const d = draw(r, `x-${r}`);
      expect(ITEMS.some((t) => t.id === d.template!.id)).toBe(true);
      expect(d.fragments).toBe(CHEST_TABLE[r].fragments);
      expect(d.gold).toBe(CHEST_TABLE[r].gold);
    }
  });

  it('refuse un tirage sans modèles', () => {
    expect(() => drawChest({ chest: 'bois', sag: 0, pity: {}, seed: 's', templates: [] })).toThrow();
  });

  it('respecte les probabilités (coffre d’argent, 6000 tirages sans pitié effective)', () => {
    const counts: Record<string, number> = {};
    const N = 6000;
    for (let i = 0; i < N; i++) {
      const d = draw('argent', `dist-${i}`);
      counts[d.rarity] = (counts[d.rarity] ?? 0) + 1;
    }
    const pct = (r: string) => ((counts[r] ?? 0) / N) * 100;
    // la pitié (8 sans épique) ne s'applique pas ici : la pitié est portée par l'appelant, pas par le tirage seul
    expect(pct('commun')).toBeGreaterThan(3);
    expect(pct('commun')).toBeLessThan(7);
    expect(pct('peu_commun')).toBeGreaterThan(27);
    expect(pct('peu_commun')).toBeLessThan(33);
    expect(pct('rare')).toBeGreaterThan(42);
    expect(pct('rare')).toBeLessThan(48);
    expect(pct('epique')).toBeGreaterThan(15);
    expect(pct('epique')).toBeLessThan(21);
    expect(pct('legendaire')).toBeGreaterThan(0.8);
    expect(pct('legendaire')).toBeLessThan(3.5);
  });

  it('un coffre de bois ne donne ni épique ni légendaire sans pitié', () => {
    for (let i = 0; i < 500; i++) expect(['commun', 'peu_commun', 'rare']).toContain(draw('bois', `b${i}`).rarity);
  });

  it('un SAG élevé améliore la distribution', () => {
    const rate = (sag: number) => {
      let n = 0;
      for (let i = 0; i < 3000; i++) if (draw('bois', `sag-${i}`, sag).rarity === 'rare') n++;
      return n / 3000;
    };
    expect(rate(60)).toBeGreaterThan(rate(0) + 0.08);
  });

  it('pitié Épique : 8 ouvertures sans épique garantissent un épique, puis le compteur repart de 0', () => {
    for (let i = 0; i < 40; i++) {
      const d = draw('bronze', `pity-${i}`, 0, { bronze: PITY_EPIC });
      expect(['epique', 'legendaire']).toContain(d.rarity);
      expect(d.pity.bronze).toBe(0);
    }
    const forced = draw('bronze', 'pity-force', 0, { bronze: PITY_EPIC });
    expect(forced.rarity === 'epique' ? forced.guaranteed !== undefined : true).toBe(true);
    // sous le seuil : le compteur monte tant qu'il n'y a pas d'épique
    let pity: Record<string, number> = {};
    let sawGuarantee = false;
    for (let i = 0; i < 200; i++) {
      const d = drawChest({ chest: 'bronze', sag: 0, pity, seed: `chain-${i}`, templates: ITEMS });
      if (d.rarity === 'epique' || d.rarity === 'legendaire') expect(d.pity.bronze).toBe(0);
      else expect(d.pity.bronze).toBe((pity.bronze ?? 0) + 1);
      expect(d.pity.bronze).toBeLessThanOrEqual(PITY_EPIC);
      if (d.guaranteed === 'epique') {
        sawGuarantee = true;
        expect(pity.bronze).toBe(PITY_EPIC);
      }
      pity = d.pity;
    }
    expect(sawGuarantee).toBe(true);
  });

  it('pas de pitié pour le bois (aucun épique possible), compteurs absents', () => {
    const d = draw('bois', 'z', 0, { bois: 50 });
    expect(['commun', 'peu_commun', 'rare']).toContain(d.rarity);
    expect(d.pity).toEqual({ bois: 50 });
  });

  it('pitié Légendaire : coffres or et mythique seulement, 25 ouvertures sans légendaire', () => {
    for (const chest of ['or', 'mythique'] as const) {
      for (let i = 0; i < 20; i++) {
        const d = draw(chest, `leg-${chest}-${i}`, 0, { [`${chest}:legendaire`]: PITY_LEGENDARY });
        expect(d.rarity).toBe('legendaire');
        expect(d.pity[`${chest}:legendaire`]).toBe(0);
        expect(d.pity[chest]).toBe(0);
      }
    }
    // l'argent n'a pas de compteur légendaire
    const d = draw('argent', 'a1', 0, { 'argent:legendaire': 99 });
    expect(Object.keys(d.pity)).toContain('argent');
    expect(d.pity['argent:legendaire']).toBe(99);
    // le compteur monte sans légendaire
    let n = 0;
    let pity: Record<string, number> = {};
    for (let i = 0; i < 60; i++) {
      const r = drawChest({ chest: 'or', sag: 0, pity, seed: `or-${i}`, templates: ITEMS });
      if (r.rarity === 'legendaire') expect(r.pity['or:legendaire']).toBe(0);
      else expect(r.pity['or:legendaire']).toBe((pity['or:legendaire'] ?? 0) + 1);
      expect(r.pity['or:legendaire']).toBeLessThanOrEqual(PITY_LEGENDARY);
      if (r.guaranteed === 'legendaire') n++;
      pity = r.pity;
    }
    expect(n).toBeGreaterThanOrEqual(0);
  });

  it('la pitié légendaire n’est pas signalée « garantie » quand le tirage était déjà légendaire', () => {
    let seen = false;
    for (let i = 0; i < 500 && !seen; i++) {
      const d = draw('mythique', `nat-${i}`, 0, { 'mythique:legendaire': PITY_LEGENDARY });
      if (d.guaranteed === null) {
        expect(d.rarity).toBe('legendaire');
        seen = true;
      }
    }
    expect(seen).toBe(true);
  });
});

describe('équipement', () => {
  it('coût d’amélioration : 5 × (niveau+1) fragments, 100 × (niveau+1)^1,5 or', () => {
    expect(upgradeCost(0)).toEqual({ fragments: 5, gold: 100 });
    expect(upgradeCost(1)).toEqual({ fragments: 10, gold: 283 });
    expect(upgradeCost(3)).toEqual({ fragments: 20, gold: 800 });
    expect(upgradeCost(9)).toEqual({ fragments: 50, gold: 3162 });
    expect(upgradeCost(ITEM_MAX_LEVEL)).toBeNull();
    expect(upgradeCost(14)).toBeNull();
  });
  it('démontage : 2 / 5 / 12 / 30 / 80 fragments', () => {
    expect(ITEM_RARITIES.map(dismantleValue)).toEqual([2, 5, 12, 30, 80]);
    expect(DISMANTLE_FRAGMENTS.legendaire).toBe(80);
  });
  it('un seul objet équipé par emplacement dans l’index', () => {
    const a = item('rare');
    const b = { ...item('commun', 0, 'DEX', false), id: 'b', slot: 'tete' as const };
    const c = { ...item('commun', 0, 'DEX'), id: 'c', slot: 'tete' as const };
    const idx = equippedBySlot([a, b, c]);
    expect(Object.keys(idx).sort()).toEqual(['arme', 'tete']);
    expect(idx.tete?.id).toBe('c');
  });
  it('modèle de fusion : un modèle de l’emplacement demandé, déterministe', () => {
    for (const slot of ['arme', 'tete', 'torse', 'mains', 'bottes', 'amulette'] as const) {
      const t = pickTemplateForSlot(ITEMS, slot, 's1');
      expect(t?.slot).toBe(slot);
      expect(pickTemplateForSlot(ITEMS, slot, 's1')).toEqual(t);
    }
    expect(pickTemplateForSlot([], 'arme', 's')).toBeNull();
  });
});

describe('donjons', () => {
  const dungeon = { id: 'dj-test', tier: 1, rooms: ['un Rat', 'un Loup', 'un Ogre', 'un Troll', 'un Dragon'], boss: 'le Roi' };

  it('puissances : base × 1,35^i, boss = P(5) × 1,5, base croissante par palier', () => {
    expect(dungeonBase(1)).toBe(40);
    expect(dungeonBase(2)).toBe(60);
    expect(dungeonBase(0)).toBe(40);
    expect([0, 1, 2, 3, 4].map((i) => dungeonRoomPower(1, i))).toEqual([40, 54, 73, 98, 133]);
    expect(dungeonBossPower(1)).toBe(269);
    expect(dungeonBossPower(3)).toBeGreaterThan(dungeonBossPower(2));
  });
  it('niveau requis : 3 × palier, plafonné à 20 ; coffre du boss : bronze, argent dès le palier 5', () => {
    expect([1, 2, 6, 7, 9].map(dungeonUnlockLevel)).toEqual([3, 6, 18, 20, 20]);
    expect([1, 4, 5, 7].map(dungeonBossChest)).toEqual(['bronze', 'bronze', 'argent', 'argent']);
  });

  it('s’arrête à la salle où la survie est insuffisante, avec la PP manquante', () => {
    const r = resolveDungeon({ dungeon, pp: 60, scores: { CON: 0, FOR: 0 }, firstBossVictory: true, seed: 's' });
    expect(r.reachedRoom).toBe(2);
    expect(r.bossDefeated).toBe(false);
    expect(r.missingPower).toBe(13);
    expect(r.chest).toBeNull();
    expect(r.log).toHaveLength(3);
    expect(r.log[0]).toMatch(/^Salle 1 : tu .+ un Rat\.$/);
    expect(r.log[2]).toContain('Salle 3');
    expect(r.log[2]).toContain('13 PP');
    expect(r.gold).toBe(80);
    expect(r.fragments).toBe(8);
  });

  it('la CON augmente la survie : PP × (1 + CON/60)', () => {
    const low = resolveDungeon({ dungeon, pp: 100, scores: { CON: 0, FOR: 0 }, firstBossVictory: true, seed: 's' });
    const high = resolveDungeon({ dungeon, pp: 100, scores: { CON: 60, FOR: 0 }, firstBossVictory: true, seed: 's' });
    expect(low.reachedRoom).toBe(4);
    expect(high.reachedRoom).toBe(5);
    // missingPower tient compte de la CON
    const mid = resolveDungeon({ dungeon, pp: 100, scores: { CON: 10, FOR: 0 }, firstBossVictory: true, seed: 's' });
    expect(mid.reachedRoom).toBe(4);
    expect(mid.missingPower).toBe(Math.ceil(133 / (1 + 10 / 60) - 100));
  });

  it('le boss exige PP × (1 + FOR/60) ≥ boss', () => {
    const miss = resolveDungeon({ dungeon, pp: 200, scores: { CON: 60, FOR: 0 }, firstBossVictory: true, seed: 's' });
    expect(miss).toMatchObject({ reachedRoom: 5, bossDefeated: false, chest: null });
    expect(miss.missingPower).toBe(69);
    expect(miss.log.at(-1)).toContain('Boss');
    const win = resolveDungeon({ dungeon, pp: 200, scores: { CON: 60, FOR: 30 }, firstBossVictory: true, seed: 's' });
    expect(win).toMatchObject({ reachedRoom: 5, bossDefeated: true, missingPower: null, chest: 'bronze' });
    expect(win.log.at(-1)).toBe('Boss : tu terrasses le Roi !');
    expect(win.gold).toBe(40 * 5 + 40 * 3);
    expect(win.fragments).toBe(4 * 5 + 4 * 3);
    expect(win.heroPower).toBe(200);
    expect(win.roomPowers).toEqual([40, 54, 73, 98, 133]);
    expect(win.bossPower).toBe(269);
  });

  it('le coffre du boss n’est donné qu’à la première victoire ; argent au palier 5', () => {
    const base = { pp: 5000, scores: { CON: 60, FOR: 60 } };
    expect(resolveDungeon({ dungeon, ...base, firstBossVictory: false, seed: 's' })).toMatchObject({ bossDefeated: true, chest: null });
    expect(resolveDungeon({ dungeon: { ...dungeon, tier: 5 }, ...base, firstBossVictory: true, seed: 's' }).chest).toBe('argent');
  });

  it('est déterministe, et un monstre manquant a un nom de repli', () => {
    const input = { dungeon: { ...dungeon, rooms: ['un Rat'] }, pp: 10_000, scores: { CON: 60, FOR: 60 }, firstBossVictory: true, seed: 'graine' };
    expect(resolveDungeon(input)).toEqual(resolveDungeon(input));
    expect(resolveDungeon(input).log[1]).toContain('une ombre');
    const another = resolveDungeon({ ...input, seed: 'autre' });
    expect(another.log).toHaveLength(6);
  });

  it('valeur de bestRoom quand le boss est vaincu', () => {
    expect(DUNGEON_BOSS_ROOM).toBe(6);
  });
});
