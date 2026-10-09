// Types partagés du moteur de jeu (app + Edge Functions).

export type AbilityId = 'FOR' | 'DEX' | 'CON' | 'INT' | 'SAG' | 'CHA';
export const ABILITIES: readonly AbilityId[] = ['FOR', 'DEX', 'CON', 'INT', 'SAG', 'CHA'] as const;

export type Difficulty = 'easy' | 'medium' | 'high' | 'expert';
export const DIFFICULTIES: readonly Difficulty[] = ['easy', 'medium', 'high', 'expert'] as const;

export type Period = 'daily' | 'weekly' | 'monthly' | 'epic';
export const PERIODS: readonly Period[] = ['daily', 'weekly', 'monthly', 'epic'] as const;

export type QuestStatus = 'proposed' | 'accepted' | 'completed' | 'abandoned' | 'expired';

export type ValidationSpec =
  | { type: 'simple' }
  | { type: 'counter'; target: number; unit: string }
  | { type: 'timer'; minutes: number }
  | { type: 'steps'; steps: string[] }
  | { type: 'journal'; minChars?: number };

export type ValidationType = ValidationSpec['type'];

/** Part de l'XP d'une quête versée à une caractéristique secondaire (en %). */
export interface XpShare {
  ability: AbilityId;
  pct: number;
}

export interface QuestTemplate {
  id: string;
  source: 'catalog' | 'custom';
  ownerId?: string | null;
  ability: AbilityId;
  difficulty: Difficulty;
  periods: Period[];
  title: string;
  flavor: string;
  objective: string;
  tips: string[];
  validation: ValidationSpec;
  tags: string[];
  /** Discipline guidée (danse, cuisine…) ; absente pour les quêtes générales. */
  theme?: string | null;
  /** Caractéristiques secondaires qui reçoivent une part de l'XP. */
  secondary?: XpShare[];
  isActive?: boolean;
}

/** Copie figée du texte d'une quête au moment du tirage. */
export type QuestSnapshot = Pick<
  QuestTemplate,
  'ability' | 'difficulty' | 'title' | 'flavor' | 'objective' | 'tips' | 'validation' | 'tags' | 'theme' | 'secondary'
>;

export interface QuestPreference {
  templateId: string;
  isFavorite?: boolean;
  isExcluded?: boolean;
  isPinned?: boolean;
}

export interface QuestInstance {
  id: string;
  templateId: string;
  snapshot: QuestSnapshot;
  period: Period;
  /** Dates locales de jeu YYYY-MM-DD */
  periodStart: string;
  periodEnd: string;
  status: QuestStatus;
  progress: number;
  /** Avancement des étapes (type steps) */
  stepsDone?: boolean[];
  xpAwarded: number;
  inspirationUsed: boolean;
  /** Quête « libre » : proposition facultative hors quota */
  free?: boolean;
  acceptedAt?: string | null;
  completedAt?: string | null;
}

export interface CharacterCore {
  id: string;
  name: string;
  classId: string;
  pathId?: string | null;
  baseScores: Record<AbilityId, number>;
  /** Points d'amélioration appliqués (+2 / +1) par caractéristique */
  improvements: Record<AbilityId, number>;
  /** Nombre d'améliorations déjà choisies (une par palier 4, 8, 12, 16, 19) */
  improvementsChosen: number;
  totalXp: number;
  abilityXp: Record<AbilityId, number>;
  level: number;
  streakCurrent: number;
  streakBest: number;
  inspiration: number;
}

export interface SettingsCore {
  resetHour: number;
  timezone: string;
  dailyQuestCount: number;
  hardcore: boolean;
}

export const emptyAbilityRecord = <T>(v: T): Record<AbilityId, T> => ({
  FOR: v,
  DEX: v,
  CON: v,
  INT: v,
  SAG: v,
  CHA: v,
});
