import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { SupabaseStore, type QuestPreference, type QuestTemplate, type SettingsRecord, type ReactionKind } from '@levelup/engine';
import { env } from '../env';
import type {
  AppNotification,
  AuthApi,
  AuthUser,
  Backend,
  CommandResult,
  CompanionSheet,
  FeedPage,
  FeedPost,
  FriendRow,
  GameApi,
  LeaderRow,
  MyProfile,
  NewPost,
  PendingRequest,
  PostComment,
  ProfileCard,
  SocialApi,
} from './types';

const DEFAULT_REACTIONS = () => ({ bravo: 0, inspirant: 0, respect: 0, rire: 0 }) as Record<ReactionKind, number>;

function mapCard(r: any): ProfileCard | null {
  if (!r || !r.username) return null;
  return {
    profileId: r.profile_id ?? null,
    username: r.username,
    name: r.name ?? null,
    level: r.level ?? null,
    classId: r.class_id ?? null,
    portraitId: r.portrait_id ?? null,
    frameColor: r.frame_color ?? null,
    isFriend: !!r.is_friend,
    requestStatus: r.request_status ?? null,
  };
}

const unwrapCharacter = (c: any) => (Array.isArray(c) ? c[0] : c) ?? {};

function mapAuthor(p: any) {
  const ch = unwrapCharacter(p?.characters);
  return {
    id: p?.id ?? '',
    username: p?.username ?? '?',
    name: ch.name ?? p?.username ?? '?',
    level: ch.level ?? 1,
    classId: ch.class_id ?? 'explorateur',
    portraitId: ch.portrait_id ?? 'p01',
    frameColor: ch.frame_color ?? '#2f5a47',
  };
}

const POST_SELECT = `
  id, type, text, visibility, payload, created_at, edited_at, instance_id,
  author:profiles!author_id ( id, username, characters ( name, level, class_id, portrait_id, frame_color ) ),
  instance:quest_instances!instance_id ( snapshot, period, xp_awarded ),
  media:post_media ( id, storage_path, width, height, alt, position ),
  reactions ( kind, profile_id ),
  comment_count:comments ( count ),
  comments ( id, post_id, author_id, text, created_at,
    author:profiles!author_id ( username, characters ( name, level ) ) )
`;

export function createCloudBackend(): Backend {
  const sb: SupabaseClient = createClient(env.supabaseUrl, env.supabaseAnonKey, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, flowType: 'pkce' },
  });
  const store = new SupabaseStore(sb);
  let myId = '';
  const urlCache = new Map<string, { url: string; exp: number }>();

  const requireId = async (): Promise<string> => {
    if (myId) return myId;
    const { data } = await sb.auth.getSession();
    myId = data.session?.user.id ?? '';
    return myId;
  };
  sb.auth.onAuthStateChange((_e, s) => {
    myId = s?.user.id ?? '';
  });

  // ───────────────────────── Auth ─────────────────────────
  const auth: AuthApi = {
    mode: 'cloud',
    async getUser() {
      const { data } = await sb.auth.getSession();
      const u = data.session?.user;
      if (u) myId = u.id;
      return u ? { id: u.id, email: u.email ?? null } : null;
    },
    onChange(cb) {
      const { data } = sb.auth.onAuthStateChange((_e, s) => {
        const u: AuthUser | null = s?.user ? { id: s.user.id, email: s.user.email ?? null } : null;
        cb(u);
      });
      return () => data.subscription.unsubscribe();
    },
    async signUp(i) {
      const { data, error } = await sb.auth.signUp({
        email: i.email,
        password: i.password,
        options: { data: { username: i.username, birth_year: i.birthYear }, emailRedirectTo: `${env.publicUrl}/auth/callback` },
      });
      if (error) throw error;
      return { confirmationRequired: !data.session };
    },
    async signIn(email, password) {
      const { error } = await sb.auth.signInWithPassword({ email, password });
      if (error) throw error;
    },
    async sendMagicLink(email) {
      const { error } = await sb.auth.signInWithOtp({ email, options: { emailRedirectTo: `${env.publicUrl}/auth/callback`, shouldCreateUser: false } });
      if (error) throw error;
    },
    async resendConfirmation(email) {
      const { error } = await sb.auth.resend({ type: 'signup', email });
      if (error) throw error;
    },
    async updatePassword(password) {
      const { error } = await sb.auth.updateUser({ password });
      if (error) throw error;
    },
    async updateEmail(email) {
      const { error } = await sb.auth.updateUser({ email });
      if (error) throw error;
    },
    async signOut() {
      await sb.auth.signOut();
      myId = '';
    },
    async usernameAvailable(username) {
      const { data, error } = await sb.rpc('username_available', { p_username: username });
      if (error) throw error;
      return !!data;
    },
    async getProfile(): Promise<MyProfile | null> {
      const id = await requireId();
      if (!id) return null;
      const { data, error } = await sb.from('profiles').select('id, username, friend_code, birth_year, created_at').eq('id', id).maybeSingle();
      if (error) throw error;
      return data ? { id: data.id, username: String(data.username), friendCode: data.friend_code, birthYear: data.birth_year, createdAt: data.created_at } : null;
    },
    async updateUsername(username) {
      const id = await requireId();
      const { error } = await sb.from('profiles').update({ username }).eq('id', id);
      if (error) throw error;
    },
    async linkedProviders() {
      const { data } = await sb.auth.getUserIdentities();
      return (data?.identities ?? []).map((i) => i.provider);
    },
  };

  // ───────────────────────── Jeu ─────────────────────────
  async function call<T>(action: string, payload: Record<string, unknown> = {}): Promise<T> {
    const { data, error } = await sb.functions.invoke('game', { body: { action, ...payload } });
    if (error) {
      const ctx = (error as any).context;
      if (ctx && typeof ctx.json === 'function') {
        try {
          const body = await ctx.json();
          return { ok: false, error: body?.error ?? 'server', message: body?.message } as T;
        } catch {
          /* ignore */
        }
      }
      const isNetwork = (error as any).name === 'FunctionsFetchError' || (typeof navigator !== 'undefined' && !navigator.onLine);
      return { ok: false, error: isNetwork ? 'network' : 'server', message: error.message } as T;
    }
    return data as T;
  }
  const cmd = <T>(action: string, payload?: Record<string, unknown>) => call<CommandResult<T>>(action, payload);

  const game: GameApi = {
    mode: 'cloud',
    store: store as any,
    userId: () => myId,
    async ensure() {
      const r = await call<any>('ensure');
      if (r && r.ok === false) throw new Error(r.error ?? 'ensure');
      return { created: r.created ?? [], expired: r.expired ?? [], levelUps: r.levelUps ?? [] };
    },
    createCharacter: (input) => cmd('create-character', input as any),
    accept: (instanceId) => cmd('accept', { instanceId }),
    abandon: (instanceId) => cmd('abandon', { instanceId }),
    progress: (instanceId, patch) => cmd('progress', { instanceId, ...patch }),
    start: (input) => cmd('start', input as any),
    redo: (instanceId) => cmd('redo', { instanceId }),
    reroll: (instanceId) => cmd('reroll', { instanceId }),
    tune: (instanceId, direction) => cmd('tune', { instanceId, direction }),
    complete: (req) => cmd('complete', req as any),
    undo: (instanceId) => cmd('undo', { instanceId }),
    choosePath: (pathId) => cmd('choose-path', { pathId }),
    chooseImprovement: (choice) => cmd('choose-improvement', { choice }),
    declareRest: () => cmd('declare-rest'),
    equipTitle: (title) => cmd('equip-title', { title }),
    async achievementProgress() {
      const r = await call<any>('achievements');
      return r.progress ?? [];
    },
    async resetAdventure() {
      const r = await call<any>('reset-adventure');
      if (!r.ok) throw new Error(r.message ?? 'reset');
    },
    async saveTemplate(t: QuestTemplate) {
      const uid = await requireId();
      const { error } = await sb.from('quest_templates').upsert({
        id: t.id,
        source: 'custom',
        owner_id: uid,
        ability: t.ability,
        difficulty: t.difficulty,
        periods: t.periods,
        title: t.title,
        flavor: t.flavor,
        objective: t.objective,
        tips: t.tips,
        validation: t.validation,
        tags: t.tags,
        is_active: t.isActive !== false,
      });
      if (error) throw error;
    },
    async setPreference(p: QuestPreference) {
      const uid = await requireId();
      const { error } = await sb.from('quest_preferences').upsert({
        profile_id: uid,
        template_id: p.templateId,
        is_favorite: !!p.isFavorite,
        is_excluded: !!p.isExcluded,
        is_pinned: !!p.isPinned,
        tune: p.tune ?? 0,
      });
      if (error) throw error;
    },
    async saveSettings(s: SettingsRecord) {
      await store.saveSettings(await requireId(), s);
    },
    async updateAppearance(a) {
      const uid = await requireId();
      const row: any = {};
      if (a.name !== undefined) row.name = a.name;
      if (a.portraitId !== undefined) row.portrait_id = a.portraitId;
      if (a.frameColor !== undefined) row.frame_color = a.frameColor;
      if (a.motto !== undefined) row.motto = a.motto;
      if (Object.keys(row).length) {
        const { error } = await sb.from('characters').update(row).eq('profile_id', uid);
        if (error) throw error;
      }
      if (a.oath !== undefined) {
        const { error } = await sb.from('settings').update({ oath: a.oath }).eq('profile_id', uid);
        if (error) throw error;
      }
    },
    async uploadMedia(blob, ext) {
      const uid = await requireId();
      const path = `${uid}/${crypto.randomUUID()}.${ext}`;
      const { error } = await sb.storage.from('post-media').upload(path, blob, { contentType: blob.type || 'image/jpeg', upsert: false });
      if (error) throw error;
      return path;
    },
    async exportData() {
      const { data, error } = await sb.functions.invoke('account', { body: { action: 'export' } });
      if (error) throw error;
      return data;
    },
    async deleteAccount() {
      const { data, error } = await sb.functions.invoke('account', { body: { action: 'delete', confirm: true } });
      if (error || !data?.ok) throw error ?? new Error(data?.message ?? 'delete');
      await sb.auth.signOut();
    },
  };

  // ───────────────────────── Social ─────────────────────────
  async function signedUrls(paths: string[]): Promise<Record<string, string>> {
    const out: Record<string, string> = {};
    const missing: string[] = [];
    const now = Date.now();
    for (const p of paths) {
      const c = urlCache.get(p);
      if (c && c.exp > now + 60_000) out[p] = c.url;
      else missing.push(p);
    }
    if (missing.length) {
      const { data } = await sb.storage.from('post-media').createSignedUrls(missing, 3600);
      for (const d of data ?? []) {
        if (d.path && d.signedUrl) {
          out[d.path] = d.signedUrl;
          urlCache.set(d.path, { url: d.signedUrl, exp: now + 3500_000 });
        }
      }
    }
    return out;
  }

  async function mapPost(r: any): Promise<FeedPost> {
    const reactions = DEFAULT_REACTIONS();
    let mine: ReactionKind | null = null;
    for (const x of r.reactions ?? []) {
      reactions[x.kind as ReactionKind]++;
      if (x.profile_id === myId) mine = x.kind;
    }
    const media = [...(r.media ?? [])].sort((a: any, b: any) => a.position - b.position);
    const urls = media.length ? await signedUrls(media.map((m: any) => m.storage_path)) : {};
    const comments: PostComment[] = [...(r.comments ?? [])]
      .sort((a: any, b: any) => a.created_at.localeCompare(b.created_at))
      .map((c: any) => {
        const ch = unwrapCharacter(c.author?.characters);
        return {
          id: c.id, postId: c.post_id ?? r.id, authorId: c.author_id, authorUsername: c.author?.username ?? '?',
          authorName: ch.name ?? c.author?.username ?? '?', authorLevel: ch.level ?? 1, text: c.text, createdAt: c.created_at,
        };
      });
    const inst = Array.isArray(r.instance) ? r.instance[0] : r.instance;
    const count = Array.isArray(r.comment_count) ? r.comment_count[0]?.count ?? comments.length : comments.length;
    return {
      id: r.id,
      author: mapAuthor(r.author),
      type: r.type,
      text: r.text,
      visibility: r.visibility,
      createdAt: r.created_at,
      editedAt: r.edited_at,
      payload: r.payload ?? {},
      quest: inst?.snapshot
        ? { ability: inst.snapshot.ability, difficulty: inst.snapshot.difficulty, title: inst.snapshot.title, period: inst.period, xp: inst.xp_awarded ?? null }
        : null,
      media: media.map((m: any) => ({ id: m.id, path: m.storage_path, url: urls[m.storage_path] ?? null, width: m.width, height: m.height, alt: m.alt })),
      reactions,
      myReaction: mine,
      commentCount: count,
      comments: comments.slice(-2),
    };
  }

  const social: SocialApi = {
    async searchProfiles(q) {
      const { data, error } = await sb.rpc('search_profiles', { p_query: q });
      if (error) throw error;
      return (data ?? []).map(mapCard).filter(Boolean) as ProfileCard[];
    },
    async findByCode(code) {
      const { data, error } = await sb.rpc('find_profile_by_code', { p_code: code });
      if (error) throw error;
      return mapCard(data);
    },
    async profileCard(username) {
      const { data, error } = await sb.rpc('get_profile_card', { p_username: username });
      if (error) throw error;
      return mapCard(data);
    },
    async sendRequest(profileId) {
      const { data, error } = await sb.rpc('send_friend_request', { p_target: profileId });
      if (error) throw error;
      return String(data);
    },
    async sendRequestByCode(code) {
      const { data, error } = await sb.rpc('send_friend_request_by_code', { p_code: code });
      if (error) throw error;
      return String(data);
    },
    async respond(requestId, accept) {
      const { data, error } = await sb.rpc('respond_friend_request', { p_request: requestId, p_accept: accept });
      if (error) throw error;
      return String(data);
    },
    async cancelRequest(requestId) {
      const { error } = await sb.from('friendships').delete().eq('id', requestId);
      if (error) throw error;
    },
    async removeFriend(profileId) {
      const { error } = await sb.rpc('remove_friend', { p_friend: profileId });
      if (error) throw error;
    },
    async block(profileId) {
      const { error } = await sb.rpc('block_user', { p_target: profileId });
      if (error) throw error;
    },
    async unblock(profileId) {
      const uid = await requireId();
      const { error } = await sb.from('blocks').delete().eq('blocker_id', uid).eq('blocked_id', profileId);
      if (error) throw error;
    },
    async blocked() {
      const uid = await requireId();
      const { data, error } = await sb.from('blocks').select('blocked_id').eq('blocker_id', uid);
      if (error) throw error;
      const ids = (data ?? []).map((b: any) => b.blocked_id);
      if (!ids.length) return [];
      // le profil d'un utilisateur bloqué reste lisible par celui qui l'a bloqué ? non (RLS) : on garde l'identifiant
      const { data: ps } = await sb.from('profiles').select('id, username').in('id', ids);
      const byId = new Map((ps ?? []).map((p: any) => [p.id, String(p.username)]));
      return ids.map((id: string) => ({ profileId: id, username: byId.get(id) ?? 'Utilisateur masqué' }));
    },
    async friends(): Promise<FriendRow[]> {
      const { data, error } = await sb.rpc('friends_overview');
      if (error) throw error;
      return (data ?? []).map((r: any) => ({
        profileId: r.profile_id, username: r.username, name: r.name ?? r.username, level: r.level ?? 1, classId: r.class_id ?? 'explorateur',
        portraitId: r.portrait_id ?? 'p01', frameColor: r.frame_color ?? '#2f5a47', lastTitle: r.last_title, lastAt: r.last_at,
      }));
    },
    async pendingRequests(): Promise<PendingRequest[]> {
      const { data, error } = await sb.rpc('pending_requests');
      if (error) throw error;
      return (data ?? [])
        .map((r: any) => ({ id: r.id, direction: r.direction, card: mapCard(r.card) as ProfileCard, createdAt: r.created_at }))
        .filter((r: PendingRequest) => r.card);
    },
    async companionSheet(username): Promise<CompanionSheet | null> {
      const card = await social.profileCard(username);
      if (!card) return null;
      if (!card.isFriend || !card.profileId) return { card, character: null, trophies: [] };
      const [{ data: ch }, { data: tr }] = await Promise.all([
        sb.from('characters').select('*').eq('profile_id', card.profileId).maybeSingle(),
        sb.from('unlocked_achievements').select('achievement_id').eq('profile_id', card.profileId),
      ]);
      return {
        card,
        character: ch
          ? {
              name: ch.name, classId: ch.class_id, pathId: ch.path_id, level: ch.level, totalXp: ch.total_xp, motto: ch.motto,
              portraitId: ch.portrait_id, frameColor: ch.frame_color, titleEquipped: ch.title_equipped, streakCurrent: ch.streak_current,
              baseScores: ch.base_scores, improvements: ch.improvements, abilityXp: ch.ability_xp,
            }
          : null,
        trophies: (tr ?? []).map((t: any) => t.achievement_id),
      };
    },
    async companionPosts(profileId) {
      const { data, error } = await sb
        .from('posts').select(POST_SELECT).eq('author_id', profileId).is('deleted_at', null).order('created_at', { ascending: false }).limit(20)
        .order('created_at', { referencedTable: 'comments', ascending: false }).limit(2, { referencedTable: 'comments' });
      if (error) throw error;
      return Promise.all((data ?? []).map(mapPost));
    },

    async feed(before, limit = 20): Promise<FeedPage> {
      let q = sb
        .from('posts').select(POST_SELECT).is('deleted_at', null).eq('visibility', 'friends')
        .order('created_at', { ascending: false }).limit(limit + 1)
        .order('created_at', { referencedTable: 'comments', ascending: false }).limit(2, { referencedTable: 'comments' });
      if (before) q = q.lt('created_at', before);
      const { data, error } = await q;
      if (error) throw error;
      const rows = data ?? [];
      const posts = await Promise.all(rows.slice(0, limit).map(mapPost));
      return { posts, hasMore: rows.length > limit };
    },
    async post(id) {
      const { data, error } = await sb.from('posts').select(POST_SELECT).eq('id', id).is('deleted_at', null).maybeSingle();
      if (error) throw error;
      if (!data) return null;
      const p = await mapPost(data);
      // détail : tous les commentaires
      const { data: cs } = await sb
        .from('comments').select('id, post_id, author_id, text, created_at, author:profiles!author_id ( username, characters ( name, level ) )')
        .eq('post_id', id).order('created_at', { ascending: true });
      p.comments = (cs ?? []).map((c: any) => {
        const ch = unwrapCharacter(c.author?.characters);
        return { id: c.id, postId: id, authorId: c.author_id, authorUsername: c.author?.username ?? '?', authorName: ch.name ?? c.author?.username ?? '?', authorLevel: ch.level ?? 1, text: c.text, createdAt: c.created_at };
      });
      p.commentCount = p.comments.length;
      return p;
    },
    async publish(p: NewPost) {
      const uid = await requireId();
      const paths: { path: string; w: number; h: number; alt?: string }[] = [];
      for (const m of p.media.slice(0, 4)) paths.push({ path: await game.uploadMedia(m.blob, m.ext), w: m.width, h: m.height, alt: m.alt });
      const { data, error } = await sb
        .from('posts')
        .insert({ author_id: uid, type: p.type, text: p.text, visibility: p.visibility, instance_id: p.instanceId ?? null })
        .select('id').single();
      if (error) throw error;
      if (paths.length) {
        const { error: e2 } = await sb.from('post_media').insert(
          paths.map((m, i) => ({ post_id: data.id, storage_path: m.path, width: m.w, height: m.h, position: i, alt: m.alt ?? null })),
        );
        if (e2) throw e2;
      }
      return data.id;
    },
    async editPost(id, text) {
      const { error } = await sb.from('posts').update({ text, edited_at: new Date().toISOString() }).eq('id', id);
      if (error) throw error;
    },
    async deletePost(id) {
      const { error } = await sb.from('posts').update({ deleted_at: new Date().toISOString() }).eq('id', id);
      if (error) throw error;
    },
    async react(postId, kind) {
      const uid = await requireId();
      if (!kind) {
        const { error } = await sb.from('reactions').delete().eq('post_id', postId).eq('profile_id', uid);
        if (error) throw error;
        return;
      }
      const { error } = await sb.from('reactions').upsert({ post_id: postId, profile_id: uid, kind }, { onConflict: 'post_id,profile_id' });
      if (error) throw error;
    },
    async reactors(postId) {
      const { data, error } = await sb
        .from('reactions').select('kind, profile:profiles!profile_id ( username, characters ( name ) )').eq('post_id', postId);
      if (error) throw error;
      return (data ?? []).map((r: any) => ({ username: r.profile?.username ?? '?', name: unwrapCharacter(r.profile?.characters).name ?? r.profile?.username ?? '?', kind: r.kind }));
    },
    async comment(postId, text) {
      const uid = await requireId();
      const { data, error } = await sb
        .from('comments').insert({ post_id: postId, author_id: uid, text })
        .select('id, post_id, author_id, text, created_at').single();
      if (error) throw error;
      return { id: data.id, postId, authorId: uid, authorUsername: '', authorName: '', authorLevel: 1, text: data.text, createdAt: data.created_at };
    },
    async deleteComment(commentId) {
      const { error } = await sb.from('comments').update({ deleted_at: new Date().toISOString() }).eq('id', commentId);
      if (error) throw error;
    },
    async report(target, id, reason) {
      const uid = await requireId();
      const { error } = await sb.from('reports').upsert({ reporter_id: uid, target_type: target, target_id: id, reason }, { onConflict: 'reporter_id,target_type,target_id', ignoreDuplicates: true });
      if (error) throw error;
    },
    async leaderboard(): Promise<LeaderRow[]> {
      const { data, error } = await sb.rpc('weekly_leaderboard');
      if (error) throw error;
      return (data ?? []).map((r: any) => ({
        profileId: r.profile_id, username: r.username, name: r.name ?? r.username, level: r.level ?? 1, classId: r.class_id ?? 'explorateur',
        portraitId: r.portrait_id ?? 'p01', frameColor: r.frame_color ?? '#2f5a47', xp: Number(r.xp ?? 0),
      }));
    },
    subscribe(h) {
      const ch = sb.channel('levelup-' + Math.random().toString(36).slice(2));
      ch.on('postgres_changes', { event: '*', schema: 'public', table: 'posts' }, () => h.onFeed?.());
      ch.on('postgres_changes', { event: '*', schema: 'public', table: 'reactions' }, () => h.onFeed?.());
      ch.on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'comments' }, () => h.onFeed?.());
      ch.on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'notifications' }, () => h.onNotification?.());
      ch.on('postgres_changes', { event: '*', schema: 'public', table: 'friendships' }, () => h.onRequest?.());
      ch.subscribe();
      return () => {
        void sb.removeChannel(ch);
      };
    },
    async notifications(): Promise<AppNotification[]> {
      const { data, error } = await sb.from('notifications').select('*').order('created_at', { ascending: false }).limit(100);
      if (error) throw error;
      return (data ?? []).map((n: any) => ({ id: n.id, type: n.type, payload: n.payload ?? {}, readAt: n.read_at, createdAt: n.created_at }));
    },
    async unreadCount() {
      const { count, error } = await sb.from('notifications').select('id', { count: 'exact', head: true }).is('read_at', null);
      if (error) throw error;
      return count ?? 0;
    },
    async markAllRead() {
      await sb.rpc('mark_notifications_read');
    },
    async markRead(id) {
      await sb.from('notifications').update({ read_at: new Date().toISOString() }).eq('id', id);
    },
    async registerDevice(token, platform) {
      const uid = await requireId();
      await sb.from('device_tokens').upsert({ profile_id: uid, token, platform, last_seen_at: new Date().toISOString() });
    },
    signedUrls,
  };

  return { mode: 'cloud', auth, game, social };
}
