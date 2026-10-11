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

// ───────────────────────── Aventure : coffres, équipement, donjons ─────────────────────────
//
// Le héros part à l'aventure : puissance (PP), expédition, coffres gagnés par la discipline, équipement, donjons.
// Règles et formules dans `adventure.ts` ; spécification dans docs/DONJONS.md.

export type ChestRarity = 'bois' | 'bronze' | 'argent' | 'or' | 'mythique';
/** Du plus commun au plus rare */
export const CHEST_RARITIES: readonly ChestRarity[] = ['bois', 'bronze', 'argent', 'or', 'mythique'] as const;

export type ItemRarity = 'commun' | 'peu_commun' | 'rare' | 'epique' | 'legendaire';
/** Du plus commun au plus rare */
export const ITEM_RARITIES: readonly ItemRarity[] = ['commun', 'peu_commun', 'rare', 'epique', 'legendaire'] as const;

export type EquipSlot = 'arme' | 'tete' | 'torse' | 'mains' | 'bottes' | 'amulette';
export const EQUIP_SLOTS: readonly EquipSlot[] = ['arme', 'tete', 'torse', 'mains', 'bottes', 'amulette'] as const;

/** Modèle d'objet (contenu statique `items.fr.json`) : un glyphe, un nom, aucune image. */
export interface ItemDef {
  id: string;
  slot: EquipSlot;
  /** Caractéristique augmentée par l'objet (bonus d'aventure) */
  ability: AbilityId;
  name: string;
  /** Un emoji */
  glyph: string;
  blurb: string;
  /** Panoplie dont l'objet est une pièce (`null` : hors set) */
  setId?: string | null;
}

/** Palier de bonus d'une panoplie : atteint dès `pieces` pièces équipées (le palier atteint remplace le précédent). */
export interface SetBonusTier {
  pieces: number;
  /** PP ajoutés à la puissance */
  pp: number;
  /** Bonus de score d'aventure sur la caractéristique du set */
  ability: number;
}

/** Panoplie : 6 pièces (une par emplacement) et des bonus à 2 / 4 / 6 pièces équipées (contenu statique `sets.fr.json`). */
export interface SetDef {
  id: string;
  name: string;
  glyph: string;
  /** Caractéristique de toutes les pièces, et du bonus de score */
  ability: AbilityId;
  blurb: string;
  /** Identifiant du modèle d'objet de chaque emplacement */
  pieces: Record<EquipSlot, string>;
  bonuses: SetBonusTier[];
}

/** Objet possédé par un joueur. */
export interface InventoryItem {
  id: string;
  templateId: string;
  rarity: ItemRarity;
  slot: EquipSlot;
  ability: AbilityId;
  /** Niveau d'amélioration 0..10 */
  level: number;
  equipped: boolean;
  createdAt: string;
}

/** D'où vient un coffre : quête du jour, promotion d'échelon, jalon de série, boss de donjon, fusion, raid (V2). */
export type ChestSource = 'quest' | 'rung' | 'streak' | 'dungeon' | 'merge' | 'raid' | 'season';

export interface Chest {
  id: string;
  rarity: ChestRarity;
  source: ChestSource;
  /** Clé d'idempotence avec `source` (ex. le jour de jeu pour `quest`, `{parcours}:{échelon}` pour `rung`) */
  sourceKey: string;
  /** Quête dont la validation a donné ce coffre (sert à l'annulation) */
  instanceId?: string | null;
  createdAt: string;
  openedAt: string | null;
}

/** Compteurs de pitié : `{rareté de coffre}` (sans Épique+) et `{rareté de coffre}:legendaire` (sans Légendaire). */
export type ChestPity = Record<string, number>;

/** Un donjon par thème de parcours (contenu statique `dungeons.fr.json`). */
export interface DungeonDef {
  id: string;
  /** Discipline (thème de parcours) dont il est issu */
  theme: string;
  name: string;
  glyph: string;
  blurb: string;
  /** Palier (1..) : plus il est haut, plus le donjon est dur */
  tier: number;
  /** Niveau du personnage requis */
  unlockLevel: number;
  /** Monstres des 5 salles (avec article : « un Gobelin ancien ») */
  rooms: string[];
  /** Boss (avec article) */
  boss: string;
}

/** Progression d'un joueur dans un donjon. */
export interface DungeonProgress {
  dungeonId: string;
  /** Meilleure salle franchie : 0..5, ou 6 si le boss a été vaincu */
  bestRoom: number;
  /** Palier du donjon quand son boss a été vaincu pour la première fois (0 = jamais) */
  bossDefeatedTier: number;
  lastRunDate: string | null;
}

/** Champs d'aventure d'un personnage (colonnes de `characters`). */
export interface AdventureFields {
  gold: number;
  fragments: number;
  /** Clés de donjon en stock (0..MAX_KEYS) */
  keys: number;
  chestPity: ChestPity;
  /** Début de l'expédition en cours (ISO) ; null = pas encore initialisée */
  expeditionStartedAt: string | null;
  chestOpensDate: string | null;
  chestOpensToday: number;
  /** Puissance (PP) à la dernière synchronisation : lue par les amis (carte de compagnon) */
  power: number;
  /** Cadre de portrait cosmétique gagné en fin de saison, `{saison}:{cadre}` (ex. « S1:or ») ; null = aucun */
  frameStyle: string | null;
}

export const emptyAdventureFields = (): AdventureFields => ({
  gold: 0,
  fragments: 0,
  keys: 0,
  chestPity: {},
  expeditionStartedAt: null,
  chestOpensDate: null,
  chestOpensToday: 0,
  power: 0,
  frameStyle: null,
});
