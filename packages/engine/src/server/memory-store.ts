import {
  Chest,
  DungeonProgress,
  InventoryItem,
  QuestInstance,
  QuestPreference,
  QuestTemplate,
  SpellKnown,
  TrackState,
  emptyAdventureFields,
} from '../types';
import { migrateLegacyItems } from '../legacy-items';
import { RAID_MAX_MEMBERS, type RaidOutcome } from '../raid';
import type { SeasonScoreLike } from '../seasons';
import {
  CharacterRecord,
  GameStore,
  InstanceFilter,
  JournalEntry,
  PostDraft,
  RaidDamageRecord,
  RaidEncouragementRecord,
  RaidMemberRecord,
  RaidMemberWrite,
  RaidTeamRecord,
  SeasonResultRecord,
  SeasonScoreRecord,
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
  /** Aventure : équipement, coffres, progression des donjons (absents des anciens instantanés) */
  items?: InventoryItem[];
  chests?: Chest[];
  dungeons?: DungeonProgress[];
  /** Capacités connues (V4, absentes des anciens instantanés) */
  spells?: SpellKnown[];
  /** Saisons : puissance publiée et résultats (absents des anciens instantanés) */
  seasonScores?: SeasonScoreRecord[];
  seasonResults?: SeasonResultRecord[];
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
  items: [],
  chests: [],
  dungeons: [],
  spells: [],
  seasonScores: [],
  seasonResults: [],
});

const asArray = <T>(v: T | T[] | undefined): T[] | undefined => (v === undefined ? undefined : Array.isArray(v) ? v : [v]);

/** Implémentation en mémoire de GameStore (tests et mode local). Sérialisable via snapshot()/restore(). */
export class MemoryStore implements GameStore {
  users = new Map<string, UserData>();
  posts: StoredPost[] = [];
  /** Appelé après chaque écriture (persistance du mode local) */
  onChange?: () => void;
  /** Raids d'amis : équipes, membres, dégâts, encouragements (partagés entre joueurs, jamais persistés en mode local) */
  raidTeams: RaidTeamRecord[] = [];
  raidMembers: RaidMemberRecord[] = [];
  raidDamage: RaidDamageRecord[] = [];
  raidEncouragements: RaidEncouragementRecord[] = [];
  /** Amitiés acceptées, sous la forme « a|b » (a < b) ; réservé aux tests (l'app locale n'a pas d'amis) */
  friendPairs = new Set<string>();
  /** Notifications créées (tests) */
  notifications: { userId: string; type: string; payload: Record<string, unknown> }[] = [];
  socialCountsFn?: (userId: string) => { posts: number; friends: number; reactionsGiven: number };

  constructor(public catalog: QuestTemplate[] = []) {}

  data(userId: string): UserData {
    let d = this.users.get(userId);
    if (!d) {
      d = emptyUserData();
      this.users.set(userId, d);
    }
    d.tracks ??= [];
    d.items = migrateLegacyItems(d.items ?? []);
    d.chests ??= [];
    d.dungeons ??= [];
    d.spells ??= [];
    d.seasonScores ??= [];
    d.seasonResults ??= [];
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
    // Un personnage enregistré avant l'aventure n'a pas les champs d'aventure : valeurs par défaut.
    const c = this.data(userId).character;
    return c ? structuredClone({ ...emptyAdventureFields(), ...c }) : null;
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

  async listItems(userId: string) {
    return structuredClone(this.data(userId).items!);
  }
  async insertItems(userId: string, items: InventoryItem[]) {
    this.data(userId).items!.push(...structuredClone(items));
    this.touch();
  }
  async updateItem(userId: string, id: string, patch: Partial<Pick<InventoryItem, 'level' | 'equipped'>>) {
    const it = this.data(userId).items!.find((x) => x.id === id);
    if (it) Object.assign(it, patch);
    this.touch();
  }
  async deleteItems(userId: string, ids: string[]) {
    const d = this.data(userId);
    d.items = d.items!.filter((i) => !ids.includes(i.id));
    this.touch();
  }

  async listChests(userId: string, filter: { opened?: boolean } = {}) {
    return structuredClone(
      this.data(userId).chests!.filter((c) => filter.opened === undefined || (c.openedAt !== null) === filter.opened),
    );
  }
  async insertChest(userId: string, chest: Chest) {
    const list = this.data(userId).chests!;
    if (list.some((c) => c.source === chest.source && c.sourceKey === chest.sourceKey)) return false;
    list.push(structuredClone(chest));
    this.touch();
    return true;
  }
  async markChestOpened(userId: string, id: string, at: string) {
    const c = this.data(userId).chests!.find((x) => x.id === id);
    if (!c || c.openedAt) return false;
    c.openedAt = at;
    this.touch();
    return true;
  }
  async deleteChests(userId: string, ids: string[]) {
    const d = this.data(userId);
    d.chests = d.chests!.filter((c) => !ids.includes(c.id));
    this.touch();
  }

  async listDungeonProgress(userId: string) {
    return structuredClone(this.data(userId).dungeons!);
  }
  async saveDungeonProgress(userId: string, p: DungeonProgress) {
    const list = this.data(userId).dungeons!;
    const i = list.findIndex((x) => x.dungeonId === p.dungeonId);
    if (i >= 0) list[i] = structuredClone(p);
    else list.push(structuredClone(p));
    this.touch();
  }

  async listSpells(userId: string) {
    return structuredClone(this.data(userId).spells!);
  }
  async saveSpell(userId: string, spell: SpellKnown) {
    const list = this.data(userId).spells!;
    // Un seul sort par emplacement du Grimoire (comme l'index unique de la base).
    if (spell.equippedSlot !== null && list.some((x) => x.spellId !== spell.spellId && x.equippedSlot === spell.equippedSlot)) {
      throw new Error('spells.save: emplacement déjà occupé');
    }
    const i = list.findIndex((x) => x.spellId === spell.spellId);
    if (i >= 0) list[i] = structuredClone(spell);
    else list.push(structuredClone(spell));
    this.touch();
  }

  // ───── Raids d'amis
  addFriendship(a: string, b: string): void {
    this.friendPairs.add([a, b].sort().join('|'));
  }
  async areFriends(a: string, b: string) {
    return a !== b && this.friendPairs.has([a, b].sort().join('|'));
  }
  async getRaidTeam(teamId: string) {
    const t = this.raidTeams.find((x) => x.id === teamId);
    return t ? structuredClone(t) : null;
  }
  async listRaidMemberships(userId: string, since: string) {
    return structuredClone(this.raidMembers.filter((m) => m.profileId === userId && m.weekStart >= since));
  }
  async listRaidMembers(teamId: string) {
    return structuredClone(this.raidMembers.filter((m) => m.teamId === teamId));
  }
  private joinedElsewhere(m: Pick<RaidMemberRecord, 'teamId' | 'profileId' | 'weekStart'>): boolean {
    return this.raidMembers.some((x) => x.status === 'joined' && x.profileId === m.profileId && x.weekStart === m.weekStart && x.teamId !== m.teamId);
  }
  private joinedCount(teamId: string, except?: string): number {
    return this.raidMembers.filter((x) => x.teamId === teamId && x.status === 'joined' && x.profileId !== except).length;
  }
  async insertRaidTeam(team: RaidTeamRecord, leader: RaidMemberRecord) {
    if (this.joinedElsewhere(leader)) return false;
    this.raidTeams.push(structuredClone(team));
    this.raidMembers.push(structuredClone(leader));
    this.touch();
    return true;
  }
  async insertRaidMember(m: RaidMemberRecord): Promise<RaidMemberWrite> {
    const team = this.raidTeams.find((t) => t.id === m.teamId);
    if (!team || team.weekStart !== m.weekStart) return 'conflict';
    if (this.raidMembers.some((x) => x.teamId === m.teamId && x.profileId === m.profileId)) return 'duplicate';
    if (m.profileId !== team.leaderId && !(await this.areFriends(team.leaderId, m.profileId))) return 'not-friend';
    if (m.status === 'joined') {
      if (this.joinedElsewhere(m)) return 'conflict';
      if (this.joinedCount(m.teamId) >= RAID_MAX_MEMBERS) return 'full';
    }
    this.raidMembers.push(structuredClone(m));
    this.touch();
    return 'ok';
  }
  async joinRaidMember(teamId: string, profileId: string, at: string): Promise<RaidMemberWrite> {
    const m = this.raidMembers.find((x) => x.teamId === teamId && x.profileId === profileId);
    if (!m) return 'conflict';
    if (m.status === 'joined') return 'duplicate';
    if (this.joinedElsewhere(m)) return 'conflict';
    if (this.joinedCount(teamId) >= RAID_MAX_MEMBERS) return 'full';
    m.status = 'joined';
    m.joinedAt = at;
    this.touch();
    return 'ok';
  }
  async deleteRaidMember(teamId: string, profileId: string) {
    this.raidMembers = this.raidMembers.filter((m) => !(m.teamId === teamId && m.profileId === profileId));
    this.raidDamage = this.raidDamage.filter((d) => !(d.teamId === teamId && d.profileId === profileId));
    this.raidEncouragements = this.raidEncouragements.filter((e) => !(e.teamId === teamId && (e.fromId === profileId || e.toId === profileId)));
    this.touch();
  }
  async deleteRaidInvites(profileId: string, weekStart: string) {
    this.raidMembers = this.raidMembers.filter((m) => !(m.profileId === profileId && m.weekStart === weekStart && m.status === 'invited'));
    this.touch();
  }
  async setRaidLeader(teamId: string, leaderId: string) {
    const t = this.raidTeams.find((x) => x.id === teamId);
    if (t) t.leaderId = leaderId;
    this.touch();
  }
  async deleteRaidTeam(teamId: string) {
    this.raidTeams = this.raidTeams.filter((t) => t.id !== teamId);
    this.raidMembers = this.raidMembers.filter((m) => m.teamId !== teamId);
    this.raidDamage = this.raidDamage.filter((d) => d.teamId !== teamId);
    this.raidEncouragements = this.raidEncouragements.filter((e) => e.teamId !== teamId);
    this.touch();
  }
  async resolveRaidTeam(teamId: string, r: { outcome: RaidOutcome; maxHp: number; totalDamage: number; victoryDay: string | null; at: string }) {
    const t = this.raidTeams.find((x) => x.id === teamId);
    if (!t || t.resolvedAt) return false;
    Object.assign(t, { resolvedAt: r.at, outcome: r.outcome, maxHp: r.maxHp, totalDamage: r.totalDamage, victoryDay: r.victoryDay });
    this.touch();
    return true;
  }
  async listRaidDamage(teamId: string) {
    return structuredClone(this.raidDamage.filter((d) => d.teamId === teamId));
  }
  async insertRaidDamage(d: RaidDamageRecord) {
    if (this.raidDamage.some((x) => x.profileId === d.profileId && x.gameDate === d.gameDate)) return false;
    this.raidDamage.push(structuredClone(d));
    this.touch();
    return true;
  }
  async updateRaidDamage(teamId: string, profileId: string, gameDate: string, patch: Pick<RaidDamageRecord, 'damage' | 'encouragements'>) {
    const d = this.raidDamage.find((x) => x.teamId === teamId && x.profileId === profileId && x.gameDate === gameDate);
    if (d) Object.assign(d, patch);
    this.touch();
  }
  async listRaidEncouragements(teamId: string, gameDate: string) {
    return structuredClone(this.raidEncouragements.filter((e) => e.teamId === teamId && e.gameDate === gameDate));
  }
  async insertRaidEncouragement(e: RaidEncouragementRecord) {
    if (this.raidEncouragements.some((x) => x.teamId === e.teamId && x.fromId === e.fromId && x.toId === e.toId && x.gameDate === e.gameDate)) return false;
    this.raidEncouragements.push(structuredClone(e));
    this.touch();
    return true;
  }
  async notify(userId: string, type: string, payload: Record<string, unknown>) {
    this.notifications.push({ userId, type, payload: structuredClone(payload) });
  }

  // ───── Saisons
  async upsertSeasonScore(userId: string, seasonKey: string, power: number, day: string) {
    const list = this.data(userId).seasonScores!;
    const cur = list.find((x) => x.seasonKey === seasonKey);
    if (cur) {
      cur.power = power;
      if (day > cur.lastDay) cur.lastDay = day;
      if (day < cur.firstDay) cur.firstDay = day;
    } else list.push({ seasonKey, power, firstDay: day, lastDay: day });
    this.touch();
  }
  async listSeasonScores(userId: string) {
    return structuredClone(this.data(userId).seasonScores!);
  }
  async seasonRanking(userId: string, seasonKey: string): Promise<SeasonScoreLike[]> {
    const optedIn = (id: string) => this.data(id).settings.leaderboardOptIn !== false;
    if (!optedIn(userId)) return [];
    const rows: SeasonScoreLike[] = [];
    for (const id of this.users.keys()) {
      if (id !== userId && (!(await this.areFriends(userId, id)) || !optedIn(id))) continue;
      const score = this.data(id).seasonScores!.find((x) => x.seasonKey === seasonKey);
      if (score) rows.push({ profileId: id, power: score.power });
    }
    return rows;
  }
  async listSeasonResults(userId: string) {
    return structuredClone(this.data(userId).seasonResults!);
  }
  async insertSeasonResult(userId: string, r: SeasonResultRecord) {
    const list = this.data(userId).seasonResults!;
    if (list.some((x) => x.seasonKey === r.seasonKey)) return false;
    list.push(structuredClone(r));
    this.touch();
    return true;
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
