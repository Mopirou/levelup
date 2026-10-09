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
 * Social du mode local : quelques amis de démonstration (ceux des maquettes) pour pouvoir tout essayer
 * sans compte en ligne. Rien n'est envoyé nulle part.
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

const PEOPLE: Person[] = [
  { id: 'p-lea', username: 'lea_augrandair', name: 'Léa Martin', level: 14, classId: 'eclaireur', portraitId: 'p05', frameColor: '#e0893d', friendCode: 'ELAN-LEAAUGRA-1204', streak: 12, motto: 'Un pas après l’autre', title: 'Marcheur des cimes', weekXp: 710, scores: { FOR: 13, DEX: 10, CON: 17, INT: 11, SAG: 12, CHA: 12 }, trophies: ['premier-pas', 'feu-sacre', 'serie-14'] },
  { id: 'p-sam', username: 'sam_curieux', name: 'Sam Diallo', level: 11, classId: 'erudit', portraitId: 'p11', frameColor: '#4a82b8', friendCode: 'ELAN-SAMCURIE-3321', streak: 5, motto: 'Toujours une page de plus', title: 'Curieux', weekXp: 480, scores: { FOR: 9, DEX: 11, CON: 10, INT: 18, SAG: 15, CHA: 11 }, trophies: ['premier-pas', 'premier-elan', 'decouvreur-10'] },
  { id: 'p-ines', username: 'ines_creative', name: 'Inès Robert', level: 9, classId: 'artisan', portraitId: 'p14', frameColor: '#5f9e6e', friendCode: 'ELAN-INESCREA-7788', streak: 9, motto: 'Essayer avant d’être prête', title: null, weekXp: 390, scores: { FOR: 10, DEX: 16, CON: 11, INT: 14, SAG: 11, CHA: 12 }, trophies: ['premier-pas', 'forgeron'] },
  { id: 'p-noe', username: 'noe_pasapas', name: 'Noé Bernard', level: 8, classId: 'explorateur', portraitId: 'p08', frameColor: '#2f5a47', friendCode: 'ELAN-NOEPASAP-4410', streak: 3, motto: '', title: null, weekXp: 260, scores: { FOR: 11, DEX: 10, CON: 14, INT: 10, SAG: 13, CHA: 11 }, trophies: ['premier-pas'] },
  { id: 'p-mila', username: 'mila_sereine', name: 'Mila Laurent', level: 13, classId: 'gardien', portraitId: 'p19', frameColor: '#8a6bb8', friendCode: 'ELAN-MILASERE-9052', streak: 21, motto: 'Respirer, simplement', title: 'Gardien du feu', weekXp: 560, scores: { FOR: 9, DEX: 10, CON: 12, INT: 12, SAG: 17, CHA: 15 }, trophies: ['premier-pas', 'feu-sacre', 'serie-14', 'repos-du-sage'] },
  { id: 'p-jules', username: 'jules_ose', name: 'Jules Perrin', level: 10, classId: 'aventurier', portraitId: 'p03', frameColor: '#c8553d', friendCode: 'ELAN-JULESOSE-1730', streak: 4, motto: 'Oser, juste un peu', title: null, weekXp: 310, scores: { FOR: 15, DEX: 13, CON: 12, INT: 9, SAG: 10, CHA: 12 }, trophies: ['premier-pas', 'audacieux-10'] },
  { id: 'p-hugo', username: 'hugo_enroute', name: 'Hugo Durand', level: 6, classId: 'troubadour', portraitId: 'p21', frameColor: '#d9ae3a', friendCode: 'ELAN-HUGOENRO-6620', streak: 2, motto: '', title: null, weekXp: 120, scores: { FOR: 10, DEX: 14, CON: 10, INT: 10, SAG: 10, CHA: 13 }, trophies: ['premier-pas'] },
  { id: 'p-emma', username: 'emma_lentement', name: 'Emma Petit', level: 7, classId: 'gardien', portraitId: 'p17', frameColor: '#8a6bb8', friendCode: 'ELAN-EMMALENT-2849', streak: 6, motto: 'Doucement', title: null, weekXp: 200, scores: { FOR: 9, DEX: 10, CON: 11, INT: 11, SAG: 14, CHA: 13 }, trophies: ['premier-pas'] },
  { id: 'p-theo', username: 'theo_marin', name: 'Théo Marin', level: 5, classId: 'rassembleur', portraitId: 'p02', frameColor: '#e0893d', friendCode: 'ELAN-THEOMARI-5517', streak: 1, motto: '', title: null, weekXp: 90, scores: { FOR: 11, DEX: 10, CON: 13, INT: 9, SAG: 10, CHA: 14 }, trophies: [] },
];

const ago = (minutes: number) => new Date(Date.now() - minutes * 60_000).toISOString();

function seed(): State {
  const posts: LocalPost[] = [
    { id: 'd1', authorId: 'p-lea', type: 'quest', text: 'Pas le meilleur chrono, mais le plus beau lever de soleil. Et ça, ça compte !', createdAt: ago(25), quest: { ability: 'CON', difficulty: 'medium', title: 'Courir 3 km', period: 'daily', xp: 80 }, mediaPaths: [] },
    { id: 'd2', authorId: 'p-sam', type: 'achievement', text: '', createdAt: ago(62), payload: { id: 'decouvreur-50', name: 'Curiosité sans fin', description: '10 quêtes de Savoir accomplies. « Un chapitre après l’autre, on finit par voir plus loin. »' }, mediaPaths: [] },
    { id: 'd3', authorId: 'p-ines', type: 'quest', text: 'J’ai dessiné la plante du salon. Elle ne ressemble pas tout à fait à ça, mais j’ai adoré essayer.', createdAt: ago(130), quest: { ability: 'DEX', difficulty: 'medium', title: 'Dessiner pendant 15 min', period: 'daily', xp: 50 }, mediaPaths: [] },
    { id: 'd4', authorId: 'p-mila', type: 'streak', text: '', createdAt: ago(60 * 20), payload: { days: 21 }, mediaPaths: [] },
    { id: 'd5', authorId: 'p-jules', type: 'level_up', text: '', createdAt: ago(60 * 27), payload: { level: 10 }, mediaPaths: [] },
    { id: 'd6', authorId: 'p-noe', type: 'quest', text: 'Marcher 20 minutes sans écouteurs, juste pour entendre la rue.', createdAt: ago(60 * 30), quest: { ability: 'CON', difficulty: 'easy', title: 'Marcher 20 minutes', period: 'daily', xp: 20 }, mediaPaths: [] },
  ];
  return {
    seeded: true,
    friendIds: ['p-lea', 'p-sam', 'p-ines', 'p-noe', 'p-mila', 'p-jules'],
    incoming: ['p-hugo', 'p-emma'],
    outgoing: [],
    blocked: [],
    posts,
    reactions: [
      { postId: 'd1', profileId: 'p-sam', kind: 'bravo' }, { postId: 'd1', profileId: 'p-mila', kind: 'respect' },
      { postId: 'd1', profileId: 'p-ines', kind: 'inspirant' }, { postId: 'd1', profileId: 'p-noe', kind: 'bravo' },
      { postId: 'd1', profileId: 'p-jules', kind: 'bravo' }, { postId: 'd2', profileId: 'p-lea', kind: 'respect' },
      { postId: 'd2', profileId: 'p-mila', kind: 'inspirant' }, { postId: 'd3', profileId: 'p-lea', kind: 'bravo' },
      { postId: 'd3', profileId: 'p-sam', kind: 'inspirant' }, { postId: 'd3', profileId: 'p-mila', kind: 'bravo' },
    ],
    comments: [
      { id: 'c1', postId: 'd1', authorId: 'p-mila', text: 'Bravo pour la régularité ! 🌿', createdAt: ago(20) },
      { id: 'c2', postId: 'd1', authorId: 'p-noe', text: 'Le lever de soleil, ça vaut tous les chronos.', createdAt: ago(12) },
      { id: 'c3', postId: 'd2', authorId: 'p-jules', text: 'Respect, Sam !', createdAt: ago(50) },
      { id: 'c4', postId: 'd3', authorId: 'p-sam', text: 'Elle a l’air très bien, cette plante.', createdAt: ago(100) },
    ],
    notifications: [
      { id: 'n1', type: 'friend_request', payload: { from: 'p-hugo', username: 'hugo_enroute', request: 'p-hugo' }, readAt: null, createdAt: ago(180) },
      { id: 'n2', type: 'friend_request', payload: { from: 'p-emma', username: 'emma_lentement', request: 'p-emma' }, readAt: null, createdAt: ago(175) },
      { id: 'n3', type: 'friend_level', payload: { from: 'p-jules', username: 'jules_ose', level: 10, post: 'd5' }, readAt: null, createdAt: ago(60 * 27) },
    ],
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
  let state: State = (await kv.get('social').catch(() => undefined))?.value ?? seed();
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
      // en démonstration, certains amis acceptent après quelques secondes
      setTimeout(() => {
        if (!state.outgoing.includes(profileId)) return;
        state.outgoing = state.outgoing.filter((x) => x !== profileId);
        state.friendIds.push(profileId);
        state.notifications.unshift({ id: crypto.randomUUID(), type: 'friend_accepted', payload: { from: profileId, username: p.username }, readAt: null, createdAt: new Date().toISOString() });
        save();
        ping('onNotification');
        ping('onRequest');
      }, 4000);
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
