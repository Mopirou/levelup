import { describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  MAX_ACTIVE_TRACKS,
  MemoryStore,
  SupabaseStore,
  abandonQuest,
  acceptQuest,
  completeQuestAction,
  createCharacter,
  defaultSettings,
  ensureQuests,
  recomputeCharacter,
  rerollQuest,
  setTrackPaused,
  startQuest,
  startTrack,
  stopTrack,
  tuneQuest,
  undoQuest,
  type QuestInstance,
  type QuestTemplate,
  type ServerContext,
  type TrackState,
} from '../src';
import { TEST_RUNG_TEMPLATES } from './track-fixtures';

// Corrections de la revue de code du changement « parcours de discipline ».

const catalog = JSON.parse(readFileSync(join(__dirname, '..', '..', 'content', 'data', 'quests.fr.json'), 'utf8')).map(
  (q: QuestTemplate) => ({ ...q, source: 'catalog' }),
) as QuestTemplate[];

const U = 'user-rev';
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

function setup(templates: QuestTemplate[] = [...catalog, ...TEST_RUNG_TEMPLATES], store = new MemoryStore(templates)) {
  let nowMs = Date.parse(at(5));
  const ctx: ServerContext = { store, now: () => nowMs, uuid: () => `rv-${++counter}` };
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

async function playDay(s: S, day: number, trackId: string) {
  s.setNow(at(day));
  await ensureQuests(s.ctx, U);
  const q = (await trackQuests(s, trackId)).find((x) => x.periodStart === date(day))!;
  expect(q).toBeDefined();
  const r = await finish(s, q);
  expect(r.ok).toBe(true);
  return q;
}

/** Ancienne règle : une quête de « Pour aller plus loin » acceptée puis validée ce jour-là. */
async function playFreeDay(s: S, day: number) {
  s.setNow(at(day));
  await ensureQuests(s.ctx, U);
  const q = (await s.store.listInstances(U, { period: 'daily' })).find((x) => x.periodStart === date(day) && x.origin === 'draw')!;
  expect(q).toBeDefined();
  expect((await acceptQuest(s.ctx, U, q.id)).ok).toBe(true);
  const r = await finish(s, q);
  expect(r.ok).toBe(true);
  return r.ok ? r.data : undefined;
}

describe('I-1 : gabarits chargés une seule fois par commande', () => {
  it('validation d’une quête de parcours : un seul chargement (échelon, XP, trophées)', async () => {
    const s = await hero();
    await startTrack(s.ctx, U, { trackId: 'muscu-haut' });
    const [q] = await trackQuests(s);
    const spy = vi.spyOn(s.store, 'listTemplates');
    expect((await finish(s, q)).ok).toBe(true);
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it('validation d’une quête libre : un seul chargement, sans les gabarits d’échelon', async () => {
    const s = await hero();
    const free = (await s.store.listInstances(U, { period: 'daily' }))[0];
    await acceptQuest(s.ctx, U, free.id);
    const spy = vi.spyOn(s.store, 'listTemplates');
    expect((await finish(s, free)).ok).toBe(true);
    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy.mock.calls[0][1]).toEqual({ withRungs: false });
  });

  it('ensureQuests, startTrack et la reprise d’un parcours : un chargement chacun', async () => {
    const s = await hero();
    const spy = vi.spyOn(s.store, 'listTemplates');
    s.setNow(at(6));
    await ensureQuests(s.ctx, U);
    expect(spy).toHaveBeenCalledTimes(1);
    spy.mockClear();
    expect((await startTrack(s.ctx, U, { trackId: 'muscu-haut' })).ok).toBe(true);
    expect(spy).toHaveBeenCalledTimes(1);
    spy.mockClear();
    await setTrackPaused(s.ctx, U, { trackId: 'muscu-haut', paused: true });
    expect(spy.mock.calls.length).toBeLessThanOrEqual(1);
    spy.mockClear();
    expect((await setTrackPaused(s.ctx, U, { trackId: 'muscu-haut', paused: false })).ok).toBe(true);
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it('annulation d’une quête de parcours : un seul chargement', async () => {
    const s = await hero();
    await startTrack(s.ctx, U, { trackId: 'muscu-haut' });
    const [q] = await trackQuests(s);
    await finish(s, q);
    const spy = vi.spyOn(s.store, 'listTemplates');
    expect((await undoQuest(s.ctx, U, q.id)).ok).toBe(true);
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it('startQuest et rerollQuest : un chargement, sans gabarits d’échelon', async () => {
    const s = await hero();
    const spy = vi.spyOn(s.store, 'listTemplates');
    const free = (await s.store.listInstances(U, { period: 'daily' }))[0];
    await rerollQuest(s.ctx, U, free.id);
    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy.mock.calls[0][1]).toEqual({ withRungs: false });
    spy.mockClear();
    const t = catalog.find((x) => x.difficulty === 'medium' && x.periods.includes('weekly') && x.ability === 'FOR')!;
    await startQuest(s.ctx, U, { templateId: t.id, period: 'weekly' });
    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy.mock.calls[0][1]).toEqual({ withRungs: false });
  });

  it('MemoryStore : withRungs=false retire les gabarits d’échelon, le défaut les garde', async () => {
    const store = new MemoryStore([...catalog, ...TEST_RUNG_TEMPLATES]);
    expect((await store.listTemplates(U)).some((t) => t.trackId)).toBe(true);
    expect((await store.listTemplates(U, { withRungs: true })).some((t) => t.trackId)).toBe(true);
    const plain = await store.listTemplates(U, { withRungs: false });
    expect(plain.some((t) => t.trackId)).toBe(false);
    expect(plain).toHaveLength(catalog.length);
  });

  it('SupabaseStore : withRungs=false filtre track_id is null côté base, le défaut non', async () => {
    const calls: [string, unknown[]][][] = [];
    const client = {
      from() {
        const entry: [string, unknown[]][] = [];
        calls.push(entry);
        const proxy: any = new Proxy(
          {},
          {
            get(_t, prop: string) {
              if (prop === 'then') return (res: (v: unknown) => void) => res({ data: [], error: null });
              return (...args: unknown[]) => {
                entry.push([prop, args]);
                return proxy;
              };
            },
          },
        );
        return proxy;
      },
    };
    const store = new SupabaseStore(client);
    await store.listTemplates('u1');
    await store.listTemplates('u1', { withRungs: true });
    await store.listTemplates('u1', { withRungs: false });
    const isCalls = calls.map((c) => c.filter(([m]) => m === 'is'));
    expect(isCalls[0]).toEqual([]);
    expect(isCalls[1]).toEqual([]);
    expect(isCalls[2]).toEqual([['is', ['track_id', null]]]);
  });
});

describe('I-2 : série d’un joueur existant à l’activation d’un parcours', () => {
  it('une série de 3 jours avant le parcours est conservée puis continue', async () => {
    const s = await hero();
    for (const d of [5, 6, 7]) await playFreeDay(s, d);
    expect((await s.store.getCharacter(U))!.streakCurrent).toBe(3);
    s.setNow(at(8));
    expect((await startTrack(s.ctx, U, { trackId: 'muscu-haut' })).ok).toBe(true);
    expect((await s.store.getCharacter(U))!.streakCurrent).toBe(3);
    const [q] = (await trackQuests(s)).filter((x) => x.periodStart === date(8));
    const r1 = await finish(s, q);
    expect(r1.ok && r1.data.streak).toBe(4);
    const q9 = await playDay(s, 9, 'muscu-haut');
    expect(q9.periodStart).toBe(date(9));
    const c = (await s.store.getCharacter(U))!;
    expect(c.streakCurrent).toBe(5);
    expect(c.streakBest).toBe(5);
  });

  it('après la date de démarrage, une quête libre ne compte plus (règle « parcours »)', async () => {
    const s = await hero();
    for (const d of [5, 6, 7]) await playFreeDay(s, d);
    s.setNow(at(8));
    await startTrack(s.ctx, U, { trackId: 'muscu-haut' });
    // le 8, seule une quête libre est validée : le 8 ne compte pas, la série d'avant (3) est conservée
    await playFreeDay(s, 8);
    expect((await s.store.getCharacter(U))!.streakCurrent).toBe(3);
    // le 10 : ni le 8 ni le 9 n'ont de quête de parcours, la série est cassée ; la meilleure reste 3
    s.setNow(at(10));
    await ensureQuests(s.ctx, U);
    expect((await s.store.getCharacter(U))!.streakCurrent).toBe(0);
    expect((await s.store.getCharacter(U))!.streakBest).toBe(3);
  });

  it('l’Inspiration suit la série de transition (7e jour = ancienne série + parcours)', async () => {
    const s = await hero();
    for (const d of [5, 6, 7, 8, 9, 10]) await playFreeDay(s, d);
    expect((await s.store.getCharacter(U))!.inspiration).toBe(0);
    s.setNow(at(11));
    await startTrack(s.ctx, U, { trackId: 'muscu-haut' });
    const [q] = (await trackQuests(s)).filter((x) => x.periodStart === date(11));
    const r = await finish(s, q);
    expect(r.ok && r.data.streak).toBe(7);
    expect(r.ok && r.data.inspirationGained).toBe(true);
    expect((await s.store.getCharacter(U))!.inspiration).toBe(1);
  });

  it('la date de bascule est le plus ancien démarrage : un 2e parcours démarré plus tard ne la déplace pas', async () => {
    const s = await hero();
    for (const d of [5, 6]) await playFreeDay(s, d);
    s.setNow(at(7));
    await startTrack(s.ctx, U, { trackId: 'muscu-haut' });
    await playFreeDay(s, 7); // le 7 : seule une quête libre (ne compte pas, on est déjà en mode parcours)
    s.setNow(at(8));
    await startTrack(s.ctx, U, { trackId: 'course-fond' });
    expect((await recomputeCharacter(s.ctx, U))!.streakCurrent).toBe(0);
  });
});

describe('I-3 : abandon d’une quête de parcours', () => {
  it('refusé avec un message clair, la quête reste ouverte ; une quête libre reste abandonnable', async () => {
    const s = await hero();
    await startTrack(s.ctx, U, { trackId: 'muscu-haut' });
    const [q] = await trackQuests(s);
    const r = await abandonQuest(s.ctx, U, q.id);
    expect(r).toMatchObject({ ok: false, error: 'invalid', message: 'Mets le parcours en pause plutôt que d’abandonner sa quête.' });
    expect((await s.store.getInstance(U, q.id))!.status).toBe('proposed');
    await acceptQuest(s.ctx, U, q.id);
    expect(await abandonQuest(s.ctx, U, q.id)).toMatchObject({ ok: false, error: 'invalid' });
    expect((await s.store.getInstance(U, q.id))!.status).toBe('accepted');
    const free = (await s.store.listInstances(U, { period: 'daily' })).find((i) => i.origin === 'draw')!;
    expect((await abandonQuest(s.ctx, U, free.id)).ok).toBe(true);
  });
});

describe('I-4 : l’annulation ne défait que ce que la validation a compté', () => {
  it('pause → validation → annulation : état du parcours strictement inchangé', async () => {
    const s = await hero();
    await startTrack(s.ctx, U, { trackId: 'muscu-haut' });
    await s.store.saveTrack(U, { ...(await track(s, 'muscu-haut')), rung: 3, hits: 2, bestRung: 3, lastDoneDate: '2026-10-02' });
    const [q] = await trackQuests(s);
    await setTrackPaused(s.ctx, U, { trackId: 'muscu-haut', paused: true });
    const before = await track(s, 'muscu-haut');
    expect((await finish(s, q)).ok).toBe(true);
    expect(await track(s, 'muscu-haut')).toEqual(before);
    expect((await undoQuest(s.ctx, U, q.id)).ok).toBe(true);
    expect(await track(s, 'muscu-haut')).toEqual(before);
  });

  it('pause à zéro hit à l’échelon 4 : l’annulation ne fait pas redescendre', async () => {
    const s = await hero();
    await startTrack(s.ctx, U, { trackId: 'muscu-haut' });
    await s.store.saveTrack(U, { ...(await track(s, 'muscu-haut')), rung: 4, hits: 0, bestRung: 4 });
    const [q] = await trackQuests(s);
    await setTrackPaused(s.ctx, U, { trackId: 'muscu-haut', paused: true });
    await finish(s, q);
    await undoQuest(s.ctx, U, q.id);
    expect(await track(s, 'muscu-haut')).toMatchObject({ status: 'paused', rung: 4, hits: 0, bestRung: 4 });
  });

  it('validation normale → annulation : comme avant, et on peut revalider', async () => {
    const s = await hero();
    await startTrack(s.ctx, U, { trackId: 'muscu-haut' });
    const before = await track(s, 'muscu-haut');
    const [q] = await trackQuests(s);
    await finish(s, q);
    expect(await track(s, 'muscu-haut')).toMatchObject({ hits: 1, lastDoneDate: date(5) });
    await undoQuest(s.ctx, U, q.id);
    expect(await track(s, 'muscu-haut')).toEqual(before);
    const again = await finish(s, (await s.store.getInstance(U, q.id))!);
    expect(again.ok && again.data.track).toMatchObject({ hits: 1 });
  });

  it('montée d’échelon puis annulation : retour exact (échelon, hits, meilleur échelon, dernière date)', async () => {
    const s = await hero();
    await startTrack(s.ctx, U, { trackId: 'muscu-haut' });
    for (let d = 5; d <= 8; d++) await playDay(s, d, 'muscu-haut');
    const before = await track(s, 'muscu-haut');
    const last = await playDay(s, 9, 'muscu-haut');
    expect(await track(s, 'muscu-haut')).toMatchObject({ rung: 2, hits: 0 });
    await undoQuest(s.ctx, U, last.id);
    // seule la date de dernier règlement a avancé avec le passage du 9
    expect(await track(s, 'muscu-haut')).toEqual({ ...before, lastCheckedDate: date(8) });
  });

  it('dernier échelon (hits plafonné) : l’annulation restaure exactement l’état', async () => {
    const s = await hero();
    await startTrack(s.ctx, U, { trackId: 'muscu-haut' });
    await s.store.saveTrack(U, { ...(await track(s, 'muscu-haut')), rung: 10, hits: 5, bestRung: 10, lastDoneDate: '2026-10-04' });
    s.setNow(at(6));
    await ensureQuests(s.ctx, U);
    const before = await track(s, 'muscu-haut');
    const [q] = (await trackQuests(s)).filter((x) => x.periodStart === date(6));
    expect((await finish(s, q)).ok).toBe(true);
    expect(await track(s, 'muscu-haut')).toMatchObject({ rung: 10, hits: 5, lastDoneDate: date(6) });
    expect((await undoQuest(s.ctx, U, q.id)).ok).toBe(true);
    expect(await track(s, 'muscu-haut')).toEqual(before);
  });

  it('dernier échelon à 3 hits : +1 puis -1', async () => {
    const s = await hero();
    await startTrack(s.ctx, U, { trackId: 'muscu-haut' });
    await s.store.saveTrack(U, { ...(await track(s, 'muscu-haut')), rung: 10, hits: 3, bestRung: 10 });
    const before = await track(s, 'muscu-haut');
    const [q] = await trackQuests(s);
    await finish(s, q);
    expect((await track(s, 'muscu-haut')).hits).toBe(4);
    await undoQuest(s.ctx, U, q.id);
    expect(await track(s, 'muscu-haut')).toEqual(before);
  });

  it('si le parcours a avancé depuis (validation d’un autre jour), le repli défait le jour annulé', async () => {
    const s = await hero();
    await startTrack(s.ctx, U, { trackId: 'muscu-haut' });
    const first = await playDay(s, 5, 'muscu-haut');
    await playDay(s, 6, 'muscu-haut');
    expect((await undoQuest(s.ctx, U, first.id)).ok).toBe(true);
    expect(await track(s, 'muscu-haut')).toMatchObject({ rung: 1, hits: 1, lastDoneDate: date(6) });
  });

  it('une quête validée alors que le parcours n’avait plus d’état, puis annulée, ne touche pas au nouvel état', async () => {
    const s = await hero();
    await startTrack(s.ctx, U, { trackId: 'muscu-haut' });
    const [q] = await trackQuests(s);
    await acceptQuest(s.ctx, U, q.id);
    await stopTrack(s.ctx, U, { trackId: 'muscu-haut' });
    expect((await finish(s, q)).ok).toBe(true);
    await startTrack(s.ctx, U, { trackId: 'muscu-haut' });
    await s.store.saveTrack(U, { ...(await track(s, 'muscu-haut')), rung: 3, hits: 2, bestRung: 3 });
    const before = await track(s, 'muscu-haut');
    await undoQuest(s.ctx, U, q.id);
    expect(await track(s, 'muscu-haut')).toEqual(before);
  });
});

describe('I-6 : « trop dur / trop facile » sur une quête de parcours', () => {
  it('refusé dans les deux sens, rien n’est mémorisé', async () => {
    const s = await hero();
    await startTrack(s.ctx, U, { trackId: 'muscu-haut' });
    await s.store.saveTrack(U, { ...(await track(s, 'muscu-haut')), rung: 2 });
    s.setNow(at(6));
    await ensureQuests(s.ctx, U);
    const q = (await trackQuests(s)).find((x) => x.periodStart === date(6))!;
    expect(q.snapshot.validation.type).toBe('counter');
    for (const dir of ['easier', 'harder'] as const) {
      expect(await tuneQuest(s.ctx, U, q.id, dir)).toMatchObject({ ok: false, error: 'invalid' });
    }
    expect((await s.store.getInstance(U, q.id))!.snapshot).toEqual(q.snapshot);
    expect(await s.store.getPreferences(U)).toEqual({});
  });

  it('une ancienne préférence « tune » sur un gabarit d’échelon est ignorée à la création de la quête', async () => {
    const s = await hero();
    await s.store.savePreference(U, { templateId: 'muscu-haut-r02', tune: -1 });
    await startTrack(s.ctx, U, { trackId: 'muscu-haut' });
    await s.store.saveTrack(U, { ...(await track(s, 'muscu-haut')), rung: 2 });
    s.setNow(at(6));
    await ensureQuests(s.ctx, U);
    const q = (await trackQuests(s)).find((x) => x.periodStart === date(6))!;
    expect(q.snapshot.validation).toEqual({ type: 'counter', target: 10, unit: 'fois' });
    expect(q.snapshot.tune).toBeUndefined();
  });

  it('les quêtes libres restent ajustables', async () => {
    const s = await hero();
    const free = (await s.store.listInstances(U, { period: 'daily' })).find((i) => ['counter', 'timer'].includes(i.snapshot.validation.type));
    if (!free) return;
    expect((await tuneQuest(s.ctx, U, free.id, 'easier')).ok).toBe(true);
  });
});

describe('I-7 : validation hors ligne d’une quête de parcours expirée', () => {
  /** Départ le 5, quatre jours manqués (6 à 9) réglés au passage du 10 : la quête du 9 est expirée et son jour est réglé. */
  async function settled() {
    const s = await hero();
    await startTrack(s.ctx, U, { trackId: 'muscu-haut' });
    await s.store.saveTrack(U, { ...(await track(s, 'muscu-haut')), rung: 3, bestRung: 3 });
    for (let d = 6; d <= 9; d++) {
      s.setNow(at(d));
      await ensureQuests(s.ctx, U);
    }
    s.setNow(at(10, 6));
    await ensureQuests(s.ctx, U);
    const q9 = (await trackQuests(s)).find((x) => x.periodStart === date(9))!;
    expect(q9.status).toBe('expired');
    expect(await track(s, 'muscu-haut')).toMatchObject({ rung: 2, lastCheckedDate: date(9) });
    return { s, q9 };
  }

  it('jour déjà réglé (compté manqué, descente appliquée) : refusé, ni XP ni avancement', async () => {
    const { s, q9 } = await settled();
    const before = await track(s, 'muscu-haut');
    const r = await finish(s, q9, { clientCompletedAt: at(9, 22) });
    expect(r).toMatchObject({ ok: false, error: 'too-late' });
    expect(r.ok === false && r.message).toMatch(/réglé/);
    expect(await track(s, 'muscu-haut')).toEqual(before);
    expect((await s.store.listXpEvents(U)).length).toBe(0);
    expect((await s.store.getInstance(U, q9.id))!.status).toBe('expired');
  });

  it('jour pas encore réglé (série de jours manqués en cours, recomptée ensuite) : la validation passe', async () => {
    const s = await hero();
    await startTrack(s.ctx, U, { trackId: 'muscu-haut' });
    await s.store.saveTrack(U, { ...(await track(s, 'muscu-haut')), rung: 3, bestRung: 3 });
    s.setNow(at(6));
    await ensureQuests(s.ctx, U);
    const q6 = (await trackQuests(s)).find((x) => x.periodStart === date(6))!;
    s.setNow(at(7, 6));
    await ensureQuests(s.ctx, U);
    expect((await track(s, 'muscu-haut')).lastCheckedDate).toBe(date(5)); // la série de manqués (jour 6) est encore ouverte
    const r = await finish(s, q6, { clientCompletedAt: at(6, 22) });
    expect(r.ok).toBe(true);
    expect(await track(s, 'muscu-haut')).toMatchObject({ hits: 1, lastDoneDate: date(6) });
  });

  it('jour de démarrage : une validation hors ligne passe', async () => {
    const s = await hero();
    await startTrack(s.ctx, U, { trackId: 'muscu-haut' });
    const [q] = await trackQuests(s);
    s.setNow(at(6, 6));
    await ensureQuests(s.ctx, U);
    const r = await finish(s, q, { clientCompletedAt: at(5, 22) });
    expect(r.ok).toBe(true);
    expect(await track(s, 'muscu-haut')).toMatchObject({ hits: 1, lastDoneDate: date(5) });
  });

  it('le jour de démarrage reste validable même quand le règlement a déjà dépassé ce jour (il n’est jamais compté manqué)', async () => {
    const s = await hero();
    await startTrack(s.ctx, U, { trackId: 'muscu-haut' });
    const [q] = await trackQuests(s);
    s.setNow(at(6, 6));
    await ensureQuests(s.ctx, U);
    await s.store.saveTrack(U, { ...(await track(s, 'muscu-haut')), lastCheckedDate: date(6) });
    expect((await finish(s, q, { clientCompletedAt: at(5, 22) })).ok).toBe(true);
  });

  it('une quête acceptée mais pas encore expirée n’est pas concernée', async () => {
    const s = await hero();
    await startTrack(s.ctx, U, { trackId: 'muscu-haut' });
    const [q] = await trackQuests(s);
    await acceptQuest(s.ctx, U, q.id);
    s.setNow(at(6, 3)); // avant le reset de 4 h : encore le jour 5
    expect((await finish(s, q, { clientCompletedAt: at(5, 22) })).ok).toBe(true);
  });

  it('parcours en pause : le règlement n’est pas en jeu, la validation passe sans avancer l’état', async () => {
    const { s, q9 } = await settled();
    await setTrackPaused(s.ctx, U, { trackId: 'muscu-haut', paused: true });
    const before = await track(s, 'muscu-haut');
    const r = await finish(s, q9, { clientCompletedAt: at(9, 22) });
    expect(r.ok).toBe(true);
    expect(await track(s, 'muscu-haut')).toEqual(before);
  });

  it('parcours arrêté : comportement inchangé', async () => {
    const { s, q9 } = await settled();
    await stopTrack(s.ctx, U, { trackId: 'muscu-haut' });
    expect((await finish(s, q9, { clientCompletedAt: at(9, 22) })).ok).toBe(true);
  });

  it('l’horodatage client est borné au jour de la quête (avant ou après : hors période)', async () => {
    const s = await hero();
    await startTrack(s.ctx, U, { trackId: 'muscu-haut' });
    s.setNow(at(6));
    await ensureQuests(s.ctx, U);
    const q6 = (await trackQuests(s)).find((x) => x.periodStart === date(6))!;
    s.setNow(at(7, 6));
    await ensureQuests(s.ctx, U);
    expect(await finish(s, q6, { clientCompletedAt: at(7, 5) })).toMatchObject({ ok: false, error: 'out-of-period' });
    expect(await finish(s, q6, { clientCompletedAt: at(5, 22) })).toMatchObject({ ok: false, error: 'out-of-period' });
    expect(await finish(s, q6, { clientCompletedAt: 'pas une date' })).toMatchObject({ ok: false, error: 'invalid' });
    expect((await finish(s, q6, { clientCompletedAt: at(6, 23) })).ok).toBe(true);
    expect(await track(s, 'muscu-haut')).toMatchObject({ lastDoneDate: date(6) });
  });
});

describe('M-2 : descentes signalées dans EnsureResult', () => {
  it('liste les descentes constatées pendant le passage (et rien sinon)', async () => {
    const s = await hero();
    await startTrack(s.ctx, U, { trackId: 'muscu-haut' });
    await s.store.saveTrack(U, { ...(await track(s, 'muscu-haut')), rung: 4, bestRung: 4 });
    s.setNow(at(8));
    const none = await ensureQuests(s.ctx, U);
    expect(none.demoted ?? []).toEqual([]);
    s.setNow(at(10));
    const r = await ensureQuests(s.ctx, U);
    expect(r.demoted).toEqual([{ trackId: 'muscu-haut', from: 4, to: 3 }]);
    // déjà constaté : pas de redite au passage suivant
    expect((await ensureQuests(s.ctx, U)).demoted ?? []).toEqual([]);
  });

  it('plusieurs parcours : une entrée par parcours descendu', async () => {
    const s = await hero();
    await startTrack(s.ctx, U, { trackId: 'muscu-haut' });
    await startTrack(s.ctx, U, { trackId: 'course-fond' });
    await s.store.saveTrack(U, { ...(await track(s, 'muscu-haut')), rung: 3 });
    await s.store.saveTrack(U, { ...(await track(s, 'course-fond')), rung: 2 });
    s.setNow(at(10));
    const r = await ensureQuests(s.ctx, U);
    expect((r.demoted ?? []).map((d) => `${d.trackId}:${d.from}>${d.to}`).sort()).toEqual(['course-fond:2>1', 'muscu-haut:3>2']);
  });
});

describe('M-3 : arrêter un parcours', () => {
  it('supprime la quête proposée du jour : un redémarrage le même jour recrée la quête de l’échelon 1', async () => {
    const s = await hero();
    await startTrack(s.ctx, U, { trackId: 'muscu-haut' });
    const [old] = await trackQuests(s);
    await stopTrack(s.ctx, U, { trackId: 'muscu-haut' });
    expect(await s.store.getInstance(U, old.id)).toBeNull();
    expect(await trackQuests(s)).toHaveLength(0);
    await startTrack(s.ctx, U, { trackId: 'muscu-haut' });
    const [fresh] = await trackQuests(s);
    expect(fresh).toMatchObject({ trackId: 'muscu-haut', rung: 1, status: 'proposed', periodStart: date(5) });
    expect(fresh.id).not.toBe(old.id);
  });

  it('ne touche ni à une quête validée, ni aux quêtes d’autres parcours', async () => {
    const s = await hero();
    await startTrack(s.ctx, U, { trackId: 'muscu-haut' });
    await startTrack(s.ctx, U, { trackId: 'course-fond' });
    const done = (await trackQuests(s, 'muscu-haut'))[0];
    await finish(s, done);
    const other = (await trackQuests(s, 'course-fond'))[0];
    await stopTrack(s.ctx, U, { trackId: 'muscu-haut' });
    expect((await s.store.getInstance(U, done.id))!.status).toBe('completed');
    expect((await s.store.getInstance(U, other.id))!.status).toBe('proposed');
  });

  it('une quête passée non validée (expirée) reste dans l’historique', async () => {
    const s = await hero();
    await startTrack(s.ctx, U, { trackId: 'muscu-haut' });
    const [old] = await trackQuests(s);
    s.setNow(at(6));
    await ensureQuests(s.ctx, U);
    await stopTrack(s.ctx, U, { trackId: 'muscu-haut' });
    expect((await s.store.getInstance(U, old.id))!.status).toBe('expired');
    expect(await trackQuests(s)).toHaveLength(1);
  });
});

describe('M-4 : parcours orphelins (aucun gabarit d’échelon)', () => {
  const ghost: TrackState = { trackId: 'fantome', status: 'active', rung: 1, hits: 0, lastDoneDate: null, lastCheckedDate: '2026-10-05', bestRung: 1, startedAt: '2026-10-05T00:00:00Z' };

  it('ne comptent pas dans la limite de 3 actifs (démarrage)', async () => {
    const s = await hero();
    await s.store.saveTrack(U, ghost);
    await s.store.saveTrack(U, { ...ghost, trackId: 'fantome-2' });
    for (const id of ['muscu-haut', 'course-fond', 'lecture-fiction']) {
      expect((await startTrack(s.ctx, U, { trackId: id })).ok).toBe(true);
    }
    expect(MAX_ACTIVE_TRACKS).toBe(3);
    expect(await startTrack(s.ctx, U, { trackId: 'yoga-doux' })).toMatchObject({ ok: false, error: 'too-many-open' });
  });

  it('la reprise d’un parcours ne compte pas non plus les orphelins', async () => {
    const s = await hero();
    for (const id of ['fantome', 'fantome-2', 'fantome-3']) await s.store.saveTrack(U, { ...ghost, trackId: id });
    await s.store.saveTrack(U, { ...ghost, trackId: 'muscu-haut', status: 'paused' });
    expect((await setTrackPaused(s.ctx, U, { trackId: 'muscu-haut', paused: false })).ok).toBe(true);
  });

  it('sont nettoyés au passage de ensureQuests, sans toucher aux vrais parcours', async () => {
    const s = await hero();
    await startTrack(s.ctx, U, { trackId: 'muscu-haut' });
    await s.store.saveTrack(U, ghost);
    await s.store.saveTrack(U, { ...ghost, trackId: 'fantome-pause', status: 'paused' });
    s.setNow(at(6));
    await ensureQuests(s.ctx, U);
    expect((await s.store.listTracks(U)).map((t) => t.trackId)).toEqual(['muscu-haut']);
  });

  it('si aucun gabarit de parcours n’existe (contenu absent), rien n’est supprimé', async () => {
    const s = await hero(catalog);
    await s.store.saveTrack(U, ghost);
    await ensureQuests(s.ctx, U);
    expect((await s.store.listTracks(U)).map((t) => t.trackId)).toEqual(['fantome']);
  });
});

describe('M-5 : la limite est relue juste avant l’écriture', () => {
  /** Magasin dont le n-ième `listTracks` (compté à partir de `arm`) insère d'abord des parcours concurrents. */
  function racing() {
    const store = new MemoryStore([...catalog, ...TEST_RUNG_TEMPLATES]);
    const st = { n: 0, nth: 0, inject: [] as TrackState[] };
    const real = store.listTracks.bind(store);
    store.listTracks = async (uid: string) => {
      st.n++;
      if (st.nth && st.n === st.nth) for (const t of st.inject) await store.saveTrack(uid, t);
      return real(uid);
    };
    return {
      store,
      arm(nth: number, inject: TrackState[]) {
        st.n = 0;
        st.nth = nth;
        st.inject = inject;
      },
    };
  }
  const mk = (trackId: string, status: 'active' | 'paused' = 'active'): TrackState => ({ trackId, status, rung: 1, hits: 0, lastDoneDate: null, lastCheckedDate: '2026-10-05', bestRung: 1, startedAt: '2026-10-05T00:00:00Z' });

  it('startTrack : trois parcours apparus entre la lecture et l’écriture font refuser le 4e', async () => {
    const r = racing();
    const s = setup(undefined, r.store);
    await createCharacter(s.ctx, U, heroInput);
    r.arm(2, [mk('muscu-haut'), mk('course-fond'), mk('lecture-fiction')]);
    expect(await startTrack(s.ctx, U, { trackId: 'yoga-doux' })).toMatchObject({ ok: false, error: 'too-many-open' });
    expect((await s.store.listTracks(U)).map((t) => t.trackId)).not.toContain('yoga-doux');
  });

  it('startTrack : le même parcours apparu entre-temps est un doublon', async () => {
    const r = racing();
    const s = setup(undefined, r.store);
    await createCharacter(s.ctx, U, heroInput);
    r.arm(2, [mk('yoga-doux')]);
    expect(await startTrack(s.ctx, U, { trackId: 'yoga-doux' })).toMatchObject({ ok: false, error: 'already-active' });
  });

  it('setTrackPaused (reprise) : relit aussi avant d’écrire', async () => {
    const r = racing();
    const s = setup(undefined, r.store);
    await createCharacter(s.ctx, U, heroInput);
    await s.store.saveTrack(U, mk('yoga-doux', 'paused'));
    r.arm(2, [mk('muscu-haut'), mk('course-fond'), mk('lecture-fiction')]);
    expect(await setTrackPaused(s.ctx, U, { trackId: 'yoga-doux', paused: false })).toMatchObject({ ok: false, error: 'too-many-open' });
    expect((await s.store.listTracks(U)).find((t) => t.trackId === 'yoga-doux')!.status).toBe('paused');
  });
});

describe('M-1 : « Propositions par jour » pilote « Pour aller plus loin »', () => {
  const freeOf = async (s: S, day: number) =>
    (await s.store.listInstances(U, { period: 'daily' })).filter((i) => i.periodStart === date(day) && i.origin === 'draw');

  async function withCount(n: number) {
    const s = setup();
    await createCharacter(s.ctx, U, heroInput);
    await s.store.saveSettings(U, { ...(await s.store.getSettings(U)), dailyQuestCount: n });
    s.setNow(at(6));
    await ensureQuests(s.ctx, U);
    return s;
  }

  it('la valeur par défaut est 2 (compatible avec la contrainte SQL 0..6)', () => {
    const d = defaultSettings();
    expect(d.dailyQuestCount).toBe(2);
    expect(d.dailyQuestCount).toBeGreaterThanOrEqual(0);
    expect(d.dailyQuestCount).toBeLessThanOrEqual(6);
  });

  it('1, 2, 3 et 4 suggestions ; 0 = aucune ; au-delà de 4 : plafonné à 4', async () => {
    expect(await freeOf(await withCount(0), 6)).toHaveLength(0);
    for (const n of [1, 2, 3, 4]) {
      const free = await freeOf(await withCount(n), 6);
      expect(free).toHaveLength(n);
      expect(free.every((i) => i.free && i.status === 'proposed')).toBe(true);
    }
    expect(await freeOf(await withCount(6), 6)).toHaveLength(4);
  });

  it('une valeur absurde (négative, décimale) est ramenée dans les bornes', async () => {
    expect(await freeOf(await withCount(-3), 6)).toHaveLength(0);
    expect(await freeOf(await withCount(2.7), 6)).toHaveLength(2);
  });
});
