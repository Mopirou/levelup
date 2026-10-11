import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import { citext } from '@electric-sql/pglite/contrib/citext';
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  SupabaseStore,
  abilityScores,
  achievementProgress,
  acceptQuest,
  chooseImprovement,
  claimExpedition,
  createRaidTeam,
  encourageRaid,
  getRaidState,
  inviteToRaid,
  joinRaidTeam,
  leaveRaidTeam,
  raidMaxHp,
  completeQuestAction,
  dismantleItem,
  equipItem,
  getAdventureState,
  getSeasonState,
  listDungeons,
  mergeChests,
  mergeItems,
  openChest,
  runDungeon,
  unequipSlot,
  upgradeItem,
  createCharacter,
  declareRest,
  ensureQuests,
  recomputeCharacter,
  redoQuest,
  rerollQuest,
  setTrackPaused,
  startTrack,
  stopTrack,
  startQuest,
  undoQuest,
  tuneQuest,
  updateProgress,
  type QuestInstance,
  type ServerContext,
} from '../../packages/engine/src';
import { fakeSupabase } from './fake-supabase';

/**
 * Vérifie que la logique de jeu (la même que celle des Edge Functions) tourne avec l'adaptateur SupabaseStore
 * contre le vrai schéma SQL : noms de colonnes, contraintes, index uniques, triggers.
 */
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (f: string) => readFileSync(join(root, f), 'utf8');

const PLATFORM = `
create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;
create schema extensions; create schema auth; create schema storage;
grant usage on schema public, extensions, auth, storage to anon, authenticated, service_role;
alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
create table auth.users (id uuid primary key default gen_random_uuid(), email text, raw_user_meta_data jsonb default '{}');
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
create table storage.buckets (id text primary key, name text, public boolean, file_size_limit bigint, allowed_mime_types text[]);
create table storage.objects (id uuid primary key default gen_random_uuid(), bucket_id text, name text, owner uuid);
alter table storage.objects enable row level security;
grant all on storage.objects, storage.buckets to authenticated, service_role;
create function storage.foldername(name text) returns text[] language sql immutable as $$
  select (string_to_array(name, '/'))[1:greatest(array_length(string_to_array(name, '/'), 1) - 1, 0)] $$;
create publication supabase_realtime;
`;

// Parcours de test : le premier parcours de Force (la Force du personnage de test est au-dessus de la moyenne, sans effet d'équilibrage).
const defs = JSON.parse(readFileSync(join(root, '..', 'packages/content/data/tracks.fr.json'), 'utf8')) as {
  id: string;
  theme: string;
  ability: string;
  secondary: unknown[];
  rungs: { rung: number; title: string; objective: string; tips: string[]; validation: unknown; difficulty: string }[];
}[];
const def = defs.find((d) => d.ability === 'FOR') ?? defs[0];

let pg: PGlite;
let firstXp = 0;
const U = '00000000-0000-0000-0000-0000000000a1';

function setup(startIso: string) {
  let nowMs = Date.parse(startIso);
  const store = new SupabaseStore(fakeSupabase(pg));
  const ctx: ServerContext = { store: store as never, now: () => nowMs, uuid: () => crypto.randomUUID() };
  return { store: store as any, ctx, setNow: (iso: string) => (nowMs = Date.parse(iso)) };
}

const input = {
  name: 'Aldric',
  classId: 'eclaireur',
  scores: { FOR: 5, DEX: 2, CON: 5, INT: 2, SAG: 2, CHA: 2 },
  portraitId: 'p03',
  frameColor: '#2f5a47',
  motto: 'Un pas après l’autre',
  oath: 'Pour retrouver de l’énergie',
  timezone: 'Europe/Paris',
};

const complete = (s: ReturnType<typeof setup>, q: QuestInstance, extra: Record<string, unknown> = {}) => {
  const v = q.snapshot.validation;
  return completeQuestAction(s.ctx, U, {
    instanceId: q.id,
    useInspiration: false,
    progress: v.type === 'counter' ? v.target : v.type === 'timer' ? v.minutes : undefined,
    stepsDone: v.type === 'steps' ? v.steps.map(() => true) : undefined,
    journalText: v.type === 'journal' ? 'x'.repeat(60) : undefined,
    ...extra,
  });
};

beforeAll(async () => {
  pg = await PGlite.create({ extensions: { citext, pgcrypto } });
  await pg.exec(PLATFORM);
  for (const f of ['20261008000001_schema.sql', '20261008000002_security.sql', '20261008000003_cron.sql', '20261008000004_friend_code.sql', '20261009000001_quest_themes.sql', '20261009000002_interests_and_tuning.sql', '20261009000003_rescale_base_scores.sql', '20261010000001_quest_runs.sql', '20261011000001_tracks.sql', '20261011000002_free_quest_default.sql', '20261012000001_adventure.sql', '20261013000001_raids.sql', '20261014000001_seasons.sql', '20261015000001_daily_chest.sql']) await pg.exec(read(`migrations/${f}`));
  await pg.exec(read('seed.sql'));
  await pg.query(`insert into auth.users (id, email, raw_user_meta_data) values ($1, 'a@ex.fr', '{"username":"aldric","birth_year":1994}')`, [U]);
}, 120_000);

afterAll(async () => {
  await pg?.close();
});

describe('logique de jeu sur le vrai schéma (adaptateur SupabaseStore)', () => {
  it('crée le personnage, les réglages et tire les premières quêtes', async () => {
    const s = setup('2026-10-05T09:00:00+02:00');
    const r = await createCharacter(s.ctx, U, input);
    expect(r.ok).toBe(true);
    const c = (await s.store.getCharacter(U))!;
    expect(c).toMatchObject({ name: 'Aldric', classId: 'eclaireur', level: 1, totalXp: 0, oath: input.oath, portraitId: 'p03' });
    expect(abilityScores(c).FOR).toBe(5);
    const settings = await s.store.getSettings(U);
    expect(settings).toMatchObject({ resetHour: 4, timezone: 'Europe/Paris', hardcore: false });
    const inst = await s.store.listInstances(U);
    // plus de quête du jour imposée : sans parcours actif, seulement « Pour aller plus loin » (facultatif) et les périodes longues, tout en « proposée »
    expect(inst.filter((i: QuestInstance) => i.period === 'daily' && !i.free)).toHaveLength(0);
    expect(inst.filter((i: QuestInstance) => i.origin === 'track')).toHaveLength(0);
    expect(inst.filter((i: QuestInstance) => i.free && i.period === 'daily')).toHaveLength(2);
    expect(inst.filter((i: QuestInstance) => i.period === 'weekly')).toHaveLength(2);
    expect(inst.filter((i: QuestInstance) => i.period === 'monthly')).toHaveLength(1);
    expect(inst.every((i: QuestInstance) => i.status === 'proposed')).toBe(true);
    // dates au format PostgREST, instantanés au format ISO
    expect(inst[0].periodStart).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(inst.every((i: QuestInstance) => i.snapshot.title && i.templateId)).toBe(true);
  });

  it('le tirage est idempotent (index unique sur profil, quête, période)', async () => {
    const s = setup('2026-10-05T09:30:00+02:00');
    const before = (await s.store.listInstances(U)).length;
    await ensureQuests(s.ctx, U);
    await ensureQuests(s.ctx, U);
    expect((await s.store.listInstances(U)).length).toBe(before);
  });

  it('valide une quête : instance, registre d’XP, personnage, trophée, publication avec photo', async () => {
    const s = setup('2026-10-05T10:00:00+02:00');
    // la quête du jour d'un parcours se valide directement depuis « proposée »
    expect((await startTrack(s.ctx, U, { trackId: def.id })).ok).toBe(true);
    const q = (await s.store.listInstances(U, { period: 'daily' })).find((i: QuestInstance) => i.origin === 'track')!;
    expect(q).toMatchObject({ status: 'proposed', trackId: def.id, rung: 1 });
    const r = await complete(s, q, { share: { text: 'Une pause au grand air 🌿', mediaPaths: [`${U}/a.webp`], visibility: 'friends' } });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    firstXp = r.data.xpAwarded;
    expect(firstXp).toBeGreaterThanOrEqual(10); // 10 de base (+10 si la caractéristique est maîtrisée par la classe)
    expect(r.data.achievements.map((a) => a.id)).toContain('premier-pas');
    const c = (await s.store.getCharacter(U))!;
    expect(c.totalXp).toBe(r.data.character.totalXp);
    expect(c.streakCurrent).toBe(1);
    expect((await s.store.listTracks(U)).find((t: { trackId: string }) => t.trackId === def.id)).toMatchObject({ hits: 1, lastDoneDate: '2026-10-05' });
    const events = await s.store.listXpEvents(U);
    // une quête guidée verse son XP sur plusieurs caractéristiques : un événement par caractéristique
    expect([...new Set(events.map((e: { reason: string }) => e.reason))].sort()).toEqual(['achievement', 'quest']);
    expect(events.filter((e: { reason: string }) => e.reason === 'quest').reduce((n: number, e: { amount: number }) => n + e.amount, 0)).toBe(firstXp);
    expect(events[0].gameDate).toBe('2026-10-05');
    expect((await s.store.listUnlocked(U)).map((u: { achievementId: string }) => u.achievementId)).toContain('premier-pas');
    const posts = (await pg.query(`select type, text, visibility from posts where author_id = $1 order by type`, [U])).rows as { type: string; text: string }[];
    // la publication choisie + une carte automatique par trophée débloqué (partage automatique activé par défaut)
    expect(posts.filter((p) => p.type === 'quest')).toEqual([{ type: 'quest', text: 'Une pause au grand air 🌿', visibility: 'friends' }]);
    expect(posts.filter((p) => p.type === 'achievement')).toHaveLength(r.data.achievements.length);
    expect(((await pg.query(`select storage_path from post_media`)).rows as { storage_path: string }[]).map((m) => m.storage_path)).toEqual([`${U}/a.webp`]);
    // idempotence côté base
    const questEvents = events.filter((e: { reason: string }) => e.reason === 'quest').length;
    const again = await complete(s, q);
    expect(again.ok && again.data.duplicate).toBe(true);
    expect((await s.store.listXpEvents(U)).filter((e: { reason: string }) => e.reason === 'quest')).toHaveLength(questEvents);
  });

  it('annule une validation : événement compensatoire, quête rouverte, publication détachée', async () => {
    const s = setup('2026-10-05T11:00:00+02:00');
    const done = (await s.store.listInstances(U, { status: 'completed' }))[0];
    const r = await undoQuest(s.ctx, U, done.id);
    expect(r.ok).toBe(true);
    const events = await s.store.listXpEvents(U);
    expect(events.filter((e: { reason: string }) => e.reason === 'undo').reduce((n: number, e: { amount: number }) => n + e.amount, 0)).toBe(-firstXp);
    expect((await s.store.getInstance(U, done.id)).status).toBe('accepted');
    const post = (await pg.query(`select instance_id, payload from posts where author_id = $1`, [U])).rows[0] as { instance_id: string | null; payload: Record<string, unknown> };
    expect(post.instance_id).toBeNull();
    expect(post.payload['questDetached']).toBe(true);
    const c = await recomputeCharacter(s.ctx, U);
    // il ne reste que les bonus des trophées débloqués (« Le Premier Pas » : 25, plus ceux du premier jour de parcours)
    const bonus = (await s.store.listXpEvents(U)).filter((e: { reason: string }) => e.reason === 'achievement').reduce((n: number, e: { amount: number }) => n + e.amount, 0);
    expect(bonus).toBeGreaterThanOrEqual(25);
    expect(c!.totalXp).toBe(bonus);
  });

  it('progression, acceptation hebdomadaire, relance, jour de repos', async () => {
    const s = setup('2026-10-05T12:00:00+02:00');
    const [a, b] = (await s.store.listInstances(U, { status: 'proposed', period: 'daily' })).filter((i: QuestInstance) => i.free);
    expect((await acceptQuest(s.ctx, U, b.id)).ok).toBe(true);
    expect((await updateProgress(s.ctx, U, b.id, { progress: 0 })).ok).toBe(true);
    const w = (await s.store.listInstances(U, { period: 'weekly' }))[0];
    expect((await acceptQuest(s.ctx, U, w.id)).ok).toBe(true);
    expect((await s.store.getInstance(U, w.id)).status).toBe('accepted');
    const rr = await rerollQuest(s.ctx, U, a.id);
    expect(rr.ok).toBe(true);
    expect(await s.store.getInstance(U, a.id)).toBeNull();
    expect((await s.store.getCharacter(U))!.rerollsUsed).toBe(1);
    expect((await declareRest(s.ctx, U)).ok).toBe(true);
    expect(await s.store.listRestDays(U)).toEqual(['2026-10-05']);
  });

  it('le lendemain : clôture, partiel, nouveau tirage, série (dates SQL ↔ moteur)', async () => {
    const s = setup('2026-10-06T09:00:00+02:00');
    const r = await ensureQuests(s.ctx, U);
    expect(r.expired.length).toBeGreaterThan(0);
    const today = await s.store.listInstances(U, { covers: '2026-10-06', period: 'daily' });
    // la quête du jour du parcours actif, puis les 2 suggestions facultatives
    expect(today.filter((i: QuestInstance) => i.origin === 'track')).toMatchObject([{ trackId: def.id, status: 'proposed', periodStart: '2026-10-06' }]);
    expect(today.filter((i: QuestInstance) => i.free)).toHaveLength(2);
    expect((await s.store.listInstances(U, { status: 'expired' })).length).toBeGreaterThan(0);
  });

  it('validation hors ligne rejouée après le reset (RG-03)', async () => {
    const s = setup('2026-10-06T10:00:00+02:00');
    const q = (await s.store.listInstances(U, { period: 'daily', covers: '2026-10-06' })).find((i: QuestInstance) => i.origin === 'track')!;
    expect(q.status).toBe('proposed');
    s.setNow('2026-10-07T05:00:00+02:00');
    await ensureQuests(s.ctx, U);
    expect((await s.store.getInstance(U, q.id)).status).toBe('expired');
    const r = await complete(s, q, { clientCompletedAt: '2026-10-06T22:30:00+02:00' });
    expect(r.ok).toBe(true);
    expect((await s.store.getInstance(U, q.id)).status).toBe('completed');
  });

  it('niveau, voie, amélioration et trophées via le registre', async () => {
    const s = setup('2026-10-07T12:00:00+02:00');
    await pg.query(`insert into xp_events (profile_id, ability, amount, reason, game_date) values ($1, 'FOR', 700, 'bonus', '2026-10-07')`, [U]);
    const c = (await recomputeCharacter(s.ctx, U))!;
    expect(c.level).toBe(4);
    expect(await chooseImprovement(s.ctx, U, { plus2: 'INT' })).toMatchObject({ ok: true });
    const after = (await s.store.getCharacter(U))!;
    expect(after.improvements.INT).toBe(2);
    expect(abilityScores(after).INT).toBe(4);
    const progress = await achievementProgress(s.ctx, U);
    expect(progress).toHaveLength(98);
    expect((await s.store.listUnlocked(U)).map((u: { achievementId: string }) => u.achievementId)).toContain('premier-pas');
    expect(progress.find((p) => p.id === 'premier-elan')).toMatchObject({ target: 10 });
  });

  it('l’adaptateur pagine les longues listes (plafond de 1 000 lignes de PostgREST)', async () => {
    const s = setup('2026-10-07T13:00:00+02:00');
    await pg.query(`insert into xp_events (profile_id, ability, amount, reason, game_date) select $1, 'INT', 1, 'bonus', '2026-09-01' from generate_series(1, 2300)`, [U]);
    const events = await s.store.listXpEvents(U);
    expect(events.length).toBeGreaterThanOrEqual(2300);
  });

  it('le journal et les compteurs sociaux sont lus depuis la base', async () => {
    const s = setup('2026-10-07T14:00:00+02:00');
    await pg.query(`insert into journal_entries (profile_id, text) values ($1, 'Ce que j’ai appris aujourd’hui')`, [U]);
    expect(await s.store.countJournal(U)).toBe(1);
    expect((await s.store.listJournal(U))[0].text).toContain('appris');
    expect(await s.store.socialCounts(U)).toMatchObject({ posts: 1, friends: 0, reactionsGiven: 0 });
  });

  it('centres d’intérêt et ajustement « trop dur » : écrits et relus dans les vraies colonnes', async () => {
    const s = setup('2026-10-07T15:00:00+02:00');
    const settings = await s.store.getSettings(U);
    expect(settings.interests).toEqual([]);
    await s.store.saveSettings(U, { ...settings, interests: ['cuisine', 'langues:espagnol'] });
    expect((await s.store.getSettings(U)).interests).toEqual(['cuisine', 'langues:espagnol']);

    const open = await s.store.listInstances(U, { status: ['proposed', 'accepted'] });
    const counter = open.find((i: QuestInstance) => i.snapshot.validation.type === 'counter' && i.snapshot.validation.target >= 4);
    expect(counter).toBeTruthy();
    const target = (counter!.snapshot.validation as { target: number }).target;
    const r = await tuneQuest(s.ctx, U, counter!.id, 'easier');
    expect(r.ok).toBe(true);
    const reread = await s.store.getInstance(U, counter!.id);
    expect(reread.snapshot.tune).toBe(-1);
    expect(reread.snapshot.baseTarget).toBe(target);
    expect((reread.snapshot.validation as { target: number }).target).toBeLessThan(target);
    expect((await s.store.getPreferences(U))[counter!.templateId].tune).toBe(-1);
  });

  it('quêtes choisies et refaites : plusieurs passages dans la période grâce à la colonne run', async () => {
    const s = setup('2026-10-08T12:00:00+02:00');
    await ensureQuests(s.ctx, U);
    const taken = (await s.store.listInstances(U, { period: 'daily', from: '2026-10-08' })).map((i: QuestInstance) => i.templateId);
    const t = (await s.store.listTemplates(U)).find((x: any) => x.difficulty === 'easy' && x.validation.type === 'simple' && x.periods.includes('daily') && !taken.includes(x.id))!;
    const first = await startQuest(s.ctx, U, { templateId: t.id, period: 'daily' });
    expect(first.ok && first.instance).toMatchObject({ origin: 'chosen', run: 1, free: true, status: 'accepted' });
    if (!first.ok) return;
    expect((await complete(s, first.instance)).ok).toBe(true);
    const again = await redoQuest(s.ctx, U, first.instance.id);
    expect(again.ok && again.instance).toMatchObject({ origin: 'redo', run: 2 });
    if (!again.ok) return;
    const stored = await s.store.getInstance(U, again.instance.id);
    expect(stored).toMatchObject({ origin: 'redo', run: 2, status: 'accepted' });
    const done = await complete(s, again.instance);
    expect(done.ok && done.data.breakdown.repeat).toBe(0.9);
    const rows = (await s.store.listInstances(U, { period: 'daily', from: '2026-10-08' })).filter((i: QuestInstance) => i.templateId === t.id);
    expect(rows).toHaveLength(2);
    // le tirage reste idempotent malgré les quêtes ajoutées
    const before = (await s.store.listInstances(U)).length;
    await ensureQuests(s.ctx, U);
    expect((await s.store.listInstances(U)).length).toBe(before);
  });

  it('mode manuel : la base accepte 0 quête tirée par jour', async () => {
    const s = setup('2026-10-08T13:00:00+02:00');
    await s.store.saveSettings(U, { ...(await s.store.getSettings(U)), dailyQuestCount: 0 });
    expect((await s.store.getSettings(U)).dailyQuestCount).toBe(0);
  });
});

/**
 * Parcours de discipline (docs/PARCOURS.md) : ces tests sont écrits contre le contrat du moteur
 * (startTrack / setTrackPaused / stopTrack, GameStore.listTracks / saveTrack / deleteTrack, quêtes `origin = 'track'`)
 * et contre la vraie table `tracks`. Ils dépendent donc de l'implémentation du moteur et de l'adaptateur SupabaseStore.
 */
describe('parcours de discipline sur le vrai schéma', () => {
  const tplId = (rung: number) => `${def.id}-r${String(rung).padStart(2, '0')}`;
  const trackRows = async () =>
    (await pg.query(`select profile_id, track_id, status, rung, hits, last_done_date::text, last_checked_date::text, best_rung from tracks where profile_id = $1 order by track_id`, [U])).rows as any[];
  const trackQuests = async (s: ReturnType<typeof setup>, from: string) =>
    (await s.store.listInstances(U, { period: 'daily', from })).filter((i: QuestInstance) => i.origin === 'track');

  it('le contenu fournit au moins un parcours dont les gabarits d’échelon sont en base', async () => {
    expect(def).toBeTruthy();
    // gabarits d'échelon : générés par le seed ; on les crée ici s'ils n'y sont pas encore (le test reste indépendant du seed)
    for (const r of def.rungs) {
      await pg.query(
        `insert into quest_templates (id, source, ability, difficulty, periods, title, objective, tips, validation, theme, secondary, track_id, rung)
         values ($1, 'catalog', $2, $3, '{daily}', $4, $5, $6, $7::jsonb, $8, $9::jsonb, $10, $11) on conflict (id) do nothing`,
        [tplId(r.rung), def.ability, r.difficulty, r.title, r.objective, r.tips, JSON.stringify(r.validation), def.theme, JSON.stringify(def.secondary), def.id, r.rung],
      );
    }
    const n = (await pg.query(`select count(*)::int n from quest_templates where track_id = $1`, [def.id])).rows[0] as { n: number };
    expect(n.n).toBe(def.rungs.length);
  });

  it('l’adaptateur écrit, relit, remplace et supprime l’état d’un parcours', async () => {
    const s = setup('2026-10-09T08:00:00+02:00');
    const state = { trackId: 'parcours-fictif', status: 'paused' as const, rung: 3, hits: 2, lastDoneDate: '2026-10-08', lastCheckedDate: '2026-10-08', bestRung: 4, startedAt: '2026-10-01T08:00:00.000Z' };
    await s.store.saveTrack(U, state);
    const [got] = (await s.store.listTracks(U)).filter((t: { trackId: string }) => t.trackId === 'parcours-fictif');
    expect(got).toMatchObject({ trackId: 'parcours-fictif', status: 'paused', rung: 3, hits: 2, lastDoneDate: '2026-10-08', lastCheckedDate: '2026-10-08', bestRung: 4 });
    expect(Date.parse(got.startedAt)).toBe(Date.parse(state.startedAt));
    await s.store.saveTrack(U, { ...state, status: 'active', rung: 4, hits: 0, lastDoneDate: null, lastCheckedDate: null });
    const rows = (await trackRows()).filter((r) => r.track_id === 'parcours-fictif');
    expect(rows).toHaveLength(1); // remplacé, pas dupliqué
    expect(rows[0]).toMatchObject({ status: 'active', rung: 4, hits: 0, last_done_date: null, last_checked_date: null, best_rung: 4 });
    await s.store.deleteTrack(U, 'parcours-fictif');
    expect((await trackRows()).filter((r) => r.track_id === 'parcours-fictif')).toEqual([]);
  });

  it('startTrack crée le parcours à l’échelon 1 ; un doublon ou un parcours inconnu est refusé', async () => {
    const s = setup('2026-10-09T09:00:00+02:00');
    // le parcours est déjà suivi depuis le 5 octobre : un doublon est refusé, puis on l'arrête pour repartir de l'échelon 1
    expect(await startTrack(s.ctx, U, { trackId: def.id })).toMatchObject({ ok: false, error: 'already-active' });
    expect((await stopTrack(s.ctx, U, { trackId: def.id })).ok).toBe(true);
    const r = await startTrack(s.ctx, U, { trackId: def.id });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.track).toMatchObject({ trackId: def.id, status: 'active', rung: 1, hits: 0, bestRung: 1 });
    expect(await trackRows()).toMatchObject([{ track_id: def.id, status: 'active', rung: 1, hits: 0, best_rung: 1 }]);
    expect(await startTrack(s.ctx, U, { trackId: def.id })).toMatchObject({ ok: false, error: 'already-active' });
    expect(await startTrack(s.ctx, U, { trackId: 'parcours-inexistant' })).toMatchObject({ ok: false, error: 'not-found' });
  });

  it('ensureQuests propose la quête de l’échelon du jour (origin track), une seule fois', async () => {
    const s = setup('2026-10-09T09:30:00+02:00');
    await ensureQuests(s.ctx, U);
    await ensureQuests(s.ctx, U);
    const q = await trackQuests(s, '2026-10-09');
    expect(q).toHaveLength(1);
    expect(q[0]).toMatchObject({ origin: 'track', trackId: def.id, rung: 1, templateId: tplId(1), period: 'daily', periodStart: '2026-10-09', status: 'proposed', free: false });
    // les colonnes ajoutées par la migration sont bien renseignées
    const row = (await pg.query(`select origin, track_id, rung, status from quest_instances where id = $1`, [q[0].id])).rows[0];
    expect(row).toEqual({ origin: 'track', track_id: def.id, rung: 1, status: 'proposed' });
    // « Pour aller plus loin » ne ressert jamais un gabarit d'échelon
    const all = await s.store.listInstances(U, { from: '2026-10-09' });
    expect(all.filter((i: QuestInstance) => i.origin === 'draw' && i.trackId)).toEqual([]);
  });

  it('valider la quête du parcours fait avancer ses jours validés ; l’annuler les défait', async () => {
    const s = setup('2026-10-09T10:00:00+02:00');
    const [q] = await trackQuests(s, '2026-10-09');
    const done = await complete(s, q);
    expect(done.ok).toBe(true);
    let t = (await s.store.listTracks(U)).find((x: { trackId: string }) => x.trackId === def.id)!;
    expect(t).toMatchObject({ rung: 1, hits: 1, lastDoneDate: '2026-10-09' });
    expect((await trackRows())[0]).toMatchObject({ hits: 1, last_done_date: '2026-10-09' });
    const undone = await undoQuest(s.ctx, U, q.id);
    expect(undone.ok).toBe(true);
    t = (await s.store.listTracks(U)).find((x: { trackId: string }) => x.trackId === def.id)!;
    expect(t.hits).toBe(0);
  });

  it('la pause gèle le parcours : plus de quête du jour proposée, la reprise la rétablit', async () => {
    const s = setup('2026-10-10T09:00:00+02:00');
    const paused = await setTrackPaused(s.ctx, U, { trackId: def.id, paused: true });
    expect(paused.ok && paused.track).toMatchObject({ trackId: def.id, status: 'paused', rung: 1 });
    expect((await trackRows())[0].status).toBe('paused');
    await ensureQuests(s.ctx, U);
    expect(await trackQuests(s, '2026-10-10')).toEqual([]);
    const resumed = await setTrackPaused(s.ctx, U, { trackId: def.id, paused: false });
    expect(resumed.ok && resumed.track.status).toBe('active');
    await ensureQuests(s.ctx, U);
    expect(await trackQuests(s, '2026-10-10')).toHaveLength(1);
    expect(await setTrackPaused(s.ctx, U, { trackId: 'parcours-inexistant', paused: true })).toMatchObject({ ok: false, error: 'not-found' });
  });

  it('MAX_ACTIVE_TRACKS : un quatrième parcours actif est refusé', async () => {
    const s = setup('2026-10-10T10:00:00+02:00');
    const others = defs.filter((d) => d.id !== def.id);
    expect(others.length).toBeGreaterThanOrEqual(4);
    const [x, y, z, w] = others;
    await stopTrack(s.ctx, U, { trackId: def.id });
    // de vrais parcours (avec leurs gabarits d'échelon) : les parcours sans gabarit sont des orphelins qui ne comptent pas
    for (const d of [x, y, z]) expect((await startTrack(s.ctx, U, { trackId: d.id })).ok).toBe(true);
    expect(await startTrack(s.ctx, U, { trackId: w.id })).toMatchObject({ ok: false, error: 'too-many-open' });
    expect((await trackRows()).filter((r) => r.status === 'active')).toHaveLength(3);
    // en pause, un parcours libère sa place
    expect((await setTrackPaused(s.ctx, U, { trackId: z.id, paused: true })).ok).toBe(true);
    expect((await startTrack(s.ctx, U, { trackId: w.id })).ok).toBe(true);
    expect(await setTrackPaused(s.ctx, U, { trackId: z.id, paused: false })).toMatchObject({ ok: false, error: 'too-many-open' });
    for (const d of [x, y, z, w]) await stopTrack(s.ctx, U, { trackId: d.id });
    expect(await trackRows()).toEqual([]);
    expect((await startTrack(s.ctx, U, { trackId: def.id })).ok).toBe(true);
  });

  it('stopTrack supprime l’état du parcours et la quête du jour non commencée, mais garde les quêtes validées', async () => {
    const s = setup('2026-10-10T11:00:00+02:00');
    const other = defs.find((d) => d.id !== def.id)!;
    expect((await startTrack(s.ctx, U, { trackId: other.id })).ok).toBe(true);
    const today = async (trackId: string) => (await trackQuests(s, '2026-10-10')).filter((i: QuestInstance) => i.trackId === trackId);
    const [mine] = await today(def.id);
    const [theirs] = await today(other.id);
    expect(mine.status).toBe('proposed');
    expect(theirs.status).toBe('proposed');
    expect((await complete(s, mine)).ok).toBe(true);

    // quête validée : elle reste après l'arrêt du parcours
    expect(await stopTrack(s.ctx, U, { trackId: def.id })).toMatchObject({ ok: true, trackId: def.id });
    expect((await trackRows()).map((r) => r.track_id)).toEqual([other.id]);
    expect(await s.store.getInstance(U, mine.id)).toMatchObject({ status: 'completed', trackId: def.id });
    // quête « proposée » du jour : elle disparaît avec le parcours
    expect(await stopTrack(s.ctx, U, { trackId: other.id })).toMatchObject({ ok: true, trackId: other.id });
    expect(await s.store.getInstance(U, theirs.id)).toBeNull();
    expect(await trackRows()).toEqual([]);
    expect(await stopTrack(s.ctx, U, { trackId: def.id })).toMatchObject({ ok: false, error: 'not-found' });
  });
});

describe('aventure sur le vrai schéma (coffres, équipement, donjons, expédition)', () => {
  const V = '00000000-0000-0000-0000-0000000000b2';
  const at = (day: number, hour = 9) => `2026-10-${String(day).padStart(2, '0')}T${String(hour).padStart(2, '0')}:00:00+02:00`;
  const rows = async (sql: string, p: unknown[] = []) => (await pg.query(sql, p)).rows as any[];

  const mk = () => {
    let nowMs = Date.parse(at(12));
    const store = new SupabaseStore(fakeSupabase(pg));
    const ctx: ServerContext = { store: store as never, now: () => nowMs, uuid: () => crypto.randomUUID() };
    return { store: store as any, ctx, setNow: (iso: string) => (nowMs = Date.parse(iso)) };
  };
  const chestOf = (rarity: string, key: string): any => ({ id: crypto.randomUUID(), rarity, source: 'quest', sourceKey: key, instanceId: null, createdAt: new Date().toISOString(), openedAt: null });
  const itemOf = (slot: string, rarity = 'rare', over: object = {}): any => ({ id: crypto.randomUUID(), templateId: 'epee-du-sentier', rarity, slot, ability: 'FOR', level: 0, equipped: false, createdAt: new Date().toISOString(), ...over });

  beforeAll(async () => {
    await pg.query(`insert into auth.users (id, email, raw_user_meta_data) values ($1, 'v@ex.fr', '{"username":"vaillant","birth_year":1990}')`, [V]);
  });

  it('le personnage est créé avec l’expédition en cours et les ressources à zéro', async () => {
    const s = mk();
    expect((await createCharacter(s.ctx, V, input)).ok).toBe(true);
    const [c] = await rows(`select gold, fragments, keys, chest_pity, chest_opens_today, expedition_started_at from characters where profile_id = $1`, [V]);
    expect(c).toMatchObject({ gold: 0, fragments: 0, keys: 0, chest_pity: {}, chest_opens_today: 0 });
    expect(new Date(c.expedition_started_at).toISOString()).toBe(new Date(Date.parse(at(12))).toISOString());
    const back = (await s.store.getCharacter(V))!;
    expect(back).toMatchObject({ gold: 0, keys: 0, chestPity: {}, chestOpensDate: null });
    expect(back.expeditionStartedAt).toMatch(/^2026-10-12T0[57]:00:00/);
  });

  it('la quête du jour d’un parcours donne un coffre idempotent, annulable tant qu’il est fermé', async () => {
    const s = mk();
    expect((await startTrack(s.ctx, V, { trackId: def.id })).ok).toBe(true);
    const q = (await s.store.listInstances(V, { period: 'daily' })).find((i: QuestInstance) => i.origin === 'track')!;
    const v = q.snapshot.validation;
    const done = await completeQuestAction(s.ctx, V, {
      instanceId: q.id,
      useInspiration: false,
      progress: v.type === 'counter' ? v.target : v.type === 'timer' ? v.minutes : undefined,
      stepsDone: v.type === 'steps' ? v.steps.map(() => true) : undefined,
      journalText: v.type === 'journal' ? 'x'.repeat(60) : undefined,
    });
    expect(done.ok && done.data.chests).toHaveLength(1);
    const [row] = await rows(`select rarity, source, source_key, instance_id, opened_at from chests where profile_id = $1`, [V]);
    expect(row).toMatchObject({ rarity: 'bois', source: 'quest', source_key: '2026-10-12', instance_id: q.id, opened_at: null });
    // idempotence : un second coffre pour la même source et la même clé est refusé sans erreur
    expect(await s.store.insertChest(V, chestOf('or', '2026-10-12'))).toBe(false);
    expect((await rows(`select count(*)::int n from chests where profile_id = $1`, [V]))[0].n).toBe(1);
    // annulation : le coffre fermé disparaît
    expect((await undoQuest(s.ctx, V, q.id)).ok).toBe(true);
    expect((await rows(`select count(*)::int n from chests where profile_id = $1`, [V]))[0].n).toBe(0);
  });

  it('ouvre au plus 2 coffres par jour de jeu (plafond écrit en base), repart le lendemain', async () => {
    const s = mk();
    const cs = [chestOf('bois', 'a'), chestOf('bronze', 'b'), chestOf('argent', 'c')];
    for (const c of cs) expect(await s.store.insertChest(V, c)).toBe(true);
    expect((await openChest(s.ctx, V, { chestId: cs[0].id })).ok).toBe(true);
    expect((await openChest(s.ctx, V, { chestId: cs[1].id })).ok).toBe(true);
    expect(await openChest(s.ctx, V, { chestId: cs[2].id })).toMatchObject({ ok: false, error: 'daily-cap' });
    const [c] = await rows(`select gold, fragments, chest_opens_today, chest_opens_date::text d, chest_pity from characters where profile_id = $1`, [V]);
    expect(c).toMatchObject({ gold: 200, fragments: 20, chest_opens_today: 2, d: '2026-10-12' });
    expect((await rows(`select count(*)::int n from inventory_items where profile_id = $1`, [V]))[0].n).toBe(2);
    expect((await rows(`select count(*)::int n from chests where profile_id = $1 and opened_at is not null`, [V]))[0].n).toBe(2);
    // un coffre ouvert ne se rouvre pas
    expect(await s.store.markChestOpened(V, cs[0].id, new Date().toISOString())).toBe(false);
    s.setNow(at(13));
    expect((await openChest(s.ctx, V, { chestId: cs[2].id })).ok).toBe(true);
    expect((await rows(`select chest_opens_today n from characters where profile_id = $1`, [V]))[0].n).toBe(1);
    await pg.query(`delete from inventory_items where profile_id = $1`, [V]);
  });

  it('fusion de coffres : les 3 sont consommés (clé gardée), 1 coffre supérieur est créé', async () => {
    const s = mk();
    for (const k of ['m1', 'm2', 'm3']) await s.store.insertChest(V, chestOf('or', k));
    const r = await mergeChests(s.ctx, V, { rarity: 'or' });
    expect(r.ok && r.chest.rarity).toBe('mythique');
    expect(await rows(`select count(*)::int n from chests where profile_id = $1 and rarity = 'or' and opened_at is not null`, [V])).toEqual([{ n: 3 }]);
    expect(await rows(`select source, rarity, opened_at from chests where profile_id = $1 and source = 'merge'`, [V])).toEqual([{ source: 'merge', rarity: 'mythique', opened_at: null }]);
  });

  it('un seul objet équipé par emplacement : équiper remplace, sans heurter l’index d’unicité', async () => {
    const s = mk();
    const [a, b, t] = [itemOf('arme'), itemOf('arme', 'commun'), itemOf('tete')];
    await s.store.insertItems(V, [a, b, t]);
    expect((await equipItem(s.ctx, V, { itemId: a.id })).ok).toBe(true);
    expect(await equipItem(s.ctx, V, { itemId: b.id })).toMatchObject({ ok: true, replaced: a.id });
    expect((await equipItem(s.ctx, V, { itemId: t.id })).ok).toBe(true);
    expect((await rows(`select id from inventory_items where profile_id = $1 and equipped order by slot`, [V])).map((r) => r.id).sort()).toEqual([b.id, t.id].sort());
    const state = await getAdventureState(s.ctx, V);
    expect(state.ok && state.state.equipped).toEqual({ arme: b.id, tete: t.id });
    expect((await unequipSlot(s.ctx, V, { slot: 'tete' })).ok).toBe(true);
    expect((await rows(`select count(*)::int n from inventory_items where profile_id = $1 and equipped`, [V]))[0].n).toBe(1);
  });

  it('améliorer, fusionner et démonter écrivent les bonnes colonnes', async () => {
    const s = mk();
    await pg.query(`delete from inventory_items where profile_id = $1`, [V]);
    await pg.query(`update characters set gold = 1000, fragments = 100 where profile_id = $1`, [V]);
    const [a, b, c, d] = [itemOf('mains'), itemOf('mains'), itemOf('mains'), itemOf('torse', 'commun')];
    await s.store.insertItems(V, [a, b, c, d]);
    const up = await upgradeItem(s.ctx, V, { itemId: a.id });
    expect(up.ok && up.item.level).toBe(1);
    expect((await rows(`select gold, fragments from characters where profile_id = $1`, [V]))[0]).toEqual({ gold: 900, fragments: 95 });
    expect((await rows(`select level from inventory_items where id = $1`, [a.id]))[0].level).toBe(1);
    const m = await mergeItems(s.ctx, V, { itemIds: [a.id, b.id, c.id] });
    expect(m.ok && m.item).toMatchObject({ rarity: 'epique', slot: 'mains', level: 0 });
    expect((await rows(`select count(*)::int n from inventory_items where profile_id = $1`, [V]))[0].n).toBe(2);
    expect(await dismantleItem(s.ctx, V, { itemId: d.id })).toMatchObject({ ok: true, fragments: 2 });
    expect((await rows(`select fragments from characters where profile_id = $1`, [V]))[0].fragments).toBe(97);
  });

  it('donjon : progression et coffre du boss (une seule fois) écrits en base', async () => {
    const s = mk();
    await pg.query(`delete from inventory_items where profile_id = $1`, [V]);
    await pg.query(`update characters set level = 20, keys = 3 where profile_id = $1`, [V]);
    const slots = ['arme', 'tete', 'torse', 'mains', 'bottes', 'amulette'];
    await s.store.insertItems(V, slots.map((slot) => itemOf(slot, 'legendaire', { level: 10, equipped: true })));
    const list = await listDungeons(s.ctx, V);
    expect(list.ok && list.dungeons).toHaveLength(26);
    const first = await runDungeon(s.ctx, V, { dungeonId: 'dj-randonnee' });
    expect(first.ok && first.result).toMatchObject({ bossDefeated: true, chest: 'bronze' });
    expect(await rows(`select best_room, boss_defeated_tier, last_run_date::text d from dungeon_progress where profile_id = $1 and dungeon_id = 'dj-randonnee'`, [V])).toEqual([{ best_room: 6, boss_defeated_tier: 1, d: '2026-10-12' }]);
    expect((await rows(`select keys from characters where profile_id = $1`, [V]))[0].keys).toBe(2);
    const second = await runDungeon(s.ctx, V, { dungeonId: 'dj-randonnee' });
    expect(second.ok && second.chest).toBeNull();
    expect((await rows(`select count(*)::int n from chests where profile_id = $1 and source = 'dungeon'`, [V]))[0].n).toBe(1);
    expect((await rows(`select count(*)::int n from dungeon_progress where profile_id = $1`, [V]))[0].n).toBe(1);
  });

  it('expédition : or et fragments versés, compteur relancé, plafond de 24 h', async () => {
    const s = mk();
    await pg.query(`update characters set gold = 0, fragments = 0, keys = 0, expedition_started_at = $2 where profile_id = $1`, [V, new Date(Date.parse(at(12)) - 100 * 3_600_000).toISOString()]);
    const r = await claimExpedition(s.ctx, V);
    expect(r.ok && r.claim).toMatchObject({ hours: 24, capped: true });
    const [c] = await rows(`select gold, fragments, expedition_started_at from characters where profile_id = $1`, [V]);
    expect(c.gold).toBe(r.ok ? r.claim.gold : -1);
    expect(c.gold).toBeGreaterThan(500);
    expect(new Date(c.expedition_started_at).getTime()).toBe(Date.parse(at(12)));
    expect(await claimExpedition(s.ctx, V)).toMatchObject({ ok: false, error: 'nothing-pending' });
  });
});

describe('raids d’amis sur le vrai schéma (adaptateur SupabaseStore, triggers, notifications)', () => {
  const P = Array.from({ length: 8 }, (_, i) => `00000000-0000-0000-0000-00001400000${i + 1}`);
  const [LEA, BOB, CAT, DAN, EVE, FAY, GUS, STRANGER] = P;
  const at = (day: number, hour = 9) => `2026-10-${String(day).padStart(2, '0')}T${String(hour).padStart(2, '0')}:00:00+02:00`;
  const rows = async (sql: string, p: unknown[] = []) => (await pg.query(sql, p)).rows as any[];
  const mk = () => {
    let nowMs = Date.parse(at(12));
    const store = new SupabaseStore(fakeSupabase(pg));
    const ctx: ServerContext = { store: store as never, now: () => nowMs, uuid: () => crypto.randomUUID() };
    return { store: store as any, ctx, setNow: (iso: string) => (nowMs = Date.parse(iso)) };
  };
  const ok = <T extends { ok: boolean }>(r: T) => {
    expect(r.ok).toBe(true);
    return r as Extract<T, { ok: true }>;
  };

  beforeAll(async () => {
    for (const [i, id] of P.entries()) {
      await pg.query(`insert into auth.users (id, email, raw_user_meta_data) values ($1, $2, $3)`, [id, `r${i}@ex.fr`, JSON.stringify({ username: `raideur${i}`, birth_year: 1992 })]);
      expect((await createCharacter(mk().ctx, id, { ...input, name: `Raideur${i}` })).ok).toBe(true);
    }
    for (const id of [BOB, CAT, DAN, EVE, FAY, GUS]) {
      await pg.query(`insert into friendships (requester_id, addressee_id, status, accepted_at) values ($1, $2, 'accepted', now())`, [LEA, id]);
    }
  });

  it('équipe complète de bout en bout : création, invitations, arrivées, coups, encouragement, persistance', async () => {
    const s = mk();
    const created = ok(await createRaidTeam(s.ctx, LEA));
    const teamId = created.state.team!.id;
    expect((await rows(`select week_start::text w, leader_id from raid_teams where id = $1`, [teamId]))[0]).toEqual({ w: '2026-10-12', leader_id: LEA });
    // Amis uniquement, vérifié par la base (can_view_owner)
    expect(await inviteToRaid(s.ctx, LEA, { profileId: STRANGER })).toMatchObject({ ok: false, error: 'not-friends' });
    for (const id of [BOB, CAT]) {
      ok(await inviteToRaid(s.ctx, LEA, { profileId: id }));
      const inv = ok(await getRaidState(s.ctx, id)).state.invitations;
      expect(inv).toHaveLength(1);
      expect(ok(await joinRaidTeam(s.ctx, id, { teamId })).state.team!.members).toHaveLength(id === BOB ? 2 : 3);
    }
    const [m] = await rows(`select count(*)::int n from raid_members where team_id = $1 and status = 'joined'`, [teamId]);
    expect(m.n).toBe(3);
    // Un coup par membre, enregistré une seule fois
    const dmg = await rows(`select profile_id, game_date::text d, damage, base_damage, encouragements from raid_damage where team_id = $1 order by profile_id`, [teamId]);
    expect(dmg.map((r) => r.profile_id)).toEqual([LEA, BOB, CAT]);
    expect(dmg.every((r) => r.d === '2026-10-12' && r.damage > 0 && r.damage === r.base_damage)).toBe(true);
    await getRaidState(s.ctx, LEA);
    expect((await rows(`select count(*)::int n from raid_damage where team_id = $1`, [teamId]))[0].n).toBe(3);
    // Encouragement : +5 % sur le coup déjà joué, une seule fois, avec une notification
    ok(await encourageRaid(s.ctx, LEA, { profileId: BOB }));
    expect(await encourageRaid(s.ctx, LEA, { profileId: BOB })).toMatchObject({ ok: false, error: 'already-done' });
    const [bob] = await rows(`select damage, base_damage, encouragements from raid_damage where team_id = $1 and profile_id = $2`, [teamId, BOB]);
    expect(bob).toMatchObject({ encouragements: 1, damage: Math.floor(bob.base_damage * 1.05) });
    // Notifications : une invitation par invité, un encouragement
    const notes = await rows(`select profile_id, type, payload from notifications where type like 'raid_%' order by created_at, type`);
    expect(notes.filter((n) => n.type === 'raid_invite').map((n) => n.profile_id).sort()).toEqual([BOB, CAT]);
    expect(notes.filter((n) => n.type === 'raid_encouraged')).toHaveLength(1);
    expect(notes.find((n) => n.type === 'raid_encouraged')).toMatchObject({ profile_id: BOB, payload: { from: LEA, username: 'Raideur0', team: teamId } });
  });

  it('victoire : coffres de raid pour tous (idempotents en base), notifications une fois, issue figée', async () => {
    const s = mk();
    const [{ id: teamId }] = await rows(`select id from raid_teams where week_start = '2026-10-12'`);
    await pg.query(`insert into raid_damage (team_id, profile_id, game_date, damage, base_damage) values ($1, $2, '2026-10-13', 50000, 50000)`, [teamId, LEA]);
    s.setNow(at(14));
    const st = ok(await getRaidState(s.ctx, CAT)).state;
    expect(st.team).toMatchObject({ status: 'victory', reward: 'mythique', daysToKill: 2 });
    const [t] = await rows(`select outcome, max_hp, total_damage, victory_day::text vd, resolved_at is not null r from raid_teams where id = $1`, [teamId]);
    expect(t).toMatchObject({ outcome: 'victory', max_hp: 13000, vd: '2026-10-13', r: true });
    for (const id of [LEA, BOB, CAT]) {
      const c = await rows(`select rarity, source, source_key from chests where profile_id = $1 and source = 'raid'`, [id]);
      expect(c).toEqual([{ rarity: 'mythique', source: 'raid', source_key: `2026-W42:${teamId}` }]);
    }
    await getRaidState(s.ctx, LEA);
    await getRaidState(s.ctx, BOB);
    expect((await rows(`select count(*)::int n from chests where source = 'raid'`))[0].n).toBe(3);
    expect((await rows(`select count(*)::int n from notifications where type = 'raid_victory'`))[0].n).toBe(3);
    // Le raid clos n'accepte plus ni départ ni invitation
    expect(await leaveRaidTeam(s.ctx, LEA)).toMatchObject({ ok: false, error: 'raid-closed' });
  });

  it('semaine suivante : nouvelle équipe, plafond de 6 imposé par la base, départ qui emporte les dégâts', async () => {
    const s = mk();
    s.setNow(at(19));
    const created = ok(await createRaidTeam(s.ctx, LEA));
    const teamId = created.state.team!.id;
    for (const id of [BOB, CAT, DAN, EVE, FAY]) {
      ok(await inviteToRaid(s.ctx, LEA, { profileId: id }));
      ok(await joinRaidTeam(s.ctx, id, { teamId }));
    }
    expect(ok(await getRaidState(s.ctx, LEA)).state.team!.members).toHaveLength(6);
    expect(await inviteToRaid(s.ctx, LEA, { profileId: GUS })).toMatchObject({ ok: false, error: 'team-full' });
    // Invitation posée directement : la base refuse la 7e arrivée (trigger raid_full)
    expect(await s.store.insertRaidMember({ teamId, profileId: GUS, weekStart: '2026-10-19', status: 'invited', invitedBy: LEA, createdAt: at(19), joinedAt: null })).toBe('ok');
    expect(await joinRaidTeam(s.ctx, GUS, { teamId })).toMatchObject({ ok: false, error: 'team-full' });
    expect(await s.store.joinRaidMember(teamId, GUS, at(19))).toBe('full');
    expect(await s.store.insertRaidMember({ teamId, profileId: STRANGER, weekStart: '2026-10-19', status: 'joined', invitedBy: LEA, createdAt: at(19), joinedAt: at(19) })).toBe('not-friend');
    expect(await s.store.insertRaidMember({ teamId, profileId: BOB, weekStart: '2026-10-19', status: 'invited', invitedBy: LEA, createdAt: at(19), joinedAt: null })).toBe('duplicate');
    // Un départ emporte les dégâts du joueur ; le chef qui part passe la main
    const before = (await rows(`select count(*)::int n from raid_damage where team_id = $1`, [teamId]))[0].n;
    ok(await leaveRaidTeam(s.ctx, FAY));
    expect((await rows(`select count(*)::int n from raid_damage where team_id = $1`, [teamId]))[0].n).toBe(before - 1);
    ok(await leaveRaidTeam(s.ctx, LEA));
    expect((await rows(`select leader_id from raid_teams where id = $1`, [teamId]))[0].leader_id).toBe(BOB);
    // Une seconde équipe la même semaine est refusée par l'index unique, sans laisser d'équipe orpheline
    const rival = { id: crypto.randomUUID(), weekStart: '2026-10-19', leaderId: BOB, createdAt: at(19), resolvedAt: null, outcome: null, maxHp: null, totalDamage: null, victoryDay: null };
    const teamsBefore = (await rows(`select count(*)::int n from raid_teams`))[0].n;
    expect(await s.store.insertRaidTeam(rival, { teamId: rival.id, profileId: BOB, weekStart: '2026-10-19', status: 'joined', invitedBy: BOB, createdAt: at(19), joinedAt: at(19) })).toBe(false);
    expect((await rows(`select count(*)::int n from raid_teams`))[0].n).toBe(teamsBefore);
  });

  it('défaite à la clôture : aucune récompense, issue enregistrée avec les PV figés', async () => {
    const s = mk();
    s.setNow(at(26));
    const st = ok(await getRaidState(s.ctx, BOB)).state;
    expect(st.team).toBeNull();
    expect(st.lastResult).toMatchObject({ outcome: 'defeat', reward: null });
    const [t] = await rows(`select outcome, max_hp from raid_teams where week_start = '2026-10-19'`);
    expect(t).toMatchObject({ outcome: 'defeat', max_hp: raidMaxHp(4) }); // 4 membres restent après les deux départs
  });
});

describe('saisons sur le vrai schéma (adaptateur SupabaseStore, classement, récompense idempotente)', () => {
  const P = Array.from({ length: 3 }, (_, i) => `00000000-0000-0000-0000-00001500000${i + 1}`);
  const [ANA, BEN, CLO] = P;
  const day = (iso: string) => `${iso}T09:00:00+02:00`;
  const rows = async (sql: string, p: unknown[] = []) => (await pg.query(sql, p)).rows as any[];
  const mk = (iso = '2026-10-05') => {
    let nowMs = Date.parse(day(iso));
    const store = new SupabaseStore(fakeSupabase(pg));
    const ctx: ServerContext = { store: store as never, now: () => nowMs, uuid: () => crypto.randomUUID() };
    return { store: store as any, ctx, setNow: (d: string) => (nowMs = Date.parse(day(d))) };
  };
  const ok = <T extends { ok: boolean }>(r: T) => {
    expect(r.ok).toBe(true);
    return r as Extract<T, { ok: true }>;
  };

  beforeAll(async () => {
    for (const [i, id] of P.entries()) {
      await pg.query(`insert into auth.users (id, email, raw_user_meta_data) values ($1, $2, $3)`, [id, `s${i}@ex.fr`, JSON.stringify({ username: `saison${i}`, birth_year: 1992 })]);
      expect((await createCharacter(mk().ctx, id, { ...input, name: `Saison${i}` })).ok).toBe(true);
    }
    await pg.query(`insert into friendships (requester_id, addressee_id, status, accepted_at) values ($1, $2, 'accepted', now()), ($1, $3, 'accepted', now())`, [ANA, BEN, CLO]);
    // Ben porte une panoplie de Titan de 4 pièces (épiques) : plus puissant
    for (const [slot, tpl] of [['arme', 'epee-du-sentier'], ['tete', 'bandeau-du-guerrier'], ['torse', 'armure-de-plates'], ['mains', 'gantelets-de-force']]) {
      await pg.query(`insert into inventory_items (profile_id, template_id, rarity, slot, ability, equipped) values ($1, $2, 'epique', $3, 'FOR', true)`, [BEN, tpl, slot]);
    }
  });

  it('la puissance (panoplie comprise) est publiée sur le personnage et pour la saison', async () => {
    const s = mk();
    const ben = ok(await getAdventureState(s.ctx, BEN));
    expect(ben.state.powerBreakdown.sets).toBe(12);
    expect(ben.state.sets.find((x) => x.setId === 'titan')).toMatchObject({ equipped: 4, tier: { pieces: 4 } });
    const [c] = await rows(`select power from characters where profile_id = $1`, [BEN]);
    expect(c.power).toBe(ben.state.power);
    const [sc] = await rows(`select season_key, power, first_day::text f, last_day::text l from season_scores where profile_id = $1`, [BEN]);
    expect(sc).toEqual({ season_key: 'S1', power: ben.state.power, f: '2026-10-05', l: '2026-10-05' });
    ok(await getAdventureState(s.ctx, ANA));
    ok(await getAdventureState(s.ctx, CLO));
  });

  it('équiper et retirer un objet met la puissance à jour en base', async () => {
    const s = mk('2026-10-08');
    const [boots] = await rows(`insert into inventory_items (profile_id, template_id, rarity, slot, ability) values ($1, 'sabots-du-bucheron', 'epique', 'bottes', 'FOR') returning id`, [BEN]);
    const before = (await rows(`select power from characters where profile_id = $1`, [BEN]))[0].power;
    ok(await equipItem(s.ctx, BEN, { itemId: boots.id }));
    const after = (await rows(`select power from characters where profile_id = $1`, [BEN]))[0].power;
    expect(after).toBeGreaterThan(before);
    ok(await unequipSlot(s.ctx, BEN, { slot: 'bottes' }));
    expect((await rows(`select power from characters where profile_id = $1`, [BEN]))[0].power).toBe(before);
    expect((await rows(`select last_day::text l from season_scores where profile_id = $1`, [BEN]))[0].l).toBe('2026-10-08');
  });

  it('le classement du serveur suit la RPC : amis classés par puissance', async () => {
    const s = mk('2026-10-12');
    for (const id of P) ok(await getAdventureState(s.ctx, id));
    // Ana est amie de Ben et de Clo ; Ben et Clo ne se connaissent pas
    const ranking = await s.store.seasonRanking(ANA, 'S1');
    expect(ranking.map((r: any) => r.profileId)[0]).toBe(BEN);
    expect(ranking.map((r: any) => r.profileId).sort()).toEqual([ANA, BEN, CLO].sort());
    expect((await s.store.seasonRanking(BEN, 'S1')).map((r: any) => r.profileId).sort()).toEqual([ANA, BEN].sort());
    const season = ok(await getSeasonState(s.ctx, ANA)).state;
    expect(season).toMatchObject({ participants: 3, rank: 2, qualifies: true, daysPlayed: 8 });
  });

  it('récompense de fin de saison : cadre, coffre d’or et notification, une seule fois', async () => {
    const s = mk('2026-11-24');
    const first = ok(await getSeasonState(s.ctx, BEN));
    expect(first.state.evaluated).toHaveLength(1);
    expect(first.state.evaluated[0]).toMatchObject({ seasonKey: 'S1', rank: 1, participants: 2, frame: 'or' });
    // rejouée, relue par l'aventure, et par un second appel concurrent : toujours un seul exemplaire
    ok(await getAdventureState(s.ctx, BEN));
    ok(await getSeasonState(s.ctx, BEN));
    await Promise.all([getSeasonState(s.ctx, BEN), getAdventureState(s.ctx, BEN)]);
    expect(await rows(`select rarity, source, source_key, opened_at from chests where profile_id = $1 and source = 'season'`, [BEN])).toEqual([
      { rarity: 'or', source: 'season', source_key: 'S1', opened_at: null },
    ]);
    expect((await rows(`select frame_style from characters where profile_id = $1`, [BEN]))[0].frame_style).toBe('S1:or');
    expect(await rows(`select rank, participants, frame from season_results where profile_id = $1`, [BEN])).toEqual([{ rank: 1, participants: 2, frame: 'or' }]);
    const notes = await rows(`select type, payload from notifications where profile_id = $1 and type = 'season_end'`, [BEN]);
    expect(notes).toHaveLength(1);
    expect(notes[0].payload).toEqual({ season: 'S1', name: 'Saison 1', rank: 1, participants: 2, frame: 'or' });
    // le coffre d'or s'ouvre comme les autres
    const [chest] = await rows(`select id from chests where profile_id = $1 and source = 'season'`, [BEN]);
    expect(ok(await openChest(s.ctx, BEN, { chestId: chest.id })).opening.chest.rarity).toBe('or');
  });

  it('chacun reçoit son propre rang : cadre d’argent pour la 2e place, d’or pour une égalité en tête', async () => {
    const s = mk('2026-11-24');
    const ana = ok(await getSeasonState(s.ctx, ANA));
    expect(ana.state.evaluated[0]).toMatchObject({ rank: 2, participants: 3, frame: 'argent' });
    expect((await rows(`select frame_style from characters where profile_id = $1`, [ANA]))[0].frame_style).toBe('S1:argent');
    // Clo, amie d'Ana seulement, a exactement sa puissance : elles partagent le rang 1 de leur classement
    const clo = ok(await getSeasonState(s.ctx, CLO));
    expect(clo.state.evaluated[0]).toMatchObject({ rank: 1, participants: 2, frame: 'or' });
  });

  it('refuser le classement : récompense de participation sans rang', async () => {
    const s = mk('2026-11-24');
    await pg.query(`delete from season_results where profile_id = $1`, [CLO]);
    await pg.query(`delete from chests where profile_id = $1 and source = 'season'`, [CLO]);
    await pg.query(`update settings set leaderboard_opt_in = false where profile_id = $1`, [CLO]);
    const clo = ok(await getSeasonState(s.ctx, CLO));
    expect(clo.state.evaluated[0]).toMatchObject({ rank: null, participants: 0, frame: 'laurier' });
    expect(clo.state.optedIn).toBe(false);
    expect((await rows(`select count(*)::int n from chests where profile_id = $1 and source = 'season'`, [CLO]))[0].n).toBe(1);
  });
});
