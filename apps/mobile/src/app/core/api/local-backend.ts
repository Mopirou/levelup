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

const K256 = [
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
  0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
];

/** SHA-256 en JS pur : repli quand crypto.subtle est absent (page servie en HTTP hors localhost). */
function sha256Fallback(data: Uint8Array): Uint8Array {
  const h = [0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19];
  const padded = new Uint8Array(((data.length + 9 + 63) >> 6) << 6);
  padded.set(data);
  padded[data.length] = 0x80;
  const view = new DataView(padded.buffer);
  view.setUint32(padded.length - 8, Math.floor((data.length * 8) / 0x100000000));
  view.setUint32(padded.length - 4, (data.length * 8) >>> 0);
  const w = new Uint32Array(64);
  const rotr = (x: number, n: number) => (x >>> n) | (x << (32 - n));
  for (let off = 0; off < padded.length; off += 64) {
    for (let i = 0; i < 16; i++) w[i] = view.getUint32(off + i * 4);
    for (let i = 16; i < 64; i++) {
      const s0 = rotr(w[i - 15], 7) ^ rotr(w[i - 15], 18) ^ (w[i - 15] >>> 3);
      const s1 = rotr(w[i - 2], 17) ^ rotr(w[i - 2], 19) ^ (w[i - 2] >>> 10);
      w[i] = (w[i - 16] + s0 + w[i - 7] + s1) >>> 0;
    }
    let [a, b, c, d, e, f, g, hh] = h;
    for (let i = 0; i < 64; i++) {
      const t1 = (hh + (rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25)) + ((e & f) ^ (~e & g)) + K256[i] + w[i]) >>> 0;
      const t2 = ((rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22)) + ((a & b) ^ (a & c) ^ (b & c))) >>> 0;
      hh = g; g = f; f = e; e = (d + t1) >>> 0; d = c; c = b; b = a; a = (t1 + t2) >>> 0;
    }
    h[0] = (h[0] + a) >>> 0; h[1] = (h[1] + b) >>> 0; h[2] = (h[2] + c) >>> 0; h[3] = (h[3] + d) >>> 0;
    h[4] = (h[4] + e) >>> 0; h[5] = (h[5] + f) >>> 0; h[6] = (h[6] + g) >>> 0; h[7] = (h[7] + hh) >>> 0;
  }
  const out = new Uint8Array(32);
  const outView = new DataView(out.buffer);
  h.forEach((v, i) => outView.setUint32(i * 4, v));
  return out;
}

async function sha(text: string): Promise<string> {
  const data = new TextEncoder().encode(text);
  const buf = globalThis.crypto?.subtle
    ? new Uint8Array(await crypto.subtle.digest('SHA-256', data))
    : sha256Fallback(data);
  return [...buf].map((b) => b.toString(16).padStart(2, '0')).join('');
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
  // Ancien personnage local (scores de départ de 8 à 15) : ramené à l'échelle actuelle, une seule fois.
  const legacy = await store.getCharacter(LOCAL_ID);
  if (legacy && engine.hasLegacyBaseScores(legacy.baseScores)) {
    await store.saveCharacter(LOCAL_ID, { ...legacy, baseScores: engine.rescaleLegacyBaseScores(legacy.baseScores) });
  }
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
    tune: (id, direction) => wrap(() => engine.tuneQuest(ctx, LOCAL_ID, id, direction)),
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
