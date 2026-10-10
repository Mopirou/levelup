// Types partagés du moteur de jeu (app + Edge Functions).

export type AbilityId = 'FOR' | 'DEX' | 'CON' | 'INT' | 'SAG' | 'CHA';
export const ABILITIES: readonly AbilityId[] = ['FOR', 'DEX', 'CON', 'INT', 'SAG', 'CHA'] as const;

export type Difficulty = 'easy' | 'medium' | 'high' | 'expert';
export const DIFFICULTIES: readonly Difficulty[] = ['easy', 'medium', 'high', 'expert'] as const;

export type Period = 'daily' | 'weekly' | 'monthly' | 'epic';
export const PERIODS: readonly Period[] = ['daily', 'weekly', 'monthly', 'epic'] as const;

/** draw = tirage (« Pour aller plus loin »), chosen = catalogue, redo = refaite, track = quête du jour d'un parcours */
export type QuestOrigin = 'draw' | 'chosen' | 'redo' | 'track';

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
  /** Quête d'échelon d'un parcours : jamais tirée au sort ni listée dans le catalogue libre */
  trackId?: string | null;
  rung?: number | null;
}

/** Copie figée du texte d'une quête au moment du tirage. */
export type QuestSnapshot = Pick<
  QuestTemplate,
  'ability' | 'difficulty' | 'title' | 'flavor' | 'objective' | 'tips' | 'validation' | 'tags' | 'theme' | 'secondary'
> & {
  /** Ajustement demandé par le joueur : -1 = « trop dur » (cible réduite), 1 = « trop facile » (cible augmentée). */
  tune?: -1 | 1;
  /** Cible d'origine avant ajustement (sert à calculer l'XP proportionnelle). */
  baseTarget?: number;
  /**
   * Quête de parcours validée : état du parcours juste avant cette validation, uniquement si elle a réellement fait avancer
   * le parcours. L'annulation s'en sert pour restaurer l'état à l'identique (absent = rien à défaire).
   */
  trackBefore?: { rung: number; hits: number; bestRung: number; lastDoneDate: string | null };
};

export interface QuestPreference {
  templateId: string;
  isFavorite?: boolean;
  isExcluded?: boolean;
  isPinned?: boolean;
  /** Dernier ajustement choisi pour cette quête (-1, 0, 1), réappliqué quand elle revient au tirage. */
  tune?: number;
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
  /** Parcours de discipline dont cette quête est l'échelon du jour (origin = 'track') */
  trackId?: string | null;
  /** Échelon du parcours au moment du tirage */
  rung?: number | null;
  /** Quête « libre » : hors quota (proposition facultative, quête choisie ou refaite) */
  free?: boolean;
  /** Rang parmi les quêtes du même modèle dans la période (1 = première, 2+ = refaite) */
  run?: number;
  /** D'où vient la quête : tirage (quota), choix dans le catalogue, ou refaite après une validation */
  origin?: QuestOrigin;
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
  /** Quêtes journalières tirées chaque jour ; 0 = mode manuel (le joueur choisit dans le catalogue) */
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

// ───────────────────────── Parcours de discipline ─────────────────────────
//
// Un parcours est une échelle d'échelons au sein d'une activité d'une discipline
// (ex. discipline « musculation », parcours « Muscu haut du corps »). Le joueur en active jusqu'à MAX_ACTIVE_TRACKS ;
// chaque jour l'application lui propose la quête de son échelon. Voir docs/PARCOURS.md.

export interface TrackRung {
  /** 1 = premier échelon */
  rung: number;
  title: string;
  objective: string;
  tips: string[];
  validation: ValidationSpec;
  /** Sert à l'XP de base (easy 10 / medium 25 / high 50 / expert 100) */
  difficulty: Difficulty;
}

export interface TrackDef {
  /** `{theme}-{activité slugifiée}` — ex. « musculation-muscu-haut-du-corps » */
  id: string;
  theme: string;
  /** Nom de l'activité tel qu'il figure dans la discipline */
  activity: string;
  label: string;
  /** Pourquoi ce parcours (une phrase) */
  blurb: string;
  ability: AbilityId;
  secondary: XpShare[];
  rungs: TrackRung[];
}

export type TrackStatus = 'active' | 'paused';

/** État d'un parcours pour un joueur. */
export interface TrackState {
  trackId: string;
  status: TrackStatus;
  /** Échelon courant (1..rungs.length) */
  rung: number;
  /** Jours validés à l'échelon courant depuis la dernière montée ou descente */
  hits: number;
  /** Dernier jour de jeu (YYYY-MM-DD) où une quête du parcours a été validée */
  lastDoneDate: string | null;
  /** Dernier jour de jeu (YYYY-MM-DD) traité pour le calcul des jours manqués */
  lastCheckedDate: string | null;
  /** Échelon le plus haut jamais atteint */
  bestRung: number;
  startedAt: string;
}

export const MAX_ACTIVE_TRACKS = 3;
/** Jours validés à un échelon pour monter au suivant */
export const TRACK_PROMOTE_HITS = 5;
/** Jours manqués d'affilée (hors repos et pause) avant de descendre d'un échelon */
export const TRACK_DEMOTE_MISSES = 4;
