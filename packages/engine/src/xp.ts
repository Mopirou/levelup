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

/** Score de départ de chaque caractéristique : tout le monde commence ici, puis répartit quelques points. */
export const MIN_SCORE = 2;
/** Points à répartir à la création (1 point = +1 de score). */
export const POINT_BUY_BUDGET = 6;
/** Score maximum à la création (+3 sur une seule caractéristique). */
export const POINT_BUY_MAX = 5;

/**
 * Une quête peut être refaite dans la même période, avec une XP dégressive pour que répéter la même chose
 * ne remplace pas la variété : 100 %, puis 90 %, 80 %… jusqu'à 50 % (plancher). Le nombre de validations est plafonné par période.
 */
export const REPEAT_FACTORS: readonly number[] = [1, 0.9, 0.8, 0.7, 0.6, 0.5];
export const MAX_RUNS: Record<Period, number> = { daily: 3, weekly: 2, monthly: 1, epic: 1 };
/** Quêtes ajoutées à la main qui peuvent être en cours en même temps, par période. */
export const MAX_OPEN_EXTRAS: Record<Period, number> = { daily: 8, weekly: 5, monthly: 3, epic: 1 };

/** Part de l'XP versée quand la quête a déjà été accomplie `doneBefore` fois dans la période. */
export function repeatMultiplier(doneBefore: number): number {
  return REPEAT_FACTORS[Math.min(Math.max(Math.floor(doneBefore), 0), REPEAT_FACTORS.length - 1)];
}
export const POINT_BUY_COST: Record<number, number> = {
  2: 0, 3: 1, 4: 2, 5: 3,
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

export const MAX_SCORE = 30;
export const SOFT_CAP_SCORE = 20;
/** XP de caractéristique pour le premier point (de 2 à 3) ; chaque point suivant coûte un palier de plus. */
export const UPGRADE_XP_STEP = 50;

/** Coût en XP de caractéristique pour passer de s à s + 1 : 50, 100, 150… puis 2 000 au-delà du plafond de 20. */
export function abilityUpgradeCost(score: number): number {
  if (score < SOFT_CAP_SCORE) return UPGRADE_XP_STEP * (score - MIN_SCORE + 1);
  return 2000;
}

export interface AbilityProgress {
  score: number;
  /** XP accumulée vers le point suivant */
  current: number;
  /** XP nécessaire pour le point suivant (0 si au plafond) */
  needed: number;
  ratio: number;
  legendary: boolean;
}

const costAt = (k: number, bonus: number): number => (k + bonus >= SOFT_CAP_SCORE ? 2000 : abilityUpgradeCost(k));

/**
 * Score courant d'une caractéristique. Les améliorations (bonus) s'ajoutent au score sans refaire payer l'XP déjà gagnée :
 * le point suivant (de k à k + 1) coûte 50 × (k - 1) sur la trajectoire de départ, ou 2 000 XP une fois le score réel ≥ 20.
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
  FOR: 3, DEX: 3, CON: 3, INT: 3, SAG: 3, CHA: 3,
};

// Anciens personnages : scores de départ de 8 à 15 (27 points d'achat), avant le passage à l'échelle 2-5.
const LEGACY_POINT_BUY_COST: Record<number, number> = { 8: 0, 9: 1, 10: 2, 11: 3, 12: 4, 13: 5, 14: 7, 15: 9 };
const LEGACY_POINT_BUY_BUDGET = 27;

/** Vrai pour un personnage créé avec l'ancienne échelle (aucun score de départ n'excède POINT_BUY_MAX sur la nouvelle). */
export function hasLegacyBaseScores(scores: Record<AbilityId, number>): boolean {
  return ABILITIES.some((a) => scores[a] > POINT_BUY_MAX);
}

/** Ramène des scores de départ 8-15 à l'échelle actuelle en gardant les proportions de points investis. */
export function rescaleLegacyBaseScores(scores: Record<AbilityId, number>): Record<AbilityId, number> {
  const out = emptyAbilityRecord(MIN_SCORE);
  for (const a of ABILITIES) {
    const spent = LEGACY_POINT_BUY_COST[Math.min(Math.max(scores[a], 8), 15)];
    const points = Math.round((spent * POINT_BUY_BUDGET) / LEGACY_POINT_BUY_BUDGET);
    out[a] = Math.min(MIN_SCORE + points, POINT_BUY_MAX);
  }
  return out;
}

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
  /** Ajustement « trop dur / trop facile » : proportionnel à la cible demandée (1 = quête d'origine) */
  scale?: number;
  /** Nombre de fois où cette quête a déjà été accomplie dans la période (XP dégressive) */
  repeat?: number;
}

export interface QuestXpBreakdown {
  base: number;
  multiplier: number;
  mastery: number;
  affinity: number;
  doubled: boolean;
  /** Part de l'XP versée (1 = pleine, moins si la quête est refaite) */
  repeat: number;
  total: number;
}

/** XP d'une quête = base × multiplicateur (+ maîtrise × 5 si maîtrisée) (+2 si affinité), doublée par l'Inspiration. */
export function questXp(i: QuestXpInput): QuestXpBreakdown {
  const base = BASE_XP[i.difficulty];
  const multiplier = PERIOD_MULTIPLIER[i.period];
  const mastery = i.masteries.includes(i.ability) ? xpBonusForMastery(proficiencyBonus(i.level)) : 0;
  const affinity = i.pathAbility && i.pathAbility === i.ability ? 2 : 0;
  const core = i.scale && i.scale !== 1 ? Math.max(Math.round(base * multiplier * i.scale), 1) : base * multiplier;
  const repeat = repeatMultiplier(i.repeat ?? 0);
  const full = core + mastery + affinity;
  const sub = repeat === 1 ? full : Math.max(1, Math.round(full * repeat));
  return { base, multiplier, mastery, affinity, doubled: !!i.doubled, repeat, total: i.doubled ? sub * 2 : sub };
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
    expertEverywhere: level >= TIER4_MIN_LEVEL,
  };
}

export function questCountFor(period: Period, level: number, dailySetting?: number): number {
  const u = unlocksAt(level);
  switch (period) {
    case 'daily':
      return dailySetting != null ? Math.min(Math.max(dailySetting, 0), u.dailyQuests) : u.dailyQuests;
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
  if (level >= 17) return { index: 4, name: 'Expert' };
  if (level >= 11) return { index: 3, name: 'Confirmé' };
  if (level >= 5) return { index: 2, name: 'Régulier' };
  return { index: 1, name: 'Débutant' };
}

/** Niveau 3 (quêtes Audacieuses, mensuelles) : score minimum dans la caractéristique concernée. */
export const TIER3_MIN_SCORE = 6;
/** Niveau 4 (quêtes Légendaires, épiques) : niveau global minimum. */
export const TIER4_MIN_LEVEL = EPIC_LEVEL;

/**
 * Déblocage des quêtes par palier : 1 (Facile) et 2 (Modérée) sont toujours ouvertes ;
 * 3 (Audacieuse) demande un score minimum dans sa caractéristique ; 4 (Légendaire) demande un niveau global.
 */
export function tierUnlocked(difficulty: Difficulty, score: number, level: number): boolean {
  if (difficulty === 'high') return score >= TIER3_MIN_SCORE;
  if (difficulty === 'expert') return level >= TIER4_MIN_LEVEL;
  return true;
}

export interface LockInfo {
  locked: boolean;
  reason?: string;
}

export function questLock(difficulty: Difficulty, score: number, level: number, abilityLabel = 'caractéristique'): LockInfo {
  if (tierUnlocked(difficulty, score, level)) return { locked: false };
  if (difficulty === 'high') return { locked: true, reason: `${abilityLabel} ${TIER3_MIN_SCORE} requis (tu es à ${score})` };
  return { locked: true, reason: `Niveau ${TIER4_MIN_LEVEL} requis (tu es niveau ${level})` };
}

/** Répartition en % de l'XP d'une quête (principale en tête), pour l'affichage. */
export function xpShares(primary: AbilityId, secondary?: readonly { ability: AbilityId; pct: number }[]): { ability: AbilityId; pct: number }[] {
  const others = (secondary ?? []).filter((s) => s.ability !== primary && s.pct > 0);
  const rest = 100 - others.reduce((n, s) => n + s.pct, 0);
  return [{ ability: primary, pct: rest }, ...others];
}
