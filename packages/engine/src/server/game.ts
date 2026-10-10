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
import { nextTune, sanitizeInterests, tunableTarget, tunedSnapshot, type TuneDirection, type TuneLevel } from '../interests';
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
import { TRACK_RUNGS, advanceOnCompletion, applyMisses, effectiveRung, revertCompletion, rungTemplateId, trackShapes } from '../tracks';
import {
  ABILITIES,
  AbilityId,
  CharacterCore,
  Difficulty,
  MAX_ACTIVE_TRACKS,
  Period,
  PERIODS,
  QuestInstance,
  QuestOrigin,
  QuestPreference,
  QuestTemplate,
  TrackState,
  emptyAbilityRecord,
} from '../types';
import {
  FORGE_LEVEL,
  MAX_OPEN_EXTRAS,
  MAX_RUNS,
  SOFT_CAP_SCORE,
  abilityProgressOf,
  abilityScores,
  isValidPointBuy,
  levelFromXp,
  pendingImprovements,
  pendingPath,
  questCountFor,
  questLock,
  unlocksAt,
  PATH_LEVEL,
  splitXp,
  tierUnlocked,
  type XpPart,
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
/** Plafond des suggestions « Pour aller plus loin » par jour (le réglage « Propositions par jour » va de 0 à 6). */
export const MAX_FREE_QUESTS_PER_DAY = 4;

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
  | 'locked'
  | 'already-active'
  | 'run-limit'
  | 'too-many-open'
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
  /**
   * Cache de la commande en cours (l'Env est recréé à chaque commande, donc jamais périmé d'une commande à l'autre) :
   * le moteur n'écrit aucun gabarit, une seule lecture suffit pour toute la validation ou tout le passage de `ensureQuests`.
   */
  templates: { full?: Promise<QuestTemplate[]>; plain?: Promise<QuestTemplate[]> };
}

async function loadEnv(ctx: ServerContext, userId: string): Promise<Env | null> {
  const [character, settings] = await Promise.all([ctx.store.getCharacter(userId), ctx.store.getSettings(userId)]);
  if (!character) return null;
  const nowMs = ctx.now();
  return { ctx, userId, character, settings, nowMs, today: gameDate(nowMs, settings.timezone, settings.resetHour), templates: {} };
}

/**
 * Gabarits du joueur, lus au plus une fois par commande. `withRungs: false` (défaut : `true`) écarte les gabarits d'échelon
 * des parcours (lecture plus légère) ; une commande doit toujours demander la même variante pour ne lire qu'une fois.
 */
function loadTemplates(env: Env, withRungs = true): Promise<QuestTemplate[]> {
  const c = env.templates;
  if (withRungs) return (c.full ??= env.ctx.store.listTemplates(env.userId));
  if (c.full) return c.full.then((l) => l.filter((t) => !t.trackId));
  return (c.plain ??= env.ctx.store.listTemplates(env.userId, { withRungs: false }).then((l) => l.filter((t) => !t.trackId)));
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
  tune: number | undefined = 0,
  meta: { origin?: QuestOrigin; run?: number; trackId?: string; rung?: number } = {},
): QuestInstance {
  const snapshot = tunedSnapshot(snapshotOf(t), t.validation, (tune ?? 0) as TuneLevel);
  return {
    id,
    templateId: t.id,
    snapshot,
    period,
    periodStart: start,
    periodEnd: end,
    status,
    progress: 0,
    stepsDone: t.validation.type === 'steps' ? t.validation.steps.map(() => false) : undefined,
    xpAwarded: 0,
    inspirationUsed: false,
    free,
    run: meta.run ?? 1,
    origin: meta.origin ?? 'draw',
    ...(meta.trackId ? { trackId: meta.trackId, rung: meta.rung ?? null } : {}),
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
  /** Gabarits déjà lus par la commande (évite une relecture) ; sinon lus ici, sans les gabarits d'échelon. */
  knownTemplates?: readonly QuestTemplate[],
): Promise<PlayerStats> {
  const [completed, templates, rest, journal, social] = await Promise.all([
    store.listInstances(userId, { status: 'completed' }),
    knownTemplates ?? store.listTemplates(userId, { withRungs: false }),
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
  return evaluateAchievements(ACHIEVEMENTS, await computePlayerStats(ctx.store, userId, env.character, env.settings, await loadTemplates(env, false)));
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

/**
 * Série : un jour compte s'il contient au moins une quête de parcours validée. Sans aucun parcours actif,
 * repli sur l'ancienne règle (n'importe quelle quête journalière validée).
 * La règle « parcours » ne s'applique qu'à partir du premier démarrage de parcours (plus ancien `startedAt`, en jour de jeu) :
 * avant, l'ancienne règle vaut, pour qu'un joueur déjà en série ne retombe pas à 0 en activant un parcours.
 * La série record et l'Inspiration (calculées depuis ces jours) en héritent.
 */
async function streakInfo(store: GameStore, userId: string, settings: SettingsRecord, today: string) {
  const [daily, rest, tracks] = await Promise.all([
    store.listInstances(userId, { period: 'daily', status: 'completed', from: addDays(today, -800) }),
    store.listRestDays(userId),
    store.listTracks(userId),
  ]);
  const trackMode = tracks.some((t) => t.status === 'active');
  let trackRuleFrom: string | null = null;
  for (const t of tracks) {
    const ms = Date.parse(t.startedAt);
    if (Number.isNaN(ms)) continue;
    const d = gameDate(ms, settings.timezone, settings.resetHour);
    if (trackRuleFrom === null || d < trackRuleFrom) trackRuleFrom = d;
  }
  const days: string[] = [];
  for (const q of daily) {
    if (!q.completedAt) continue;
    const day = gameDate(Date.parse(q.completedAt), settings.timezone, settings.resetHour);
    if (!trackMode || q.origin === 'track' || (trackRuleFrom !== null && day < trackRuleFrom)) days.push(day);
  }
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
  /** @deprecated centres d'intérêt : remplacés par les parcours, enregistrés sans effet sur le tirage */
  interests?: string[];
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
  await ctx.store.saveSettings(userId, { ...defaultSettings(input.timezone), interests: sanitizeInterests(input.interests) });
  await ctx.store.saveCharacter(userId, character);
  await ensureQuests(ctx, userId);
  return { ok: true, character };
}

// ───────────────────────── Clôture et tirage ─────────────────────────

export interface EnsureResult {
  created: QuestInstance[];
  expired: QuestInstance[];
  levelUps: number[];
  /** Descentes d'échelon constatées pendant ce passage (absent s'il n'y en a pas) */
  demoted?: { trackId: string; from: number; to: number }[];
}

/**
 * Parcours « orphelin » : son état existe en base mais aucun gabarit d'échelon n'existe plus (contenu retiré).
 * Sans aucun gabarit de parcours (contenu absent ou pas encore déployé), on ne peut rien affirmer : personne n'est orphelin.
 */
const isOrphanTrack = (t: Pick<TrackState, 'trackId'>, shapes: ReadonlyMap<string, unknown>): boolean => shapes.size > 0 && !shapes.has(t.trackId);

/** Nombre de parcours actifs qui comptent pour la limite de `MAX_ACTIVE_TRACKS` (les orphelins ne comptent pas). */
const countActiveTracks = (tracks: readonly TrackState[], shapes: ReadonlyMap<string, unknown>): number =>
  tracks.filter((t) => t.status === 'active' && !isOrphanTrack(t, shapes)).length;

/**
 * Jours manqués et descentes de tous les parcours actifs (appelé avant tout le reste de `ensureQuests`).
 * Retourne les états à jour des parcours et les descentes d'échelon constatées.
 */
async function settleTracks(
  ctx: ServerContext,
  userId: string,
  today: string,
  tracks: TrackState[],
): Promise<{ tracks: TrackState[]; demoted: NonNullable<EnsureResult['demoted']> }> {
  const { store } = ctx;
  const yesterday = addDays(today, -1);
  const demoted: NonNullable<EnsureResult['demoted']> = [];
  const pending = tracks.filter((t) => t.status === 'active' && (!t.lastCheckedDate || t.lastCheckedDate < yesterday));
  if (!pending.length) return { tracks, demoted };
  const rest = await store.listRestDays(userId);
  const checked = pending.map((t) => t.lastCheckedDate).filter((d): d is string => !!d);
  const completed = checked.length
    ? await store.listInstances(userId, { period: 'daily', status: 'completed', from: addDays(checked.reduce((a, b) => (a < b ? a : b)), 1) })
    : [];
  const out: TrackState[] = [];
  for (const t of tracks) {
    if (!pending.includes(t)) {
      out.push(t);
      continue;
    }
    // Un parcours jamais pointé (état incomplet) démarre son suivi aujourd'hui : aucun jour manqué rétroactif.
    const next = t.lastCheckedDate
      ? applyMisses(
          t,
          today,
          rest,
          completed.filter((q) => q.trackId === t.trackId).map((q) => q.periodStart),
        ).state
      : { ...t, lastCheckedDate: today };
    if (next.rung !== t.rung || next.hits !== t.hits || next.lastCheckedDate !== t.lastCheckedDate) await store.saveTrack(userId, next);
    if (next.rung < t.rung) demoted.push({ trackId: t.trackId, from: t.rung, to: next.rung });
    out.push(next);
  }
  return { tracks: out, demoted };
}

/** Clôture les périodes passées (RG-01), règle les parcours, puis crée la quête du jour de chaque parcours et tire « Pour aller plus loin ». */
export async function ensureQuests(ctx: ServerContext, userId: string): Promise<EnsureResult> {
  const env = await loadEnv(ctx, userId);
  if (!env) return { created: [], expired: [], levelUps: [] };
  return ensureQuestsFor(env);
}

async function ensureQuestsFor(env: Env): Promise<EnsureResult> {
  const { ctx, userId, store } = { ...env, store: env.ctx.store };
  const result: EnsureResult = { created: [], expired: [], levelUps: [] };
  let { character } = env;
  const { settings, today } = env;
  const nowIso = new Date(env.nowMs).toISOString();
  const allTemplates = await loadTemplates(env);
  const shapes = trackShapes(allTemplates);

  // 0. Parcours orphelins nettoyés, puis jours manqués et descentes des parcours restants (avant tout).
  const stored = await store.listTracks(userId);
  const live: TrackState[] = [];
  for (const t of stored) {
    if (isOrphanTrack(t, shapes)) await store.deleteTrack(userId, t.trackId);
    else live.push(t);
  }
  const settled = await settleTracks(ctx, userId, today, live);
  const tracks = settled.tracks;
  if (settled.demoted.length) result.demoted = settled.demoted;

  // 1. Clôture des périodes passées : en cours → Expirée, avec XP au prorata pour un compteur ≥ 50 %.
  const open = await store.listInstances(userId, { status: ['proposed', 'accepted'] });
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
      }
    }
    await store.updateInstance(userId, inst.id, { status: 'expired', xpAwarded: xp });
    result.expired.push({ ...inst, status: 'expired', xpAwarded: xp });
  }
  if (events.length) await store.insertXpEvents(userId, events);

  // 2. Quête du jour de chaque parcours actif (absente → créée), avant le tirage.
  const templates = allTemplates;
  const [prefs, history] = await Promise.all([
    store.getPreferences(userId),
    store.listInstances(userId, { from: addDays(today, -400) }),
  ]);
  const scores = abilityScores(character);
  const toInsert: QuestInstance[] = [];
  const dayBounds = periodBounds('daily', today);
  for (const t of tracks) {
    if (t.status !== 'active') continue;
    const shape = shapes.get(t.trackId);
    if (!shape) continue;
    if (history.some((i) => i.trackId === t.trackId && i.period === 'daily' && i.periodStart === dayBounds.start)) continue;
    const rung = effectiveRung(shape, t, scores);
    const tpl = templates.find((x) => x.id === rungTemplateId(t.trackId, rung));
    if (!tpl) continue;
    // Pas de réglage « trop dur / trop facile » sur un échelon : la progression d'échelon le remplace.
    toInsert.push(newInstance(ctx.uuid(), tpl, 'daily', dayBounds.start, dayBounds.end, 'proposed', nowIso, false, 0, { origin: 'track', trackId: t.trackId, rung }));
  }

  // 3. « Pour aller plus loin » (quotidien) et quêtes hebdomadaires, mensuelles, épiques : tout est proposé, rien n'est accepté d'office.
  const u = unlocksAt(character.level);
  const periods: Period[] = ['daily', 'weekly', 'monthly'];
  if (u.epic) periods.push('epic');
  for (const period of periods) {
    const b = periodBounds(period, today);
    // Les quêtes choisies, refaites ou de parcours ne comptent pas comme un tirage : la période est tirée quand même.
    if (history.some((i) => i.period === period && i.periodStart === b.start && (i.origin ?? 'draw') === 'draw')) continue;
    const already = history.filter((i) => i.period === period && i.periodStart === b.start).map((i) => i.templateId);
    const base = {
      characterId: character.id,
      period,
      periodStart: b.start,
      level: character.level,
      scores,
      templates,
      preferences: prefs,
      lastDrawn: lastDrawnMap(history, period),
    };
    if (period === 'daily') {
      // « Propositions par jour » : nombre de suggestions facultatives (0 = mode manuel, aucune).
      const freeCount = Math.min(Math.max(Math.trunc(settings.dailyQuestCount) || 0, 0), MAX_FREE_QUESTS_PER_DAY);
      if (freeCount === 0) continue;
      // Les quêtes épinglées reviennent chaque jour, en proposition.
      const pinned = templates.filter(
        (t) =>
          !t.trackId &&
          t.isActive !== false &&
          prefs[t.id]?.isPinned &&
          !prefs[t.id]?.isExcluded &&
          t.periods.includes('daily') &&
          !already.includes(t.id) &&
          tierUnlocked(t.difficulty, scores[t.ability], character.level),
      );
      for (const t of pinned) toInsert.push(newInstance(ctx.uuid(), t, period, b.start, b.end, 'proposed', nowIso, true, prefs[t.id]?.tune));
      const more = drawQuests({
        ...base,
        count: freeCount,
        difficultyPlan: Array.from({ length: freeCount }, (_, i): Difficulty => (i % 2 === 0 ? 'medium' : 'high')),
        exclude: [...already, ...pinned.map((t) => t.id)],
        seedSuffix: 'free',
        skipPinned: true,
      });
      for (const t of more.picks) toInsert.push(newInstance(ctx.uuid(), t, period, b.start, b.end, 'proposed', nowIso, true, prefs[t.id]?.tune));
      continue;
    }
    const count = questCountFor(period, character.level);
    if (count <= 0) continue;
    const main = drawQuests({ ...base, count, exclude: already });
    for (const t of main.picks) toInsert.push(newInstance(ctx.uuid(), t, period, b.start, b.end, 'proposed', nowIso, false, prefs[t.id]?.tune));
  }
  if (toInsert.length) await store.insertInstances(userId, toInsert);
  result.created = toInsert;

  // 4. La série peut avoir été cassée par les jours manqués.
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
  if (inst.origin === 'track') return fail('invalid', 'Mets le parcours en pause plutôt que d’abandonner sa quête.');
  // Plus de pénalité Hardcore : abandonner une quête ne coûte pas d'XP.
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

/**
 * Démarre une quête de la période en cours, hors quota : choisie dans le catalogue ou refaite.
 * Une même quête peut revenir plusieurs fois dans la période (XP dégressive, voir MAX_RUNS et REPEAT_FACTORS).
 */
async function startFromTemplate(env: Env, t: QuestTemplate, period: Period): Promise<Result<{ instance: QuestInstance }>> {
  const { ctx, userId, character } = env;
  if (!PERIODS.includes(period) || !t.periods.includes(period)) return fail('invalid', 'Cette quête ne se fait pas sur cette période.');
  if (period === 'epic' && !unlocksAt(character.level).epic) return fail('level-too-low', 'Les quêtes épiques s’ouvrent au niveau 11.');
  const lock = questLock(t.difficulty, abilityScores(character)[t.ability], character.level);
  if (lock.locked) return fail('locked', lock.reason);
  const b = periodBounds(period, env.today);
  if (env.today > lastAcceptDate(period, b.start, b.end)) return fail('too-late-to-accept', 'Il est trop tard pour démarrer cette quête.');

  const inPeriod = await ctx.store.listInstances(userId, { period, from: b.start, to: b.start });
  const same = inPeriod.filter((i) => i.templateId === t.id);
  if (same.some((i) => i.status === 'accepted')) return fail('already-active', 'Cette quête est déjà en cours.');
  const nowIso = new Date(env.nowMs).toISOString();

  // Une proposition du tirage : on l'accepte au lieu d'en créer une seconde.
  const proposed = same.find((i) => i.status === 'proposed');
  if (proposed) {
    const patch = { status: 'accepted' as const, acceptedAt: nowIso };
    await ctx.store.updateInstance(userId, proposed.id, patch);
    return { ok: true, instance: { ...proposed, ...patch } };
  }

  if (same.filter((i) => i.status === 'completed').length >= MAX_RUNS[period]) {
    return fail('run-limit', period === 'daily' ? 'Tu as déjà refait cette quête trois fois aujourd’hui.' : 'Cette quête a déjà été faite le maximum de fois sur cette période.');
  }
  const openExtras = inPeriod.filter((i) => i.status === 'accepted' && (i.free || (i.origin ?? 'draw') !== 'draw')).length;
  if (openExtras >= MAX_OPEN_EXTRAS[period]) return fail('too-many-open', 'Trop de quêtes en cours : termine-en une avant d’en ajouter.');

  const run = same.reduce((n, i) => Math.max(n, i.run ?? 1), 0) + 1;
  const prefs = await ctx.store.getPreferences(userId);
  const inst = newInstance(ctx.uuid(), t, period, b.start, b.end, 'accepted', nowIso, true, prefs[t.id]?.tune, { origin: same.length ? 'redo' : 'chosen', run });
  await ctx.store.insertInstances(userId, [inst]);
  return { ok: true, instance: inst };
}

/** Ajoute une quête du catalogue (ou perso) aux quêtes de la période, acceptée tout de suite. */
export async function startQuest(ctx: ServerContext, userId: string, input: { templateId: string; period: Period }): Promise<Result<{ instance: QuestInstance }>> {
  const env = await loadEnv(ctx, userId);
  if (!env) return fail('no-character');
  // Les gabarits d'échelon n'existent que par leur parcours : jamais lançables par le chemin libre.
  const t = (await loadTemplates(env, false)).find((x) => x.id === input.templateId && x.isActive !== false && !x.trackId);
  if (!t) return fail('not-found');
  return startFromTemplate(env, t, input.period);
}

/** Refait une quête déjà terminée (ou abandonnée, expirée) dans la période en cours. */
export async function redoQuest(ctx: ServerContext, userId: string, instanceId: string): Promise<Result<{ instance: QuestInstance }>> {
  const env = await loadEnv(ctx, userId);
  if (!env) return fail('no-character');
  const inst = await ctx.store.getInstance(userId, instanceId);
  if (!inst) return fail('not-found');
  if (inst.status === 'proposed' || inst.status === 'accepted') return fail('already-active', 'Cette quête est déjà en cours.');
  if (inst.trackId) return fail('invalid', 'Une quête de parcours ne se refait pas : elle revient chaque jour.');
  const t = (await loadTemplates(env, false)).find((x) => x.id === inst.templateId && x.isActive !== false && !x.trackId);
  if (!t) return fail('not-found', 'Cette quête n’existe plus dans le catalogue.');
  return startFromTemplate(env, t, inst.period);
}

/** Relance : 1 gratuite par jour de jeu, puis 1 Inspiration. */
export async function rerollQuest(ctx: ServerContext, userId: string, instanceId: string): Promise<Result<{ instance: QuestInstance; usedInspiration: boolean }>> {
  const env = await loadEnv(ctx, userId);
  if (!env) return fail('no-character');
  const inst = await ctx.store.getInstance(userId, instanceId);
  if (!inst) return fail('not-found');
  if (inst.status === 'completed' || inst.status === 'expired' || inst.status === 'abandoned') return fail('not-accepted');
  if (inst.progress > 0) return fail('invalid', 'Une quête déjà entamée ne peut pas être relancée.');
  if ((inst.origin ?? 'draw') !== 'draw') return fail('invalid', 'Seules les quêtes tirées peuvent être relancées.');
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
    loadTemplates(env, false),
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
  const fresh = newInstance(ctx.uuid(), t, inst.period, inst.periodStart, inst.periodEnd, inst.status, new Date(env.nowMs).toISOString(), inst.free, prefs[t.id]?.tune);
  await ctx.store.deleteInstance(userId, instanceId);
  await ctx.store.insertInstances(userId, [fresh]);
  await ctx.store.saveCharacter(userId, character);
  return { ok: true, instance: fresh, usedInspiration };
}

/**
 * « Trop dur » / « trop facile » : réduit ou augmente la cible d'une quête à compteur ou à minuteur.
 * L'XP suit l'effort demandé, et le choix est mémorisé pour les prochaines fois où la quête sera tirée.
 */
export async function tuneQuest(
  ctx: ServerContext,
  userId: string,
  instanceId: string,
  direction: TuneDirection,
): Promise<Result<{ instance: QuestInstance }>> {
  const inst = await ctx.store.getInstance(userId, instanceId);
  if (!inst) return fail('not-found');
  if (inst.status !== 'proposed' && inst.status !== 'accepted') return fail('not-accepted');
  // La progression d'échelon remplace ce réglage : « trop dur » casserait le seuil de montée, « trop facile » n'a plus de sens.
  if (inst.origin === 'track') return fail('invalid', 'L’exigence d’une quête de parcours suit ton échelon : elle ne se règle pas.');
  const template = (await ctx.store.listTemplates(userId, { withRungs: false })).find((t) => t.id === inst.templateId);
  const base = template?.validation;
  if (!base || tunableTarget(base) === null) return fail('invalid', 'Cette quête ne peut pas être ajustée.');
  const next = nextTune(inst.snapshot.tune, base, direction);
  if (next === null) return fail('invalid', direction === 'easier' ? 'Cette quête est déjà au plus facile.' : 'Cette quête est déjà au plus difficile.');
  const { tune: _t, baseTarget: _b, ...plain } = inst.snapshot;
  const snapshot = tunedSnapshot(plain, base, next);
  const target = tunableTarget(snapshot.validation) ?? 0;
  const progress = Math.min(inst.progress, target);
  await ctx.store.updateInstance(userId, instanceId, { snapshot, progress });
  const prefs = await ctx.store.getPreferences(userId);
  await ctx.store.savePreference(userId, { ...(prefs[inst.templateId] ?? { templateId: inst.templateId }), tune: next });
  return { ok: true, instance: { ...inst, snapshot, progress } };
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
  /** XP réellement versée au total (somme des événements d'XP, après équilibrage des caractéristiques) */
  xpAwarded: number;
  /** Détail du calcul de base : `breakdown.total` est le montant AVANT équilibrage (`xpAwarded` après) */
  breakdown: { base: number; multiplier: number; mastery: number; affinity: number; doubled: boolean; repeat?: number; total: number };
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
  /** Quête de parcours : état du parcours après la validation (montée d'échelon incluse) */
  track?: TrackState;
  trackPromoted?: boolean;
  /**
   * Équilibrage des caractéristiques : une entrée par caractéristique dont l'XP a été modifiée
   * (facteur 1,5 en rattrapage ; 0,75 ou 0,5 en spécialisation). Absent quand aucune part n'est touchée.
   */
  balance?: { ability: AbilityId; factor: number; base: number; awarded: number }[];
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
  // La quête du jour d'un parcours peut être validée sans passer par « Accepter ».
  const statusOk = inst.status === 'accepted' || (inst.status === 'proposed' && inst.origin === 'track') || (offline && inst.status === 'expired');
  if (!statusOk) return fail('not-accepted');

  // Parcours : état avant validation. Un jour déjà réglé par `settleTracks` (compté manqué, descente éventuelle) ne se rattrape pas
  // hors ligne, sinon il serait compté deux fois. Le jour de démarrage n'est jamais évalué : il reste validable.
  const trackBefore = inst.trackId ? (await store.listTracks(userId)).find((t) => t.trackId === inst.trackId) : undefined;
  if (offline && inst.status === 'expired' && trackBefore?.status === 'active' && trackBefore.lastCheckedDate && inst.periodStart <= trackBefore.lastCheckedDate) {
    const startMs = Date.parse(trackBefore.startedAt);
    const startDay = Number.isNaN(startMs) ? null : gameDate(startMs, env.settings.timezone, env.settings.resetHour);
    if (inst.periodStart !== startDay) {
      return fail('too-late', 'Ce jour est déjà réglé pour ce parcours : cette validation hors ligne ne peut plus être enregistrée.');
    }
  }

  // XP dégressive quand la même quête a déjà été accomplie dans la période.
  const siblings = await store.listInstances(userId, { period: inst.period, from: inst.periodStart, to: inst.periodStart });
  const repeat = siblings.filter((i) => i.templateId === inst.templateId && i.id !== inst.id && i.status === 'completed').length;
  const masteries = masteriesFor(env.character);
  const check = completeQuest({
    character: env.character,
    masteries,
    pathAbility: pathAbilityFor(env.character),
    instance: { ...inst, status: 'accepted' },
    useInspiration: req.useInspiration,
    repeat,
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
  // Une seule lecture des gabarits pour toute la validation (échelon max, XP, trophées) ; ceux d'échelon seulement pour un parcours.
  const templates = await loadTemplates(env, !!inst.trackId);
  const custom = templates.some((t) => t.id === inst.templateId && t.source === 'custom');
  // Les événements enregistrent les montants réellement versés (après équilibrage) : l'annulation les rejoue tels quels.
  const events: XpEvent[] = res.parts.map((p) =>
    eventFor(ctx, { instanceId: inst.id, ability: p.ability, amount: p.amount, reason: 'quest', custom }, completedDay),
  );

  // Parcours : un jour validé de plus, voire une montée d'échelon. Le jour retenu est celui de la quête (bornée à sa période).
  let trackUpdate: { state: TrackState; promoted: boolean } | undefined;
  let snapshot = inst.snapshot;
  if (trackBefore) {
    const maxRung = trackShapes(templates).get(inst.trackId!)?.rungs.length ?? TRACK_RUNGS;
    const after = advanceOnCompletion(trackBefore, inst.periodStart, maxRung);
    trackUpdate = { state: after, promoted: after.rung > trackBefore.rung };
    // On mémorise l'état d'avant seulement si la validation a réellement fait avancer le parcours (garde-fou de l'annulation).
    if (after !== trackBefore) {
      const { rung, hits, bestRung, lastDoneDate } = trackBefore;
      snapshot = { ...inst.snapshot, trackBefore: { rung, hits, bestRung, lastDoneDate } };
    }
  }

  await store.updateInstance(userId, inst.id, {
    status: 'completed',
    ...(snapshot !== inst.snapshot ? { snapshot } : {}),
    progress: req.progress ?? inst.progress,
    stepsDone: req.stepsDone ?? inst.stepsDone,
    xpAwarded: res.xpAwarded,
    inspirationUsed: res.inspirationSpent,
    completedAt: completedAtIso,
    ...(inst.acceptedAt ? {} : { acceptedAt: completedAtIso }),
  });
  if (req.journalText?.trim()) {
    await store.saveJournal(userId, { id: ctx.uuid(), instanceId: inst.id, text: req.journalText.trim(), createdAt: completedAtIso });
  }
  await store.insertXpEvents(userId, events);

  if (trackBefore && trackUpdate && trackUpdate.state !== trackBefore) await store.saveTrack(userId, trackUpdate.state);

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
    const stats = await computePlayerStats(store, userId, character, env.settings, templates);
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
      ...(res.balance.length ? { balance: res.balance } : {}),
      ...(trackUpdate ? { track: trackUpdate.state, trackPromoted: trackUpdate.promoted } : {}),
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
  // L'équilibrage rend les parts non déductibles de `xpAwarded` : on retire exactement ce que les événements de
  // cette quête ont versé (validations moins annulations déjà passées, trophées exclus).
  const paid = emptyAbilityRecord(0);
  let hasEvents = false;
  for (const e of await ctx.store.listXpEvents(userId)) {
    if (e.instanceId !== instanceId || (e.reason !== 'quest' && e.reason !== 'undo')) continue;
    paid[e.ability] += e.amount;
    hasEvents = true;
  }
  const undoParts: XpPart[] = hasEvents
    ? ABILITIES.filter((a) => paid[a] !== 0).map((a) => ({ ability: a, amount: paid[a] }))
    : splitXp(inst.xpAwarded, inst.snapshot.ability, inst.snapshot.secondary);
  await ctx.store.insertXpEvents(
    userId,
    undoParts.map((p) => eventFor(ctx, { instanceId, ability: p.ability, amount: -p.amount, reason: 'undo' }, env.today)),
  );
  // Le snapshot garde la trace de ce que la validation a compté dans le parcours : on la retire avec la validation.
  const { trackBefore: counted, ...plainSnapshot } = inst.snapshot;
  const patch = { status: 'accepted' as const, xpAwarded: 0, inspirationUsed: false, completedAt: null, ...(counted ? { snapshot: plainSnapshot } : {}) };
  await ctx.store.updateInstance(userId, instanceId, patch);
  await ctx.store.detachPostsFromInstance(userId, instanceId);
  if (inst.trackId && counted) {
    // Seule une validation qui a réellement fait avancer le parcours se défait (pas celle d'un parcours en pause ou sans état).
    const track = (await ctx.store.listTracks(userId)).find((t) => t.trackId === inst.trackId);
    if (track) {
      const maxRung = trackShapes(await loadTemplates(env)).get(inst.trackId)?.rungs.length ?? TRACK_RUNGS;
      const expected = advanceOnCompletion({ ...track, ...counted, status: 'active' }, inst.periodStart, maxRung);
      const untouched = track.rung === expected.rung && track.hits === expected.hits && track.bestRung === expected.bestRung && track.lastDoneDate === expected.lastDoneDate;
      if (untouched) {
        // Le parcours n'a pas bougé depuis : retour exact à l'état d'avant (y compris au dernier échelon où `hits` plafonne).
        await ctx.store.saveTrack(userId, { ...track, ...counted });
      } else {
        const others = await ctx.store.listInstances(userId, { period: 'daily', status: 'completed', from: addDays(env.today, -60) });
        const previous = others.filter((q) => q.trackId === inst.trackId && q.id !== inst.id).map((q) => q.periodStart).sort().pop() ?? null;
        await ctx.store.saveTrack(userId, revertCompletion(track, inst.periodStart, previous));
      }
    }
  }
  let character = env.character;
  if (inst.inspirationUsed) {
    character = { ...character, inspiration: Math.min(character.inspiration + 1, MAX_INSPIRATION) };
    await ctx.store.saveCharacter(userId, character);
  }
  const recomputed = (await recomputeCharacter(ctx, userId)) ?? character;
  return { ok: true, character: recomputed, instance: { ...inst, ...patch } };
}

// ───────────────────────── Parcours de discipline ─────────────────────────

/**
 * Active un parcours (échelon 1). Les parcours existants sont déduits des gabarits d'échelon (`{trackId}-r{NN}`) du store.
 * Erreurs : no-character, not-found (parcours inconnu), already-active (état déjà présent, y compris en pause :
 * utiliser `setTrackPaused`), too-many-open (déjà `MAX_ACTIVE_TRACKS` parcours actifs).
 * Le jour du démarrage n'est jamais compté comme manqué ; la quête du jour est créée tout de suite.
 */
export async function startTrack(ctx: ServerContext, userId: string, input: { trackId: string }): Promise<Result<{ track: TrackState }>> {
  const env = await loadEnv(ctx, userId);
  if (!env) return fail('no-character');
  const shapes = trackShapes(await loadTemplates(env));
  if (!shapes.has(input.trackId)) return fail('not-found', 'Parcours inconnu.');
  const refusal = (tracks: readonly TrackState[]) =>
    tracks.some((t) => t.trackId === input.trackId)
      ? fail('already-active', 'Ce parcours est déjà suivi.')
      : countActiveTracks(tracks, shapes) >= MAX_ACTIVE_TRACKS
        ? fail('too-many-open', `Tu peux suivre ${MAX_ACTIVE_TRACKS} parcours à la fois : mets-en un en pause ou arrête-en un.`)
        : null;
  const first = refusal(await ctx.store.listTracks(userId));
  if (first) return first;
  const track: TrackState = {
    trackId: input.trackId,
    status: 'active',
    rung: 1,
    hits: 0,
    lastDoneDate: null,
    lastCheckedDate: env.today,
    bestRung: 1,
    startedAt: new Date(env.nowMs).toISOString(),
  };
  // Pas de contrainte en base : on relit l'état juste avant d'écrire pour ne pas dépasser la limite sur deux appels concurrents.
  const again = refusal(await ctx.store.listTracks(userId));
  if (again) return again;
  await ctx.store.saveTrack(userId, track);
  await ensureQuestsFor(env);
  return { ok: true, track };
}

/**
 * Met un parcours en pause (échelon gelé, aucun jour manqué) ou le reprend (le suivi des jours repart d'aujourd'hui).
 * Reprendre demande une place parmi les `MAX_ACTIVE_TRACKS` parcours actifs (sinon too-many-open).
 */
export async function setTrackPaused(ctx: ServerContext, userId: string, input: { trackId: string; paused: boolean }): Promise<Result<{ track: TrackState }>> {
  const env = await loadEnv(ctx, userId);
  if (!env) return fail('no-character');
  const tracks = await ctx.store.listTracks(userId);
  const current = tracks.find((t) => t.trackId === input.trackId);
  if (!current) return fail('not-found', 'Parcours inconnu.');
  if (input.paused === (current.status === 'paused')) return { ok: true, track: current };
  const resumeRefused = async (list: readonly TrackState[]) => {
    if (input.paused) return null;
    return countActiveTracks(list, trackShapes(await loadTemplates(env))) >= MAX_ACTIVE_TRACKS
      ? fail('too-many-open', `Tu peux suivre ${MAX_ACTIVE_TRACKS} parcours à la fois : mets-en un en pause ou arrête-en un.`)
      : null;
  };
  const first = await resumeRefused(tracks);
  if (first) return first;
  // Pas de contrainte en base : on relit l'état juste avant d'écrire.
  const fresh = input.paused ? tracks : await ctx.store.listTracks(userId);
  const again = await resumeRefused(fresh);
  if (again) return again;
  const track: TrackState = input.paused ? { ...current, status: 'paused' } : { ...current, status: 'active', lastCheckedDate: env.today };
  await ctx.store.saveTrack(userId, track);
  if (!input.paused) await ensureQuestsFor(env);
  return { ok: true, track };
}

/** Arrête un parcours : l'état est supprimé, les quêtes passées restent. */
export async function stopTrack(ctx: ServerContext, userId: string, input: { trackId: string }): Promise<Result<{ trackId: string }>> {
  const env = await loadEnv(ctx, userId);
  if (!env) return fail('no-character');
  if (!(await ctx.store.listTracks(userId)).some((t) => t.trackId === input.trackId)) return fail('not-found', 'Parcours inconnu.');
  await ctx.store.deleteTrack(userId, input.trackId);
  // La quête du jour encore « proposée » n'a plus de parcours : on la retire (une quête validée ou entamée reste), pour qu'un
  // redémarrage le même jour recrée la bonne quête de l'échelon 1.
  const stale = await ctx.store.listInstances(userId, { period: 'daily', status: 'proposed', from: env.today, to: env.today });
  for (const q of stale) if (q.origin === 'track' && q.trackId === input.trackId) await ctx.store.deleteInstance(userId, q.id);
  return { ok: true, trackId: input.trackId };
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
