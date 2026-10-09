import { describe, expect, it } from 'vitest';
import {
  abilityModifier,
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
  it('modificateur D&D', () => {
    expect(abilityModifier(8)).toBe(-1);
    expect(abilityModifier(10)).toBe(0);
    expect(abilityModifier(14)).toBe(2);
    expect(abilityModifier(20)).toBe(5);
  });
  it('coût de progression', () => {
    expect(abilityUpgradeCost(8)).toBe(100);
    expect(abilityUpgradeCost(14)).toBe(700);
    expect(abilityUpgradeCost(19)).toBe(1200);
    expect(abilityUpgradeCost(20)).toBe(2000);
  });
  it('passer de 10 à 20 coûte 7 500 XP', () => {
    expect(abilityProgress(10, 7499).score).toBe(19);
    expect(abilityProgress(10, 7500).score).toBe(20);
  });
  it('rang légendaire au-delà de 20', () => {
    const p = abilityProgress(10, 7500 + 2000);
    expect(p.score).toBe(21);
    expect(p.legendary).toBe(true);
  });
  it('plafonne à 30', () => {
    const p = abilityProgress(8, 10_000_000);
    expect(p.score).toBe(30);
    expect(p.ratio).toBe(1);
  });
  it('progress vers le point suivant', () => {
    const p = abilityProgress(14, 340);
    expect(p).toMatchObject({ score: 14, current: 340, needed: 700 });
  });
});

describe('achat de points', () => {
  it('répartition équilibrée valide (27 points)', () => {
    expect(pointBuySpent(BALANCED_SCORES)).toBe(27);
    expect(isValidPointBuy(BALANCED_SCORES)).toBe(true);
  });
  it('refuse un dépassement ou un score > 15', () => {
    expect(isValidPointBuy({ FOR: 15, DEX: 15, CON: 15, INT: 8, SAG: 8, CHA: 8 })).toBe(true);
    expect(isValidPointBuy({ FOR: 15, DEX: 15, CON: 15, INT: 15, SAG: 8, CHA: 8 })).toBe(false);
    expect(isValidPointBuy({ FOR: 16, DEX: 8, CON: 8, INT: 8, SAG: 8, CHA: 8 })).toBe(false);
    expect(isValidPointBuy({ FOR: 7, DEX: 8, CON: 8, INT: 8, SAG: 8, CHA: 8 })).toBe(false);
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

describe('verrous', () => {
  it('niveaux 1 et 2 toujours ouverts', () => {
    expect(tierUnlocked('easy', 8, 1)).toBe(true);
    expect(tierUnlocked('medium', 8, 1)).toBe(true);
  });
  it('niveau 3 (Audacieuse) : score ≥ 14 dans la caractéristique, quel que soit le niveau global', () => {
    expect(tierUnlocked('high', 13, 20)).toBe(false);
    expect(tierUnlocked('high', 14, 1)).toBe(true);
    expect(questLock('high', 10, 2, 'Force')).toEqual({ locked: true, reason: 'Force 14 requis (tu es à 10)' });
    expect(questLock('high', 14, 2, 'Force').locked).toBe(false);
  });
  it('niveau 4 (Légendaire) : niveau global ≥ 11, quel que soit le score', () => {
    expect(tierUnlocked('expert', 20, 10)).toBe(false);
    expect(tierUnlocked('expert', 8, 11)).toBe(true);
    expect(questLock('expert', 20, 4, 'Force')).toEqual({ locked: true, reason: 'Niveau 11 requis (tu es niveau 4)' });
    expect(questLock('expert', 8, 11).locked).toBe(false);
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
