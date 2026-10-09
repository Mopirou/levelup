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
  completeQuestAction,
  createCharacter,
  declareRest,
  ensureQuests,
  recomputeCharacter,
  redoQuest,
  rerollQuest,
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
  for (const f of ['20261008000001_schema.sql', '20261008000002_security.sql', '20261008000003_cron.sql', '20261008000004_friend_code.sql', '20261009000001_quest_themes.sql', '20261009000002_interests_and_tuning.sql', '20261009000003_rescale_base_scores.sql', '20261010000001_quest_runs.sql']) await pg.exec(read(`migrations/${f}`));
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
    expect(inst.filter((i: QuestInstance) => i.period === 'daily' && !i.free)).toHaveLength(3);
    expect(inst.filter((i: QuestInstance) => i.free)).toHaveLength(2);
    expect(inst.filter((i: QuestInstance) => i.period === 'weekly')).toHaveLength(2);
    expect(inst.filter((i: QuestInstance) => i.period === 'monthly')).toHaveLength(1);
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
    const q = (await s.store.listInstances(U, { status: 'accepted', period: 'daily' }))[0];
    expect(q).toBeTruthy();
    const r = await complete(s, q, { share: { text: 'Une pause au grand air 🌿', mediaPaths: [`${U}/a.webp`], visibility: 'friends' } });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    firstXp = r.data.xpAwarded;
    expect(firstXp).toBeGreaterThanOrEqual(10); // 10 de base (+10 si la caractéristique est maîtrisée par la classe)
    expect(r.data.achievements.map((a) => a.id)).toContain('premier-pas');
    const c = (await s.store.getCharacter(U))!;
    expect(c.totalXp).toBe(r.data.character.totalXp);
    expect(c.streakCurrent).toBe(1);
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
    expect(c!.totalXp).toBe(25); // il reste le bonus du trophée « Le Premier Pas »
  });

  it('progression, acceptation hebdomadaire, relance, jour de repos', async () => {
    const s = setup('2026-10-05T12:00:00+02:00');
    const [a] = await s.store.listInstances(U, { status: 'accepted', period: 'daily' });
    expect((await updateProgress(s.ctx, U, a.id, { progress: 0 })).ok).toBe(true);
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
    expect(today.filter((i: QuestInstance) => !i.free)).toHaveLength(3);
    expect((await s.store.listInstances(U, { status: 'expired' })).length).toBeGreaterThan(0);
  });

  it('validation hors ligne rejouée après le reset (RG-03)', async () => {
    const s = setup('2026-10-06T10:00:00+02:00');
    const q = (await s.store.listInstances(U, { status: 'accepted', period: 'daily' }))[0];
    if (!q) return;
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
