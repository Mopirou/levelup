import { QuestInstance, QuestPreference, QuestTemplate, TrackState } from '../types';
import {
  CharacterRecord,
  GameStore,
  InstanceFilter,
  JournalEntry,
  PostDraft,
  SettingsRecord,
  XpEvent,
  defaultSettings,
} from './types';

export interface StoredPost extends PostDraft {
  id: string;
  authorId: string;
  createdAt: string;
  editedAt?: string | null;
  deletedAt?: string | null;
}

export interface UserData {
  character: CharacterRecord | null;
  settings: SettingsRecord;
  customTemplates: QuestTemplate[];
  preferences: Record<string, QuestPreference>;
  instances: QuestInstance[];
  xpEvents: XpEvent[];
  unlocked: { achievementId: string; unlockedAt: string }[];
  restDays: string[];
  journal: JournalEntry[];
  /** Parcours de discipline (absent des anciens instantanés) */
  tracks?: TrackState[];
}

export interface MemorySnapshot {
  users: Record<string, UserData>;
  posts: StoredPost[];
}

export const emptyUserData = (): UserData => ({
  character: null,
  settings: defaultSettings(),
  customTemplates: [],
  preferences: {},
  instances: [],
  xpEvents: [],
  unlocked: [],
  restDays: [],
  journal: [],
  tracks: [],
});

const asArray = <T>(v: T | T[] | undefined): T[] | undefined => (v === undefined ? undefined : Array.isArray(v) ? v : [v]);

/** Implémentation en mémoire de GameStore (tests et mode local). Sérialisable via snapshot()/restore(). */
export class MemoryStore implements GameStore {
  users = new Map<string, UserData>();
  posts: StoredPost[] = [];
  /** Appelé après chaque écriture (persistance du mode local) */
  onChange?: () => void;
  socialCountsFn?: (userId: string) => { posts: number; friends: number; reactionsGiven: number };

  constructor(public catalog: QuestTemplate[] = []) {}

  data(userId: string): UserData {
    let d = this.users.get(userId);
    if (!d) {
      d = emptyUserData();
      this.users.set(userId, d);
    }
    d.tracks ??= [];
    return d;
  }

  private touch(): void {
    this.onChange?.();
  }

  snapshot(): MemorySnapshot {
    return { users: Object.fromEntries(this.users), posts: this.posts };
  }

  restore(s: MemorySnapshot): void {
    this.users = new Map(Object.entries(s.users ?? {}));
    this.posts = s.posts ?? [];
  }

  async getCharacter(userId: string) {
    return this.data(userId).character ? { ...this.data(userId).character! } : null;
  }
  async saveCharacter(userId: string, c: CharacterRecord) {
    this.data(userId).character = structuredClone(c);
    this.touch();
  }
  async getSettings(userId: string) {
    return structuredClone(this.data(userId).settings);
  }
  async saveSettings(userId: string, s: SettingsRecord) {
    this.data(userId).settings = structuredClone(s);
    this.touch();
  }
  async listTemplates(userId: string, opts: { withRungs?: boolean } = {}) {
    const all = [...this.catalog, ...this.data(userId).customTemplates];
    return opts.withRungs === false ? all.filter((t) => !t.trackId) : all;
  }
  async getPreferences(userId: string) {
    return structuredClone(this.data(userId).preferences);
  }
  async saveTemplate(userId: string, t: QuestTemplate) {
    const d = this.data(userId);
    const i = d.customTemplates.findIndex((x) => x.id === t.id);
    if (i >= 0) d.customTemplates[i] = t;
    else d.customTemplates.push(t);
    this.touch();
  }
  async savePreference(userId: string, p: QuestPreference) {
    this.data(userId).preferences[p.templateId] = p;
    this.touch();
  }

  async listInstances(userId: string, f: InstanceFilter = {}) {
    const statuses = asArray(f.status);
    return structuredClone(
      this.data(userId).instances.filter(
        (i) =>
          (!f.period || i.period === f.period) &&
          (!statuses || statuses.includes(i.status)) &&
          (!f.from || i.periodStart >= f.from) &&
          (!f.to || i.periodStart <= f.to) &&
          (!f.covers || (i.periodStart <= f.covers && i.periodEnd >= f.covers)),
      ),
    );
  }
  async getInstance(userId: string, id: string) {
    const i = this.data(userId).instances.find((x) => x.id === id);
    return i ? structuredClone(i) : null;
  }
  async insertInstances(userId: string, instances: QuestInstance[]) {
    this.data(userId).instances.push(...structuredClone(instances));
    this.touch();
  }
  async updateInstance(userId: string, id: string, patch: Partial<QuestInstance>) {
    const i = this.data(userId).instances.find((x) => x.id === id);
    if (i) Object.assign(i, structuredClone(patch));
    this.touch();
  }
  async deleteInstance(userId: string, id: string) {
    const d = this.data(userId);
    d.instances = d.instances.filter((i) => i.id !== id);
    this.touch();
  }

  async insertXpEvents(userId: string, events: XpEvent[]) {
    this.data(userId).xpEvents.push(...structuredClone(events));
    this.touch();
  }
  async listXpEvents(userId: string, since?: string) {
    return structuredClone(this.data(userId).xpEvents.filter((e) => !since || e.gameDate >= since));
  }

  async listUnlocked(userId: string) {
    return structuredClone(this.data(userId).unlocked);
  }
  async unlockAchievement(userId: string, achievementId: string, at: string) {
    const d = this.data(userId);
    if (!d.unlocked.some((u) => u.achievementId === achievementId)) d.unlocked.push({ achievementId, unlockedAt: at });
    this.touch();
  }

  async listRestDays(userId: string) {
    return [...this.data(userId).restDays];
  }
  async addRestDay(userId: string, day: string) {
    const d = this.data(userId);
    if (!d.restDays.includes(day)) d.restDays.push(day);
    this.touch();
  }

  async saveJournal(userId: string, entry: JournalEntry) {
    this.data(userId).journal.push(entry);
    this.touch();
  }
  async countJournal(userId: string) {
    return this.data(userId).journal.length;
  }
  async listJournal(userId: string) {
    return structuredClone(this.data(userId).journal);
  }

  async listTracks(userId: string) {
    return structuredClone(this.data(userId).tracks!);
  }
  async saveTrack(userId: string, t: TrackState) {
    const list = this.data(userId).tracks!;
    const i = list.findIndex((x) => x.trackId === t.trackId);
    if (i >= 0) list[i] = structuredClone(t);
    else list.push(structuredClone(t));
    this.touch();
  }
  async deleteTrack(userId: string, trackId: string) {
    const d = this.data(userId);
    d.tracks = d.tracks!.filter((t) => t.trackId !== trackId);
    this.touch();
  }

  async createPost(userId: string, draft: PostDraft) {
    const id = `post-${this.posts.length + 1}-${Math.random().toString(36).slice(2, 8)}`;
    this.posts.push({ ...structuredClone(draft), id, authorId: userId, createdAt: new Date().toISOString() });
    this.touch();
    return id;
  }
  async detachPostsFromInstance(userId: string, instanceId: string) {
    for (const p of this.posts) {
      if (p.authorId === userId && p.instanceId === instanceId) {
        p.instanceId = null;
        p.payload = { ...(p.payload ?? {}), xp: undefined, questDetached: true };
      }
    }
    this.touch();
  }
  async socialCounts(userId: string) {
    const own = this.posts.filter((p) => p.authorId === userId && !p.deletedAt && (p.type === 'quest' || p.type === 'photo')).length;
    return this.socialCountsFn?.(userId) ?? { posts: own, friends: 0, reactionsGiven: 0 };
  }
}
