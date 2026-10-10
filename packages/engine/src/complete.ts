import { isoWeek, startOfIsoWeek, addDays } from './dates';
import { tuneXpScale } from './interests';
import {
  AbilityId,
  CharacterCore,
  QuestInstance,
  ValidationSpec,
  ABILITIES,
} from './types';
import {
  BASE_XP,
  QuestXpBreakdown,
  abilityProgressOf,
  abilityScores,
  applyBalance,
  balanceDetails,
  type BalanceDetail,
  levelFromXp,
  partialXp,
  pendingImprovements,
  pendingPath,
  questXp,
  splitXp,
  type XpPart,
} from './xp';

export const MAX_INSPIRATION = 3;
export const UNDO_WINDOW_MS = 24 * 3600 * 1000;
export const OFFLINE_MAX_DELAY_MS = 72 * 3600 * 1000;
export const JOURNAL_MIN_CHARS = 50;

export interface CompletionInput {
  character: CharacterCore;
  masteries: readonly AbilityId[];
  pathAbility?: AbilityId | null;
  instance: QuestInstance;
  useInspiration: boolean;
  /** Validations déjà faites de cette quête dans la période (XP dégressive) */
  repeat?: number;
  progress?: number;
  stepsDone?: boolean[];
  journalText?: string;
}

export type CompletionError =
  | 'not-accepted'
  | 'incomplete'
  | 'journal-too-short'
  | 'no-inspiration'
  | 'already-completed';

export function validationTarget(v: ValidationSpec): number {
  switch (v.type) {
    case 'simple':
      return 1;
    case 'counter':
      return v.target;
    case 'timer':
      return v.minutes;
    case 'steps':
      return v.steps.length;
    case 'journal':
      return 1;
  }
}

export function progressRatio(inst: Pick<QuestInstance, 'snapshot' | 'progress' | 'stepsDone'>): number {
  const v = inst.snapshot.validation;
  if (v.type === 'steps') {
    const done = (inst.stepsDone ?? []).filter(Boolean).length;
    return v.steps.length ? done / v.steps.length : 0;
  }
  const target = validationTarget(v);
  return target ? Math.min(inst.progress / target, 1) : 0;
}

export function isReadyToComplete(
  inst: Pick<QuestInstance, 'snapshot' | 'progress' | 'stepsDone'>,
  journalText?: string,
): CompletionError | null {
  const v = inst.snapshot.validation;
  switch (v.type) {
    case 'simple':
      return null;
    case 'counter':
      return inst.progress >= v.target ? null : 'incomplete';
    case 'timer':
      return inst.progress >= v.minutes ? null : 'incomplete';
    case 'steps':
      return (inst.stepsDone ?? []).filter(Boolean).length >= v.steps.length ? null : 'incomplete';
    case 'journal':
      return (journalText ?? '').trim().length >= (v.minChars ?? JOURNAL_MIN_CHARS) ? null : 'journal-too-short';
  }
}

export interface AbilityUp {
  ability: AbilityId;
  from: number;
  to: number;
}

export interface XpApplication {
  character: CharacterCore;
  levelsGained: number[];
  levelsLost: number[];
  abilityUps: AbilityUp[];
  pendingImprovements: number;
  pendingPath: boolean;
}

/** Applique un gain (ou retrait) d'XP. Le niveau et les scores sont recalculés depuis les totaux (RG-06). */
export function applyXp(character: CharacterCore, ability: AbilityId, amount: number): XpApplication {
  const before = character;
  const abilityXp = { ...before.abilityXp, [ability]: Math.max((before.abilityXp[ability] ?? 0) + amount, 0) };
  const totalXp = Math.max(before.totalXp + amount, 0);
  const level = levelFromXp(totalXp);
  const next: CharacterCore = { ...before, abilityXp, totalXp, level };

  const levelsGained: number[] = [];
  const levelsLost: number[] = [];
  for (let l = before.level + 1; l <= level; l++) levelsGained.push(l);
  for (let l = before.level; l > level; l--) levelsLost.push(l);

  const abilityUps: AbilityUp[] = [];
  const from = abilityProgressOf(before, ability).score;
  const to = abilityProgressOf(next, ability).score;
  if (to > from) abilityUps.push({ ability, from, to });

  return {
    character: next,
    levelsGained,
    levelsLost,
    abilityUps,
    pendingImprovements: pendingImprovements(level, before.improvementsChosen),
    pendingPath: pendingPath(level, before.pathId),
  };
}

/** Applique plusieurs gains d'XP d'un coup (quête répartie sur plusieurs caractéristiques). */
export function applyXpParts(character: CharacterCore, parts: readonly XpPart[]): XpApplication {
  let current = character;
  const levelsGained: number[] = [];
  const levelsLost: number[] = [];
  const abilityUps: AbilityUp[] = [];
  for (const p of parts) {
    const r = applyXp(current, p.ability, p.amount);
    current = r.character;
    levelsGained.push(...r.levelsGained);
    levelsLost.push(...r.levelsLost);
    abilityUps.push(...r.abilityUps);
  }
  return {
    character: current,
    levelsGained,
    levelsLost,
    abilityUps,
    pendingImprovements: pendingImprovements(current.level, character.improvementsChosen),
    pendingPath: pendingPath(current.level, character.pathId),
  };
}

export interface CompletionResult extends XpApplication {
  /** XP réellement versée au total = somme de `parts` (après équilibrage). `breakdown.total` reste le montant avant équilibrage. */
  xpAwarded: number;
  /** Parts versées par caractéristique (après équilibrage) : ce sont exactement les montants des événements d'XP. */
  parts: XpPart[];
  /** Parts modifiées par l'équilibrage (rattrapage / spécialisation) ; vide si aucun effet. */
  balance: BalanceDetail[];
  breakdown: QuestXpBreakdown;
  inspirationSpent: boolean;
}

export function completeQuest(input: CompletionInput): { ok: true; result: CompletionResult } | { ok: false; error: CompletionError } {
  const { character, instance } = input;
  if (instance.status === 'completed') return { ok: false, error: 'already-completed' };
  if (instance.status !== 'accepted') return { ok: false, error: 'not-accepted' };
  if (input.useInspiration && character.inspiration < 1) return { ok: false, error: 'no-inspiration' };

  const merged = {
    snapshot: instance.snapshot,
    progress: input.progress ?? instance.progress,
    stepsDone: input.stepsDone ?? instance.stepsDone,
  };
  const notReady = isReadyToComplete(merged, input.journalText);
  if (notReady) return { ok: false, error: notReady };

  const breakdown = questXp({
    difficulty: instance.snapshot.difficulty,
    period: instance.period,
    ability: instance.snapshot.ability,
    level: character.level,
    masteries: input.masteries,
    pathAbility: input.pathAbility,
    doubled: input.useInspiration,
    scale: tuneXpScale(instance.snapshot),
    repeat: input.repeat,
  });
  const base = input.useInspiration ? { ...character, inspiration: character.inspiration - 1 } : character;
  // Équilibrage : les scores pris en compte sont ceux d'AVANT l'attribution, identiques pour toutes les parts.
  const scores = abilityScores(character);
  const baseParts = splitXp(breakdown.total, instance.snapshot.ability, instance.snapshot.secondary);
  const parts = applyBalance(baseParts, scores);
  const balance = balanceDetails(baseParts, scores);
  const applied = applyXpParts(base, parts);
  return {
    ok: true,
    result: {
      ...applied,
      xpAwarded: parts.reduce((n, p) => n + p.amount, 0),
      parts,
      balance,
      breakdown,
      inspirationSpent: input.useInspiration,
    },
  };
}

/** XP au prorata pour une quête à compteur expirée (≥ 50 %). */
export function expiredPartialXp(inst: QuestInstance, level: number, masteries: readonly AbilityId[], pathAbility?: AbilityId | null): number {
  const v = inst.snapshot.validation;
  if (v.type !== 'counter') return 0;
  const full = questXp({
    difficulty: inst.snapshot.difficulty,
    period: inst.period,
    ability: inst.snapshot.ability,
    level,
    masteries,
    pathAbility,
    scale: tuneXpScale(inst.snapshot),
  }).total;
  return partialXp(full, inst.progress, v.target);
}

/** L'annulation est possible dans les 24 h après la validation. */
export function canUndo(completedAtIso: string | null | undefined, nowMs: number): boolean {
  if (!completedAtIso) return false;
  return nowMs - Date.parse(completedAtIso) <= UNDO_WINDOW_MS;
}

/** Validation hors ligne acceptée ? (RG-03) */
export function offlineCompletionAllowed(clientCompletedAtMs: number, serverNowMs: number, periodStartMs: number, periodEndMs: number): boolean {
  if (serverNowMs - clientCompletedAtMs > OFFLINE_MAX_DELAY_MS) return false;
  return clientCompletedAtMs >= periodStartMs && clientCompletedAtMs <= periodEndMs;
}

/** Mode Hardcore : retire 10 % de l'XP de base à l'abandon ou l'expiration. */
export function hardcorePenalty(inst: Pick<QuestInstance, 'snapshot'>): number {
  return Math.ceil(BASE_XP[inst.snapshot.difficulty] * 0.1);
}

// ───────────────────────── Séries, inspiration, repos ─────────────────────────

export interface StreakResult {
  current: number;
  doneToday: boolean;
}

/**
 * Série = jours consécutifs avec au moins une quête journalière validée.
 * Un jour de repos déclaré ne casse pas la série (RG-02). Aujourd'hui, tant qu'il n'est pas fini, ne la casse pas.
 */
export function computeStreak(dailyDoneDays: Iterable<string>, restDays: Iterable<string>, today: string): StreakResult {
  const done = new Set(dailyDoneDays);
  const rest = new Set(restDays);
  let streak = 0;
  const doneToday = done.has(today);
  if (doneToday) streak++;
  let cursor = addDays(today, -1);
  for (let guard = 0; guard < 4000; guard++) {
    if (done.has(cursor)) streak++;
    else if (!rest.has(cursor)) break;
    cursor = addDays(cursor, -1);
  }
  return { current: streak, doneToday };
}

export function computeBestStreak(dailyDoneDays: Iterable<string>, restDays: Iterable<string>): number {
  const days = [...new Set(dailyDoneDays)].sort();
  if (!days.length) return 0;
  const rest = new Set(restDays);
  let best = 0;
  let cur = 0;
  let prev: string | null = null;
  for (const d of days) {
    if (prev === null) cur = 1;
    else {
      let gap = addDays(prev, 1);
      let bridged = true;
      while (gap < d) {
        if (!rest.has(gap)) {
          bridged = false;
          break;
        }
        gap = addDays(gap, 1);
      }
      cur = bridged ? cur + 1 : 1;
    }
    best = Math.max(best, cur);
    prev = d;
  }
  return best;
}

export interface InspirationGain {
  inspiration: number;
  gained: boolean;
  overflow: boolean;
}

/** +1 Inspiration tous les 7 jours de série (max 3, RG-11). */
export function inspirationAfterStreak(prevStreak: number, newStreak: number, inspiration: number): InspirationGain {
  const crossed = newStreak > prevStreak && newStreak > 0 && newStreak % 7 === 0;
  if (!crossed) return { inspiration, gained: false, overflow: false };
  if (inspiration >= MAX_INSPIRATION) return { inspiration, gained: false, overflow: true };
  return { inspiration: inspiration + 1, gained: true, overflow: false };
}

/** Un seul jour de repos par semaine ISO. */
export function canDeclareRest(restDays: readonly string[], date: string): boolean {
  const key = (d: string) => {
    const w = isoWeek(d);
    return `${w.year}-${w.week}`;
  };
  return !restDays.some((d) => key(d) === key(date) && d !== date);
}

export function weekStartOf(date: string): string {
  return startOfIsoWeek(date);
}

export function totalAbilityScoreSum(scores: Record<AbilityId, number>): number {
  return ABILITIES.reduce((s, a) => s + scores[a], 0);
}
