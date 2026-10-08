import Dexie from 'dexie';
import type { CompleteRequest } from './api/types';

export type PendingAction =
  | { kind: 'complete'; req: CompleteRequest }
  | { kind: 'progress'; instanceId: string; progress?: number; stepsDone?: boolean[] }
  | { kind: 'accept'; instanceId: string };

export interface QueuedPost {
  id?: number;
  post: { type: 'photo' | 'quest'; text: string; visibility: 'friends' | 'private'; instanceId?: string | null; media: { blob: Blob; ext: 'jpg' | 'webp'; width: number; height: number }[] };
  createdAt: string;
}

export interface PendingRow {
  id?: number;
  action: PendingAction;
  createdAt: string;
}

/** Cache local (lecture hors ligne) et file d'actions en attente, rejouée au retour du réseau (RG-17). */
class OfflineDb extends Dexie {
  cache!: Dexie.Table<{ key: string; value: any }, string>;
  pending!: Dexie.Table<PendingRow, number>;
  posts!: Dexie.Table<QueuedPost, number>;
  constructor() {
    super('levelup-offline');
    this.version(1).stores({ cache: 'key', pending: '++id' });
    this.version(2).stores({ cache: 'key', pending: '++id', posts: '++id' });
  }
}

let db: OfflineDb | null = null;
let unavailable = false;

/** RG-14 : IndexedDB indisponible (navigation privée…) → l'app fonctionne en ligne uniquement. */
async function open(): Promise<OfflineDb | null> {
  if (unavailable) return null;
  if (db) return db;
  try {
    const d = new OfflineDb();
    await d.open();
    db = d;
    return d;
  } catch {
    unavailable = true;
    return null;
  }
}

export const offline = {
  async available(): Promise<boolean> {
    return !!(await open());
  },
  async putCache(key: string, value: unknown): Promise<void> {
    const d = await open();
    await d?.cache.put({ key, value }).catch(() => undefined);
  },
  async getCache<T>(key: string): Promise<T | undefined> {
    const d = await open();
    return (await d?.cache.get(key).catch(() => undefined))?.value as T | undefined;
  },
  async clear(): Promise<void> {
    const d = await open();
    await d?.cache.clear().catch(() => undefined);
    await d?.pending.clear().catch(() => undefined);
  },
  async enqueue(action: PendingAction): Promise<void> {
    const d = await open();
    await d?.pending.add({ action, createdAt: new Date().toISOString() });
  },
  async pending(): Promise<PendingRow[]> {
    const d = await open();
    return (await d?.pending.orderBy('id').toArray().catch(() => [])) ?? [];
  },
  async queuePost(post: QueuedPost['post']): Promise<void> {
    const d = await open();
    await d?.posts.add({ post, createdAt: new Date().toISOString() });
  },
  async queuedPosts(): Promise<QueuedPost[]> {
    const d = await open();
    return (await d?.posts.orderBy('id').toArray().catch(() => [])) ?? [];
  },
  async removePost(id: number): Promise<void> {
    const d = await open();
    await d?.posts.delete(id).catch(() => undefined);
  },
  async remove(id: number): Promise<void> {
    const d = await open();
    await d?.pending.delete(id).catch(() => undefined);
  },
};
