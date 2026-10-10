import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  MAX_ACTIVE_TRACKS,
  MemoryStore,
  abandonQuest,
  acceptQuest,
  completeQuestAction,
  createCharacter,
  declareRest,
  emptyUserData,
  ensureQuests,
  recomputeCharacter,
  redoQuest,
  rerollQuest,
  setTrackPaused,
  startQuest,
  startTrack,
  stopTrack,
  undoQuest,
  type QuestInstance,
  type QuestTemplate,
  type ServerContext,
  type TrackState,
} from '../src';
import { TEST_RUNG_TEMPLATES } from './track-fixtures';

const catalog = JSON.parse(readFileSync(join(__dirname, '..', '..', 'content', 'data', 'quests.fr.json'), 'utf8')).map(
  (q: QuestTemplate) => ({ ...q, source: 'catalog' }),
) as QuestTemplate[];

const U = 'user-1';
let counter = 0;

/** 5 octobre 2026 = lundi (heure d'été). */
const at = (day: number, hour = 9) => `2026-10-${String(day).padStart(2, '0')}T${String(hour).padStart(2, '0')}:00:00+02:00`;
const date = (day: number) => `2026-10-${String(day).padStart(2, '0')}`;

const heroInput = {
  name: 'Aldric',
  classId: 'eclaireur',
  scores: { FOR: 5, DEX: 2, CON: 5, INT: 2, SAG: 2, CHA: 2 },
  portraitId: 'p1',
  frameColor: '#2f5a47',
  timezone: 'Europe/Paris',
};

function setup(templates: QuestTemplate[] = [...catalog, ...TEST_RUNG_TEMPLATES]) {
  const store = new MemoryStore(templates);
  let nowMs = Date.parse(at(5));
  const ctx: ServerContext = { store, now: () => nowMs, uuid: () => `tid-${++counter}` };
  return { store, ctx, setNow: (iso: string) => (nowMs = Date.parse(iso)) };
}
type S = ReturnType<typeof setup>;

async function hero(templates?: QuestTemplate[]) {
  const s = setup(templates);
  expect((await createCharacter(s.ctx, U, heroInput)).ok).toBe(true);
  return s;
}

const trackQuests = async (s: S, trackId?: string) =>
  (await s.store.listInstances(U, { period: 'daily' })).filter((q) => q.origin === 'track' && (!trackId || q.trackId === trackId));

const track = async (s: S, trackId: string) => (await s.store.listTracks(U)).find((t) => t.trackId === trackId)!;

function finish(s: S, q: QuestInstance, extra: { useInspiration?: boolean; clientCompletedAt?: string } = {}) {
  const v = q.snapshot.validation;
  return completeQuestAction(s.ctx, U, {
    instanceId: q.id,
    useInspiration: extra.useInspiration ?? false,
    clientCompletedAt: extra.clientCompletedAt,
    progress: v.type === 'counter' ? v.target : v.type === 'timer' ? v.minutes : undefined,
    stepsDone: v.type === 'steps' ? v.steps.map(() => true) : undefined,
    journalText: v.type === 'journal' ? 'x'.repeat(60) : undefined,
  });
}

/** Une journée de jeu : on ouvre l'appli ce jour-là, puis on valide (ou non) la quête du parcours. */
async function playDay(s: S, day: number, trackId: string, validate = true) {
  s.setNow(at(day));
  await ensureQuests(s.ctx, U);
  const q = (await trackQuests(s, trackId)).find((x) => x.periodStart === date(day));
  expect(q).toBeDefined();
  if (!validate) return q!;
  const r = await finish(s, q!);
  expect(r.ok).toBe(true);
  return q!;
}

describe('démarrer, mettre en pause, arrêter', () => {
  it('démarre un parcours : état initial et quête du jour créée, proposée et non libre', async () => {
    const s = await hero();
    const r = await startTrack(s.ctx, U, { trackId: 'course-fond' });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.track).toMatchObject({ trackId: 'course-fond', status: 'active', rung: 1, hits: 0, lastDoneDate: null, lastCheckedDate: '2026-10-05', bestRung: 1 });
    expect(await s.store.listTracks(U)).toEqual([r.track]);
    const [q] = await trackQuests(s);
    expect(q).toMatchObject({
      templateId: 'course-fond-r01', origin: 'track', period: 'daily', status: 'proposed', free: false,
      trackId: 'course-fond', rung: 1, periodStart: '2026-10-05', periodEnd: '2026-10-05', run: 1,
    });
    expect(q.snapshot).toMatchObject({ ability: 'CON', difficulty: 'easy', title: 'course-fond échelon 1', theme: 'sport', secondary: [{ ability: 'DEX', pct: 20 }] });
    // les suggestions facultatives sont tirées en plus, jamais un gabarit de parcours
    const others = (await s.store.listInstances(U)).filter((i) => i.origin !== 'track');
    expect(others.every((i) => !i.trackId)).toBe(true);
  });

  it('refuse un parcours inconnu, un doublon, un 4e parcours actif ; sans personnage, rien', async () => {
    const s = await hero();
    expect(await startTrack(s.ctx, U, { trackId: 'nope' })).toMatchObject({ ok: false, error: 'not-found' });
    expect((await startTrack(s.ctx, U, { trackId: 'muscu-haut' })).ok).toBe(true);
    expect(await startTrack(s.ctx, U, { trackId: 'muscu-haut' })).toMatchObject({ ok: false, error: 'already-active' });
    expect(MAX_ACTIVE_TRACKS).toBe(3);
    expect((await startTrack(s.ctx, U, { trackId: 'course-fond' })).ok).toBe(true);
    expect((await startTrack(s.ctx, U, { trackId: 'lecture-fiction' })).ok).toBe(true);
    expect(await startTrack(s.ctx, U, { trackId: 'yoga-doux' })).toMatchObject({ ok: false, error: 'too-many-open' });
    expect(await s.store.listTracks(U)).toHaveLength(3);
    // pas de personnage
    expect(await startTrack(s.ctx, 'nobody', { trackId: 'muscu-haut' })).toMatchObject({ ok: false, error: 'no-character' });
    expect(await setTrackPaused(s.ctx, 'nobody', { trackId: 'muscu-haut', paused: true })).toMatchObject({ ok: false, error: 'no-character' });
    expect(await stopTrack(s.ctx, 'nobody', { trackId: 'muscu-haut' })).toMatchObject({ ok: false, error: 'no-character' });
  });

  it('une pause libère une place ; reprendre exige une place libre', async () => {
    const s = await hero();
    for (const id of ['muscu-haut', 'course-fond', 'lecture-fiction']) await startTrack(s.ctx, U, { trackId: id });
    expect((await setTrackPaused(s.ctx, U, { trackId: 'muscu-haut', paused: true })).ok).toBe(true);
    expect((await startTrack(s.ctx, U, { trackId: 'yoga-doux' })).ok).toBe(true);
    expect(await startTrack(s.ctx, U, { trackId: 'muscu-haut' })).toMatchObject({ ok: false, error: 'already-active' });
    expect(await setTrackPaused(s.ctx, U, { trackId: 'muscu-haut', paused: false })).toMatchObject({ ok: false, error: 'too-many-open' });
    expect((await track(s, 'muscu-haut')).status).toBe('paused');
    expect(await setTrackPaused(s.ctx, U, { trackId: 'nope', paused: true })).toMatchObject({ ok: false, error: 'not-found' });
    // idempotent
    const again = await setTrackPaused(s.ctx, U, { trackId: 'muscu-haut', paused: true });
    expect(again.ok && again.track.status).toBe('paused');
  });

  it('arrêter supprime l’état mais garde les quêtes passées ; on peut repartir de zéro sans doublon de quête', async () => {
    const s = await hero();
    await startTrack(s.ctx, U, { trackId: 'muscu-haut' });
    const done = await playDay(s, 5, 'muscu-haut');
    expect(await stopTrack(s.ctx, U, { trackId: 'muscu-haut' })).toEqual({ ok: true, trackId: 'muscu-haut' });
    expect(await s.store.listTracks(U)).toEqual([]);
    expect((await s.store.getInstance(U, done.id))!.status).toBe('completed');
    expect(await stopTrack(s.ctx, U, { trackId: 'muscu-haut' })).toMatchObject({ ok: false, error: 'not-found' });
    // même jour : la quête existe déjà, rien n'est recréé
    expect((await startTrack(s.ctx, U, { trackId: 'muscu-haut' })).ok).toBe(true);
    expect(await trackQuests(s, 'muscu-haut')).toHaveLength(1);
    expect(await track(s, 'muscu-haut')).toMatchObject({ rung: 1, hits: 0, bestRung: 1 });
  });
});

describe('quête du jour d’un parcours', () => {
  it('ensureQuests est idempotent et crée une quête par jour et par parcours actif, jamais en pause', async () => {
    const s = await hero();
    await startTrack(s.ctx, U, { trackId: 'muscu-haut' });
    await startTrack(s.ctx, U, { trackId: 'yoga-doux' });
    await ensureQuests(s.ctx, U);
    await ensureQuests(s.ctx, U);
    expect(await trackQuests(s)).toHaveLength(2);
    await setTrackPaused(s.ctx, U, { trackId: 'yoga-doux', paused: true });
    s.setNow(at(6));
    await ensureQuests(s.ctx, U);
    expect((await trackQuests(s)).filter((q) => q.periodStart === date(6)).map((q) => q.trackId)).toEqual(['muscu-haut']);
  });

  it('la quête de la veille non validée expire ; elle ne se valide plus le lendemain', async () => {
    const s = await hero();
    await startTrack(s.ctx, U, { trackId: 'muscu-haut' });
    const [q] = await trackQuests(s);
    s.setNow(at(6));
    const r = await ensureQuests(s.ctx, U);
    expect(r.expired.map((x) => x.id)).toContain(q.id);
    expect(await finish(s, q)).toMatchObject({ ok: false, error: 'out-of-period' });
  });

  it('se valide directement depuis « proposée » (XP, répartition sur les secondaires, série)', async () => {
    const s = await hero();
    await startTrack(s.ctx, U, { trackId: 'course-fond' });
    const [q] = await trackQuests(s);
    expect(q.status).toBe('proposed');
    const r = await finish(s, q);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.data.xpAwarded).toBeGreaterThanOrEqual(10);
    expect(r.data.streak).toBe(1);
    expect(r.data.track).toMatchObject({ trackId: 'course-fond', rung: 1, hits: 1 });
    expect(r.data.trackPromoted).toBe(false);
    const done = (await s.store.getInstance(U, q.id))!;
    expect(done).toMatchObject({ status: 'completed', acceptedAt: expect.any(String) });
    const events = (await s.store.listXpEvents(U)).filter((e) => e.reason === 'quest');
    expect(events.map((e) => e.ability).sort()).toEqual(['CON', 'DEX']);
    // idempotent
    const again = await finish(s, q);
    expect(again.ok && again.data.duplicate).toBe(true);
    expect(await track(s, 'course-fond')).toMatchObject({ hits: 1 });
  });

  it('une quête de tirage « proposée » n’est toujours pas validable sans l’accepter', async () => {
    const s = await hero();
    const draw = (await s.store.listInstances(U, { period: 'daily' }))[0];
    expect(draw.status).toBe('proposed');
    expect(await finish(s, draw)).toMatchObject({ ok: false, error: 'not-accepted' });
    expect((await acceptQuest(s.ctx, U, draw.id)).ok).toBe(true);
    expect((await finish(s, draw)).ok).toBe(true);
  });

  it('ne peut pas être abandonnée (on met le parcours en pause), sans aucun effet d’XP', async () => {
    const s = await hero();
    await startTrack(s.ctx, U, { trackId: 'muscu-haut' });
    const [q] = await trackQuests(s);
    expect(await abandonQuest(s.ctx, U, q.id)).toMatchObject({ ok: false, error: 'invalid' });
    expect((await s.store.getInstance(U, q.id))!.status).toBe('proposed');
    expect((await s.store.listXpEvents(U)).length).toBe(0);
  });

  it('ne se relance pas, ne se refait pas, ne se lance pas par le chemin libre', async () => {
    const s = await hero();
    await startTrack(s.ctx, U, { trackId: 'muscu-haut' });
    const [q] = await trackQuests(s);
    expect(await rerollQuest(s.ctx, U, q.id)).toMatchObject({ ok: false, error: 'invalid' });
    await finish(s, q);
    expect(await redoQuest(s.ctx, U, q.id)).toMatchObject({ ok: false, error: 'invalid' });
    expect(await startQuest(s.ctx, U, { templateId: 'muscu-haut-r01', period: 'daily' })).toMatchObject({ ok: false, error: 'not-found' });
    expect(await startQuest(s.ctx, U, { templateId: 'muscu-haut-r05', period: 'weekly' })).toMatchObject({ ok: false, error: 'not-found' });
  });

  it('un gabarit d’échelon n’est jamais tiré, même sans parcours actif', async () => {
    const s = await hero();
    for (let d = 6; d <= 31; d++) {
      s.setNow(at(d));
      await ensureQuests(s.ctx, U);
    }
    s.setNow('2026-11-20T09:00:00+01:00');
    await ensureQuests(s.ctx, U);
    const all = await s.store.listInstances(U);
    expect(all.length).toBeGreaterThan(40);
    expect(all.every((i) => !i.trackId && !i.templateId.match(/-r\d\d$/))).toBe(true);
  });

  it('est plafonnée par le score : l’échelon courant monte, la quête reste celle du dernier échelon accessible', async () => {
    const s = await hero();
    await startTrack(s.ctx, U, { trackId: 'lecture-fiction' }); // INT 2 : échelon 5+ exige 4
    await s.store.saveTrack(U, { ...(await track(s, 'lecture-fiction')), rung: 6, bestRung: 6 });
    s.setNow(at(6));
    await ensureQuests(s.ctx, U);
    const q = (await trackQuests(s, 'lecture-fiction')).find((x) => x.periodStart === date(6))!;
    expect(q.rung).toBe(4);
    expect(q.templateId).toBe('lecture-fiction-r04');
    expect(q.snapshot.difficulty).toBe('medium');
    expect(await track(s, 'lecture-fiction')).toMatchObject({ rung: 6 });
  });

  it('ignore les réglages « trop dur / trop facile » mémorisés pour l’échelon (la progression d’échelon les remplace)', async () => {
    const s = await hero();
    await s.store.savePreference(U, { templateId: 'muscu-haut-r02', tune: -1 });
    await s.store.savePreference(U, { templateId: 'muscu-haut-r01', tune: 0 });
    await startTrack(s.ctx, U, { trackId: 'muscu-haut' });
    await s.store.saveTrack(U, { ...(await track(s, 'muscu-haut')), rung: 2 });
    s.setNow(at(6));
    await ensureQuests(s.ctx, U);
    const q = (await trackQuests(s)).find((x) => x.periodStart === date(6))!;
    expect(q.rung).toBe(2);
    expect(q.snapshot.validation).toEqual({ type: 'counter', target: 10, unit: 'fois' });
    expect(q.snapshot.tune).toBeUndefined();
  });

  it('tolère un parcours sans gabarit (contenu absent) et un état jamais pointé', async () => {
    const s = await hero();
    await s.store.saveTrack(U, { trackId: 'fantome', status: 'active', rung: 1, hits: 0, lastDoneDate: null, lastCheckedDate: '2026-09-01', bestRung: 1, startedAt: '2026-09-01T00:00:00Z' });
    await s.store.saveTrack(U, { trackId: 'muscu-haut', status: 'active', rung: 3, hits: 2, lastDoneDate: null, lastCheckedDate: null, bestRung: 3, startedAt: '2026-09-01T00:00:00Z' });
    await ensureQuests(s.ctx, U);
    expect(await track(s, 'muscu-haut')).toMatchObject({ rung: 3, hits: 2, lastCheckedDate: '2026-10-05' });
    expect((await trackQuests(s)).map((q) => q.trackId)).toEqual(['muscu-haut']);
    // le parcours fantôme (aucun gabarit d'échelon) est nettoyé, il ne compte plus dans la limite
    expect((await s.store.listTracks(U)).map((t) => t.trackId)).toEqual(['muscu-haut']);
  });

  it('ignore un parcours dont le gabarit de l’échelon effectif manque', async () => {
    const holes = TEST_RUNG_TEMPLATES.filter((t) => t.trackId !== 'muscu-haut' || t.rung !== 1);
    const s = await hero([...catalog, ...holes]);
    await s.store.saveTrack(U, { trackId: 'muscu-haut', status: 'active', rung: 1, hits: 0, lastDoneDate: null, lastCheckedDate: '2026-10-05', bestRung: 1, startedAt: '2026-10-05T00:00:00Z' });
    await ensureQuests(s.ctx, U);
    expect(await trackQuests(s)).toHaveLength(0);
  });
});

describe('montée, descente, repos, pause', () => {
  it('5 jours validés font monter d’un échelon, et la quête suivante est celle de l’échelon 2', async () => {
    const s = await hero();
    await startTrack(s.ctx, U, { trackId: 'muscu-haut' });
    let last;
    for (let d = 5; d <= 9; d++) {
      last = await playDay(s, d, 'muscu-haut');
      const t = await track(s, 'muscu-haut');
      if (d < 9) expect(t).toMatchObject({ rung: 1, hits: d - 4 });
    }
    expect(last!.rung).toBe(1);
    expect(await track(s, 'muscu-haut')).toMatchObject({ rung: 2, hits: 0, bestRung: 2, lastDoneDate: date(9) });
    s.setNow(at(10));
    await ensureQuests(s.ctx, U);
    const next = (await trackQuests(s)).find((q) => q.periodStart === date(10))!;
    expect(next).toMatchObject({ rung: 2, templateId: 'muscu-haut-r02' });
    const r = await finish(s, next);
    expect(r.ok && r.data.track).toMatchObject({ rung: 2, hits: 1 });
  });

  it('indique la montée dans la réponse de validation', async () => {
    const s = await hero();
    await startTrack(s.ctx, U, { trackId: 'muscu-haut' });
    await s.store.saveTrack(U, { ...(await track(s, 'muscu-haut')), hits: 4 });
    const [q] = await trackQuests(s);
    const r = await finish(s, q);
    expect(r.ok && r.data.trackPromoted).toBe(true);
    expect(r.ok && r.data.track).toMatchObject({ rung: 2, hits: 0 });
  });

  it('les jours validés n’ont pas besoin d’être consécutifs (2 jours manqués ne pénalisent pas)', async () => {
    const s = await hero();
    await startTrack(s.ctx, U, { trackId: 'muscu-haut' });
    for (const d of [5, 6, 9, 10, 13]) await playDay(s, d, 'muscu-haut');
    expect(await track(s, 'muscu-haut')).toMatchObject({ rung: 2, hits: 0 });
  });

  it('4 jours manqués d’affilée font redescendre d’un échelon (minimum 1)', async () => {
    const s = await hero();
    await startTrack(s.ctx, U, { trackId: 'muscu-haut' });
    for (let d = 5; d <= 9; d++) await playDay(s, d, 'muscu-haut');
    expect((await track(s, 'muscu-haut')).rung).toBe(2);
    // 10, 11, 12 manqués : pas encore
    s.setNow(at(13));
    await ensureQuests(s.ctx, U);
    expect(await track(s, 'muscu-haut')).toMatchObject({ rung: 2, lastCheckedDate: date(9) });
    // 13 aussi manqué : au passage du 14, descente
    s.setNow(at(14));
    await ensureQuests(s.ctx, U);
    expect(await track(s, 'muscu-haut')).toMatchObject({ rung: 1, hits: 0, bestRung: 2, lastCheckedDate: date(13) });
    const q = (await trackQuests(s)).find((x) => x.periodStart === date(14))!;
    expect(q).toMatchObject({ rung: 1, templateId: 'muscu-haut-r01' });
    // 4 autres jours manqués à l'échelon 1 : on ne descend pas sous 1
    s.setNow(at(19));
    await ensureQuests(s.ctx, U);
    expect(await track(s, 'muscu-haut')).toMatchObject({ rung: 1, hits: 0 });
  });

  it('les descentes ne dépendent pas du nombre d’ouvertures de l’appli', async () => {
    const run = async (days: number[]) => {
      const s = await hero();
      await startTrack(s.ctx, U, { trackId: 'muscu-haut' });
      await s.store.saveTrack(U, { ...(await track(s, 'muscu-haut')), rung: 4 });
      for (const d of days) {
        s.setNow(at(d));
        await ensureQuests(s.ctx, U);
      }
      return track(s, 'muscu-haut');
    };
    const often = await run([6, 7, 8, 9, 10]);
    const once = await run([10]);
    expect(often.rung).toBe(3);
    expect(once.rung).toBe(3);
  });

  it('un long départ ne coûte qu’un échelon par retour', async () => {
    const s = await hero();
    await startTrack(s.ctx, U, { trackId: 'muscu-haut' });
    await s.store.saveTrack(U, { ...(await track(s, 'muscu-haut')), rung: 7, bestRung: 7 });
    s.setNow('2026-11-20T09:00:00+01:00');
    await ensureQuests(s.ctx, U);
    expect(await track(s, 'muscu-haut')).toMatchObject({ rung: 6, bestRung: 7 });
  });

  it('un jour de repos protège : il ne compte pas comme manqué', async () => {
    const s = await hero();
    await startTrack(s.ctx, U, { trackId: 'muscu-haut' });
    await s.store.saveTrack(U, { ...(await track(s, 'muscu-haut')), rung: 3, bestRung: 3 });
    s.setNow(at(6));
    await ensureQuests(s.ctx, U);
    expect((await declareRest(s.ctx, U)).ok).toBe(true); // 6 octobre
    s.setNow(at(10));
    await ensureQuests(s.ctx, U);
    // jours 5 (jour de départ, non compté), 6 (repos), 7, 8, 9 manqués → 3 jours manqués seulement
    expect(await track(s, 'muscu-haut')).toMatchObject({ rung: 3 });
    s.setNow(at(11));
    await ensureQuests(s.ctx, U);
    expect((await track(s, 'muscu-haut')).rung).toBe(2);
  });

  it('une pause gèle l’échelon et les jours manqués ; la reprise repart d’aujourd’hui', async () => {
    const s = await hero();
    await startTrack(s.ctx, U, { trackId: 'muscu-haut' });
    await s.store.saveTrack(U, { ...(await track(s, 'muscu-haut')), rung: 5, hits: 3, bestRung: 5 });
    s.setNow(at(6));
    expect((await setTrackPaused(s.ctx, U, { trackId: 'muscu-haut', paused: true })).ok).toBe(true);
    s.setNow(at(20));
    await ensureQuests(s.ctx, U);
    expect(await track(s, 'muscu-haut')).toMatchObject({ status: 'paused', rung: 5, hits: 3 });
    expect((await trackQuests(s)).filter((q) => q.periodStart > date(5))).toHaveLength(0);
    const resumed = await setTrackPaused(s.ctx, U, { trackId: 'muscu-haut', paused: false });
    expect(resumed.ok && resumed.track).toMatchObject({ status: 'active', rung: 5, hits: 3, lastCheckedDate: date(20) });
    expect((await trackQuests(s)).filter((q) => q.periodStart === date(20))).toHaveLength(1);
    s.setNow(at(22));
    await ensureQuests(s.ctx, U);
    expect(await track(s, 'muscu-haut')).toMatchObject({ rung: 5 });
  });

  it('valider une quête restée ouverte pendant la pause ne fait pas avancer le parcours', async () => {
    const s = await hero();
    await startTrack(s.ctx, U, { trackId: 'muscu-haut' });
    const [q] = await trackQuests(s);
    await setTrackPaused(s.ctx, U, { trackId: 'muscu-haut', paused: true });
    const r = await finish(s, q);
    expect(r.ok && r.data.track).toMatchObject({ status: 'paused', hits: 0 });
    expect(r.ok && r.data.trackPromoted).toBe(false);
  });

  it('une validation hors ligne le dernier jour compte dans le parcours', async () => {
    const s = await hero();
    await startTrack(s.ctx, U, { trackId: 'muscu-haut' });
    const [q] = await trackQuests(s);
    s.setNow(at(6, 6)); // avant le reset de 4 h ? non : 6 h, donc nouveau jour — la quête d'hier a expiré
    await ensureQuests(s.ctx, U);
    const r = await finish(s, q, { clientCompletedAt: at(5, 22) });
    expect(r.ok).toBe(true);
    expect(await track(s, 'muscu-haut')).toMatchObject({ hits: 1, lastDoneDate: date(5) });
  });

  it('au dernier échelon, les validations continuent sans monter', async () => {
    const s = await hero();
    await startTrack(s.ctx, U, { trackId: 'muscu-haut' });
    await s.store.saveTrack(U, { ...(await track(s, 'muscu-haut')), rung: 10, hits: 4, bestRung: 10 });
    s.setNow(at(6));
    await ensureQuests(s.ctx, U);
    // FOR 5 : l'échelon 10 est verrouillé (9 requis) → quête de l'échelon 6 mais l'état reste à 10
    const [q] = (await trackQuests(s)).filter((x) => x.periodStart === date(6));
    expect(q.rung).toBe(6);
    const r = await finish(s, q);
    expect(r.ok && r.data.track).toMatchObject({ rung: 10, hits: 5 });
  });
});

describe('série basée sur les parcours', () => {
  it('avec un parcours actif, seule une quête de parcours validée compte', async () => {
    const s = await hero();
    await startTrack(s.ctx, U, { trackId: 'muscu-haut' });
    const free = (await s.store.listInstances(U, { period: 'daily' })).find((q) => q.origin === 'draw')!;
    await acceptQuest(s.ctx, U, free.id);
    const r = await finish(s, free);
    expect(r.ok && r.data.streak).toBe(0);
    expect((await s.store.getCharacter(U))!.streakCurrent).toBe(0);
    const [q] = await trackQuests(s);
    const r2 = await finish(s, q);
    expect(r2.ok && r2.data.streak).toBe(1);
  });

  it('la série monte jour après jour, tient avec un repos et casse après un jour sans quête de parcours', async () => {
    const s = await hero();
    await startTrack(s.ctx, U, { trackId: 'muscu-haut' });
    await playDay(s, 5, 'muscu-haut');
    await playDay(s, 6, 'muscu-haut');
    expect((await s.store.getCharacter(U))!.streakCurrent).toBe(2);
    // le 7 : repos (pas de validation)
    s.setNow(at(7));
    await ensureQuests(s.ctx, U);
    expect((await declareRest(s.ctx, U)).ok).toBe(true);
    await playDay(s, 8, 'muscu-haut');
    expect((await s.store.getCharacter(U))!.streakCurrent).toBe(3);
    // le 9 et le 10 manqués : série cassée
    s.setNow(at(11));
    await ensureQuests(s.ctx, U);
    const c = (await s.store.getCharacter(U))!;
    expect(c.streakCurrent).toBe(0);
    expect(c.streakBest).toBe(3);
  });

  it('sans parcours actif, repli sur l’ancienne règle (n’importe quelle quête du jour), y compris parcours en pause', async () => {
    const s = await hero();
    const free = (await s.store.listInstances(U, { period: 'daily' }))[0];
    await acceptQuest(s.ctx, U, free.id);
    expect((await finish(s, free)).ok && (await s.store.getCharacter(U))!.streakCurrent).toBe(1);
    // un parcours en pause n'impose pas la nouvelle règle
    await startTrack(s.ctx, U, { trackId: 'muscu-haut' });
    expect((await s.store.getCharacter(U))!.streakCurrent).toBe(0);
    await setTrackPaused(s.ctx, U, { trackId: 'muscu-haut', paused: true });
    const rec = (await recomputeCharacter(s.ctx, U))!;
    expect(rec.streakCurrent).toBe(1);
    // après l'arrêt aussi ; les quêtes de parcours passées restent comptées
    await stopTrack(s.ctx, U, { trackId: 'muscu-haut' });
    expect((await recomputeCharacter(s.ctx, U))!.streakCurrent).toBe(1);
  });
});

describe('annulation', () => {
  it('retire le jour validé du parcours', async () => {
    const s = await hero();
    await startTrack(s.ctx, U, { trackId: 'muscu-haut' });
    const [q] = await trackQuests(s);
    await finish(s, q);
    expect(await track(s, 'muscu-haut')).toMatchObject({ hits: 1, lastDoneDate: date(5) });
    const r = await undoQuest(s.ctx, U, q.id);
    expect(r.ok).toBe(true);
    expect(await track(s, 'muscu-haut')).toMatchObject({ rung: 1, hits: 0, lastDoneDate: null });
    expect((await s.store.getCharacter(U))!.streakCurrent).toBe(0);
    // on peut revalider ensuite
    const again = await finish(s, (await s.store.getInstance(U, q.id))!);
    expect(again.ok && again.data.track).toMatchObject({ hits: 1 });
  });

  it('défait aussi une montée d’échelon et restaure la dernière date validée', async () => {
    const s = await hero();
    await startTrack(s.ctx, U, { trackId: 'muscu-haut' });
    for (let d = 5; d <= 8; d++) await playDay(s, d, 'muscu-haut');
    const last = await playDay(s, 9, 'muscu-haut');
    expect(await track(s, 'muscu-haut')).toMatchObject({ rung: 2, hits: 0, bestRung: 2 });
    expect((await undoQuest(s.ctx, U, last.id)).ok).toBe(true);
    expect(await track(s, 'muscu-haut')).toMatchObject({ rung: 1, hits: 4, bestRung: 1, lastDoneDate: date(8) });
  });

  it('fonctionne si le parcours a été arrêté entre-temps, et ne touche pas aux quêtes libres', async () => {
    const s = await hero();
    await startTrack(s.ctx, U, { trackId: 'muscu-haut' });
    const [q] = await trackQuests(s);
    await finish(s, q);
    await stopTrack(s.ctx, U, { trackId: 'muscu-haut' });
    expect((await undoQuest(s.ctx, U, q.id)).ok).toBe(true);
    expect(await s.store.listTracks(U)).toEqual([]);
    const free = (await s.store.listInstances(U, { period: 'daily' })).find((i) => i.origin === 'draw')!;
    await acceptQuest(s.ctx, U, free.id);
    await finish(s, free);
    expect((await undoQuest(s.ctx, U, free.id)).ok).toBe(true);
  });

  it('la validation d’une quête de parcours dont l’état a disparu reste possible', async () => {
    const s = await hero();
    await startTrack(s.ctx, U, { trackId: 'muscu-haut' });
    const [q] = await trackQuests(s);
    await acceptQuest(s.ctx, U, q.id); // une quête entamée survit à l'arrêt du parcours (la proposée est retirée)
    await stopTrack(s.ctx, U, { trackId: 'muscu-haut' });
    const r = await finish(s, q);
    expect(r.ok).toBe(true);
    expect(r.ok && r.data.track).toBeUndefined();
  });
});

describe('« Pour aller plus loin » et périodes longues', () => {
  it('tout est proposé, rien n’est accepté d’office, pas de pénalité', async () => {
    const s = await hero();
    await startTrack(s.ctx, U, { trackId: 'muscu-haut' });
    for (const d of [6, 13, 20]) {
      s.setNow(at(d));
      await ensureQuests(s.ctx, U);
    }
    const all = await s.store.listInstances(U);
    expect(all.filter((i) => i.origin !== 'track').every((i) => i.status === 'proposed' || i.status === 'expired')).toBe(true);
    expect(all.some((i) => i.status === 'accepted')).toBe(false);
    expect(all.filter((i) => i.period === 'daily' && i.origin === 'draw').every((i) => i.free)).toBe(true);
    expect((await s.store.listXpEvents(U)).length).toBe(0);
  });

  it('une quête épinglée revient chaque jour en proposition', async () => {
    const s = await hero();
    const pin = catalog.find((t) => t.difficulty === 'easy' && t.periods.includes('daily') && t.ability === 'FOR')!;
    await s.store.savePreference(U, { templateId: pin.id, isPinned: true });
    s.setNow(at(6));
    await ensureQuests(s.ctx, U);
    const day = (await s.store.listInstances(U, { period: 'daily' })).filter((i) => i.periodStart === date(6));
    const p = day.find((i) => i.templateId === pin.id)!;
    expect(p).toMatchObject({ status: 'proposed', free: true, origin: 'draw' });
    expect(day).toHaveLength(3);
  });

  it('le mode manuel (0 quête par jour) ne propose plus de suggestions, mais les parcours restent', async () => {
    const s = await hero();
    await s.store.saveSettings(U, { ...(await s.store.getSettings(U)), dailyQuestCount: 0 });
    await startTrack(s.ctx, U, { trackId: 'muscu-haut' });
    s.setNow(at(6));
    await ensureQuests(s.ctx, U);
    const day = (await s.store.listInstances(U, { period: 'daily' })).filter((i) => i.periodStart === date(6));
    expect(day.map((i) => i.origin)).toEqual(['track']);
  });
});

describe('persistance', () => {
  it('MemoryStore sauvegarde, remplace et supprime les parcours, et relit les anciens instantanés sans parcours', async () => {
    const store = new MemoryStore([]);
    const t: TrackState = { trackId: 'a', status: 'active', rung: 1, hits: 0, lastDoneDate: null, lastCheckedDate: null, bestRung: 1, startedAt: 'x' };
    await store.saveTrack(U, t);
    await store.saveTrack(U, { ...t, rung: 3 });
    await store.saveTrack(U, { ...t, trackId: 'b' });
    expect((await store.listTracks(U)).map((x) => `${x.trackId}${x.rung}`)).toEqual(['a3', 'b1']);
    await store.deleteTrack(U, 'a');
    expect((await store.listTracks(U)).map((x) => x.trackId)).toEqual(['b']);
    const snap = store.snapshot();
    const old = emptyUserData();
    delete old.tracks;
    const legacy = new MemoryStore([]);
    legacy.restore({ users: { u: old }, posts: [] });
    expect(await legacy.listTracks('u')).toEqual([]);
    const copy = new MemoryStore([]);
    copy.restore(JSON.parse(JSON.stringify(snap)));
    expect((await copy.listTracks(U)).map((x) => x.trackId)).toEqual(['b']);
  });
});
