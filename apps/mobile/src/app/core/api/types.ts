import type {
  AbilityId,
  AdventureState,
  CharacterRecord,
  CardGain,
  CardOwned,
  Chest,
  ChestOpening,
  ChestRarity,
  DungeonEntry,
  DungeonRunResult,
  DungeonProgress,
  EquipSlot,
  ExpeditionClaim,
  CollectionState,
  GrimoireState,
  ItemView,
  SpellGain,
  SpellView,
  RaidHit,
  RaidInvitationView,
  RaidMemberView,
  RaidResult,
  RaidRules,
  RaidState,
  RaidStatus,
  RaidTeamView,
  ItemRarity,
  SeasonResultView,
  SeasonState,
  SetProgress,
  ShopOffer,
  FragmentPack,
  CompleteRequest,
  CompleteResponse,
  CreateCharacterInput,
  Difficulty,
  GameError,
  GameStore,
  ImprovementChoice,
  Period,
  QuestInstance,
  QuestPreference,
  QuestTemplate,
  ReactionKind,
  SettingsRecord,
  TrackState,
  Visibility,
  EnsureResult,
  AchievementProgress,
} from '@levelup/engine';

export type { CompleteRequest, CompleteResponse, CreateCharacterInput, GameError, ImprovementChoice };
export type { GrimoireState, SpellGain, SpellView };
export type { CardGain, CardOwned, CollectionState, FragmentPack, ShopOffer };
export type { AdventureState, Chest, ChestOpening, ChestRarity, DungeonEntry, DungeonProgress, DungeonRunResult, EquipSlot, ExpeditionClaim, ItemView };
export type { SeasonResultView, SeasonState, SetProgress };
export type { RaidHit, RaidInvitationView, RaidMemberView, RaidResult, RaidRules, RaidState, RaidStatus, RaidTeamView };

export interface AuthUser {
  id: string;
  email: string | null;
}

export interface MyProfile {
  id: string;
  username: string;
  friendCode: string;
  birthYear: number | null;
  createdAt: string;
}

export interface SignUpInput {
  email: string;
  password: string;
  username: string;
  birthYear: number;
}

export type CommandResult<T> = ({ ok: true } & T) | { ok: false; error: GameError | 'network' | 'server'; message?: string };

// ───────────────────────── Authentification ─────────────────────────

export interface AuthApi {
  readonly mode: 'local' | 'cloud';
  getUser(): Promise<AuthUser | null>;
  onChange(cb: (u: AuthUser | null) => void): () => void;
  signUp(input: SignUpInput): Promise<{ confirmationRequired: boolean }>;
  signIn(email: string, password: string): Promise<void>;
  sendMagicLink(email: string): Promise<void>;
  resendConfirmation(email: string): Promise<void>;
  updatePassword(password: string): Promise<void>;
  updateEmail(email: string): Promise<void>;
  signOut(): Promise<void>;
  usernameAvailable(username: string): Promise<boolean>;
  getProfile(): Promise<MyProfile | null>;
  updateUsername(username: string): Promise<void>;
  linkedProviders(): Promise<string[]>;
}

// ───────────────────────── Jeu ─────────────────────────

export interface GameApi {
  readonly mode: 'local' | 'cloud';
  /** Lecture des données (RLS côté cloud) */
  readonly store: GameStore;
  userId(): string;

  // Commandes : la logique officielle (Edge Function côté cloud, moteur en processus en mode local)
  ensure(): Promise<EnsureResult>;
  createCharacter(input: CreateCharacterInput): Promise<CommandResult<{ character: CharacterRecord }>>;
  accept(instanceId: string): Promise<CommandResult<{ instance: QuestInstance }>>;
  abandon(instanceId: string): Promise<CommandResult<{ instance: QuestInstance }>>;
  progress(instanceId: string, patch: { progress?: number; stepsDone?: boolean[] }): Promise<CommandResult<{ instance: QuestInstance }>>;
  /** Ajoute une quête du catalogue aux quêtes de la période (acceptée tout de suite, hors quota) */
  start(input: { templateId: string; period: Period }): Promise<CommandResult<{ instance: QuestInstance }>>;
  /** Refait une quête terminée dans la période en cours (XP dégressive) */
  redo(instanceId: string): Promise<CommandResult<{ instance: QuestInstance }>>;
  reroll(instanceId: string): Promise<CommandResult<{ instance: QuestInstance; usedInspiration: boolean }>>;
  /** « Trop dur » / « trop facile » : ajuste la cible d'une quête à compteur ou à minuteur */
  tune(instanceId: string, direction: 'easier' | 'harder'): Promise<CommandResult<{ instance: QuestInstance }>>;
  complete(req: CompleteRequest): Promise<CommandResult<{ data: CompleteResponse }>>;
  undo(instanceId: string): Promise<CommandResult<{ character: CharacterRecord; instance: QuestInstance }>>;
  choosePath(pathId: string): Promise<CommandResult<{ character: CharacterRecord }>>;
  /** Reclassification gratuite (une fois) après la refonte des classes, voir docs/CLASSES.md §4 */
  changeClass(classId: string): Promise<CommandResult<{ character: CharacterRecord }>>;
  chooseImprovement(choice: ImprovementChoice): Promise<CommandResult<{ character: CharacterRecord }>>;
  declareRest(): Promise<CommandResult<{ day: string }>>;
  equipTitle(title: string | null): Promise<CommandResult<{ character: CharacterRecord }>>;
  /** Parcours de discipline : démarrer, mettre en pause / reprendre, arrêter (voir docs/PARCOURS.md) */
  trackStart(trackId: string): Promise<CommandResult<{ track: TrackState }>>;
  trackPause(trackId: string, paused: boolean): Promise<CommandResult<{ track: TrackState }>>;
  trackStop(trackId: string): Promise<CommandResult<{ trackId: string }>>;
  achievementProgress(): Promise<AchievementProgress[]>;

  // Aventure : puissance, expédition, coffres, équipement, donjons (voir docs/DONJONS.md)
  /** État complet : PP, expédition, coffres fermés, inventaire, ressources, plafond d'ouverture */
  adventureState(): Promise<CommandResult<{ state: AdventureState; character: CharacterRecord }>>;
  /** Réclame or / fragments (et parfois une Clé) et relance l'expédition */
  expeditionClaim(): Promise<CommandResult<{ claim: ExpeditionClaim; character: CharacterRecord }>>;
  /** Ouvre un coffre (2 par jour de jeu au maximum) */
  chestOpen(chestId: string): Promise<CommandResult<{ opening: ChestOpening; character: CharacterRecord }>>;
  /** Boutique : achète un pack de fragments contre de l'or */
  shopFragments(packId: string): Promise<CommandResult<{ pack: FragmentPack; character: CharacterRecord }>>;
  /** Boutique : achète un coffre (bois, bronze ou argent) contre des fragments */
  shopBuy(rarity: ChestRarity): Promise<CommandResult<{ chest: Chest; price: number; character: CharacterRecord }>>;
  /** 3 coffres fermés de même rareté -> 1 coffre de rareté supérieure */
  chestMerge(rarity: ChestRarity): Promise<CommandResult<{ chest: Chest }>>;
  itemEquip(itemId: string): Promise<CommandResult<{ item: ItemView; replaced: string | null }>>;
  itemUnequip(slot: EquipSlot): Promise<CommandResult<{ item: ItemView }>>;
  itemUpgrade(itemId: string): Promise<CommandResult<{ item: ItemView; character: CharacterRecord }>>;
  /** 3 objets non équipés de même rareté -> 1 objet de rareté supérieure */
  itemMerge(itemIds: string[]): Promise<CommandResult<{ item: ItemView }>>;
  itemDismantle(itemId: string): Promise<CommandResult<{ fragments: number; character: CharacterRecord }>>;
  /** Grimoire (V4) : équipe une capacité connue dans un emplacement (1 à 3), le premier libre par défaut */
  spellEquip(spellId: string, slot?: number): Promise<CommandResult<{ grimoire: GrimoireState; character: CharacterRecord }>>;
  /** Retire la capacité d'un emplacement du Grimoire */
  spellUnequip(slot: number): Promise<CommandResult<{ grimoire: GrimoireState; character: CharacterRecord }>>;
  dungeonList(): Promise<CommandResult<{ dungeons: DungeonEntry[]; keys: number; maxKeys: number; power: number }>>;
  /** Consomme 1 Clé et résout la run côté serveur */
  dungeonRun(dungeonId: string): Promise<CommandResult<{ result: DungeonRunResult; progress: DungeonProgress; chest: Chest | null; character: CharacterRecord }>>;
  // Raids d'amis (V2, voir docs/DONJONS.md §8). Chaque commande renvoie l'état frais ; le coup du jour est joué à la lecture.
  /** Boss de la semaine, mon équipe, invitations reçues ; applique le coup du jour et clôt les raids dus */
  raidState(): Promise<CommandResult<{ state: RaidState }>>;
  /** Crée l'équipe de la semaine (le créateur en est le chef) */
  raidCreate(): Promise<CommandResult<{ state: RaidState }>>;
  /** Le chef invite un ami accepté (une notification par invitation) */
  raidInvite(profileId: string): Promise<CommandResult<{ state: RaidState }>>;
  /** Accepte une invitation de la semaine */
  raidJoin(teamId: string): Promise<CommandResult<{ state: RaidState }>>;
  /** Quitte l'équipe de la semaine, ou refuse l'invitation `teamId` */
  raidLeave(teamId?: string): Promise<CommandResult<{ state: RaidState }>>;
  /** +5 % de dégâts aujourd'hui pour un coéquipier (un encouragement par ami et par jour) */
  raidEncourage(profileId: string): Promise<CommandResult<{ state: RaidState }>>;
  /** Saison en cours : jours restants, mon rang, la récompense en jeu ; évalue les saisons terminées */
  seasonState(): Promise<CommandResult<{ state: SeasonState; character: CharacterRecord }>>;
  resetAdventure(): Promise<void>;

  // Écritures directes (autorisées par RLS)
  saveTemplate(t: QuestTemplate): Promise<void>;
  setPreference(p: QuestPreference): Promise<void>;
  saveSettings(s: SettingsRecord): Promise<void>;
  updateAppearance(a: { name?: string; portraitId?: string; frameColor?: string; motto?: string; oath?: string }): Promise<void>;
  /** Photos : redimensionnées côté client puis envoyées dans le dossier de l'utilisateur */
  uploadMedia(blob: Blob, ext: string): Promise<string>;
  /** Données personnelles (RGPD) */
  exportData(): Promise<Record<string, unknown>>;
  deleteAccount(): Promise<void>;
}

// ───────────────────────── Social ─────────────────────────

export interface ProfileCard {
  profileId: string | null;
  username: string;
  name: string | null;
  level: number | null;
  classId: string | null;
  portraitId: string | null;
  frameColor: string | null;
  isFriend: boolean;
  /** sent | received | accepted | declined */
  requestStatus: string | null;
}

export interface FriendRow {
  profileId: string;
  username: string;
  name: string;
  level: number;
  classId: string;
  portraitId: string;
  frameColor: string;
  lastTitle: string | null;
  lastAt: string | null;
}

export interface PendingRequest {
  id: string;
  direction: 'received' | 'sent';
  card: ProfileCard;
  createdAt: string;
}

export interface PostAuthor {
  id: string;
  username: string;
  name: string;
  level: number;
  classId: string;
  portraitId: string;
  frameColor: string;
}

export interface PostMedia {
  id: string;
  path: string;
  url: string | null;
  width: number | null;
  height: number | null;
  alt: string | null;
}

export interface PostComment {
  id: string;
  postId: string;
  authorId: string;
  authorUsername: string;
  authorName: string;
  authorLevel: number;
  text: string;
  createdAt: string;
}

export type PostKind = 'quest' | 'photo' | 'level_up' | 'achievement' | 'streak';

export interface FeedPost {
  id: string;
  author: PostAuthor;
  type: PostKind;
  text: string;
  visibility: Visibility;
  createdAt: string;
  editedAt?: string | null;
  payload: Record<string, any>;
  quest: { ability: AbilityId; difficulty: Difficulty; title: string; period: Period; xp: number | null } | null;
  media: PostMedia[];
  reactions: Record<ReactionKind, number>;
  myReaction: ReactionKind | null;
  commentCount: number;
  comments: PostComment[];
  /** En attente d'envoi (publication hors ligne) */
  pending?: boolean;
}

export interface FeedPage {
  posts: FeedPost[];
  hasMore: boolean;
}

export interface NewPost {
  type: 'photo' | 'quest';
  text: string;
  visibility: Visibility;
  instanceId?: string | null;
  media: { blob: Blob; ext: 'jpg' | 'webp'; width: number; height: number; alt?: string }[];
}

/** Une ligne du classement de saison (puissance entre amis) */
export interface SeasonRow {
  profileId: string;
  username: string;
  name: string;
  level: number;
  classId: string;
  portraitId: string;
  frameColor: string;
  /** Cadre cosmétique de fin de saison, `S1:or` */
  frameStyle: string | null;
  power: number;
}

/** Équipement visible sur la fiche d'un compagnon (soi-même ou ami non bloqué) */
export interface ProfileGear {
  power: number;
  frameStyle: string | null;
  items: { slot: EquipSlot; templateId: string; rarity: ItemRarity; level: number }[];
}

export interface LeaderRow {
  profileId: string;
  username: string;
  name: string;
  level: number;
  classId: string;
  portraitId: string;
  frameColor: string;
  xp: number;
}

export interface AppNotification {
  id: string;
  type: string;
  payload: Record<string, any>;
  readAt: string | null;
  createdAt: string;
}

export interface CompanionSheet {
  card: ProfileCard;
  character: {
    name: string;
    classId: string;
    pathId: string | null;
    level: number;
    totalXp: number;
    motto: string;
    portraitId: string;
    frameColor: string;
    titleEquipped: string | null;
    streakCurrent: number;
    baseScores: Record<AbilityId, number>;
    improvements: Record<AbilityId, number>;
    abilityXp: Record<AbilityId, number>;
  } | null;
  trophies: string[];
  /** Équipement et puissance, quand le compagnon est un ami */
  gear?: ProfileGear | null;
}

export interface SocialApi {
  searchProfiles(query: string): Promise<ProfileCard[]>;
  findByCode(code: string): Promise<ProfileCard | null>;
  profileCard(username: string): Promise<ProfileCard | null>;
  sendRequest(profileId: string): Promise<string>;
  sendRequestByCode(code: string): Promise<string>;
  respond(requestId: string, accept: boolean): Promise<string>;
  cancelRequest(requestId: string): Promise<void>;
  removeFriend(profileId: string): Promise<void>;
  block(profileId: string): Promise<void>;
  unblock(profileId: string): Promise<void>;
  blocked(): Promise<{ profileId: string; username: string }[]>;
  friends(): Promise<FriendRow[]>;
  pendingRequests(): Promise<PendingRequest[]>;
  companionSheet(username: string): Promise<CompanionSheet | null>;
  companionPosts(profileId: string): Promise<FeedPost[]>;

  feed(before?: string | null, limit?: number): Promise<FeedPage>;
  post(id: string): Promise<FeedPost | null>;
  publish(p: NewPost): Promise<string>;
  editPost(id: string, text: string): Promise<void>;
  deletePost(id: string): Promise<void>;
  react(postId: string, kind: ReactionKind | null): Promise<void>;
  reactors(postId: string): Promise<{ username: string; name: string; kind: ReactionKind }[]>;
  comment(postId: string, text: string): Promise<PostComment>;
  deleteComment(commentId: string): Promise<void>;
  report(target: 'post' | 'comment' | 'profile', id: string, reason: string): Promise<void>;
  leaderboard(): Promise<LeaderRow[]>;
  /** Classement de puissance de la saison `season` (`S1`…) entre moi et mes amis qui acceptent le classement */
  seasonLeaderboard(season: string): Promise<SeasonRow[]>;
  /** Les objets équipés et la puissance d'un compagnon (null si ce n'est pas un ami) */
  profileGear(username: string): Promise<ProfileGear | null>;
  /** Abonnement temps réel : retourne une fonction de désinscription */
  subscribe(handlers: { onFeed?: () => void; onNotification?: () => void; onRequest?: () => void }): () => void;

  notifications(): Promise<AppNotification[]>;
  unreadCount(): Promise<number>;
  markAllRead(): Promise<void>;
  markRead(id: string): Promise<void>;
  registerDevice(token: string, platform: 'android' | 'ios' | 'web'): Promise<void>;
  /** Pièces jointes : URL signées (valables 1 h) */
  signedUrls(paths: string[]): Promise<Record<string, string>>;
}

export interface Backend {
  mode: 'local' | 'cloud';
  auth: AuthApi;
  game: GameApi;
  social: SocialApi;
}
