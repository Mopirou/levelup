import { describe, expect, it } from 'vitest';
import {
  abilityProgress,
  abilityUpgradeCost,
  tierUnlocked,
  isValidPointBuy,
  levelFromXp,
  levelProgress,
  partialXp,
  pendingImprovements,
  pendingPath,
  pointBuySpent,
  proficiencyBonus,
  questCountFor,
  questLock,
  questXp,
  splitXp,
  tierAt,
  unlocksAt,
  BALANCED_SCORES,
  hasLegacyBaseScores,
  rescaleLegacyBaseScores,
  repeatMultiplier,
  REPEAT_FACTORS,
  BALANCE_CATCHUP_FACTOR,
  BALANCE_CATCHUP_GAP,
  BALANCE_HEAVY_SPECIALIZE_FACTOR,
  BALANCE_HEAVY_SPECIALIZE_GAP,
  BALANCE_SPECIALIZE_FACTOR,
  BALANCE_SPECIALIZE_GAP,
  applyBalance,
  balanceAmount,
  balanceDetails,
  balanceGap,
  previewBalance,
  xpBalanceFactor,
  type AbilityId,
} from '../src';

describe('niveaux', () => {
  it('suit la table D&D / 5', () => {
    expect(levelFromXp(0)).toBe(1);
    expect(levelFromXp(59)).toBe(1);
    expect(levelFromXp(60)).toBe(2);
    expect(levelFromXp(1300)).toBe(5);
    expect(levelFromXp(71000)).toBe(20);
    expect(levelFromXp(999999)).toBe(20);
  });
  it('calcule la progression vers le niveau suivant', () => {
    const p = levelProgress(1240 + 0);
    expect(p.level).toBe(4);
    expect(p.nextLevelXp).toBe(1300);
    expect(p.remaining).toBe(60);
    expect(levelProgress(80000).ratio).toBe(1);
  });
  it('bonus de maîtrise par palier', () => {
    expect([1, 4, 5, 8, 9, 12, 13, 16, 17, 20].map(proficiencyBonus)).toEqual([2, 2, 3, 3, 4, 4, 5, 5, 6, 6]);
  });
  it('paliers et titres', () => {
    expect(tierAt(1).name).toBe('Débutant');
    expect(tierAt(5).name).toBe('Régulier');
    expect(tierAt(11).name).toBe('Confirmé');
    expect(tierAt(17).name).toBe('Expert');
  });
  it('déblocages', () => {
    expect(unlocksAt(1)).toMatchObject({ dailyQuests: 3, weeklyQuests: 2, monthlyQuests: 1, forge: false, epic: false });
    expect(unlocksAt(2).forge).toBe(true);
    expect(unlocksAt(5).dailyQuests).toBe(4);
    expect(unlocksAt(6).weeklyQuests).toBe(3);
    expect(unlocksAt(10)).toMatchObject({ dailyQuests: 5, monthlyQuests: 2 });
    expect(unlocksAt(11).epic).toBe(true);
    expect(unlocksAt(14).weeklyQuests).toBe(4);
    expect(unlocksAt(17).dailyQuests).toBe(6);
  });
  it('nombre de quêtes limité par le niveau', () => {
    expect(questCountFor('daily', 1, 6)).toBe(3);
    expect(questCountFor('daily', 10, 4)).toBe(4);
    expect(questCountFor('daily', 10)).toBe(5);
    expect(questCountFor('epic', 5)).toBe(0);
    expect(questCountFor('epic', 11)).toBe(1);
  });
});

describe('caractéristiques', () => {
  it('coût de progression : 50, 100, 150… puis 2 000 au plafond', () => {
    expect(abilityUpgradeCost(2)).toBe(50);
    expect(abilityUpgradeCost(3)).toBe(100);
    expect(abilityUpgradeCost(14)).toBe(650);
    expect(abilityUpgradeCost(19)).toBe(900);
    expect(abilityUpgradeCost(20)).toBe(2000);
  });
  it('le départ à 2 donne des points vite : 50, 150 puis 300 XP', () => {
    expect(abilityProgress(2, 0)).toMatchObject({ score: 2, current: 0, needed: 50 });
    expect(abilityProgress(2, 49).score).toBe(2);
    expect(abilityProgress(2, 50).score).toBe(3);
    expect(abilityProgress(2, 150).score).toBe(4);
    expect(abilityProgress(2, 300).score).toBe(5);
  });
  it('passer de 10 à 20 coûte 6 750 XP', () => {
    expect(abilityProgress(10, 6749).score).toBe(19);
    expect(abilityProgress(10, 6750).score).toBe(20);
  });
  it('rang légendaire au-delà de 20', () => {
    const p = abilityProgress(10, 6750 + 2000);
    expect(p.score).toBe(21);
    expect(p.legendary).toBe(true);
  });
  it('plafonne à 30', () => {
    const p = abilityProgress(2, 10_000_000);
    expect(p.score).toBe(30);
    expect(p.ratio).toBe(1);
  });
  it('progress vers le point suivant', () => {
    const p = abilityProgress(14, 340);
    expect(p).toMatchObject({ score: 14, current: 340, needed: 650 });
  });
});

describe('achat de points', () => {
  it('répartition équilibrée valide (6 points, 1 de plus partout)', () => {
    expect(pointBuySpent(BALANCED_SCORES)).toBe(6);
    expect(isValidPointBuy(BALANCED_SCORES)).toBe(true);
  });
  it('tout le monde part de 2 : rien à dépenser, c’est valide', () => {
    expect(isValidPointBuy({ FOR: 2, DEX: 2, CON: 2, INT: 2, SAG: 2, CHA: 2 })).toBe(true);
  });
  it('refuse un dépassement ou un score > 5', () => {
    expect(isValidPointBuy({ FOR: 5, DEX: 5, CON: 2, INT: 2, SAG: 2, CHA: 2 })).toBe(true);
    expect(isValidPointBuy({ FOR: 5, DEX: 5, CON: 5, INT: 2, SAG: 2, CHA: 2 })).toBe(false);
    expect(isValidPointBuy({ FOR: 6, DEX: 2, CON: 2, INT: 2, SAG: 2, CHA: 2 })).toBe(false);
    expect(isValidPointBuy({ FOR: 1, DEX: 2, CON: 2, INT: 2, SAG: 2, CHA: 2 })).toBe(false);
  });
  it('ramène un ancien personnage (8 à 15) à l’échelle 2-5 en gardant ses proportions', () => {
    const old = { FOR: 15, DEX: 8, CON: 15, INT: 8, SAG: 8, CHA: 8 };
    expect(hasLegacyBaseScores(old)).toBe(true);
    expect(rescaleLegacyBaseScores(old)).toEqual({ FOR: 4, DEX: 2, CON: 4, INT: 2, SAG: 2, CHA: 2 });
    // l’ancienne répartition équilibrée devient la nouvelle
    expect(rescaleLegacyBaseScores({ FOR: 13, DEX: 13, CON: 13, INT: 12, SAG: 12, CHA: 12 })).toEqual(BALANCED_SCORES);
    // un personnage à la nouvelle échelle n’est jamais touché
    expect(hasLegacyBaseScores(BALANCED_SCORES)).toBe(false);
    expect(hasLegacyBaseScores({ FOR: 5, DEX: 2, CON: 2, INT: 2, SAG: 2, CHA: 2 })).toBe(false);
    expect(isValidPointBuy(rescaleLegacyBaseScores({ FOR: 15, DEX: 15, CON: 15, INT: 8, SAG: 8, CHA: 8 }))).toBe(true);
  });
});

describe('XP d’une quête', () => {
  it('exemple du cahier des charges : mensuelle Expert CON, Barbare niv. 6 → 815 XP', () => {
    const r = questXp({ difficulty: 'expert', period: 'monthly', ability: 'CON', level: 6, masteries: ['FOR', 'CON'] });
    expect(r.total).toBe(815);
  });
  it('journalière facile sans maîtrise = 10', () => {
    expect(questXp({ difficulty: 'easy', period: 'daily', ability: 'INT', level: 1, masteries: ['FOR', 'CON'] }).total).toBe(10);
  });
  it('affinité de voie +2 et inspiration ×2', () => {
    const r = questXp({ difficulty: 'medium', period: 'weekly', ability: 'SAG', level: 3, masteries: [], pathAbility: 'SAG', doubled: true });
    expect(r.affinity).toBe(2);
    expect(r.total).toBe((25 * 3 + 2) * 2);
  });
  it('compteur au prorata si ≥ 50 %', () => {
    expect(partialXp(100, 2, 4)).toBe(50);
    expect(partialXp(100, 1, 4)).toBe(0);
    expect(partialXp(100, 5, 4)).toBe(100);
    expect(partialXp(100, 1, 0)).toBe(0);
  });
});

describe('XP d’une quête refaite', () => {
  it('baisse de 10 % en 10 %, jusqu’à un plancher de 50 %', () => {
    expect(REPEAT_FACTORS).toEqual([1, 0.9, 0.8, 0.7, 0.6, 0.5]);
    expect([0, 1, 2, 3, 4, 5].map(repeatMultiplier)).toEqual([1, 0.9, 0.8, 0.7, 0.6, 0.5]);
    expect(repeatMultiplier(6)).toBe(0.5);
    expect(repeatMultiplier(40)).toBe(0.5);
    expect(repeatMultiplier(-3)).toBe(1);
  });
  it('s’applique à l’XP de la quête, avec « trop facile » et l’Inspiration', () => {
    const base = { difficulty: 'medium', period: 'daily', ability: 'INT', level: 1, masteries: [] } as const;
    expect(questXp({ ...base, repeat: 0 }).total).toBe(25);
    expect(questXp({ ...base, repeat: 1 })).toMatchObject({ repeat: 0.9, total: 23 }); // 25 × 0,9 = 22,5 → 23
    expect(questXp({ ...base, repeat: 5 })).toMatchObject({ repeat: 0.5, total: 13 }); // 25 × 0,5 = 12,5 → 13
    expect(questXp({ ...base, repeat: 1, doubled: true }).total).toBe(46);
    expect(questXp({ ...base, repeat: 1, scale: 0.5 }).total).toBe(12); // moitié moins (13) puis × 0,9 = 11,7
  });
});

describe('verrous', () => {
  it('niveaux 1 et 2 toujours ouverts', () => {
    expect(tierUnlocked('easy', 2, 1)).toBe(true);
    expect(tierUnlocked('medium', 2, 1)).toBe(true);
  });
  it('niveau 3 (Audacieuse) : score ≥ 6 dans la caractéristique, quel que soit le niveau global', () => {
    expect(tierUnlocked('high', 5, 20)).toBe(false);
    expect(tierUnlocked('high', 6, 1)).toBe(true);
    expect(questLock('high', 4, 2, 'Force')).toEqual({ locked: true, reason: 'Force 6 requis (tu es à 4)' });
    expect(questLock('high', 6, 2, 'Force').locked).toBe(false);
  });
  it('niveau 4 (Légendaire) : niveau global ≥ 11, quel que soit le score', () => {
    expect(tierUnlocked('expert', 20, 10)).toBe(false);
    expect(tierUnlocked('expert', 2, 11)).toBe(true);
    expect(questLock('expert', 20, 4, 'Force')).toEqual({ locked: true, reason: 'Niveau 11 requis (tu es niveau 4)' });
    expect(questLock('expert', 2, 11).locked).toBe(false);
  });
  it('améliorations et voie en attente', () => {
    expect(pendingImprovements(3, 0)).toBe(0);
    expect(pendingImprovements(4, 0)).toBe(1);
    expect(pendingImprovements(9, 0)).toBe(2);
    expect(pendingImprovements(9, 2)).toBe(0);
    expect(pendingImprovements(19, 0)).toBe(5);
    expect(pendingPath(2, null)).toBe(false);
    expect(pendingPath(3, null)).toBe(true);
    expect(pendingPath(3, 'x')).toBe(false);
  });
});

describe('répartition de l’XP entre caractéristiques', () => {
  const sec = [{ ability: 'CHA' as const, pct: 30 }, { ability: 'FOR' as const, pct: 10 }];
  it('donne à chaque secondaire sa part et le reste à la principale', () => {
    expect(splitXp(25, 'DEX', sec)).toEqual([
      { ability: 'DEX', amount: 16 },
      { ability: 'CHA', amount: 7 },
      { ability: 'FOR', amount: 2 },
    ]);
  });
  it('conserve toujours le total, y compris pour un retrait', () => {
    for (const total of [1, 10, 25, 75, 160, 999]) {
      expect(splitXp(total, 'DEX', sec).reduce((n, p) => n + p.amount, 0)).toBe(total);
      expect(splitXp(-total, 'DEX', sec).reduce((n, p) => n + p.amount, 0)).toBe(-total);
    }
  });
  it('sans secondaire, tout va à la principale', () => {
    expect(splitXp(50, 'FOR')).toEqual([{ ability: 'FOR', amount: 50 }]);
  });
});

describe('équilibrage des caractéristiques', () => {
  /** Scores où `ability` vaut `score` et les cinq autres valent `others`. */
  const scoresWith = (ability: AbilityId, score: number, others: number): Record<AbilityId, number> => ({
    FOR: others, DEX: others, CON: others, INT: others, SAG: others, CHA: others, [ability]: score,
  });

  it('expose des constantes nommées', () => {
    expect([BALANCE_CATCHUP_GAP, BALANCE_SPECIALIZE_GAP, BALANCE_HEAVY_SPECIALIZE_GAP]).toEqual([-1, 4, 7]);
    expect([BALANCE_CATCHUP_FACTOR, BALANCE_SPECIALIZE_FACTOR, BALANCE_HEAVY_SPECIALIZE_FACTOR]).toEqual([1.5, 0.75, 0.5]);
  });
  it('mesure l’écart à la moyenne des 5 autres', () => {
    expect(balanceGap('FOR', BALANCED_SCORES)).toBe(0);
    expect(balanceGap('FOR', { FOR: 8, DEX: 2, CON: 2, INT: 2, SAG: 2, CHA: 2 })).toBe(6);
    expect(balanceGap('DEX', { FOR: 8, DEX: 2, CON: 2, INT: 2, SAG: 2, CHA: 2 })).toBeCloseTo(-1.2);
  });
  it('seuils du rattrapage : écart ≤ −1 → ×1,5', () => {
    expect(xpBalanceFactor('FOR', scoresWith('FOR', 3, 3))).toBe(1);
    expect(xpBalanceFactor('FOR', scoresWith('FOR', 2, 3))).toBe(1.5); // écart exactement −1
    expect(xpBalanceFactor('FOR', scoresWith('FOR', 2, 8))).toBe(1.5);
    // écart de −0,8 (moyenne des autres 2,8 ; score 2) : pas de bonus
    expect(xpBalanceFactor('FOR', { FOR: 2, DEX: 3, CON: 3, INT: 3, SAG: 3, CHA: 2 })).toBe(1);
    // écart de −1,2 : bonus
    expect(xpBalanceFactor('FOR', { FOR: 2, DEX: 3, CON: 3, INT: 3, SAG: 3, CHA: 4 })).toBe(1.5);
  });
  it('seuils de la spécialisation : ≥ +4 → ×0,75, ≥ +7 → ×0,5', () => {
    expect(xpBalanceFactor('FOR', scoresWith('FOR', 6, 3))).toBe(1); // +3
    expect(xpBalanceFactor('FOR', scoresWith('FOR', 7, 3))).toBe(0.75); // +4 exactement
    expect(xpBalanceFactor('FOR', scoresWith('FOR', 9, 3))).toBe(0.75); // +6
    expect(xpBalanceFactor('FOR', scoresWith('FOR', 10, 3))).toBe(0.5); // +7 exactement
    expect(xpBalanceFactor('FOR', scoresWith('FOR', 30, 3))).toBe(0.5);
    // +3,8 : pas encore de réduction ; +4,2 : réduction
    expect(xpBalanceFactor('FOR', { FOR: 7, DEX: 3, CON: 3, INT: 3, SAG: 3, CHA: 4 })).toBe(1);
    expect(xpBalanceFactor('FOR', { FOR: 7, DEX: 3, CON: 3, INT: 3, SAG: 3, CHA: 2 })).toBe(0.75);
  });
  it('le facteur compare au reste des scores, la caractéristique elle-même est exclue de la moyenne', () => {
    const s = { FOR: 10, DEX: 3, CON: 3, INT: 3, SAG: 3, CHA: 3 };
    expect(xpBalanceFactor('FOR', s)).toBe(0.5);
    expect(xpBalanceFactor('DEX', s)).toBe(1.5); // 3 contre une moyenne de 4,4
    expect(xpBalanceFactor('CHA', s)).toBe(1.5);
  });
  it('arrondit, avec un minimum de 1 pour un gain', () => {
    expect(balanceAmount(10, 1.5)).toBe(15);
    expect(balanceAmount(25, 0.75)).toBe(19); // 18,75
    expect(balanceAmount(25, 1.5)).toBe(38); // 37,5 arrondi au supérieur
    expect(balanceAmount(1, 0.5)).toBe(1);
    expect(balanceAmount(1, 0.75)).toBe(1);
    expect(balanceAmount(3, 0.5)).toBe(2);
    expect(balanceAmount(1, 1.5)).toBe(2);
    expect(balanceAmount(1, 0.3)).toBe(1); // plancher de 1 même si l'arrondi donnerait 0
  });
  it('n’agit jamais sur un retrait, un zéro ou un facteur neutre', () => {
    expect(balanceAmount(-20, 1.5)).toBe(-20);
    expect(balanceAmount(-20, 0.5)).toBe(-20);
    expect(balanceAmount(0, 1.5)).toBe(0);
    expect(balanceAmount(40, 1)).toBe(40);
  });
  it('applyBalance traite chaque part avec le score de sa caractéristique (scores d’avant)', () => {
    const scores = { FOR: 10, DEX: 3, CON: 3, INT: 3, SAG: 3, CHA: 3 };
    const parts = splitXp(40, 'FOR', [{ ability: 'DEX', pct: 25 }]); // FOR 30, DEX 10
    expect(applyBalance(parts, scores)).toEqual([
      { ability: 'FOR', amount: 15 },
      { ability: 'DEX', amount: 15 },
    ]);
    expect(applyBalance([{ ability: 'FOR', amount: -30 }], scores)).toEqual([{ ability: 'FOR', amount: -30 }]);
    expect(applyBalance([], scores)).toEqual([]);
    expect(applyBalance(parts, scores).reduce((n, p) => n + p.amount, 0)).toBe(30);
  });
  it('balanceDetails ne liste que les parts modifiées', () => {
    const mixed = { FOR: 12, DEX: 3, CON: 6, INT: 5, SAG: 5, CHA: 5 }; // FOR ×0,5 ; DEX ×1,5 ; CON neutre
    expect(balanceDetails([{ ability: 'FOR', amount: 30 }, { ability: 'CON', amount: 10 }, { ability: 'DEX', amount: 10 }], mixed)).toEqual([
      { ability: 'FOR', factor: 0.5, base: 30, awarded: 15 },
      { ability: 'DEX', factor: 1.5, base: 10, awarded: 15 },
    ]);
    expect(balanceDetails([{ ability: 'CON', amount: 10 }], BALANCED_SCORES)).toEqual([]);
    expect(balanceDetails([{ ability: 'FOR', amount: -5 }], mixed)).toEqual([]);
  });
  it('previewBalance annonce l’effet avant la validation', () => {
    const weak = { FOR: 2, DEX: 5, CON: 5, INT: 5, SAG: 5, CHA: 5 };
    const p = previewBalance(weak, 'FOR');
    expect(p).toMatchObject({ factor: 1.5, kind: 'catchup', percent: 50, label: '+50 % XP en rattrapage' });
    expect(p.entries).toEqual([{ ability: 'FOR', pct: 100, factor: 1.5 }]);

    const strong = { FOR: 7, DEX: 3, CON: 3, INT: 3, SAG: 3, CHA: 3 };
    expect(previewBalance(strong, 'FOR')).toMatchObject({ kind: 'specialization', percent: -25, label: '−25 % XP (spécialisation)' });
    expect(previewBalance({ ...strong, FOR: 10 }, 'FOR')).toMatchObject({ percent: -50, label: '−50 % XP (spécialisation)' });

    const none = previewBalance(BALANCED_SCORES, 'FOR', [{ ability: 'DEX', pct: 20 }]);
    expect(none).toMatchObject({ factor: 1, kind: 'none', percent: 0, label: null });
    expect(none.entries).toEqual([
      { ability: 'FOR', pct: 80, factor: 1 },
      { ability: 'DEX', pct: 20, factor: 1 },
    ]);
  });
  it('previewBalance pondère principale et secondaires par leur part', () => {
    // FOR forte (×0,5, 80 %), DEX faible (×1,5, 20 %) : 0,4 + 0,3 = 0,7
    const s = { FOR: 10, DEX: 2, CON: 3, INT: 3, SAG: 3, CHA: 3 };
    const p = previewBalance(s, 'FOR', [{ ability: 'DEX', pct: 20 }]);
    expect(p.factor).toBeCloseTo(0.7);
    expect(p.percent).toBe(-30);
    expect(p.kind).toBe('specialization');
  });
});
