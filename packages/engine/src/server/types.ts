import type { RaidOutcome } from '../raid';
import type { SeasonScoreLike } from '../seasons';
import type {
  AbilityId,
  AdventureFields,
  CharacterCore,
  Chest,
  DungeonProgress,
  InventoryItem,
  Period,
  QuestInstance,
  QuestPreference,
  QuestStatus,
  QuestTemplate,
  SettingsCore,
  SpellKnown,
  CardOwned,
  TrackState,
} from '../types';

export type PostType = 'quest' | 'photo' | 'level_up' | 'achievement' | 'streak';
export type Visibility = 'friends' | 'private';

export interface CharacterRecord extends CharacterCore, AdventureFields {
  profileId: string;
  portraitId: string;
  frameColor: string;
  motto: string;
  oath: string;
  titleEquipped: string | null;
  /** « Ta classe a évolué » : à montrer une fois aux personnages migrés des anciennes classes */
  classNotice?: boolean;
  /** La reclassification gratuite a été utilisée */
  classChanged?: boolean;
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
  notifPrefs: { daily: true, dailyTime: '09:00', weekEnd: true, friendRequests: true, reactions: true, comments: true, raid: true, season: true },
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

  // ───── Aventure (voir docs/DONJONS.md)
  listItems(userId: string): Promise<InventoryItem[]>;
  insertItems(userId: string, items: InventoryItem[]): Promise<void>;
  updateItem(userId: string, id: string, patch: Partial<Pick<InventoryItem, 'level' | 'equipped'>>): Promise<void>;
  deleteItems(userId: string, ids: string[]): Promise<void>;
  /** Coffres du joueur ; `opened: false` = fermés seulement, `true` = ouverts seulement */
  listChests(userId: string, filter?: { opened?: boolean }): Promise<Chest[]>;
  /** Insère un coffre. Retourne `false` (sans rien écrire) si `(source, sourceKey)` existe déjà : idempotence. */
  insertChest(userId: string, chest: Chest): Promise<boolean>;
  /** Marque un coffre comme ouvert. Retourne `false` s'il n'existe pas ou était déjà ouvert (ouverture atomique). */
  markChestOpened(userId: string, id: string, at: string): Promise<boolean>;
  deleteChests(userId: string, ids: string[]): Promise<void>;
  listDungeonProgress(userId: string): Promise<DungeonProgress[]>;
  saveDungeonProgress(userId: string, p: DungeonProgress): Promise<void>;
  /** Capacités connues du joueur (V4, docs/CLASSES.md) : niveau 1 à 5 et emplacement du Grimoire (1 à 3, un seul sort par emplacement) */
  listSpells(userId: string): Promise<SpellKnown[]>;
  /** Crée ou met à jour une capacité connue (clé : joueur + capacité). */
  saveSpell(userId: string, spell: SpellKnown): Promise<void>;
  /** Cartes de la collection du joueur (docs/COLLECTION.md) : une ligne par carte, `copies` ≥ 1 */
  listCards(userId: string): Promise<CardOwned[]>;
  /** Crée ou met à jour une carte possédée (clé : joueur + carte). */
  saveCard(userId: string, card: CardOwned): Promise<void>;

  // ───── Raids d'amis (V2). Données partagées entre joueurs : les méthodes prennent des identifiants explicites.
  /** Amis acceptés et non bloqués (même règle que `can_view_owner`) */
  areFriends(a: string, b: string): Promise<boolean>;
  getRaidTeam(teamId: string): Promise<RaidTeamRecord | null>;
  /** Appartenances du joueur (invitations comprises) pour les semaines `weekStart >= since` */
  listRaidMemberships(userId: string, since: string): Promise<RaidMemberRecord[]>;
  listRaidMembers(teamId: string): Promise<RaidMemberRecord[]>;
  /** Crée l'équipe et son chef (membre `joined`). `false` si le chef est déjà dans une équipe cette semaine. */
  insertRaidTeam(team: RaidTeamRecord, leader: RaidMemberRecord): Promise<boolean>;
  insertRaidMember(m: RaidMemberRecord): Promise<RaidMemberWrite>;
  /** Passe une invitation à `joined`. */
  joinRaidMember(teamId: string, profileId: string, at: string): Promise<RaidMemberWrite>;
  /** Retire un membre ou une invitation, avec ses dégâts et ses encouragements. */
  deleteRaidMember(teamId: string, profileId: string): Promise<void>;
  /** Retire les invitations en attente d'un joueur pour une semaine (il vient de rejoindre une équipe). */
  deleteRaidInvites(profileId: string, weekStart: string): Promise<void>;
  setRaidLeader(teamId: string, leaderId: string): Promise<void>;
  deleteRaidTeam(teamId: string): Promise<void>;
  /** Clôture atomique : `false` si l'équipe est déjà close. */
  resolveRaidTeam(teamId: string, r: { outcome: RaidOutcome; maxHp: number; totalDamage: number; victoryDay: string | null; at: string }): Promise<boolean>;
  listRaidDamage(teamId: string): Promise<RaidDamageRecord[]>;
  /** Un seul coup par joueur et par jour (toutes équipes confondues) : `false` s'il existe déjà. */
  insertRaidDamage(d: RaidDamageRecord): Promise<boolean>;
  updateRaidDamage(teamId: string, profileId: string, gameDate: string, patch: Pick<RaidDamageRecord, 'damage' | 'encouragements'>): Promise<void>;
  listRaidEncouragements(teamId: string, gameDate: string): Promise<RaidEncouragementRecord[]>;
  /** `false` si ce joueur a déjà encouragé cet ami aujourd'hui. */
  insertRaidEncouragement(e: RaidEncouragementRecord): Promise<boolean>;
  /** Crée une notification (`notify_user`) ; l'envoi push dépend des préférences du destinataire. */
  notify(userId: string, type: string, payload: Record<string, unknown>): Promise<void>;

  // ───── Saisons (V3). Puissance publiée par saison, classement entre amis, récompense de fin de saison.
  /** Publie la puissance du joueur pour la saison (garde le premier jour, met à jour le dernier et la puissance). */
  upsertSeasonScore(userId: string, seasonKey: string, power: number, day: string): Promise<void>;
  listSeasonScores(userId: string): Promise<SeasonScoreRecord[]>;
  /** Puissance de la saison du joueur et de ses amis qui acceptent le classement (même règle que `weekly_leaderboard`). Vide si le joueur refuse. */
  seasonRanking(userId: string, seasonKey: string): Promise<SeasonScoreLike[]>;
  listSeasonResults(userId: string): Promise<SeasonResultRecord[]>;
  /** Enregistre le résultat d'une saison. `false` s'il existe déjà : seul l'appel qui l'insère applique cadre et notification. */
  insertSeasonResult(userId: string, r: SeasonResultRecord): Promise<boolean>;

  createPost(userId: string, draft: PostDraft): Promise<string>;
  /** RG-22 : retire la mention de quête et l'XP d'une publication quand la quête est annulée. */
  detachPostsFromInstance(userId: string, instanceId: string): Promise<void>;
  /** Compteurs sociaux nécessaires aux trophées */
  socialCounts(userId: string): Promise<{ posts: number; friends: number; reactionsGiven: number }>;

}

// ───── Saisons (V3, voir docs/DONJONS.md §9)

/** Puissance publiée par un joueur pour une saison. */
export interface SeasonScoreRecord {
  seasonKey: string;
  power: number;
  /** Premier et dernier jour de jeu où la puissance a été publiée */
  firstDay: string;
  lastDay: string;
}

/** Résultat d'une saison pour un joueur : écrit une seule fois, à la première lecture après la clôture. */
export interface SeasonResultRecord {
  seasonKey: string;
  /** Rang parmi les amis classés (null : classement refusé ou saison sans participation suffisante) */
  rank: number | null;
  participants: number;
  power: number;
  /** Cadre gagné (`or`, `argent`, `bronze`, `laurier`), null si la participation n'a pas suffi */
  frame: string | null;
  createdAt: string;
}

// ───── Raids d'amis (V2, voir docs/DONJONS.md §8)

/** Équipe de raid : une par semaine ISO (`weekStart` = lundi). */
export interface RaidTeamRecord {
  id: string;
  weekStart: string;
  leaderId: string;
  createdAt: string;
  /** Renseigné quand le raid est clos (victoire dès que le boss tombe, sinon à la clôture de la semaine) */
  resolvedAt: string | null;
  outcome: RaidOutcome | null;
  /** PV et dégâts figés à la clôture */
  maxHp: number | null;
  totalDamage: number | null;
  victoryDay: string | null;
}

export type RaidMemberStatus = 'invited' | 'joined';

export interface RaidMemberRecord {
  teamId: string;
  profileId: string;
  weekStart: string;
  status: RaidMemberStatus;
  /** Qui a invité ce joueur (le chef pour un invité, le joueur lui-même pour le chef) */
  invitedBy: string;
  createdAt: string;
  joinedAt: string | null;
}

/** Dégâts d'un membre pour un jour de jeu : `damage = floor(baseDamage × (1 + 5 % × encouragements))`. */
export interface RaidDamageRecord {
  teamId: string;
  profileId: string;
  gameDate: string;
  damage: number;
  baseDamage: number;
  encouragements: number;
}

export interface RaidEncouragementRecord {
  teamId: string;
  fromId: string;
  toId: string;
  gameDate: string;
  createdAt: string;
}

/** Résultat d'une écriture de membre : la base garantit l'unicité, le plafond de 6 et l'amitié avec le chef. */
export type RaidMemberWrite = 'ok' | 'duplicate' | 'full' | 'not-friend' | 'conflict';

export interface ServerContext {
  store: GameStore;
  now: () => number;
  uuid: () => string;
}

export type { QuestInstance, QuestPreference, QuestTemplate };
