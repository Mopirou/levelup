import Dexie from 'dexie';
import * as engine from '@levelup/engine';
import {
  MemoryStore,
  type QuestInstance,
  type QuestPreference,
  type QuestTemplate,
  type ReactionKind,
  type ServerContext,
  type SettingsRecord,
  type StoredPost,
} from '@levelup/engine';
import quests from '@levelup/content/quests.fr.json';
import { createLocalSocial } from './local-social';
import type { AuthApi, AuthUser, Backend, CommandResult, GameApi, MyProfile, SignUpInput } from './types';

/** Persistance du mode local : tout le jeu tient dans IndexedDB. */
class LocalDb extends Dexie {
  kv!: Dexie.Table<{ key: string; value: any }, string>;
  constructor() {
    super('levelup-local');
    this.version(1).stores({ kv: 'key' });
  }
}

const catalog: QuestTemplate[] = (quests as unknown as QuestTemplate[]).map((q) => ({ ...q, source: 'catalog' as const }));
const LOCAL_ID = 'local-user';

async function sha(text: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

const wrap = async <T extends object>(fn: () => Promise<any>): Promise<CommandResult<T>> => {
  try {
    return (await fn()) as CommandResult<T>;
  } catch (e) {
    return { ok: false, error: 'server', message: String((e as Error).message ?? e) };
  }
};

export interface LocalAccount {
  email: string;
  passwordHash: string;
  username: string;
  birthYear: number;
  friendCode: string;
  createdAt: string;
  signedIn: boolean;
}

export async function createLocalBackend(): Promise<Backend> {
  const db = new LocalDb();
  const store = new MemoryStore(catalog);
  const ctx: ServerContext = { store, now: () => Date.now(), uuid: () => crypto.randomUUID() };

  // ───── chargement
  let account: LocalAccount | null = (await db.kv.get('account').catch(() => undefined))?.value ?? null;
  const snap = (await db.kv.get('game').catch(() => undefined))?.value;
  if (snap) store.restore(snap);

  let saveTimer: ReturnType<typeof setTimeout> | undefined;
  const persist = () => {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      void db.kv.put({ key: 'game', value: store.snapshot() }).catch(() => undefined);
    }, 150);
  };
  store.onChange = persist;
  // Enregistre immédiatement quand la page se ferme ou passe en arrière-plan.
  const flush = () => void db.kv.put({ key: 'game', value: store.snapshot() }).catch(() => undefined);
  window.addEventListener('pagehide', flush);
  document.addEventListener('visibilitychange', () => document.visibilityState === 'hidden' && flush());

  const listeners = new Set<(u: AuthUser | null) => void>();
  const asUser = (): AuthUser | null => (account?.signedIn ? { id: LOCAL_ID, email: account.email } : null);
  const saveAccount = async () => {
    if (account) await db.kv.put({ key: 'account', value: account });
    else await db.kv.delete('account');
  };
  const emit = () => listeners.forEach((cb) => cb(asUser()));

  const auth: AuthApi = {
    mode: 'local',
    async getUser() {
      return asUser();
    },
    onChange(cb) {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    async signUp(i: SignUpInput) {
      if (account && account.email !== i.email) {
        throw new Error('Un compte local existe déjà sur cet appareil. Connecte-toi, ou supprime-le dans Mes données.');
      }
      account = {
        email: i.email,
        passwordHash: await sha(i.password),
        username: i.username,
        birthYear: i.birthYear,
        friendCode: `ELAN-${i.username.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8)}-${String(Math.floor(Math.random() * 10000)).padStart(4, '0')}`,
        createdAt: new Date().toISOString(),
        signedIn: true,
      };
      await saveAccount();
      emit();
      return { confirmationRequired: false };
    },
    async signIn(email, password) {
      if (!account || account.email.toLowerCase() !== email.toLowerCase() || account.passwordHash !== (await sha(password))) {
        throw new Error('Invalid login credentials');
      }
      account.signedIn = true;
      await saveAccount();
      emit();
    },
    async signInOAuth() {
      throw new Error('La connexion Google et Apple demande un projet Supabase (mode en ligne).');
    },
    async sendMagicLink() {
      throw new Error('Le lien magique demande un projet Supabase (mode en ligne).');
    },
    async resendConfirmation() {},
    async updatePassword(password) {
      if (account) {
        account.passwordHash = await sha(password);
        await saveAccount();
      }
    },
    async updateEmail(email) {
      if (account) {
        account.email = email;
        await saveAccount();
      }
    },
    async signOut() {
      if (account) {
        account.signedIn = false;
        await saveAccount();
      }
      emit();
    },
    async usernameAvailable(u) {
      // Un seul joueur en mode local : tout pseudo bien formé est libre.
      return /^[A-Za-z0-9-]{3,20}$/.test(u);
    },
    async getProfile(): Promise<MyProfile | null> {
      if (!account) return null;
      return { id: LOCAL_ID, username: account.username, friendCode: account.friendCode, birthYear: account.birthYear, createdAt: account.createdAt };
    },
    async updateUsername(username) {
      if (account) {
        account.username = username;
        await saveAccount();
      }
    },
    async linkedProviders() {
      return ['email'];
    },
  };

  const social = await createLocalSocial({ db, store, getAccount: () => account, myId: LOCAL_ID });

  const game: GameApi = {
    mode: 'local',
    store,
    userId: () => LOCAL_ID,
    ensure: () => engine.ensureQuests(ctx, LOCAL_ID),
    createCharacter: (input) => wrap(() => engine.createCharacter(ctx, LOCAL_ID, input)),
    accept: (id) => wrap(() => engine.acceptQuest(ctx, LOCAL_ID, id)),
    abandon: (id) => wrap(() => engine.abandonQuest(ctx, LOCAL_ID, id)),
    progress: (id, patch) => wrap(() => engine.updateProgress(ctx, LOCAL_ID, id, patch)),
    reroll: (id) => wrap(() => engine.rerollQuest(ctx, LOCAL_ID, id)),
    complete: (req) => wrap(() => engine.completeQuestAction(ctx, LOCAL_ID, req)),
    undo: (id) => wrap(() => engine.undoQuest(ctx, LOCAL_ID, id)),
    choosePath: (id) => wrap(() => engine.choosePath(ctx, LOCAL_ID, id)),
    chooseImprovement: (c) => wrap(() => engine.chooseImprovement(ctx, LOCAL_ID, c)),
    declareRest: () => wrap(() => engine.declareRest(ctx, LOCAL_ID)),
    equipTitle: (t) => wrap(() => engine.equipTitle(ctx, LOCAL_ID, t)),
    achievementProgress: () => engine.achievementProgress(ctx, LOCAL_ID),
    async resetAdventure() {
      store.users.delete(LOCAL_ID);
      store.posts = store.posts.filter((p) => p.authorId !== LOCAL_ID);
      persist();
    },
    async saveTemplate(t: QuestTemplate) {
      await store.saveTemplate(LOCAL_ID, { ...t, source: 'custom', ownerId: LOCAL_ID });
    },
    async setPreference(p: QuestPreference) {
      await store.savePreference(LOCAL_ID, p);
    },
    async saveSettings(s: SettingsRecord) {
      await store.saveSettings(LOCAL_ID, s);
    },
    async updateAppearance(a) {
      const c = await store.getCharacter(LOCAL_ID);
      if (!c) return;
      await store.saveCharacter(LOCAL_ID, {
        ...c,
        ...(a.name !== undefined ? { name: a.name } : {}),
        ...(a.portraitId !== undefined ? { portraitId: a.portraitId } : {}),
        ...(a.frameColor !== undefined ? { frameColor: a.frameColor } : {}),
        ...(a.motto !== undefined ? { motto: a.motto } : {}),
        ...(a.oath !== undefined ? { oath: a.oath } : {}),
      });
    },
    async uploadMedia(blob, ext) {
      const id = `local:${crypto.randomUUID()}.${ext}`;
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const r = new FileReader();
        r.onload = () => resolve(String(r.result));
        r.onerror = reject;
        r.readAsDataURL(blob);
      });
      await db.kv.put({ key: `media:${id}`, value: dataUrl });
      return id;
    },
    async exportData() {
      return {
        ok: true,
        exportedAt: new Date().toISOString(),
        account: account ? { email: account.email, username: account.username, friendCode: account.friendCode } : null,
        game: store.snapshot(),
      };
    },
    async deleteAccount() {
      store.users.clear();
      store.posts = [];
      account = null;
      await db.delete();
      emit();
      setTimeout(() => location.reload(), 50);
    },
  };

  return { mode: 'local', auth, game, social };
}

export type { QuestInstance, ReactionKind, StoredPost };
