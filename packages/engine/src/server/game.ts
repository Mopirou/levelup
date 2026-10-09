import classesJson from '../../../content/data/classes.fr.json';
import achievementsJson from '../../../content/data/achievements.fr.json';
import {
  addDays,
  diffDays,
  gameDate,
  isDateInRange,
  isoWeek,
  lastAcceptDate,
  localMinutes,
  periodBounds,
  startOfIsoWeek,
} from '../dates';
import { drawQuests, lastDrawnMap } from '../draw';
import {
  AbilityUp,
  OFFLINE_MAX_DELAY_MS,
  UNDO_WINDOW_MS,
  applyXp,
  applyXpParts,
  canDeclareRest,
  canUndo,
  completeQuest,
  computeBestStreak,
  computeStreak,
  expiredPartialXp,
  hardcorePenalty,
  inspirationAfterStreak,
  MAX_INSPIRATION,
} from '../complete';
import {
  AchievementDef,
  PlayerStats,
  emptyStats,
  newlyUnlocked,
  evaluateAchievements,
  AchievementProgress,
} from '../achievements';
import { ClassDef, masteriesOf, pathAbilityOf } from '../content-types';
import {
  ABILITIES,
  AbilityId,
  CharacterCore,
  Difficulty,
  Period,
  QuestInstance,
  QuestPreference,
  QuestTemplate,
  emptyAbilityRecord,
} from '../types';
import {
  FORGE_LEVEL,
  SOFT_CAP_SCORE,
  abilityProgressOf,
  abilityScores,
  isValidPointBuy,
  levelFromXp,
  pendingImprovements,
  pendingPath,
  questCountFor,
  unlocksAt,
  PATH_LEVEL,
  splitXp,
} from '../xp';
import {
  CharacterRecord,
  GameStore,
  ServerContext,
  SettingsRecord,
  XpEvent,
  defaultSettings,
  PostDraft,
  Visibility,
} from './types';

export const CLASSES = classesJson as unknown as ClassDef[];
export const ACHIEVEMENTS = achievementsJson as unknown as AchievementDef[];

const STREAK_POSTS = [7, 14, 30, 60, 100, 200, 365];
const FREE_QUESTS_PER_DAY = 2;

export type GameError =
  | 'no-character'
  | 'not-found'
  | 'not-accepted'
  | 'incomplete'
  | 'journal-too-short'
  | 'no-inspiration'
  | 'out-of-period'
  | 'too-late'
  | 'already-has-character'
  | 'invalid'
  | 'cannot-undo'
  | 'too-late-to-accept'
  | 'no-reroll'
  | 'nothing-pending'
  | 'rest-unavailable'
  | 'level-too-low'
  | 'forbidden';

export type Result<T> = ({ ok: true } & T) | { ok: false; error: GameError; message?: string };

const fail = (error: GameError, message?: string) => ({ ok: false as const, error, message });

// ───────────────────────── Aides ─────────────────────────

interface Env {
  ctx: ServerContext;
  userId: string;
  character: CharacterRecord;
  settings: SettingsRecord;
  nowMs: number;
  today: string;
}

async function loadEnv(ctx: ServerContext, userId: string): Promise<Env | null> {
  const [character, settings] = await Promise.all([ctx.store.getCharacter(userId), ctx.store.getSettings(userId)]);
  if (!character) return null;
  const nowMs = ctx.now();
  return { ctx, userId, character, settings, nowMs, today: gameDate(nowMs, settings.timezone, settings.resetHour) };
}

export function masteriesFor(c: Pick<CharacterCore, 'classId'>): AbilityId[] {
  return masteriesOf(CLASSES, c.classId);
}

export function pathAbilityFor(c: Pick<CharacterCore, 'classId' | 'pathId'>): AbilityId | null {
  return pathAbilityOf(CLASSES, c.classId, c.pathId);
}

function snapshotOf(t: QuestTemplate): QuestInstance['snapshot'] {
  return {
    ability: t.ability,
    difficulty: t.difficulty,
    title: t.title,
    flavor: t.flavor,
    objective: t.objective,
    tips: t.tips,
    validation: t.validation,
    tags: t.tags,
    ...(t.theme ? { theme: t.theme } : {}),
    ...(t.secondary?.length ? { secondary: t.secondary } : {}),
  };
}

function newInstance(
  id: string,
  t: QuestTemplate,
  period: Period,
  start: string,
  end: string,
  status: QuestInstance['status'],
  nowIso: string,
  free = false,
): QuestInstance {
  return {
    id,
    templateId: t.id,
    snapshot: snapshotOf(t),
    period,
    periodStart: start,
    periodEnd: end,
    status,
    progress: 0,
    stepsDone: t.validation.type === 'steps' ? t.validation.steps.map(() => false) : undefined,
    xpAwarded: 0,
    inspirationUsed: false,
    free,
    acceptedAt: status === 'accepted' ? nowIso : null,
    completedAt: null,
  };
}

function eventFor(
  ctx: ServerContext,
  e: Pick<XpEvent, 'instanceId' | 'ability' | 'amount' | 'reason'> & { custom?: boolean },
  gameDay: string,
): XpEvent {
  return { id: ctx.uuid(), custom: false, ...e, createdAt: new Date(ctx.now()).toISOString(), gameDate: gameDay };
}

function mergeChar(base: CharacterRecord, core: CharacterCore): CharacterRecord {
  return { ...base, ...core };
}

// ───────────────────────── Statistiques pour les trophées ─────────────────────────

export async function computePlayerStats(
  store: GameStore,
  userId: string,
  character: CharacterRecord,
  settings: SettingsRecord,
): Promise<PlayerStats> {
  const [completed, templates, rest, journal, social] = await Promise.all([
    store.listInstances(userId, { status: 'completed' }),
    store.listTemplates(userId),
    store.listRestDays(userId),
    store.countJournal(userId),
    store.socialCounts(userId),
  ]);
  const stats = emptyStats();
  stats.questsTotal = completed.length;
  stats.streakBest = character.streakBest;
  stats.level = character.level;
  stats.totalXp = character.totalXp;
  stats.scores = abilityScores(character);
  const days = new Set<string>();
  const abilitiesByWeek = new Map<string, Set<AbilityId>>();
  const discovered = new Set<string>();
  for (const q of completed) {
    stats.byDifficulty[q.snapshot.difficulty]++;
    stats.byAbility[q.snapshot.ability]++;
    discovered.add(q.templateId);
    if (q.inspirationUsed) stats.inspirationUsed++;
    if (q.period === 'weekly') stats.weeklyDone++;
    if (q.period === 'monthly') stats.monthlyDone++;
    if (q.snapshot.validation.type === 'timer') stats.timerMinutes += q.snapshot.validation.minutes;
    if (q.completedAt) {
      const ms = Date.parse(q.completedAt);
      const minutes = localMinutes(ms, settings.timezone);
      if (minutes < 8 * 60) stats.earlyQuests++;
      if (minutes >= 21 * 60) stats.lateQuests++;
      const day = gameDate(ms, settings.timezone, settings.resetHour);
      days.add(day);
      const w = isoWeek(day);
      const key = `${w.year}-${w.week}`;
      if (!abilitiesByWeek.has(key)) abilitiesByWeek.set(key, new Set());
      abilitiesByWeek.get(key)!.add(q.snapshot.ability);
    }
  }
  stats.discovered = discovered.size;
  const sorted = [...days].sort();
  for (let i = 1; i < sorted.length; i++) {
    stats.comebackGap = Math.max(stats.comebackGap, diffDays(sorted[i], sorted[i - 1]) - 1);
  }
  for (const set of abilitiesByWeek.values()) stats.weekAbilitiesMax = Math.max(stats.weekAbilitiesMax, set.size);
  // Journées parfaites : toutes les quêtes journalières « du quota » accomplies.
  const dailyByDay = new Map<string, QuestInstance[]>();
  for (const q of await store.listInstances(userId, { period: 'daily' })) {
    if (q.free) continue;
    if (!dailyByDay.has(q.periodStart)) dailyByDay.set(q.periodStart, []);
    dailyByDay.get(q.periodStart)!.push(q);
  }
  for (const qs of dailyByDay.values()) {
    if (qs.length && qs.every((q) => q.status === 'completed')) stats.perfectDays++;
  }
  stats.journalEntries = journal;
  stats.customQuests = templates.filter((t) => t.source === 'custom').length;
  stats.restDays = rest.length;
  stats.postsShared = social.posts;
  stats.friends = social.friends;
  stats.reactionsGiven = social.reactionsGiven;
  return stats;
}

export async function achievementProgress(ctx: ServerContext, userId: string): Promise<AchievementProgress[]> {
  const env = await loadEnv(ctx, userId);
  if (!env) return [];
  return evaluateAchievements(ACHIEVEMENTS, await computePlayerStats(ctx.store, userId, env.character, env.settings));
}

// ───────────────────────── Recalcul de cohérence (RG-16) ─────────────────────────

/** Recalcule totaux, niveau et série depuis le registre d'XP. Le cache `characters` est recalculable. */
export async function recomputeCharacter(ctx: ServerContext, userId: string): Promise<CharacterRecord | null> {
  const env = await loadEnv(ctx, userId);
  if (!env) return null;
  const events = await ctx.store.listXpEvents(userId);
  const abilityXp = emptyAbilityRecord(0);
  for (const e of events) abilityXp[e.ability] += e.amount;
  for (const a of ABILITIES) abilityXp[a] = Math.max(abilityXp[a], 0);
  const totalXp = ABILITIES.reduce((s, a) => s + abilityXp[a], 0);
  const streak = await streakInfo(ctx.store, userId, env.settings, env.today);
  const c: CharacterRecord = {
    ...env.character,
    abilityXp,
    totalXp,
    level: levelFromXp(totalXp),
    streakCurrent: streak.current,
    streakBest: Math.max(env.character.streakBest, streak.best),
  };
  await ctx.store.saveCharacter(userId, c);
  return c;
}

async function streakInfo(store: GameStore, userId: string, settings: SettingsRecord, today: string) {
  const [daily, rest] = await Promise.all([
    store.listInstances(userId, { period: 'daily', status: 'completed', from: addDays(today, -800) }),
    store.listRestDays(userId),
  ]);
  const days = daily
    .filter((q) => q.completedAt)
    .map((q) => gameDate(Date.parse(q.completedAt!), settings.timezone, settings.resetHour));
  const s = computeStreak(days, rest, today);
  return { current: s.current, doneToday: s.doneToday, best: computeBestStreak(days, rest), days };
}

// ───────────────────────── Création du personnage ─────────────────────────

export interface CreateCharacterInput {
  name: string;
  classId: string;
  scores: Record<AbilityId, number>;
  portraitId: string;
  frameColor: string;
  motto?: string;
  oath?: string;
  timezone?: string;
}

export async function createCharacter(ctx: ServerContext, userId: string, input: CreateCharacterInput): Promise<Result<{ character: CharacterRecord }>> {
  if (await ctx.store.getCharacter(userId)) return fail('already-has-character');
  const name = input.name.trim();
  if (name.length < 2 || name.length > 30) return fail('invalid', 'Le nom doit faire entre 2 et 30 caractères.');
  if (!CLASSES.some((c) => c.id === input.classId)) return fail('invalid', 'Classe inconnue.');
  if (!isValidPointBuy(input.scores)) return fail('invalid', 'Répartition de points invalide.');
  if ((input.motto ?? '').length > 80) return fail('invalid', 'Devise trop longue.');
  const nowIso = new Date(ctx.now()).toISOString();
  const character: CharacterRecord = {
    id: ctx.uuid(),
    profileId: userId,
    name,
    classId: input.classId,
    pathId: null,
    baseScores: { ...input.scores },
    improvements: emptyAbilityRecord(0),
    improvementsChosen: 0,
    totalXp: 0,
    abilityXp: emptyAbilityRecord(0),
    level: 1,
    streakCurrent: 0,
    streakBest: 0,
    inspiration: 0,
    portraitId: input.portraitId,
    frameColor: input.frameColor,
    motto: input.motto ?? '',
    oath: input.oath ?? '',
    titleEquipped: null,
    rerollsDate: null,
    rerollsUsed: 0,
    createdAt: nowIso,
  };
  await ctx.store.saveSettings(userId, defaultSettings(input.timezone));
  await ctx.store.saveCharacter(userId, character);
  await ensureQuests(ctx, userId);
  return { ok: true, character };
}

// ───────────────────────── Clôture et tirage ─────────────────────────

export interface EnsureResult {
  created: QuestInstance[];
  expired: QuestInstance[];
  levelUps: number[];
}

/** Clôture les périodes passées (RG-01) puis tire les quêtes manquantes de la période en cours. */
export async function ensureQuests(ctx: ServerContext, userId: string): Promise<EnsureResult> {
  const env = await loadEnv(ctx, userId);
  const result: EnsureResult = { created: [], expired: [], levelUps: [] };
  if (!env) return result;
  const { store } = ctx;
  let { character } = env;
  const { settings, today } = env;
  const nowIso = new Date(env.nowMs).toISOString();

  // 1. Clôture des périodes passées : en cours → Expirée, avec XP au prorata pour un compteur ≥ 50 %.
  const open = await store.listInstances(userId, { status: ['proposed', 'accepted'] });
  const allTemplates = await store.listTemplates(userId);
  const customIds = new Set(allTemplates.filter((t) => t.source === 'custom').map((t) => t.id));
  const masteries = masteriesFor(character);
  const pathAbility = pathAbilityFor(character);
  const events: XpEvent[] = [];
  for (const inst of open) {
    if (inst.periodEnd >= today) continue;
    let xp = 0;
    if (inst.status === 'accepted') {
      xp = expiredPartialXp(inst, character.level, masteries, pathAbility);
      if (xp > 0) {
        const parts = splitXp(xp, inst.snapshot.ability, inst.snapshot.secondary);
        for (const p of parts) events.push(eventFor(ctx, { instanceId: inst.id, ability: p.ability, amount: p.amount, reason: 'partial', custom: customIds.has(inst.templateId) }, inst.periodEnd));
        const applied = applyXpParts(character, parts);
        character = mergeChar(character, applied.character);
        result.levelUps.push(...applied.levelsGained);
      } else if (settings.hardcore) {
        const penalty = hardcorePenalty(inst);
        events.push(eventFor(ctx, { instanceId: inst.id, ability: inst.snapshot.ability, amount: -penalty, reason: 'hardcore' }, inst.periodEnd));
        character = mergeChar(character, applyXp(character, inst.snapshot.ability, -penalty).character);
      }
    }
    await store.updateInstance(userId, inst.id, { status: 'expired', xpAwarded: xp });
    result.expired.push({ ...inst, status: 'expired', xpAwarded: xp });
  }
  if (events.length) await store.insertXpEvents(userId, events);

  // 2. Tirage des périodes en cours.
  const templates = allTemplates;
  const [prefs, history] = await Promise.all([
    store.getPreferences(userId),
    store.listInstances(userId, { from: addDays(today, -400) }),
  ]);
  const scores = abilityScores(character);
  const u = unlocksAt(character.level);
  const periods: Period[] = ['daily', 'weekly', 'monthly'];
  if (u.epic) periods.push('epic');
  const toInsert: QuestInstance[] = [];

  for (const period of periods) {
    const b = periodBounds(period, today);
    if (history.some((i) => i.period === period && i.periodStart === b.start)) continue;
    const count = questCountFor(period, character.level, period === 'daily' ? settings.dailyQuestCount : undefined);
    if (count <= 0) continue;
    const base = {
      characterId: character.id,
      period,
      periodStart: b.start,
      level: character.level,
      scores,
      masteries,
      templates,
      preferences: prefs,
      lastDrawn: lastDrawnMap(history, period),
    };
    const main = drawQuests({ ...base, count });
    for (const t of main.picks) {
      const pinned = !!prefs[t.id]?.isPinned;
      const status = period === 'daily' || pinned ? 'accepted' : 'proposed';
      toInsert.push(newInstance(ctx.uuid(), t, period, b.start, b.end, status, nowIso));
    }
    if (period === 'daily') {
      const free = drawQuests({
        ...base,
        count: FREE_QUESTS_PER_DAY,
        difficultyPlan: ['medium', 'high'] as Difficulty[],
        exclude: main.picks.map((t) => t.id),
        seedSuffix: 'free',
        skipPinned: true,
      });
      for (const t of free.picks) toInsert.push(newInstance(ctx.uuid(), t, period, b.start, b.end, 'proposed', nowIso, true));
    }
  }
  if (toInsert.length) await store.insertInstances(userId, toInsert);
  result.created = toInsert;

  // 3. La série peut avoir été cassée par les jours manqués.
  const streak = await streakInfo(store, userId, settings, today);
  character = { ...character, streakCurrent: streak.current, streakBest: Math.max(character.streakBest, streak.best) };
  await store.saveCharacter(userId, character);
  return result;
}

// ───────────────────────── Actions sur les quêtes ─────────────────────────

export async function acceptQuest(ctx: ServerContext, userId: string, instanceId: string): Promise<Result<{ instance: QuestInstance }>> {
  const env = await loadEnv(ctx, userId);
  if (!env) return fail('no-character');
  const inst = await ctx.store.getInstance(userId, instanceId);
  if (!inst) return fail('not-found');
  if (inst.status !== 'proposed') return fail('not-accepted');
  if (env.today > lastAcceptDate(inst.period, inst.periodStart, inst.periodEnd) || env.today > inst.periodEnd) {
    return fail('too-late-to-accept', 'Il est trop tard pour accepter cette quête.');
  }
  const patch = { status: 'accepted' as const, acceptedAt: new Date(env.nowMs).toISOString() };
  await ctx.store.updateInstance(userId, instanceId, patch);
  return { ok: true, instance: { ...inst, ...patch } };
}

export async function abandonQuest(ctx: ServerContext, userId: string, instanceId: string): Promise<Result<{ instance: QuestInstance }>> {
  const env = await loadEnv(ctx, userId);
  if (!env) return fail('no-character');
  const inst = await ctx.store.getInstance(userId, instanceId);
  if (!inst) return fail('not-found');
  if (inst.status !== 'proposed' && inst.status !== 'accepted') return fail('not-accepted');
  if (env.settings.hardcore && inst.status === 'accepted') {
    const penalty = hardcorePenalty(inst);
    await ctx.store.insertXpEvents(userId, [eventFor(ctx, { instanceId, ability: inst.snapshot.ability, amount: -penalty, reason: 'hardcore' }, env.today)]);
    await ctx.store.saveCharacter(userId, mergeChar(env.character, applyXp(env.character, inst.snapshot.ability, -penalty).character));
  }
  await ctx.store.updateInstance(userId, instanceId, { status: 'abandoned' });
  return { ok: true, instance: { ...inst, status: 'abandoned' } };
}

export async function updateProgress(
  ctx: ServerContext,
  userId: string,
  instanceId: string,
  patch: { progress?: number; stepsDone?: boolean[] },
): Promise<Result<{ instance: QuestInstance }>> {
  const inst = await ctx.store.getInstance(userId, instanceId);
  if (!inst) return fail('not-found');
  if (inst.status !== 'accepted') return fail('not-accepted');
  const next: Partial<QuestInstance> = {};
  if (patch.progress !== undefined) next.progress = Math.max(0, patch.progress);
  if (patch.stepsDone) next.stepsDone = patch.stepsDone;
  await ctx.store.updateInstance(userId, instanceId, next);
  return { ok: true, instance: { ...inst, ...next } };
}

/** Relance : 1 gratuite par jour de jeu, puis 1 Inspiration. */
export async function rerollQuest(ctx: ServerContext, userId: string, instanceId: string): Promise<Result<{ instance: QuestInstance; usedInspiration: boolean }>> {
  const env = await loadEnv(ctx, userId);
  if (!env) return fail('no-character');
  const inst = await ctx.store.getInstance(userId, instanceId);
  if (!inst) return fail('not-found');
  if (inst.status === 'completed' || inst.status === 'expired' || inst.status === 'abandoned') return fail('not-accepted');
  if (inst.progress > 0) return fail('invalid', 'Une quête déjà entamée ne peut pas être relancée.');
  const character = { ...env.character };
  if (character.rerollsDate !== env.today) {
    character.rerollsDate = env.today;
    character.rerollsUsed = 0;
  }
  let usedInspiration = false;
  if (character.rerollsUsed >= 1) {
    if (character.inspiration < 1) return fail('no-reroll', 'Plus de relance gratuite aujourd’hui et aucune Inspiration.');
    character.inspiration -= 1;
    usedInspiration = true;
  }
  character.rerollsUsed += 1;
  const [templates, prefs, history, same] = await Promise.all([
    ctx.store.listTemplates(userId),
    ctx.store.getPreferences(userId),
    ctx.store.listInstances(userId, { from: addDays(env.today, -400) }),
    ctx.store.listInstances(userId, { period: inst.period, from: inst.periodStart, to: inst.periodStart }),
  ]);
  const draw = drawQuests({
    characterId: character.id,
    period: inst.period,
    periodStart: inst.periodStart,
    count: 1,
    level: character.level,
    scores: abilityScores(character),
    masteries: masteriesFor(character),
    templates,
    preferences: prefs,
    lastDrawn: lastDrawnMap(history, inst.period),
    exclude: same.map((i) => i.templateId),
    difficultyPlan: [inst.snapshot.difficulty],
    seedSuffix: `reroll-${character.rerollsUsed}-${ctx.uuid()}`,
    skipPinned: true,
  });
  const t = draw.picks[0];
  if (!t) return fail('invalid', 'Aucune autre quête disponible.');
  const fresh = newInstance(ctx.uuid(), t, inst.period, inst.periodStart, inst.periodEnd, inst.status, new Date(env.nowMs).toISOString(), inst.free);
  await ctx.store.deleteInstance(userId, instanceId);
  await ctx.store.insertInstances(userId, [fresh]);
  await ctx.store.saveCharacter(userId, character);
  return { ok: true, instance: fresh, usedInspiration };
}

// ───────────────────────── Validation ─────────────────────────

export interface CompleteRequest {
  instanceId: string;
  progress?: number;
  stepsDone?: boolean[];
  journalText?: string;
  useInspiration: boolean;
  share?: { text: string; mediaPaths: string[]; visibility: Visibility };
  /** Horodatage local (validations hors ligne) */
  clientCompletedAt?: string;
}

export interface UnlockedAchievement {
  id: string;
  name: string;
  description: string;
  xpBonus: number;
  titleUnlocked: string | null;
}

export interface CompleteResponse {
  xpAwarded: number;
  breakdown: { base: number; multiplier: number; mastery: number; affinity: number; doubled: boolean; total: number };
  duplicate: boolean;
  character: CharacterRecord;
  levelUps: number[];
  abilityUps: AbilityUp[];
  achievements: UnlockedAchievement[];
  pendingImprovements: number;
  pendingPath: boolean;
  inspirationGained: boolean;
  inspirationOverflow: boolean;
  streak: number;
  postId?: string;
}

export async function completeQuestAction(ctx: ServerContext, userId: string, req: CompleteRequest): Promise<Result<{ data: CompleteResponse }>> {
  const env = await loadEnv(ctx, userId);
  if (!env) return fail('no-character');
  const { store } = ctx;
  const inst = await store.getInstance(userId, req.instanceId);
  if (!inst) return fail('not-found');

  // Idempotence (RG-18) : une double validation est ignorée.
  if (inst.status === 'completed') {
    const streak = await streakInfo(store, userId, env.settings, env.today);
    return {
      ok: true,
      data: {
        xpAwarded: inst.xpAwarded,
        breakdown: { base: 0, multiplier: 0, mastery: 0, affinity: 0, doubled: inst.inspirationUsed, total: inst.xpAwarded },
        duplicate: true,
        character: env.character,
        levelUps: [],
        abilityUps: [],
        achievements: [],
        pendingImprovements: pendingImprovements(env.character.level, env.character.improvementsChosen),
        pendingPath: pendingPath(env.character.level, env.character.pathId),
        inspirationGained: false,
        inspirationOverflow: false,
        streak: streak.current,
      },
    };
  }

  // Date de la validation : l'heure du serveur fait foi (RG-03).
  let completedMs = env.nowMs;
  const offline = !!req.clientCompletedAt;
  if (offline) {
    const clientMs = Date.parse(req.clientCompletedAt!);
    if (Number.isNaN(clientMs)) return fail('invalid');
    if (env.nowMs - clientMs > OFFLINE_MAX_DELAY_MS) return fail('too-late', 'Cette validation hors ligne date de plus de 72 h et ne peut plus être enregistrée.');
    completedMs = Math.min(clientMs, env.nowMs);
  }
  const completedDay = gameDate(completedMs, env.settings.timezone, env.settings.resetHour);
  if (!isDateInRange(completedDay, inst.periodStart, inst.periodEnd)) {
    return fail('out-of-period', 'Cette quête n’est plus valable à cette date.');
  }
  const statusOk = inst.status === 'accepted' || (offline && inst.status === 'expired');
  if (!statusOk) return fail('not-accepted');

  const masteries = masteriesFor(env.character);
  const check = completeQuest({
    character: env.character,
    masteries,
    pathAbility: pathAbilityFor(env.character),
    instance: { ...inst, status: 'accepted' },
    useInspiration: req.useInspiration,
    progress: req.progress,
    stepsDone: req.stepsDone,
    journalText: req.journalText,
  });
  if (!check.ok) return fail(check.error as GameError);

  const res = check.result;
  const completedAtIso = new Date(completedMs).toISOString();
  const levelUps = [...res.levelsGained];
  const abilityUps = [...res.abilityUps];
  let character = mergeChar(env.character, res.character);
  const custom = (await store.listTemplates(userId)).some((t) => t.id === inst.templateId && t.source === 'custom');
  const events: XpEvent[] = splitXp(res.xpAwarded, inst.snapshot.ability, inst.snapshot.secondary).map((p) =>
    eventFor(ctx, { instanceId: inst.id, ability: p.ability, amount: p.amount, reason: 'quest', custom }, completedDay),
  );

  await store.updateInstance(userId, inst.id, {
    status: 'completed',
    progress: req.progress ?? inst.progress,
    stepsDone: req.stepsDone ?? inst.stepsDone,
    xpAwarded: res.xpAwarded,
    inspirationUsed: res.inspirationSpent,
    completedAt: completedAtIso,
  });
  if (req.journalText?.trim()) {
    await store.saveJournal(userId, { id: ctx.uuid(), instanceId: inst.id, text: req.journalText.trim(), createdAt: completedAtIso });
  }
  await store.insertXpEvents(userId, events);

  // Série et Inspiration (quêtes journalières).
  const prevStreak = character.streakCurrent;
  const streak = await streakInfo(store, userId, env.settings, env.today);
  let inspirationGained = false;
  let inspirationOverflow = false;
  character.streakCurrent = streak.current;
  character.streakBest = Math.max(character.streakBest, streak.best);
  if (inst.period === 'daily') {
    const g = inspirationAfterStreak(prevStreak, streak.current, character.inspiration);
    character.inspiration = g.inspiration;
    inspirationGained = g.gained;
    inspirationOverflow = g.overflow;
  }
  await store.saveCharacter(userId, character);

  // Trophées (peuvent en débloquer d'autres via le bonus d'XP : quelques passes).
  const unlockedNow: UnlockedAchievement[] = [];
  const already = new Set((await store.listUnlocked(userId)).map((u) => u.achievementId));
  for (let pass = 0; pass < 3; pass++) {
    const stats = await computePlayerStats(store, userId, character, env.settings);
    const fresh = newlyUnlocked(ACHIEVEMENTS, stats, already);
    if (!fresh.length) break;
    const bonusEvents: XpEvent[] = [];
    for (const a of fresh) {
      already.add(a.id);
      await store.unlockAchievement(userId, a.id, completedAtIso);
      unlockedNow.push({ id: a.id, name: a.name, description: a.description, xpBonus: a.xpBonus, titleUnlocked: a.titleUnlocked ?? null });
      if (a.xpBonus > 0) {
        bonusEvents.push(eventFor(ctx, { instanceId: inst.id, ability: inst.snapshot.ability, amount: a.xpBonus, reason: 'achievement' }, completedDay));
        const applied = applyXp(character, inst.snapshot.ability, a.xpBonus);
        character = mergeChar(character, applied.character);
        levelUps.push(...applied.levelsGained);
        abilityUps.push(...applied.abilityUps);
      }
      if (a.titleUnlocked && !character.titleEquipped) character.titleEquipped = a.titleUnlocked;
    }
    if (bonusEvents.length) await store.insertXpEvents(userId, bonusEvents);
    await store.saveCharacter(userId, character);
  }

  // Publications : partage choisi + événements automatiques.
  let postId: string | undefined;
  if (req.share) {
    postId = await store.createPost(userId, {
      type: 'quest',
      instanceId: inst.id,
      text: req.share.text.slice(0, 500),
      visibility: req.share.visibility,
      mediaPaths: req.share.mediaPaths.slice(0, 4),
      payload: { xp: res.xpAwarded },
    });
  }
  const autos: PostDraft[] = [];
  if (env.settings.autoShare.level && levelUps.length) {
    const top = Math.max(...levelUps);
    autos.push({ type: 'level_up', text: '', visibility: env.settings.defaultVisibility, mediaPaths: [], payload: { level: top } });
  }
  if (env.settings.autoShare.achievement) {
    for (const a of unlockedNow) {
      autos.push({ type: 'achievement', text: '', visibility: env.settings.defaultVisibility, mediaPaths: [], payload: { id: a.id, name: a.name, description: a.description } });
    }
  }
  if (env.settings.autoShare.streak && inst.period === 'daily' && STREAK_POSTS.includes(streak.current) && streak.current > prevStreak) {
    autos.push({ type: 'streak', text: '', visibility: env.settings.defaultVisibility, mediaPaths: [], payload: { days: streak.current } });
  }
  for (const d of autos) await store.createPost(userId, d);

  return {
    ok: true,
    data: {
      xpAwarded: res.xpAwarded,
      breakdown: res.breakdown,
      duplicate: false,
      character,
      levelUps: [...new Set(levelUps)].sort((a, b) => a - b),
      abilityUps,
      achievements: unlockedNow,
      pendingImprovements: pendingImprovements(character.level, character.improvementsChosen),
      pendingPath: pendingPath(character.level, character.pathId),
      inspirationGained,
      inspirationOverflow,
      streak: streak.current,
      postId,
    },
  };
}

/** Annulation d'une quête accomplie dans les 24 h : l'XP est retirée par un événement compensatoire. */
export async function undoQuest(ctx: ServerContext, userId: string, instanceId: string): Promise<Result<{ character: CharacterRecord; instance: QuestInstance }>> {
  const env = await loadEnv(ctx, userId);
  if (!env) return fail('no-character');
  const inst = await ctx.store.getInstance(userId, instanceId);
  if (!inst) return fail('not-found');
  if (inst.status !== 'completed' || !canUndo(inst.completedAt, env.nowMs)) return fail('cannot-undo', 'Cette quête ne peut plus être annulée (24 h maximum).');
  await ctx.store.insertXpEvents(
    userId,
    splitXp(inst.xpAwarded, inst.snapshot.ability, inst.snapshot.secondary).map((p) =>
      eventFor(ctx, { instanceId, ability: p.ability, amount: -p.amount, reason: 'undo' }, env.today),
    ),
  );
  const patch = { status: 'accepted' as const, xpAwarded: 0, inspirationUsed: false, completedAt: null };
  await ctx.store.updateInstance(userId, instanceId, patch);
  await ctx.store.detachPostsFromInstance(userId, instanceId);
  let character = env.character;
  if (inst.inspirationUsed) {
    character = { ...character, inspiration: Math.min(character.inspiration + 1, MAX_INSPIRATION) };
    await ctx.store.saveCharacter(userId, character);
  }
  const recomputed = (await recomputeCharacter(ctx, userId)) ?? character;
  return { ok: true, character: recomputed, instance: { ...inst, ...patch } };
}

// ───────────────────────── Choix de personnage ─────────────────────────

export async function choosePath(ctx: ServerContext, userId: string, pathId: string): Promise<Result<{ character: CharacterRecord }>> {
  const env = await loadEnv(ctx, userId);
  if (!env) return fail('no-character');
  if (env.character.level < PATH_LEVEL) return fail('level-too-low');
  if (env.character.pathId) return fail('nothing-pending');
  const cls = CLASSES.find((c) => c.id === env.character.classId);
  if (!cls?.paths.some((p) => p.id === pathId)) return fail('invalid');
  const character = { ...env.character, pathId };
  await ctx.store.saveCharacter(userId, character);
  return { ok: true, character };
}

export type ImprovementChoice = { plus2: AbilityId } | { plus1: [AbilityId, AbilityId] };

/** +2 à une caractéristique ou +1 à deux, sans dépasser 20 (RG-07). */
export async function chooseImprovement(ctx: ServerContext, userId: string, choice: ImprovementChoice): Promise<Result<{ character: CharacterRecord }>> {
  const env = await loadEnv(ctx, userId);
  if (!env) return fail('no-character');
  const c = env.character;
  if (pendingImprovements(c.level, c.improvementsChosen) < 1) return fail('nothing-pending');
  const add = emptyAbilityRecord(0);
  if ('plus2' in choice) add[choice.plus2] += 2;
  else {
    const [a, b] = choice.plus1;
    if (a === b) return fail('invalid', 'Choisis deux caractéristiques différentes.');
    add[a] += 1;
    add[b] += 1;
  }
  const scores = abilityScores(c);
  for (const a of ABILITIES) {
    if (add[a] && scores[a] + add[a] > SOFT_CAP_SCORE) return fail('invalid', 'Une caractéristique ne peut pas dépasser 20 par amélioration.');
  }
  const improvements = { ...c.improvements };
  for (const a of ABILITIES) improvements[a] += add[a];
  const character = { ...c, improvements, improvementsChosen: c.improvementsChosen + 1 };
  await ctx.store.saveCharacter(userId, character);
  return { ok: true, character };
}

export async function declareRest(ctx: ServerContext, userId: string): Promise<Result<{ day: string }>> {
  const env = await loadEnv(ctx, userId);
  if (!env) return fail('no-character');
  const rest = await ctx.store.listRestDays(userId);
  if (rest.includes(env.today) || !canDeclareRest(rest, env.today)) return fail('rest-unavailable', 'Tu as déjà utilisé ton jour de repos cette semaine.');
  await ctx.store.addRestDay(userId, env.today);
  const streak = await streakInfo(ctx.store, userId, env.settings, env.today);
  await ctx.store.saveCharacter(userId, { ...env.character, streakCurrent: streak.current });
  return { ok: true, day: env.today };
}

export async function equipTitle(ctx: ServerContext, userId: string, title: string | null): Promise<Result<{ character: CharacterRecord }>> {
  const env = await loadEnv(ctx, userId);
  if (!env) return fail('no-character');
  if (title) {
    const unlocked = new Set((await ctx.store.listUnlocked(userId)).map((u) => u.achievementId));
    const owned = ACHIEVEMENTS.some((a) => unlocked.has(a.id) && a.titleUnlocked === title);
    if (!owned) return fail('forbidden', 'Ce titre n’est pas encore débloqué.');
  }
  const character = { ...env.character, titleEquipped: title };
  await ctx.store.saveCharacter(userId, character);
  return { ok: true, character };
}

export function canForge(level: number): boolean {
  return level >= FORGE_LEVEL;
}

export { abilityProgressOf, UNDO_WINDOW_MS };
export type { QuestPreference };
export function startOfWeek(date: string): string {
  return startOfIsoWeek(date);
}
