import { AbilityId, Difficulty } from './types';

export type AchievementCondition =
  | { kind: 'quests_total'; target: number }
  | { kind: 'quests_by_difficulty'; difficulty: Difficulty; target: number }
  | { kind: 'quests_by_ability'; ability: AbilityId; target: number }
  | { kind: 'streak_best'; target: number }
  | { kind: 'level'; target: number }
  | { kind: 'total_xp'; target: number }
  | { kind: 'ability_score'; ability: AbilityId; target: number }
  | { kind: 'all_scores_min'; target: number }
  | { kind: 'legendary_abilities'; target: number }
  | { kind: 'early_quests'; target: number }
  | { kind: 'late_quests'; target: number }
  | { kind: 'comeback'; target: number }
  | { kind: 'perfect_days'; target: number }
  | { kind: 'discovered'; target: number }
  | { kind: 'journal_entries'; target: number }
  | { kind: 'posts_shared'; target: number }
  | { kind: 'friends'; target: number }
  | { kind: 'reactions_given'; target: number }
  | { kind: 'custom_quests'; target: number }
  | { kind: 'timer_minutes'; target: number }
  | { kind: 'rest_days'; target: number }
  | { kind: 'inspiration_used'; target: number }
  | { kind: 'week_all_abilities'; target: number }
  | { kind: 'weekly_done'; target: number }
  | { kind: 'monthly_done'; target: number };

export interface AchievementDef {
  id: string;
  category: 'constance' | 'maitrise' | 'exploration' | 'exploits' | 'equilibre' | 'secrets';
  name: string;
  description: string;
  hint?: string;
  condition: AchievementCondition;
  xpBonus: number;
  titleUnlocked?: string | null;
  isSecret?: boolean;
}

/** Statistiques agrégées d'un joueur, calculées côté serveur à partir du registre. */
export interface PlayerStats {
  questsTotal: number;
  byDifficulty: Record<Difficulty, number>;
  byAbility: Record<AbilityId, number>;
  streakBest: number;
  level: number;
  totalXp: number;
  scores: Record<AbilityId, number>;
  earlyQuests: number;
  lateQuests: number;
  /** Plus longue absence (en jours) suivie d'un retour */
  comebackGap: number;
  perfectDays: number;
  discovered: number;
  journalEntries: number;
  postsShared: number;
  friends: number;
  reactionsGiven: number;
  customQuests: number;
  timerMinutes: number;
  restDays: number;
  inspirationUsed: number;
  /** Plus grand nombre de caractéristiques différentes touchées sur une même semaine */
  weekAbilitiesMax: number;
  weeklyDone: number;
  monthlyDone: number;
}

export interface AchievementProgress {
  id: string;
  current: number;
  target: number;
  done: boolean;
}

export function conditionProgress(c: AchievementCondition, s: PlayerStats): { current: number; target: number } {
  switch (c.kind) {
    case 'quests_total':
      return { current: s.questsTotal, target: c.target };
    case 'quests_by_difficulty':
      return { current: s.byDifficulty[c.difficulty], target: c.target };
    case 'quests_by_ability':
      return { current: s.byAbility[c.ability], target: c.target };
    case 'streak_best':
      return { current: s.streakBest, target: c.target };
    case 'level':
      return { current: s.level, target: c.target };
    case 'total_xp':
      return { current: s.totalXp, target: c.target };
    case 'ability_score':
      return { current: s.scores[c.ability], target: c.target };
    case 'all_scores_min':
      return { current: Math.min(...Object.values(s.scores)), target: c.target };
    case 'legendary_abilities':
      return { current: Object.values(s.scores).filter((v) => v > 20).length, target: c.target };
    case 'early_quests':
      return { current: s.earlyQuests, target: c.target };
    case 'late_quests':
      return { current: s.lateQuests, target: c.target };
    case 'comeback':
      return { current: s.comebackGap, target: c.target };
    case 'perfect_days':
      return { current: s.perfectDays, target: c.target };
    case 'discovered':
      return { current: s.discovered, target: c.target };
    case 'journal_entries':
      return { current: s.journalEntries, target: c.target };
    case 'posts_shared':
      return { current: s.postsShared, target: c.target };
    case 'friends':
      return { current: s.friends, target: c.target };
    case 'reactions_given':
      return { current: s.reactionsGiven, target: c.target };
    case 'custom_quests':
      return { current: s.customQuests, target: c.target };
    case 'timer_minutes':
      return { current: s.timerMinutes, target: c.target };
    case 'rest_days':
      return { current: s.restDays, target: c.target };
    case 'inspiration_used':
      return { current: s.inspirationUsed, target: c.target };
    case 'week_all_abilities':
      return { current: s.weekAbilitiesMax, target: c.target };
    case 'weekly_done':
      return { current: s.weeklyDone, target: c.target };
    case 'monthly_done':
      return { current: s.monthlyDone, target: c.target };
  }
}

export function evaluateAchievements(defs: readonly AchievementDef[], stats: PlayerStats): AchievementProgress[] {
  return defs.map((d) => {
    const { current, target } = conditionProgress(d.condition, stats);
    return { id: d.id, current: Math.min(current, target), target, done: current >= target };
  });
}

/** Trophées dont la condition est remplie et qui ne sont pas encore débloqués. */
export function newlyUnlocked(defs: readonly AchievementDef[], stats: PlayerStats, alreadyUnlocked: ReadonlySet<string>): AchievementDef[] {
  return defs.filter((d) => !alreadyUnlocked.has(d.id) && conditionProgress(d.condition, stats).current >= conditionProgress(d.condition, stats).target);
}

export function emptyStats(): PlayerStats {
  return {
    questsTotal: 0,
    byDifficulty: { easy: 0, medium: 0, high: 0, expert: 0 },
    byAbility: { FOR: 0, DEX: 0, CON: 0, INT: 0, SAG: 0, CHA: 0 },
    streakBest: 0,
    level: 1,
    totalXp: 0,
    scores: { FOR: 8, DEX: 8, CON: 8, INT: 8, SAG: 8, CHA: 8 },
    earlyQuests: 0,
    lateQuests: 0,
    comebackGap: 0,
    perfectDays: 0,
    discovered: 0,
    journalEntries: 0,
    postsShared: 0,
    friends: 0,
    reactionsGiven: 0,
    customQuests: 0,
    timerMinutes: 0,
    restDays: 0,
    inspirationUsed: 0,
    weekAbilitiesMax: 0,
    weeklyDone: 0,
    monthlyDone: 0,
  };
}
