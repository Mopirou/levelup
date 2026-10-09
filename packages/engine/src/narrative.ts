import { createRng, weightedPick } from './random';
import { ABILITIES, AbilityId } from './types';
import { ABILITY_LABEL } from './labels';
import { POINT_BUY_BUDGET, MIN_SCORE, POINT_BUY_MAX, pointBuySpent } from './xp';

// ───────────────────────── Interpolation ─────────────────────────

export function interpolate(text: string, vars: Record<string, string | number>): string {
  return text.replace(/\{(\w+)\}/g, (_, k) => (k in vars ? String(vars[k]) : `{${k}}`));
}

// ───────────────────────── Messages du tavernier ─────────────────────────

export interface TavernCondition {
  streakMin?: number;
  streakMax?: number;
  weakest?: AbilityId;
  strongest?: AbilityId;
  /** 1 = lundi … 7 = dimanche */
  weekdays?: number[];
  hourMin?: number;
  hourMax?: number;
  daily?: 'none' | 'some' | 'all';
  firstOfMonth?: boolean;
  monday?: boolean;
  levelMin?: number;
  levelMax?: number;
  inspirationMin?: number;
  /** Jours d'absence avant aujourd'hui */
  awayMin?: number;
  newPlayer?: boolean;
}

export interface TavernMessage {
  id: string;
  text: string;
  when?: TavernCondition;
  weight?: number;
}

export interface TavernContext {
  name: string;
  streak: number;
  weakest: AbilityId;
  strongest: AbilityId;
  weekday: number;
  hour: number;
  dayOfMonth: number;
  dailyDone: number;
  dailyTotal: number;
  level: number;
  inspiration: number;
  daysAway: number;
  totalQuests: number;
  date: string;
}

function matches(c: TavernCondition | undefined, x: TavernContext): boolean {
  if (!c) return true;
  if (c.streakMin !== undefined && x.streak < c.streakMin) return false;
  if (c.streakMax !== undefined && x.streak > c.streakMax) return false;
  if (c.weakest && c.weakest !== x.weakest) return false;
  if (c.strongest && c.strongest !== x.strongest) return false;
  if (c.weekdays && !c.weekdays.includes(x.weekday)) return false;
  if (c.hourMin !== undefined && x.hour < c.hourMin) return false;
  if (c.hourMax !== undefined && x.hour > c.hourMax) return false;
  if (c.daily) {
    const state = x.dailyDone === 0 ? 'none' : x.dailyDone >= x.dailyTotal ? 'all' : 'some';
    if (state !== c.daily) return false;
  }
  if (c.firstOfMonth && x.dayOfMonth !== 1) return false;
  if (c.monday && x.weekday !== 1) return false;
  if (c.levelMin !== undefined && x.level < c.levelMin) return false;
  if (c.levelMax !== undefined && x.level > c.levelMax) return false;
  if (c.inspirationMin !== undefined && x.inspiration < c.inspirationMin) return false;
  if (c.awayMin !== undefined && x.daysAway < c.awayMin) return false;
  if (c.newPlayer && x.totalQuests > 3) return false;
  return true;
}

/** Choisit un message pour la journée : les plus spécifiques sont favorisés, le choix est stable dans la journée. */
export function pickTavernMessage(messages: readonly TavernMessage[], ctx: TavernContext): string {
  const eligible = messages.filter((m) => matches(m.when, ctx));
  const pool = eligible.length ? eligible : messages;
  if (!pool.length) return '';
  const specificity = (m: TavernMessage) => (m.when ? Object.keys(m.when).length : 0);
  const rng = createRng(`tavern|${ctx.date}|${ctx.dailyDone}`);
  const chosen = weightedPick(pool, (m) => (m.weight ?? 1) * (1 + specificity(m) * 2), rng) ?? pool[0];
  return interpolate(chosen.text, {
    name: ctx.name,
    streak: ctx.streak,
    weakest: ABILITY_LABEL[ctx.weakest],
    strongest: ABILITY_LABEL[ctx.strongest],
    level: ctx.level,
  });
}

// ───────────────────────── Bilans ─────────────────────────

export interface RecapTemplates {
  openers: { trend: 'up' | 'down' | 'flat' | 'first'; text: string }[];
  best: { ability: AbilityId; text: string }[];
  weak: { ability: AbilityId; text: string }[];
  closers: { kind: 'week' | 'month'; text: string }[];
}

export interface RecapInput {
  kind: 'week' | 'month';
  name: string;
  xp: number;
  xpPrev: number;
  done: number;
  proposed: number;
  xpByAbility: Record<AbilityId, number>;
  doneByAbility: Record<AbilityId, number>;
  seed: string;
}

export interface Recap {
  kind: 'week' | 'month';
  xp: number;
  xpPrev: number;
  /** variation en % (null si pas de période précédente) */
  deltaPct: number | null;
  done: number;
  proposed: number;
  successRate: number;
  xpByAbility: Record<AbilityId, number>;
  doneByAbility: Record<AbilityId, number>;
  best: AbilityId | null;
  weakest: AbilityId | null;
  narrative: string;
}

export function buildRecap(input: RecapInput, templates: RecapTemplates): Recap {
  const deltaPct = input.xpPrev > 0 ? Math.round(((input.xp - input.xpPrev) / input.xpPrev) * 100) : null;
  const ranked = [...ABILITIES].sort((a, b) => input.xpByAbility[b] - input.xpByAbility[a]);
  const best = input.xp > 0 ? ranked[0] : null;
  const weakest = ranked[ranked.length - 1];
  const rng = createRng(`recap|${input.seed}`);
  const pick = <T>(arr: readonly T[]): T | undefined => (arr.length ? arr[Math.floor(rng() * arr.length)] : undefined);

  const trend: 'up' | 'down' | 'flat' | 'first' = deltaPct === null ? 'first' : deltaPct >= 5 ? 'up' : deltaPct <= -5 ? 'down' : 'flat';
  const vars = { name: input.name, best: best ? ABILITY_LABEL[best] : '', weak: ABILITY_LABEL[weakest], done: input.done, xp: input.xp };
  const parts: string[] = [];
  const opener = pick(templates.openers.filter((o) => o.trend === trend));
  if (opener) parts.push(interpolate(opener.text, vars));
  if (best) {
    const b = pick(templates.best.filter((o) => o.ability === best));
    if (b) parts.push(interpolate(b.text, vars));
  }
  if (input.xp > 0 || input.done > 0) {
    const w = pick(templates.weak.filter((o) => o.ability === weakest));
    if (w && input.xpByAbility[weakest] < (best ? input.xpByAbility[best] : 0)) parts.push(interpolate(w.text, vars));
  }
  const closer = pick(templates.closers.filter((o) => o.kind === input.kind));
  if (closer) parts.push(interpolate(closer.text, vars));

  return {
    kind: input.kind,
    xp: input.xp,
    xpPrev: input.xpPrev,
    deltaPct,
    done: input.done,
    proposed: input.proposed,
    successRate: input.proposed ? Math.round((input.done / input.proposed) * 100) : 0,
    xpByAbility: input.xpByAbility,
    doneByAbility: input.doneByAbility,
    best,
    weakest: input.xp > 0 ? weakest : null,
    narrative: parts.join(' '),
  };
}

// ───────────────────────── Auto-évaluation ─────────────────────────

export interface SelfAssessmentQuestion {
  id: string;
  ability: AbilityId;
  text: string;
  /** Libellés des extrémités du curseur 1 → 5 */
  low: string;
  high: string;
}

/** Transforme 12 réponses (1 à 5) en une répartition valide pour l'achat de points. */
export function scoresFromAssessment(
  questions: readonly SelfAssessmentQuestion[],
  answers: Record<string, number>,
): Record<AbilityId, number> {
  const scores = {} as Record<AbilityId, number>;
  for (const a of ABILITIES) {
    const qs = questions.filter((q) => q.ability === a);
    const vals = qs.map((q) => Math.min(Math.max(answers[q.id] ?? 3, 1), 5));
    const avg = vals.length ? vals.reduce((s, v) => s + v, 0) / vals.length : 3;
    scores[a] = Math.min(Math.max(Math.round(MIN_SCORE + ((avg - 1) * (POINT_BUY_MAX - MIN_SCORE)) / 4), MIN_SCORE), POINT_BUY_MAX);
  }
  // Réduit les plus hauts scores jusqu'à respecter le budget de points à répartir.
  let guard = 0;
  while (pointBuySpent(scores) > POINT_BUY_BUDGET && guard++ < 100) {
    const top = [...ABILITIES].sort((a, b) => scores[b] - scores[a])[0];
    scores[top]--;
  }
  return scores;
}
