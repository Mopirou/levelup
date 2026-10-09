import type Dexie from 'dexie';
import { REACTION_KINDS, type AbilityId, type MemoryStore, type ReactionKind, type StoredPost } from '@levelup/engine';
import type {
  AppNotification,
  CompanionSheet,
  FeedPage,
  FeedPost,
  FriendRow,
  LeaderRow,
  NewPost,
  PendingRequest,
  PostComment,
  ProfileCard,
  SocialApi,
} from './types';
import type { LocalAccount } from './local-backend';

/**
 * Social du mode local : aucun ami, aucune demande, aucune publication d'autres joueurs. Seules les publications
 * du joueur lui-même (gardées sur l'appareil) apparaissent dans son fil. Le vrai social passe par Supabase.
 */
interface Person {
  id: string;
  username: string;
  name: string;
  level: number;
  classId: string;
  portraitId: string;
  frameColor: string;
  friendCode: string;
  streak: number;
  motto: string;
  title: string | null;
  weekXp: number;
  scores: Record<AbilityId, number>;
  trophies: string[];
}

interface LocalPost {
  id: string;
  authorId: string;
  type: FeedPost['type'];
  text: string;
  createdAt: string;
  quest?: { ability: AbilityId; difficulty: 'easy' | 'medium' | 'high' | 'expert'; title: string; period: 'daily' | 'weekly' | 'monthly' | 'epic'; xp: number };
  payload?: Record<string, any>;
  mediaPaths: string[];
}

interface Reaction {
  postId: string;
  profileId: string;
  kind: ReactionKind;
}
interface LocalComment {
  id: string;
  postId: string;
  authorId: string;
  text: string;
  createdAt: string;
}

interface State {
  seeded: boolean;
  version?: number;
  friendIds: string[];
  incoming: string[];
  outgoing: string[];
  blocked: string[];
  posts: LocalPost[];
  reactions: Reaction[];
  comments: LocalComment[];
  notifications: AppNotification[];
  deleted: string[];
  edited: Record<string, string>;
}

/** Aucun joueur fictif : le mode local n'a pas d'amis. Le social (amis, fil, classement) demande le mode en ligne. */
const PEOPLE: Person[] = [];

const STATE_VERSION = 2;
const ago = (minutes: number) => new Date(Date.now() - minutes * 60_000).toISOString();

function seed(): State {
  return {
    seeded: true,
    version: STATE_VERSION,
    friendIds: [],
    incoming: [],
    outgoing: [],
    blocked: [],
    posts: [],
    reactions: [],
    comments: [],
    notifications: [],
    deleted: [],
    edited: {},
  };
}

export async function createLocalSocial(deps: {
  db: Dexie;
  store: MemoryStore;
  getAccount: () => LocalAccount | null;
  myId: string;
}): Promise<SocialApi> {
  const { db, store, myId } = deps;
  const kv = (db as any).kv;
  // Les anciennes versions contenaient des amis et des demandes fictifs : on repart d'un état vide.
  const saved: State | undefined = (await kv.get('social').catch(() => undefined))?.value;
  let state: State = saved && saved.version === STATE_VERSION ? saved : seed();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const save = () => {
    clearTimeout(timer);
    timer = setTimeout(() => void kv.put({ key: 'social', value: state }).catch(() => undefined), 150);
  };
  const watchers = new Set<{ onFeed?: () => void; onNotification?: () => void; onRequest?: () => void }>();
  const ping = (k: 'onFeed' | 'onNotification' | 'onRequest') => watchers.forEach((w) => w[k]?.());

  const byId = (id: string) => PEOPLE.find((p) => p.id === id);
  const toCard = (p: Person): ProfileCard => ({
    profileId: p.id,
    username: p.username,
    name: p.name,
    level: p.level,
    classId: p.classId,
    portraitId: p.portraitId,
    frameColor: p.frameColor,
    isFriend: state.friendIds.includes(p.id),
    requestStatus: state.outgoing.includes(p.id) ? 'sent' : state.incoming.includes(p.id) ? 'received' : state.friendIds.includes(p.id) ? 'accepted' : null,
  });
  const visible = (p: Person) => !state.blocked.includes(p.id);

  async function me() {
    const c = await store.getCharacter(myId);
    return {
      id: myId,
      username: deps.getAccount()?.username ?? 'moi',
      name: c?.name ?? 'Moi',
      level: c?.level ?? 1,
      classId: c?.classId ?? 'explorateur',
      portraitId: c?.portraitId ?? 'p01',
      frameColor: c?.frameColor ?? '#2f5a47',
    };
  }

  async function mediaUrls(paths: string[]): Promise<Record<string, string>> {
    const out: Record<string, string> = {};
    for (const p of paths) {
      const row = await kv.get(`media:${p}`);
      if (row?.value) out[p] = row.value;
    }
    return out;
  }

  function counts(postId: string) {
    const reactions = { bravo: 0, inspirant: 0, respect: 0, rire: 0 } as Record<ReactionKind, number>;
    let mine: ReactionKind | null = null;
    for (const r of state.reactions) {
      if (r.postId !== postId) continue;
      if (r.profileId !== myId && state.blocked.includes(r.profileId)) continue;
      reactions[r.kind]++;
      if (r.profileId === myId) mine = r.kind;
    }
    return { reactions, mine };
  }

  async function commentsOf(postId: string): Promise<PostComment[]> {
    const mine = await me();
    return state.comments
      .filter((c) => c.postId === postId && !state.deleted.includes(c.id) && !state.blocked.includes(c.authorId))
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
      .map((c) => {
        const p = byId(c.authorId);
        return {
          id: c.id, postId, authorId: c.authorId,
          authorUsername: p?.username ?? mine.username, authorName: p?.name ?? mine.name, authorLevel: p?.level ?? mine.level,
          text: c.text, createdAt: c.createdAt,
        };
      });
  }

  async function toFeed(lp: LocalPost): Promise<FeedPost> {
    const p = byId(lp.authorId);
    const { reactions, mine } = counts(lp.id);
    const urls = await mediaUrls(lp.mediaPaths);
    const comments = await commentsOf(lp.id);
    const author = p
      ? { id: p.id, username: p.username, name: p.name, level: p.level, classId: p.classId, portraitId: p.portraitId, frameColor: p.frameColor }
      : await me();
    return {
      id: lp.id,
      author,
      type: lp.type,
      text: state.edited[lp.id] ?? lp.text,
      visibility: 'friends',
      createdAt: lp.createdAt,
      payload: lp.payload ?? {},
      quest: lp.quest ?? null,
      media: lp.mediaPaths.map((path, i) => ({ id: `${lp.id}-${i}`, path, url: urls[path] ?? null, width: null, height: null, alt: null })),
      reactions,
      myReaction: mine,
      commentCount: comments.length,
      comments: comments.slice(-2),
    };
  }

  async function mineToFeed(sp: StoredPost): Promise<FeedPost> {
    const a = await me();
    const inst = sp.instanceId ? await store.getInstance(myId, sp.instanceId) : null;
    const { reactions, mine } = counts(sp.id);
    const urls = await mediaUrls(sp.mediaPaths);
    const comments = await commentsOf(sp.id);
    return {
      id: sp.id,
      author: a,
      type: sp.type,
      text: state.edited[sp.id] ?? sp.text,
      visibility: sp.visibility,
      createdAt: sp.createdAt,
      editedAt: sp.editedAt,
      payload: sp.payload ?? {},
      quest: inst ? { ability: inst.snapshot.ability, difficulty: inst.snapshot.difficulty, title: inst.snapshot.title, period: inst.period, xp: inst.xpAwarded } : null,
      media: sp.mediaPaths.map((path, i) => ({ id: `${sp.id}-${i}`, path, url: urls[path] ?? null, width: null, height: null, alt: null })),
      reactions,
      myReaction: mine,
      commentCount: comments.length,
      comments: comments.slice(-2),
    };
  }

  async function allPosts(onlyFriends: boolean): Promise<FeedPost[]> {
    const theirs = state.posts.filter((p) => !state.deleted.includes(p.id) && state.friendIds.includes(p.authorId) && !state.blocked.includes(p.authorId));
    const mineRaw = store.posts.filter((p) => p.authorId === myId && !p.deletedAt && !state.deleted.includes(p.id) && (!onlyFriends || p.visibility === 'friends'));
    const list = [...(await Promise.all(theirs.map(toFeed))), ...(await Promise.all(mineRaw.map(mineToFeed)))];
    return list.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  const social: SocialApi = {
    async searchProfiles(q) {
      const s = q.trim().toLowerCase();
      if (s.length < 3) return [];
      return PEOPLE.filter((p) => visible(p) && p.username.toLowerCase().startsWith(s)).map(toCard);
    },
    async findByCode(code) {
      const p = PEOPLE.find((x) => x.friendCode === code.trim().toUpperCase() && visible(x));
      return p ? toCard(p) : null;
    },
    async profileCard(username) {
      const p = PEOPLE.find((x) => x.username === username && visible(x));
      return p ? toCard(p) : null;
    },
    async sendRequest(profileId) {
      const p = byId(profileId);
      if (!p || !visible(p)) return 'not_found';
      if (state.friendIds.includes(profileId)) return 'already_friends';
      if (state.incoming.includes(profileId)) {
        state.incoming = state.incoming.filter((x) => x !== profileId);
        state.friendIds.push(profileId);
        save();
        return 'accepted';
      }
      if (state.outgoing.includes(profileId)) return 'already_sent';
      state.outgoing.push(profileId);
      save();
      return 'sent';
    },
    async sendRequestByCode(code) {
      const p = PEOPLE.find((x) => x.friendCode === code.trim().toUpperCase());
      return p ? social.sendRequest(p.id) : 'not_found';
    },
    async respond(requestId, accept) {
      if (!state.incoming.includes(requestId)) return 'not_found';
      state.incoming = state.incoming.filter((x) => x !== requestId);
      if (accept) state.friendIds.push(requestId);
      save();
      return accept ? 'accepted' : 'declined';
    },
    async cancelRequest(requestId) {
      state.outgoing = state.outgoing.filter((x) => x !== requestId);
      save();
    },
    async removeFriend(profileId) {
      state.friendIds = state.friendIds.filter((x) => x !== profileId);
      save();
    },
    async block(profileId) {
      state.friendIds = state.friendIds.filter((x) => x !== profileId);
      state.incoming = state.incoming.filter((x) => x !== profileId);
      state.outgoing = state.outgoing.filter((x) => x !== profileId);
      if (!state.blocked.includes(profileId)) state.blocked.push(profileId);
      save();
    },
    async unblock(profileId) {
      state.blocked = state.blocked.filter((x) => x !== profileId);
      save();
    },
    async blocked() {
      return state.blocked.map((id) => ({ profileId: id, username: byId(id)?.username ?? id }));
    },
    async friends(): Promise<FriendRow[]> {
      return state.friendIds
        .map(byId)
        .filter((p): p is Person => !!p)
        .map((p) => {
          const last = state.posts.filter((x) => x.authorId === p.id && x.quest).sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
          return {
            profileId: p.id, username: p.username, name: p.name, level: p.level, classId: p.classId, portraitId: p.portraitId,
            frameColor: p.frameColor, lastTitle: last?.quest?.title ?? null, lastAt: last?.createdAt ?? null,
          };
        })
        .sort((a, b) => (b.lastAt ?? '').localeCompare(a.lastAt ?? ''));
    },
    async pendingRequests(): Promise<PendingRequest[]> {
      const rec = state.incoming.map(byId).filter((p): p is Person => !!p && visible(p)).map((p) => ({ id: p.id, direction: 'received' as const, card: toCard(p), createdAt: ago(180) }));
      const sent = state.outgoing.map(byId).filter((p): p is Person => !!p).map((p) => ({ id: p.id, direction: 'sent' as const, card: toCard(p), createdAt: ago(5) }));
      return [...rec, ...sent];
    },
    async companionSheet(username): Promise<CompanionSheet | null> {
      const p = PEOPLE.find((x) => x.username === username && visible(x));
      if (!p) return null;
      const card = toCard(p);
      if (!card.isFriend) return { card, character: null, trophies: [] };
      return {
        card,
        character: {
          name: p.name, classId: p.classId, pathId: null, level: p.level, totalXp: p.level * 700, motto: p.motto, portraitId: p.portraitId,
          frameColor: p.frameColor, titleEquipped: p.title, streakCurrent: p.streak, baseScores: p.scores,
          improvements: { FOR: 0, DEX: 0, CON: 0, INT: 0, SAG: 0, CHA: 0 }, abilityXp: { FOR: 0, DEX: 0, CON: 0, INT: 0, SAG: 0, CHA: 0 },
        },
        trophies: p.trophies,
      };
    },
    async companionPosts(profileId) {
      return Promise.all(state.posts.filter((p) => p.authorId === profileId && !state.deleted.includes(p.id)).sort((a, b) => b.createdAt.localeCompare(a.createdAt)).map(toFeed));
    },

    async feed(before, limit = 20): Promise<FeedPage> {
      const list = (await allPosts(true)).filter((p) => !before || p.createdAt < before);
      return { posts: list.slice(0, limit), hasMore: list.length > limit };
    },
    async post(id) {
      return (await allPosts(false)).find((p) => p.id === id) ?? null;
    },
    async publish(p: NewPost) {
      const paths: string[] = [];
      for (const m of p.media.slice(0, 4)) {
        const id = `local:${crypto.randomUUID()}.${m.ext}`;
        const dataUrl = await new Promise<string>((resolve, reject) => {
          const r = new FileReader();
          r.onload = () => resolve(String(r.result));
          r.onerror = reject;
          r.readAsDataURL(m.blob);
        });
        await kv.put({ key: `media:${id}`, value: dataUrl });
        paths.push(id);
      }
      const id = await store.createPost(myId, { type: p.type, text: p.text, visibility: p.visibility, instanceId: p.instanceId ?? null, mediaPaths: paths });
      ping('onFeed');
      return id;
    },
    async editPost(id, text) {
      const sp = store.posts.find((p) => p.id === id);
      if (sp) {
        sp.text = text;
        sp.editedAt = new Date().toISOString();
        store.onChange?.();
      } else state.edited[id] = text;
      save();
    },
    async deletePost(id) {
      const sp = store.posts.find((p) => p.id === id);
      if (sp) {
        sp.deletedAt = new Date().toISOString();
        store.onChange?.();
      }
      state.deleted.push(id);
      save();
      ping('onFeed');
    },
    async react(postId, kind) {
      state.reactions = state.reactions.filter((r) => !(r.postId === postId && r.profileId === myId));
      if (kind) state.reactions.push({ postId, profileId: myId, kind });
      save();
    },
    async reactors(postId) {
      const mine = await me();
      return state.reactions
        .filter((r) => r.postId === postId)
        .map((r) => {
          const p = byId(r.profileId);
          return { username: p?.username ?? mine.username, name: p?.name ?? mine.name, kind: r.kind };
        });
    },
    async comment(postId, text) {
      const c: LocalComment = { id: crypto.randomUUID(), postId, authorId: myId, text, createdAt: new Date().toISOString() };
      state.comments.push(c);
      save();
      const mine = await me();
      return { id: c.id, postId, authorId: myId, authorUsername: mine.username, authorName: mine.name, authorLevel: mine.level, text, createdAt: c.createdAt };
    },
    async deleteComment(commentId) {
      state.deleted.push(commentId);
      save();
    },
    async report() {},
    async leaderboard(): Promise<LeaderRow[]> {
      const week = engine_startOfWeek();
      const events = await store.listXpEvents(myId, week);
      const myXp = events.reduce((n, e) => n + e.amount, 0);
      const a = await me();
      const rows: LeaderRow[] = [
        { profileId: myId, username: a.username, name: a.name, level: a.level, classId: a.classId, portraitId: a.portraitId, frameColor: a.frameColor, xp: Math.max(myXp, 0) },
        ...state.friendIds.map(byId).filter((p): p is Person => !!p).map((p) => ({
          profileId: p.id, username: p.username, name: p.name, level: p.level, classId: p.classId, portraitId: p.portraitId, frameColor: p.frameColor, xp: p.weekXp,
        })),
      ];
      return rows.sort((x, y) => y.xp - x.xp);
    },
    subscribe(h) {
      watchers.add(h);
      return () => watchers.delete(h);
    },

    async notifications() {
      return [...state.notifications].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    },
    async unreadCount() {
      return state.notifications.filter((n) => !n.readAt).length;
    },
    async markAllRead() {
      const now = new Date().toISOString();
      state.notifications.forEach((n) => (n.readAt ??= now));
      save();
    },
    async markRead(id) {
      const n = state.notifications.find((x) => x.id === id);
      if (n) n.readAt = new Date().toISOString();
      save();
    },
    async registerDevice() {},
    async signedUrls(paths) {
      return mediaUrls(paths);
    },
  };

  // Réactions factices : un ami encourage de temps en temps ta dernière publication.
  void REACTION_KINDS;
  return social;
}

function engine_startOfWeek(): string {
  const d = new Date();
  const day = d.getDay() === 0 ? 7 : d.getDay();
  d.setDate(d.getDate() - (day - 1));
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
