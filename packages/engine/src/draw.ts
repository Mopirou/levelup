import { addDays, diffDays } from './dates';
import { createRng, weightedPick } from './random';
import {
  ABILITIES,
  AbilityId,
  DIFFICULTIES,
  Difficulty,
  Period,
  QuestPreference,
  QuestTemplate,
} from './types';
import { TIER4_MIN_LEVEL, tierUnlocked } from './xp';

/** Délai avant qu'une quête tirée puisse revenir (en jours). */
export const ANTI_REPEAT_DAYS: Record<Period, number> = {
  daily: 7,
  weekly: 28,
  monthly: 90,
  epic: 270,
};

export interface DrawInput {
  characterId: string;
  period: Period;
  periodStart: string;
  count: number;
  level: number;
  scores: Record<AbilityId, number>;
  masteries: readonly AbilityId[];
  templates: readonly QuestTemplate[];
  preferences: Record<string, QuestPreference>;
  /** templateId -> début de la dernière période où elle a été tirée (pour cette période) */
  lastDrawn: Record<string, string>;
  /** Templates à ne pas tirer (déjà dans la période, relance…) */
  exclude?: readonly string[];
  /** Force la difficulté de chaque emplacement (quêtes libres) */
  difficultyPlan?: readonly Difficulty[];
  /** Sel de graine (relance) */
  seedSuffix?: string;
  /** Ignore les quêtes épinglées (relance, quêtes libres) */
  skipPinned?: boolean;
}

export interface DrawResult {
  picks: QuestTemplate[];
  /** Règles relâchées faute de catalogue (RG-12) */
  relaxed: ('anti-repeat' | 'balance' | 'duplicate-ability' | 'locked')[];
}

function difficultyWeights(period: Period, level: number): Record<Difficulty, number> {
  switch (period) {
    case 'daily':
      return { easy: 60, medium: 35, high: level >= 5 ? 5 : 0, expert: 0 };
    case 'weekly':
      return { easy: 0, medium: 50, high: 40, expert: level >= TIER4_MIN_LEVEL ? 10 : 0 };
    case 'monthly':
      return { easy: 0, medium: 0, high: level >= TIER4_MIN_LEVEL ? 50 : 100, expert: level >= TIER4_MIN_LEVEL ? 50 : 0 };
    case 'epic':
      return { easy: 0, medium: 0, high: 0, expert: 100 };
  }
}

function accessible(t: QuestTemplate, scores: Record<AbilityId, number>, level: number): boolean {
  return tierUnlocked(t.difficulty, scores[t.ability], level);
}

/** Tirage déterministe des quêtes d'une période (cahier des charges 5.5). */
export function drawQuests(input: DrawInput): DrawResult {
  const rng = createRng(`${input.characterId}|${input.period}|${input.periodStart}|${input.seedSuffix ?? ''}`);
  const relaxed = new Set<DrawResult['relaxed'][number]>();
  const picks: QuestTemplate[] = [];
  const picked = new Set<string>(input.exclude ?? []);
  const prefs = input.preferences;

  const eligible = input.templates.filter((t) => t.isActive !== false && t.periods.includes(input.period) && !prefs[t.id]?.isExcluded);
  const pool = eligible.filter((t) => accessible(t, input.scores, input.level));

  // Quêtes épinglées : reviennent à chaque période sans tirage.
  if (!input.skipPinned && !input.difficultyPlan) {
    for (const t of pool) {
      if (prefs[t.id]?.isPinned && !picked.has(t.id)) {
        picks.push(t);
        picked.add(t.id);
      }
    }
  }

  const sortedScores = ABILITIES.map((a) => input.scores[a]).sort((a, b) => a - b);
  const minScore = sortedScores[0];
  const maxScore = sortedScores[sortedScores.length - 1];

  const slots = input.difficultyPlan ? input.difficultyPlan.length : Math.max(input.count - picks.length, 0);
  const dw = difficultyWeights(input.period, input.level);

  for (let slot = 0; slot < slots; slot++) {
    const wantedDifficulty: Difficulty | undefined = input.difficultyPlan?.[slot];
    const chosenDifficulty =
      wantedDifficulty ??
      (weightedPick(DIFFICULTIES as readonly Difficulty[], (d) => dw[d], rng) as Difficulty | undefined) ??
      'easy';
    // Ordre de repli : la difficulté voulue puis les plus proches.
    const idx = DIFFICULTIES.indexOf(chosenDifficulty);
    const order = [...DIFFICULTIES].sort((a, b) => Math.abs(DIFFICULTIES.indexOf(a) - idx) - Math.abs(DIFFICULTIES.indexOf(b) - idx));

    let found: QuestTemplate | undefined;
    // Dernier recours : si rien n'est débloqué pour ce créneau (p. ex. la quête mensuelle d'un début de partie),
    // on tire parmi les quêtes verrouillées de la caractéristique la plus haute plutôt que de laisser le créneau vide.
    let source = pool;
    // Niveaux de relâchement successifs (RG-12) : anti-répétition, équilibrage, doublon de caractéristique.
    for (let attempt = 0; attempt < 2 && !found; attempt++) {
    if (attempt === 1) {
      const open = eligible.filter((t) => !picked.has(t.id));
      const best = Math.max(-Infinity, ...open.map((t) => input.scores[t.ability]));
      source = open.filter((t) => input.scores[t.ability] === best);
      if (!source.length) break;
    }
    for (let relax = 0; relax <= 3 && !found; relax++) {
      const useAntiRepeat = relax < 1;
      const useBalance = relax < 2;
      const useNoDup = relax < 3;
      const needMastery = slot === 0 && picks.length === 0 && input.masteries.length > 0;
      const hasMastery = picks.some((p) => input.masteries.includes(p.ability));

      for (const diff of order) {
        if (wantedDifficulty && diff !== wantedDifficulty && relax < 1) continue;
        let cands = source.filter((t) => t.difficulty === diff && !picked.has(t.id));
        if (useAntiRepeat) {
          const win = ANTI_REPEAT_DAYS[input.period];
          cands = cands.filter((t) => {
            const last = input.lastDrawn[t.id];
            return !last || diffDays(input.periodStart, last) >= win;
          });
        }
        if (useNoDup && input.period === 'daily' && input.count <= 6) {
          const used = new Set(picks.map((p) => p.ability));
          if (used.size < ABILITIES.length) cands = cands.filter((t) => !used.has(t.ability));
        }
        if (needMastery || (!hasMastery && slot === slots - 1 && input.masteries.length > 0)) {
          const mastered = cands.filter((t) => input.masteries.includes(t.ability));
          if (mastered.length) cands = mastered;
        }
        if (!cands.length) continue;
        found = weightedPick(
          cands,
          (t) => {
            let w = 1;
            if (useBalance && maxScore > minScore) {
              if (input.scores[t.ability] === minScore) w *= 2;
              else if (input.scores[t.ability] === maxScore) w *= 0.5;
            }
            if (prefs[t.id]?.isFavorite) w *= 3;
            return w;
          },
          rng,
        );
        if (found) {
          if (!useAntiRepeat) relaxed.add('anti-repeat');
          if (!useBalance) relaxed.add('balance');
          if (!useNoDup && input.period === 'daily') relaxed.add('duplicate-ability');
          if (attempt === 1) relaxed.add('locked');
          break;
        }
      }
    }
    }
    if (!found) break;
    picks.push(found);
    picked.add(found.id);
  }
  return { picks, relaxed: [...relaxed] };
}

/** Début de la dernière période où chaque template a été tiré, à partir de l'historique des instances. */
export function lastDrawnMap(
  instances: readonly { templateId: string; period: Period; periodStart: string }[],
  period: Period,
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const i of instances) {
    if (i.period !== period) continue;
    if (!out[i.templateId] || i.periodStart > out[i.templateId]) out[i.templateId] = i.periodStart;
  }
  return out;
}

/** Date avant laquelle une quête tirée ne peut revenir. */
export function availableAgainOn(period: Period, lastPeriodStart: string): string {
  return addDays(lastPeriodStart, ANTI_REPEAT_DAYS[period]);
}
