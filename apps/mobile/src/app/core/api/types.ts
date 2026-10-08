import type {
  AbilityId,
  CharacterRecord,
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
  Visibility,
  EnsureResult,
  AchievementProgress,
} from '@levelup/engine';

export type { CompleteRequest, CompleteResponse, CreateCharacterInput, GameError, ImprovementChoice };

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
  signInOAuth(provider: 'google' | 'apple'): Promise<void>;
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
  reroll(instanceId: string): Promise<CommandResult<{ instance: QuestInstance; usedInspiration: boolean }>>;
  complete(req: CompleteRequest): Promise<CommandResult<{ data: CompleteResponse }>>;
  undo(instanceId: string): Promise<CommandResult<{ character: CharacterRecord; instance: QuestInstance }>>;
  choosePath(pathId: string): Promise<CommandResult<{ character: CharacterRecord }>>;
  chooseImprovement(choice: ImprovementChoice): Promise<CommandResult<{ character: CharacterRecord }>>;
  declareRest(): Promise<CommandResult<{ day: string }>>;
  equipTitle(title: string | null): Promise<CommandResult<{ character: CharacterRecord }>>;
  achievementProgress(): Promise<AchievementProgress[]>;
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
  media: { blob: Blob; ext: string; width: number; height: number; alt?: string }[];
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
