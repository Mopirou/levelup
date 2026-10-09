import {
  ABILITIES,
  AbilityId,
  CharacterCore,
  Difficulty,
  Period,
  emptyAbilityRecord,
} from './types';

/** XP totale requise pour chaque niveau (index 0 = niveau 1). Table D&D 5e / 5. */
export const LEVEL_XP: readonly number[] = [
  0, 60, 180, 540, 1300, 2800, 4600, 6800, 9600, 12800, 17000, 20000, 24000, 28000, 33000, 39000,
  45000, 53000, 61000, 71000,
];
export const MAX_LEVEL = 20;
export const IMPROVEMENT_LEVELS: readonly number[] = [4, 8, 12, 16, 19];
export const PATH_LEVEL = 3;
export const FORGE_LEVEL = 2;
export const EPIC_LEVEL = 11;

export const BASE_XP: Record<Difficulty, number> = { easy: 10, medium: 25, high: 50, expert: 100 };
export const PERIOD_MULTIPLIER: Record<Period, number> = {
  daily: 1,
  weekly: 3,
  monthly: 8,
  epic: 20,
};

export const MIN_SCORE = 8;
export const POINT_BUY_BUDGET = 27;
export const POINT_BUY_MAX = 15;
export const POINT_BUY_COST: Record<number, number> = {
  8: 0, 9: 1, 10: 2, 11: 3, 12: 4, 13: 5, 14: 7, 15: 9,
};

export function levelFromXp(totalXp: number): number {
  let level = 1;
  for (let i = 1; i < LEVEL_XP.length; i++) {
    if (totalXp >= LEVEL_XP[i]) level = i + 1;
    else break;
  }
  return level;
}

export interface LevelProgress {
  level: number;
  current: number;
  needed: number;
  ratio: number;
  nextLevelXp: number | null;
  remaining: number;
}

export function levelProgress(totalXp: number): LevelProgress {
  const level = levelFromXp(totalXp);
  if (level >= MAX_LEVEL) {
    return { level, current: totalXp - LEVEL_XP[MAX_LEVEL - 1], needed: 0, ratio: 1, nextLevelXp: null, remaining: 0 };
  }
  const start = LEVEL_XP[level - 1];
  const end = LEVEL_XP[level];
  return {
    level,
    current: totalXp - start,
    needed: end - start,
    ratio: (totalXp - start) / (end - start),
    nextLevelXp: end,
    remaining: end - totalXp,
  };
}

export function proficiencyBonus(level: number): number {
  return 2 + Math.floor((Math.min(Math.max(level, 1), MAX_LEVEL) - 1) / 4);
}

export function abilityModifier(score: number): number {
  return Math.floor((score - 10) / 2);
}

/** Coût en XP de caractéristique pour passer de s à s + 1. */
export function abilityUpgradeCost(score: number): number {
  if (score < 20) return 100 * (score - 7);
  return 2000;
}

export const MAX_SCORE = 30;
export const SOFT_CAP_SCORE = 20;

export interface AbilityProgress {
  score: number;
  /** XP accumulée vers le point suivant */
  current: number;
  /** XP nécessaire pour le point suivant (0 si au plafond) */
  needed: number;
  ratio: number;
  legendary: boolean;
}

const costAt = (k: number, bonus: number): number => (k + bonus >= SOFT_CAP_SCORE ? 2000 : 100 * (k - 7));

/**
 * Score courant d'une caractéristique. Les améliorations (bonus) s'ajoutent au score sans refaire payer l'XP déjà gagnée :
 * le k-ième point gagné par l'XP coûte 100 × (k - 7) sur la trajectoire de départ, ou 2 000 XP une fois le score réel ≥ 20.
 */
export function abilityProgress(baseScore: number, abilityXp: number, bonus = 0): AbilityProgress {
  let k = Math.max(baseScore, MIN_SCORE);
  let xp = Math.max(abilityXp, 0);
  while (k + bonus < MAX_SCORE && xp >= costAt(k, bonus)) {
    xp -= costAt(k, bonus);
    k++;
  }
  if (k + bonus >= MAX_SCORE) return { score: MAX_SCORE, current: xp, needed: 0, ratio: 1, legendary: true };
  const needed = costAt(k, bonus);
  return { score: k + bonus, current: xp, needed, ratio: xp / needed, legendary: k + bonus > SOFT_CAP_SCORE };
}

export function abilityProgressOf(
  c: Pick<CharacterCore, 'baseScores' | 'improvements' | 'abilityXp'>,
  a: AbilityId,
): AbilityProgress {
  return abilityProgress(c.baseScores[a], c.abilityXp[a] ?? 0, c.improvements[a] ?? 0);
}

export function abilityScores(c: Pick<CharacterCore, 'baseScores' | 'improvements' | 'abilityXp'>): Record<AbilityId, number> {
  const out = emptyAbilityRecord(0);
  for (const a of ABILITIES) out[a] = abilityProgressOf(c, a).score;
  return out;
}

export function pointBuySpent(scores: Record<AbilityId, number>): number {
  let total = 0;
  for (const a of ABILITIES) total += POINT_BUY_COST[scores[a]] ?? Infinity;
  return total;
}

export function isValidPointBuy(scores: Record<AbilityId, number>): boolean {
  for (const a of ABILITIES) {
    if (!(scores[a] >= MIN_SCORE && scores[a] <= POINT_BUY_MAX)) return false;
  }
  return pointBuySpent(scores) <= POINT_BUY_BUDGET;
}

export const BALANCED_SCORES: Record<AbilityId, number> = {
  FOR: 13, DEX: 13, CON: 13, INT: 12, SAG: 12, CHA: 12,
};

export function xpBonusForMastery(proficiency: number): number {
  return proficiency * 5;
}

export interface QuestXpInput {
  difficulty: Difficulty;
  period: Period;
  ability: AbilityId;
  level: number;
  masteries: readonly AbilityId[];
  /** Affinité secondaire de la voie (niveau 3) : +2 XP */
  pathAbility?: AbilityId | null;
  doubled?: boolean;
}

export interface QuestXpBreakdown {
  base: number;
  multiplier: number;
  mastery: number;
  affinity: number;
  doubled: boolean;
  total: number;
}

/** XP d'une quête = base × multiplicateur (+ maîtrise × 5 si maîtrisée) (+2 si affinité), doublée par l'Inspiration. */
export function questXp(i: QuestXpInput): QuestXpBreakdown {
  const base = BASE_XP[i.difficulty];
  const multiplier = PERIOD_MULTIPLIER[i.period];
  const mastery = i.masteries.includes(i.ability) ? xpBonusForMastery(proficiencyBonus(i.level)) : 0;
  const affinity = i.pathAbility && i.pathAbility === i.ability ? 2 : 0;
  const sub = base * multiplier + mastery + affinity;
  return { base, multiplier, mastery, affinity, doubled: !!i.doubled, total: i.doubled ? sub * 2 : sub };
}

export interface XpPart {
  ability: AbilityId;
  amount: number;
}

/**
 * Répartit l'XP d'une quête entre sa caractéristique principale et ses secondaires.
 * Chaque secondaire reçoit son pourcentage (arrondi inférieur), la principale garde le reste : la somme est toujours égale au total.
 * Fonctionne aussi pour un retrait (total négatif), de façon symétrique.
 */
export function splitXp(total: number, primary: AbilityId, secondary?: readonly { ability: AbilityId; pct: number }[]): XpPart[] {
  const sign = total < 0 ? -1 : 1;
  const abs = Math.abs(Math.round(total));
  const parts: XpPart[] = [];
  let given = 0;
  for (const s of secondary ?? []) {
    if (s.ability === primary) continue;
    const amount = Math.floor((abs * s.pct) / 100);
    if (amount > 0) {
      parts.push({ ability: s.ability, amount: amount * sign });
      given += amount;
    }
  }
  parts.unshift({ ability: primary, amount: (abs - given) * sign });
  return parts.filter((p) => p.amount !== 0);
}

/** XP au prorata pour un compteur expiré (>= 50 %), sinon 0. */
export function partialXp(fullXp: number, progress: number, target: number): number {
  if (target <= 0) return 0;
  const ratio = progress / target;
  if (ratio < 0.5) return 0;
  return Math.floor(fullXp * Math.min(ratio, 1));
}

export function pendingImprovements(level: number, chosen: number): number {
  const due = IMPROVEMENT_LEVELS.filter((l) => l <= level).length;
  return Math.max(due - chosen, 0);
}

export function pendingPath(level: number, pathId?: string | null): boolean {
  return level >= PATH_LEVEL && !pathId;
}

export interface Unlocks {
  dailyQuests: number;
  weeklyQuests: number;
  monthlyQuests: number;
  epic: boolean;
  forge: boolean;
  expertEverywhere: boolean;
}

export function unlocksAt(level: number): Unlocks {
  const dailyQuests = level >= 17 ? 6 : level >= 10 ? 5 : level >= 5 ? 4 : 3;
  const weeklyQuests = level >= 14 ? 4 : level >= 6 ? 3 : 2;
  const monthlyQuests = level >= 10 ? 2 : 1;
  return {
    dailyQuests,
    weeklyQuests,
    monthlyQuests,
    epic: level >= EPIC_LEVEL,
    forge: level >= FORGE_LEVEL,
    expertEverywhere: level >= 5,
  };
}

export function questCountFor(period: Period, level: number, dailySetting?: number): number {
  const u = unlocksAt(level);
  switch (period) {
    case 'daily':
      return dailySetting ? Math.min(Math.max(dailySetting, 1), u.dailyQuests) : u.dailyQuests;
    case 'weekly':
      return u.weeklyQuests;
    case 'monthly':
      return u.monthlyQuests;
    case 'epic':
      return u.epic ? 1 : 0;
  }
}

export interface Tier {
  index: 1 | 2 | 3 | 4;
  name: string;
}

export function tierAt(level: number): Tier {
  if (level >= 17) return { index: 4, name: 'Légende' };
  if (level >= 11) return { index: 3, name: 'Maître du royaume' };
  if (level >= 5) return { index: 2, name: 'Héros du royaume' };
  return { index: 1, name: 'Aventurier' };
}

/** Une quête Expert est accessible si score ≥ 14 dans sa caractéristique ou niveau ≥ 5. */
export function expertUnlocked(score: number, level: number): boolean {
  return score >= 14 || level >= 5;
}

export interface LockInfo {
  locked: boolean;
  reason?: string;
}

export function questLock(difficulty: Difficulty, score: number, level: number, abilityLabel = 'caractéristique'): LockInfo {
  if (difficulty === 'expert' && !expertUnlocked(score, level)) {
    return { locked: true, reason: `Score de ${abilityLabel} 14 requis, ou niveau 5` };
  }
  return { locked: false };
}

/** Répartition en % de l'XP d'une quête (principale en tête), pour l'affichage. */
export function xpShares(primary: AbilityId, secondary?: readonly { ability: AbilityId; pct: number }[]): { ability: AbilityId; pct: number }[] {
  const others = (secondary ?? []).filter((s) => s.ability !== primary && s.pct > 0);
  const rest = 100 - others.reduce((n, s) => n + s.pct, 0);
  return [{ ability: primary, pct: rest }, ...others];
}
