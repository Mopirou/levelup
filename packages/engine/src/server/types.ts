import type {
  AbilityId,
  CharacterCore,
  Period,
  QuestInstance,
  QuestPreference,
  QuestStatus,
  QuestTemplate,
  SettingsCore,
  TrackState,
} from '../types';

export type PostType = 'quest' | 'photo' | 'level_up' | 'achievement' | 'streak';
export type Visibility = 'friends' | 'private';

export interface CharacterRecord extends CharacterCore {
  profileId: string;
  portraitId: string;
  frameColor: string;
  motto: string;
  oath: string;
  titleEquipped: string | null;
  /** Relances gratuites : date de jeu et nombre utilisé ce jour-là */
  rerollsDate: string | null;
  rerollsUsed: number;
  createdAt: string;
}

export interface AutoShare {
  level: boolean;
  achievement: boolean;
  streak: boolean;
}

export interface SettingsRecord extends SettingsCore {
  autoShare: AutoShare;
  defaultVisibility: Visibility;
  leaderboardOptIn: boolean;
  notifPrefs: Record<string, boolean | string>;
  friendRequestsFrom: 'everyone' | 'code' | 'nobody';
  theme: 'auto' | 'light' | 'dark';
  sounds: boolean;
  reducedMotion: boolean;
  lastRecapWeek: string | null;
  lastRecapMonth: string | null;
  /** Centres d'intérêt : disciplines (« cuisine ») ou activités précises (« langues:espagnol »). */
  interests: string[];
}

export const defaultSettings = (timezone = 'Europe/Paris'): SettingsRecord => ({
  resetHour: 4,
  timezone,
  dailyQuestCount: 2,
  hardcore: false,
  autoShare: { level: true, achievement: true, streak: true },
  defaultVisibility: 'friends',
  leaderboardOptIn: true,
  notifPrefs: { daily: true, dailyTime: '09:00', weekEnd: true, friendRequests: true, reactions: true, comments: true },
  friendRequestsFrom: 'everyone',
  theme: 'auto',
  sounds: true,
  reducedMotion: false,
  lastRecapWeek: null,
  lastRecapMonth: null,
  interests: [],
});

export type XpReason = 'quest' | 'partial' | 'achievement' | 'undo' | 'hardcore' | 'bonus';

export interface XpEvent {
  id: string;
  instanceId: string | null;
  ability: AbilityId;
  amount: number;
  reason: XpReason;
  /** XP issue d'une quête personnalisée (plafonnée dans le classement) */
  custom: boolean;
  createdAt: string;
  gameDate: string;
}

export interface JournalEntry {
  id: string;
  instanceId: string;
  text: string;
  createdAt: string;
}

export interface PostDraft {
  type: PostType;
  instanceId?: string | null;
  text: string;
  visibility: Visibility;
  mediaPaths: string[];
  /** Données de rendu des cartes automatiques (niveau, trophée, série) */
  payload?: Record<string, unknown>;
}

export interface InstanceFilter {
  period?: Period;
  status?: QuestStatus | QuestStatus[];
  /** periodStart >= from */
  from?: string;
  /** periodStart <= to */
  to?: string;
  /** instances dont la période couvre cette date */
  covers?: string;
}

/**
 * Accès aux données pour la logique de jeu. Implémenté par Supabase (Edge Functions, rôle service)
 * et par IndexedDB (mode local). Toutes les méthodes sont limitées à un utilisateur.
 */
export interface GameStore {
  getCharacter(userId: string): Promise<CharacterRecord | null>;
  saveCharacter(userId: string, c: CharacterRecord): Promise<void>;
  getSettings(userId: string): Promise<SettingsRecord>;
  saveSettings(userId: string, s: SettingsRecord): Promise<void>;

  /**
   * Catalogue + gabarits personnels (+ gabarits d'échelon des parcours par défaut).
   * `withRungs: false` écarte les gabarits d'échelon (`track_id` non nul) : plus léger pour qui n'en a pas besoin.
   */
  listTemplates(userId: string, opts?: { withRungs?: boolean }): Promise<QuestTemplate[]>;
  getPreferences(userId: string): Promise<Record<string, QuestPreference>>;
  savePreference(userId: string, p: QuestPreference): Promise<void>;

  listInstances(userId: string, filter?: InstanceFilter): Promise<QuestInstance[]>;
  getInstance(userId: string, id: string): Promise<QuestInstance | null>;
  insertInstances(userId: string, instances: QuestInstance[]): Promise<void>;
  updateInstance(userId: string, id: string, patch: Partial<QuestInstance>): Promise<void>;
  deleteInstance(userId: string, id: string): Promise<void>;

  insertXpEvents(userId: string, events: XpEvent[]): Promise<void>;
  listXpEvents(userId: string, since?: string): Promise<XpEvent[]>;

  listUnlocked(userId: string): Promise<{ achievementId: string; unlockedAt: string }[]>;
  unlockAchievement(userId: string, achievementId: string, at: string): Promise<void>;

  listRestDays(userId: string): Promise<string[]>;
  addRestDay(userId: string, day: string): Promise<void>;

  saveJournal(userId: string, entry: JournalEntry): Promise<void>;
  countJournal(userId: string): Promise<number>;

  /** Parcours de discipline du joueur (tous statuts) */
  listTracks(userId: string): Promise<TrackState[]>;
  /** Crée ou remplace l'état d'un parcours */
  saveTrack(userId: string, t: TrackState): Promise<void>;
  deleteTrack(userId: string, trackId: string): Promise<void>;
  listJournal(userId: string): Promise<JournalEntry[]>;

  createPost(userId: string, draft: PostDraft): Promise<string>;
  /** RG-22 : retire la mention de quête et l'XP d'une publication quand la quête est annulée. */
  detachPostsFromInstance(userId: string, instanceId: string): Promise<void>;
  /** Compteurs sociaux nécessaires aux trophées */
  socialCounts(userId: string): Promise<{ posts: number; friends: number; reactionsGiven: number }>;

}

export interface ServerContext {
  store: GameStore;
  now: () => number;
  uuid: () => string;
}

export type { QuestInstance, QuestPreference, QuestTemplate };
