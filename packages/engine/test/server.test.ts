import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  MemoryStore,
  QuestTemplate,
  ServerContext,
  abandonQuest,
  acceptQuest,
  achievementProgress,
  chooseImprovement,
  choosePath,
  completeQuestAction,
  createCharacter,
  declareRest,
  ensureQuests,
  equipTitle,
  recomputeCharacter,
  redoQuest,
  rerollQuest,
  startQuest,
  startTrack,
  undoQuest,
  updateProgress,
  abilityScores,
  ABILITIES,
  type QuestInstance,
} from '../src';
import { TEST_RUNG_TEMPLATES } from './track-fixtures';

const catalog = JSON.parse(readFileSync(join(__dirname, '..', '..', 'content', 'data', 'quests.fr.json'), 'utf8')).map(
  (q: QuestTemplate) => ({ ...q, source: 'catalog' }),
) as QuestTemplate[];

const U = 'user-1';
let counter = 0;

function setup(startIso = '2026-10-05T09:00:00+02:00') {
  const store = new MemoryStore([...catalog, ...TEST_RUNG_TEMPLATES]);
  let nowMs = Date.parse(startIso);
  const ctx: ServerContext = { store, now: () => nowMs, uuid: () => `id-${++counter}` };
  return {
    store,
    ctx,
    setNow: (iso: string) => (nowMs = Date.parse(iso)),
    advanceHours: (h: number) => (nowMs += h * 3600_000),
  };
}

const heroInput = {
  name: 'Aldric',
  classId: 'eclaireur',
  scores: { FOR: 5, DEX: 2, CON: 5, INT: 2, SAG: 2, CHA: 2 },
  portraitId: 'p1',
  frameColor: '#2f5a47',
  motto: 'Un pas après l’autre',
  oath: 'Pour avancer',
  timezone: 'Europe/Paris',
};

/**
 * Personnage créé, avec les propositions du jour (« Pour aller plus loin ») acceptées : reproduit l'ancien flux
 * où des quêtes journalières « en cours » attendaient d'être validées. Rien n'est accepté d'office par le moteur.
 */
async function started() {
  const s = await created();
  await acceptDaily(s);
  return s;
}

async function acceptDaily(s: ReturnType<typeof setup>) {
  for (const q of await s.store.listInstances(U, { period: 'daily', status: 'proposed' })) {
    expect((await acceptQuest(s.ctx, U, q.id)).ok).toBe(true);
  }
}

/** Personnage créé, sans rien accepter. */
async function created() {
  const s = setup();
  const r = await createCharacter(s.ctx, U, heroInput);
  expect(r.ok).toBe(true);
  return s;
}

/** Valide toutes les quêtes acceptées « faciles à satisfaire » d'une période. */
async function completeAllDaily(s: ReturnType<typeof setup>) {
  await acceptDaily(s);
  const today = (await s.store.listInstances(U, { period: 'daily', status: 'accepted' }));
  const done: QuestInstance[] = [];
  for (const q of today) {
    const v = q.snapshot.validation;
    const res = await completeQuestAction(s.ctx, U, {
      instanceId: q.id,
      useInspiration: false,
      progress: v.type === 'counter' ? v.target : v.type === 'timer' ? v.minutes : undefined,
      stepsDone: v.type === 'steps' ? v.steps.map(() => true) : undefined,
      journalText: v.type === 'journal' ? 'x'.repeat(60) : undefined,
    });
    expect(res.ok).toBe(true);
    done.push(q);
  }
  return done;
}

describe('création du personnage', () => {
  it('crée le personnage et propose les premières quêtes, sans rien accepter d’office', async () => {
    const { store } = await created();
    const c = (await store.getCharacter(U))!;
    expect(c.level).toBe(1);
    expect(c.totalXp).toBe(0);
    const daily = await store.listInstances(U, { period: 'daily' });
    // « Pour aller plus loin » : 2 propositions facultatives, plus aucune quête journalière imposée
    expect(daily.filter((q) => !q.free)).toHaveLength(0);
    expect(daily).toHaveLength(2);
    expect(daily.every((q) => q.free && q.status === 'proposed' && q.origin === 'draw')).toBe(true);
    expect(await store.listTracks(U)).toEqual([]);
    const weekly = await store.listInstances(U, { period: 'weekly' });
    expect(weekly).toHaveLength(2);
    expect(weekly.every((q) => q.status === 'proposed')).toBe(true);
    expect(await store.listInstances(U, { period: 'monthly' })).toHaveLength(1);
    expect(await store.listInstances(U, { period: 'epic' })).toHaveLength(0);
  });
  it('rejette les données invalides et le double personnage', async () => {
    const s = setup();
    expect((await createCharacter(s.ctx, U, { ...heroInput, name: 'A' })).ok).toBe(false);
    expect((await createCharacter(s.ctx, U, { ...heroInput, classId: 'x' })).ok).toBe(false);
    expect((await createCharacter(s.ctx, U, { ...heroInput, scores: { ...heroInput.scores, INT: 5, SAG: 5 } })).ok).toBe(false);
    expect((await createCharacter(s.ctx, U, { ...heroInput, motto: 'x'.repeat(81) })).ok).toBe(false);
    expect((await createCharacter(s.ctx, U, heroInput)).ok).toBe(true);
    expect(await createCharacter(s.ctx, U, heroInput)).toMatchObject({ ok: false, error: 'already-has-character' });
  });
  it('ensureQuests est idempotent et déterministe', async () => {
    const s = await started();
    const before = await s.store.listInstances(U);
    const r = await ensureQuests(s.ctx, U);
    expect(r.created).toHaveLength(0);
    expect(await s.store.listInstances(U)).toHaveLength(before.length);
  });
  it('sans personnage, rien ne se passe', async () => {
    const s = setup();
    expect(await ensureQuests(s.ctx, 'nobody')).toEqual({ created: [], expired: [], levelUps: [] });
    expect(await acceptQuest(s.ctx, 'nobody', 'x')).toMatchObject({ ok: false, error: 'no-character' });
    expect(await achievementProgress(s.ctx, 'nobody')).toEqual([]);
    expect(await recomputeCharacter(s.ctx, 'nobody')).toBeNull();
  });
});

describe('validation d’une quête', () => {
  it('enregistre l’XP, met à jour le personnage et le registre', async () => {
    const s = await started();
    const q = (await s.store.listInstances(U, { period: 'daily', status: 'accepted' }))[0];
    expect(q.snapshot.validation.type).toBeDefined();
    const prog = q.snapshot.validation;
    const res = await completeQuestAction(s.ctx, U, {
      instanceId: q.id,
      useInspiration: false,
      progress: prog.type === 'counter' ? prog.target : prog.type === 'timer' ? prog.minutes : undefined,
      stepsDone: prog.type === 'steps' ? prog.steps.map(() => true) : undefined,
      journalText: prog.type === 'journal' ? 'x'.repeat(60) : undefined,
    });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    const d = res.data;
    expect(d.xpAwarded).toBeGreaterThanOrEqual(10);
    expect(d.character.totalXp).toBeGreaterThanOrEqual(d.xpAwarded);
    expect(d.streak).toBe(1);
    // Trophée « Le Premier Pas » débloqué avec son bonus
    expect(d.achievements.map((a) => a.id)).toContain('premier-pas');
    const events = await s.store.listXpEvents(U);
    expect(events.map((e) => e.reason)).toContain('quest');
    expect(events.map((e) => e.reason)).toContain('achievement');
    const char = (await s.store.getCharacter(U))!;
    expect(char.totalXp).toBe(events.reduce((n, e) => n + e.amount, 0));
  });
  it('une première quête ne débloque que « Le Premier Pas » (pas de bonus d’XP excessif)', async () => {
    const s = await started();
    const q = (await s.store.listInstances(U, { status: 'accepted' })).find((x) => x.snapshot.validation.type === 'simple');
    if (!q) return;
    const r = await completeQuestAction(s.ctx, U, { instanceId: q.id, useInspiration: false });
    expect(r.ok && r.data.achievements.map((a) => a.id)).toEqual(['premier-pas']);
    expect(r.ok && r.data.character.level).toBeLessThanOrEqual(2);
  });
  it('est idempotente (RG-18)', async () => {
    const s = await started();
    const q = (await s.store.listInstances(U, { period: 'daily', status: 'accepted' })).find((x) => x.snapshot.validation.type === 'simple');
    if (!q) return;
    const a = await completeQuestAction(s.ctx, U, { instanceId: q.id, useInspiration: false });
    const b = await completeQuestAction(s.ctx, U, { instanceId: q.id, useInspiration: false });
    expect(a.ok && b.ok).toBe(true);
    if (a.ok && b.ok) {
      expect(b.data.duplicate).toBe(true);
      expect(b.data.character.totalXp).toBe(a.data.character.totalXp);
    }
    const events = (await s.store.listXpEvents(U)).filter((e) => e.reason === 'quest');
    expect(events).toHaveLength(1);
  });
  it('refuse une quête incomplète, non acceptée ou inconnue', async () => {
    const s = await started();
    const counter = (await s.store.listInstances(U)).find((x) => x.snapshot.validation.type === 'counter' && x.status === 'accepted');
    if (counter) {
      expect(await completeQuestAction(s.ctx, U, { instanceId: counter.id, useInspiration: false, progress: 0 })).toMatchObject({ ok: false, error: 'incomplete' });
    }
    const proposed = (await s.store.listInstances(U, { status: 'proposed' }))[0];
    expect(await completeQuestAction(s.ctx, U, { instanceId: proposed.id, useInspiration: false })).toMatchObject({ ok: false, error: 'not-accepted' });
    expect(await completeQuestAction(s.ctx, U, { instanceId: 'nope', useInspiration: false })).toMatchObject({ ok: false, error: 'not-found' });
    expect(await completeQuestAction(s.ctx, U, { instanceId: proposed.id, useInspiration: true })).toMatchObject({ ok: false });
  });
  it('journal : texte trop court refusé', async () => {
    const s = await started();
    await s.store.updateInstance(U, (await s.store.listInstances(U, { status: 'accepted' }))[0].id, {
      snapshot: { ability: 'SAG', difficulty: 'easy', title: 'J', flavor: '', objective: '', tips: [], validation: { type: 'journal' }, tags: [] },
    });
    const q = (await s.store.listInstances(U, { status: 'accepted' }))[0];
    expect(await completeQuestAction(s.ctx, U, { instanceId: q.id, useInspiration: false, journalText: 'court' })).toMatchObject({ ok: false, error: 'journal-too-short' });
    const ok = await completeQuestAction(s.ctx, U, { instanceId: q.id, useInspiration: false, journalText: 'x'.repeat(55) });
    expect(ok.ok).toBe(true);
    expect(await s.store.countJournal(U)).toBe(1);
  });
  it('partage une publication avec la validation', async () => {
    const s = await started();
    const q = (await s.store.listInstances(U, { status: 'accepted' })).find((x) => x.snapshot.validation.type === 'simple');
    if (!q) return;
    const res = await completeQuestAction(s.ctx, U, {
      instanceId: q.id,
      useInspiration: false,
      share: { text: 'Une pause au grand air', mediaPaths: ['u/1.jpg'], visibility: 'friends' },
    });
    expect(res.ok && res.data.postId).toBeTruthy();
    expect(s.store.posts.some((p) => p.type === 'quest' && p.instanceId === q.id)).toBe(true);
  });
  it('l’Inspiration double l’XP', async () => {
    const s = await started();
    const c = (await s.store.getCharacter(U))!;
    await s.store.saveCharacter(U, { ...c, inspiration: 1 });
    const q = (await s.store.listInstances(U, { status: 'accepted' })).find((x) => x.snapshot.validation.type === 'simple');
    if (!q) return;
    const res = await completeQuestAction(s.ctx, U, { instanceId: q.id, useInspiration: true });
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.data.breakdown.doubled).toBe(true);
      expect(res.data.character.inspiration).toBe(0);
    }
  });
  it('met à jour la progression d’un compteur', async () => {
    const s = await started();
    const q = (await s.store.listInstances(U, { status: 'accepted' }))[0];
    const r = await updateProgress(s.ctx, U, q.id, { progress: 2 });
    expect(r.ok && r.instance.progress).toBe(2);
    expect(await updateProgress(s.ctx, U, 'nope', { progress: 1 })).toMatchObject({ ok: false, error: 'not-found' });
    const proposed = (await s.store.listInstances(U, { status: 'proposed' }))[0];
    expect(await updateProgress(s.ctx, U, proposed.id, { progress: 1 })).toMatchObject({ ok: false, error: 'not-accepted' });
  });
});

describe('annulation (24 h)', () => {
  it('retire l’XP, rouvre la quête et recalcule le niveau', async () => {
    const s = await started();
    const done = await completeAllDaily(s);
    const mid = (await s.store.getCharacter(U))!;
    expect(mid.totalXp).toBeGreaterThan(0);
    const first = done[0];
    const r = await undoQuest(s.ctx, U, first.id);
    expect(r.ok).toBe(true);
    const after = (await s.store.getCharacter(U))!;
    expect(after.totalXp).toBeLessThan(mid.totalXp);
    expect((await s.store.getInstance(U, first.id))!.status).toBe('accepted');
    expect(after.totalXp).toBe((await s.store.listXpEvents(U)).reduce((n, e) => n + e.amount, 0));
  });
  it('est refusée après 24 h', async () => {
    const s = await started();
    const done = await completeAllDaily(s);
    s.advanceHours(30);
    expect(await undoQuest(s.ctx, U, done[0].id)).toMatchObject({ ok: false, error: 'cannot-undo' });
    expect(await undoQuest(s.ctx, U, 'nope')).toMatchObject({ ok: false, error: 'not-found' });
  });
  it('rembourse l’Inspiration et détache la publication (RG-22)', async () => {
    const s = await started();
    const c = (await s.store.getCharacter(U))!;
    await s.store.saveCharacter(U, { ...c, inspiration: 1 });
    const q = (await s.store.listInstances(U, { status: 'accepted' })).find((x) => x.snapshot.validation.type === 'simple');
    if (!q) return;
    await completeQuestAction(s.ctx, U, { instanceId: q.id, useInspiration: true, share: { text: 'hop', mediaPaths: [], visibility: 'friends' } });
    const r = await undoQuest(s.ctx, U, q.id);
    expect(r.ok).toBe(true);
    expect((await s.store.getCharacter(U))!.inspiration).toBe(1);
    expect(s.store.posts.find((p) => p.type === 'quest')!.instanceId).toBeNull();
  });
});

describe('passage du temps', () => {
  it('le lendemain : expire, retire et tire de nouvelles quêtes (RG-01)', async () => {
    const s = await started();
    s.setNow('2026-10-06T09:00:00+02:00');
    const r = await ensureQuests(s.ctx, U);
    expect(r.expired.length).toBeGreaterThan(0);
    expect(r.created.filter((q) => q.period === 'daily')).toHaveLength(2);
    expect(r.created.every((q) => q.status === 'proposed')).toBe(true);
    // pas de nouvelle semaine (mardi) ni de nouveau mois
    expect(r.created.filter((q) => q.period !== 'daily')).toHaveLength(0);
  });
  it('plusieurs jours sans ouvrir : seule la période en cours est tirée', async () => {
    const s = await started();
    s.setNow('2026-10-14T09:00:00+02:00');
    await ensureQuests(s.ctx, U);
    const daily = await s.store.listInstances(U, { period: 'daily' });
    expect(daily.filter((q) => q.periodStart === '2026-10-14')).toHaveLength(2);
    expect(daily.filter((q) => q.periodStart > '2026-10-05' && q.periodStart < '2026-10-14')).toHaveLength(0);
    const weekly = await s.store.listInstances(U, { period: 'weekly' });
    expect(weekly.some((q) => q.periodStart === '2026-10-12')).toBe(true);
    expect(weekly.filter((q) => q.periodStart === '2026-10-05').every((q) => q.status === 'expired')).toBe(true);
  });
  it('avant l’heure de reset, on est encore « la veille »', async () => {
    const s = await started();
    s.setNow('2026-10-06T02:00:00+02:00');
    const r = await ensureQuests(s.ctx, U);
    expect(r.created).toHaveLength(0);
  });
  it('nouveau mois : une quête mensuelle est proposée', async () => {
    const s = await started();
    s.setNow('2026-11-02T09:00:00+01:00');
    await ensureQuests(s.ctx, U);
    const monthly = await s.store.listInstances(U, { period: 'monthly' });
    expect(monthly.some((q) => q.periodStart === '2026-11-01')).toBe(true);
  });
  it('la série se maintient puis se casse', async () => {
    const s = await started();
    await completeAllDaily(s);
    expect((await s.store.getCharacter(U))!.streakCurrent).toBe(1);
    s.setNow('2026-10-06T09:00:00+02:00');
    await ensureQuests(s.ctx, U);
    expect((await s.store.getCharacter(U))!.streakCurrent).toBe(1);
    await completeAllDaily(s);
    expect((await s.store.getCharacter(U))!.streakCurrent).toBe(2);
    s.setNow('2026-10-09T09:00:00+02:00');
    await ensureQuests(s.ctx, U);
    expect((await s.store.getCharacter(U))!.streakCurrent).toBe(0);
    expect((await s.store.getCharacter(U))!.streakBest).toBe(2);
  });
  it('un jour de repos protège la série, une fois par semaine', async () => {
    const s = await started();
    await completeAllDaily(s);
    s.setNow('2026-10-06T09:00:00+02:00');
    await ensureQuests(s.ctx, U);
    const rest = await declareRest(s.ctx, U);
    expect(rest.ok).toBe(true);
    expect(await declareRest(s.ctx, U)).toMatchObject({ ok: false, error: 'rest-unavailable' });
    s.setNow('2026-10-07T09:00:00+02:00');
    await ensureQuests(s.ctx, U);
    expect((await s.store.getCharacter(U))!.streakCurrent).toBe(1);
  });
  it('40 jours d’affilée : série, Inspiration plafonnée à 3, niveau en hausse', async () => {
    const s = await started();
    let overflow = false;
    for (let d = 0; d < 40; d++) {
      const date = new Date(Date.UTC(2026, 9, 5 + d, 7, 0));
      s.setNow(date.toISOString());
      await ensureQuests(s.ctx, U);
      await acceptDaily(s);
      const accepted = await s.store.listInstances(U, { period: 'daily', status: 'accepted' });
      for (const q of accepted) {
        const v = q.snapshot.validation;
        const r = await completeQuestAction(s.ctx, U, {
          instanceId: q.id,
          useInspiration: false,
          progress: v.type === 'counter' ? v.target : v.type === 'timer' ? v.minutes : undefined,
          stepsDone: v.type === 'steps' ? v.steps.map(() => true) : undefined,
          journalText: v.type === 'journal' ? 'x'.repeat(60) : undefined,
        });
        expect(r.ok).toBe(true);
        if (r.ok && r.data.inspirationOverflow) overflow = true;
      }
    }
    const c = (await s.store.getCharacter(U))!;
    expect(c.streakCurrent).toBe(40);
    expect(c.streakBest).toBe(40);
    expect(c.inspiration).toBe(3);
    expect(overflow).toBe(true);
    expect(c.level).toBeGreaterThanOrEqual(4);
    const unlocked = (await s.store.listUnlocked(U)).map((u) => u.achievementId);
    expect(unlocked).toEqual(expect.arrayContaining(['premier-pas', 'feu-sacre', 'serie-30']));
    // le cache est cohérent avec le registre (RG-16)
    const rec = (await recomputeCharacter(s.ctx, U))!;
    expect(rec.totalXp).toBe(c.totalXp);
    expect(rec.level).toBe(c.level);
  });
});

describe('quêtes hebdomadaires et mensuelles', () => {
  it('s’acceptent, jusqu’au vendredi (RG-08)', async () => {
    const s = await started();
    const w = (await s.store.listInstances(U, { period: 'weekly' }))[0];
    const a = await acceptQuest(s.ctx, U, w.id);
    expect(a.ok && a.instance.status).toBe('accepted');
    expect(await acceptQuest(s.ctx, U, w.id)).toMatchObject({ ok: false, error: 'not-accepted' });
    const w2 = (await s.store.listInstances(U, { period: 'weekly' }))[1];
    s.setNow('2026-10-10T09:00:00+02:00'); // samedi
    expect(await acceptQuest(s.ctx, U, w2.id)).toMatchObject({ ok: false, error: 'too-late-to-accept' });
    expect(await acceptQuest(s.ctx, U, 'nope')).toMatchObject({ ok: false, error: 'not-found' });
  });
  it('un compteur à ≥ 50 % rapporte l’XP au prorata à l’expiration', async () => {
    const s = await started();
    const w = (await s.store.listInstances(U, { period: 'weekly' }))[0];
    await acceptQuest(s.ctx, U, w.id);
    await s.store.updateInstance(U, w.id, {
      snapshot: { ...w.snapshot, difficulty: 'medium', validation: { type: 'counter', target: 4, unit: 'séances' } },
      progress: 2,
    });
    s.setNow('2026-10-13T09:00:00+02:00');
    const r = await ensureQuests(s.ctx, U);
    const exp = r.expired.find((q) => q.id === w.id)!;
    expect(exp.status).toBe('expired');
    expect(exp.xpAwarded).toBeGreaterThan(0);
    expect((await s.store.listXpEvents(U)).some((e) => e.reason === 'partial')).toBe(true);
  });
  it('abandonner une quête', async () => {
    const s = await started();
    const w = (await s.store.listInstances(U, { period: 'weekly' }))[0];
    const r = await abandonQuest(s.ctx, U, w.id);
    expect(r.ok && r.instance.status).toBe('abandoned');
    expect(await abandonQuest(s.ctx, U, w.id)).toMatchObject({ ok: false });
    expect(await abandonQuest(s.ctx, U, 'nope')).toMatchObject({ ok: false, error: 'not-found' });
  });
  it('le mode Hardcore n’existe plus : abandonner ou laisser expirer ne coûte jamais d’XP', async () => {
    const s = await started();
    const settings = await s.store.getSettings(U);
    await s.store.saveSettings(U, { ...settings, hardcore: true });
    const c = (await s.store.getCharacter(U))!;
    await s.store.saveCharacter(U, { ...c, totalXp: 100, abilityXp: { ...c.abilityXp, FOR: 100 } });
    const [q, other] = await s.store.listInstances(U, { period: 'daily', status: 'accepted' });
    await abandonQuest(s.ctx, U, q.id);
    s.setNow('2026-10-07T09:00:00+02:00');
    await ensureQuests(s.ctx, U); // l'autre quête acceptée expire
    expect((await s.store.getInstance(U, other.id))!.status).toBe('expired');
    expect((await s.store.listXpEvents(U)).some((e) => e.reason === 'hardcore' || e.amount < 0)).toBe(false);
  });
});

describe('relance', () => {
  it('une relance gratuite par jour, puis une Inspiration', async () => {
    const s = await started();
    const [a, b] = await s.store.listInstances(U, { period: 'daily', status: 'accepted' });
    const r1 = await rerollQuest(s.ctx, U, a.id);
    expect(r1.ok).toBe(true);
    if (r1.ok) {
      expect(r1.usedInspiration).toBe(false);
      expect(r1.instance.templateId).not.toBe(a.templateId);
      expect(r1.instance.snapshot.difficulty).toBe(a.snapshot.difficulty);
    }
    expect(await s.store.getInstance(U, a.id)).toBeNull();
    expect(await rerollQuest(s.ctx, U, b.id)).toMatchObject({ ok: false, error: 'no-reroll' });
    const c = (await s.store.getCharacter(U))!;
    await s.store.saveCharacter(U, { ...c, inspiration: 2 });
    const r2 = await rerollQuest(s.ctx, U, b.id);
    expect(r2.ok && r2.usedInspiration).toBe(true);
    expect((await s.store.getCharacter(U))!.inspiration).toBe(1);
  });
  it('refuse une quête entamée ou terminée', async () => {
    const s = await started();
    const [a] = await s.store.listInstances(U, { period: 'daily', status: 'accepted' });
    await updateProgress(s.ctx, U, a.id, { progress: 1 });
    expect(await rerollQuest(s.ctx, U, a.id)).toMatchObject({ ok: false });
    expect(await rerollQuest(s.ctx, U, 'nope')).toMatchObject({ ok: false, error: 'not-found' });
  });
});

describe('validation hors ligne (RG-03)', () => {
  it('accepte une validation d’hier synchronisée après le reset', async () => {
    const s = await started();
    const q = (await s.store.listInstances(U, { status: 'accepted', period: 'daily' })).find((x) => x.snapshot.validation.type === 'simple');
    if (!q) return;
    s.setNow('2026-10-06T06:00:00+02:00');
    await ensureQuests(s.ctx, U); // la quête d'hier expire
    expect((await s.store.getInstance(U, q.id))!.status).toBe('expired');
    const r = await completeQuestAction(s.ctx, U, { instanceId: q.id, useInspiration: false, clientCompletedAt: '2026-10-05T22:00:00+02:00' });
    expect(r.ok).toBe(true);
    expect((await s.store.getInstance(U, q.id))!.status).toBe('completed');
  });
  it('refuse après 72 h ou hors de la période', async () => {
    const s = await started();
    const q = (await s.store.listInstances(U, { status: 'accepted', period: 'daily' })).find((x) => x.snapshot.validation.type === 'simple');
    if (!q) return;
    s.setNow('2026-10-12T09:00:00+02:00');
    expect(await completeQuestAction(s.ctx, U, { instanceId: q.id, useInspiration: false, clientCompletedAt: '2026-10-05T22:00:00+02:00' })).toMatchObject({ ok: false, error: 'too-late' });
    expect(await completeQuestAction(s.ctx, U, { instanceId: q.id, useInspiration: false, clientCompletedAt: '2026-10-11T22:00:00+02:00' })).toMatchObject({ ok: false, error: 'out-of-period' });
    expect(await completeQuestAction(s.ctx, U, { instanceId: q.id, useInspiration: false, clientCompletedAt: 'nope' })).toMatchObject({ ok: false, error: 'invalid' });
  });
});

describe('niveau, voie, améliorations, titres', () => {
  async function levelTo(s: Awaited<ReturnType<typeof started>>, xp: number) {
    const c = (await s.store.getCharacter(U))!;
    await s.store.insertXpEvents(U, [{ id: 'seed', instanceId: null, ability: 'FOR', amount: xp, reason: 'bonus', custom: false, createdAt: new Date().toISOString(), gameDate: '2026-10-05' }]);
    await recomputeCharacter(s.ctx, U);
    return c;
  }
  it('choix de la voie au niveau 3', async () => {
    const s = await started();
    expect(await choosePath(s.ctx, U, 'eclaireur-sentier')).toMatchObject({ ok: false, error: 'level-too-low' });
    await levelTo(s, 200);
    expect(await choosePath(s.ctx, U, 'inconnue')).toMatchObject({ ok: false, error: 'invalid' });
    expect((await choosePath(s.ctx, U, 'eclaireur-sentier')).ok).toBe(true);
    expect(await choosePath(s.ctx, U, 'eclaireur-bastion')).toMatchObject({ ok: false, error: 'nothing-pending' });
  });
  it('amélioration +2 ou +1/+1, sans dépasser 20', async () => {
    const s = await started();
    expect(await chooseImprovement(s.ctx, U, { plus2: 'INT' })).toMatchObject({ ok: false, error: 'nothing-pending' });
    await levelTo(s, 600); // niveau 4
    expect(await chooseImprovement(s.ctx, U, { plus1: ['INT', 'INT'] })).toMatchObject({ ok: false, error: 'invalid' });
    const r = await chooseImprovement(s.ctx, U, { plus2: 'INT' });
    expect(r.ok).toBe(true);
    const c = (await s.store.getCharacter(U))!;
    expect(abilityScores(c).INT).toBe(4); // 2 au départ + 2 de l’amélioration
    expect(await chooseImprovement(s.ctx, U, { plus2: 'INT' })).toMatchObject({ ok: false, error: 'nothing-pending' });
  });
  it('l’amélioration conserve la progression d’XP (additive)', async () => {
    const s = await started();
    await levelTo(s, 600);
    const c0 = (await s.store.getCharacter(U))!;
    await s.store.saveCharacter(U, { ...c0, abilityXp: { ...c0.abilityXp, INT: 120 } });
    const before = abilityScores((await s.store.getCharacter(U))!).INT; // 2 + 1 point (50 XP) = 3, il reste 70 XP vers le suivant (100)
    expect(before).toBe(3);
    await chooseImprovement(s.ctx, U, { plus2: 'INT' });
    expect(abilityScores((await s.store.getCharacter(U))!).INT).toBe(5);
  });
  it('plafond de 20 par amélioration', async () => {
    const s = await started();
    await levelTo(s, 600);
    const c = (await s.store.getCharacter(U))!;
    await s.store.saveCharacter(U, { ...c, baseScores: { ...c.baseScores, FOR: 5 }, improvements: { ...c.improvements, FOR: 12 } });
    expect(await chooseImprovement(s.ctx, U, { plus2: 'FOR' })).toMatchObject({ ok: false, error: 'invalid' });
    expect((await chooseImprovement(s.ctx, U, { plus1: ['FOR', 'DEX'] })).ok).toBe(true);
  });
  it('équipe un titre débloqué seulement', async () => {
    const s = await started();
    expect(await equipTitle(s.ctx, U, 'Le Lève-tôt')).toMatchObject({ ok: false, error: 'forbidden' });
    await s.store.unlockAchievement(U, 'lieve-tot', new Date().toISOString());
    const r = await equipTitle(s.ctx, U, 'Le Lève-tôt');
    expect(r.ok && r.character.titleEquipped).toBe('Le Lève-tôt');
    const off = await equipTitle(s.ctx, U, null);
    expect(off.ok && off.character.titleEquipped).toBeNull();
  });
  it('quêtes épiques à partir du niveau 11', async () => {
    const s = await started();
    await levelTo(s, 17500);
    s.setNow('2026-10-06T09:00:00+02:00');
    await ensureQuests(s.ctx, U);
    const epic = await s.store.listInstances(U, { period: 'epic' });
    expect(epic).toHaveLength(1);
    expect(epic[0].snapshot.difficulty).toBe('expert');
    expect(epic[0].periodStart).toBe('2026-10-01');
  });
});

describe('trophées et statistiques', () => {
  it('progression des trophées', async () => {
    const s = await started();
    await completeAllDaily(s);
    const p = await achievementProgress(s.ctx, U);
    expect(p.find((x) => x.id === 'premier-pas')!.done).toBe(true);
    expect(p.find((x) => x.id === 'premier-elan')!.current).toBeGreaterThanOrEqual(2);
    expect(p.length).toBe(98);
  });
  it('Journée parfaite : toutes les quêtes de parcours du jour validées (les propositions facultatives ne comptent pas)', async () => {
    const s = await started();
    await completeAllDaily(s);
    expect((await achievementProgress(s.ctx, U)).find((x) => x.id === 'journee-parfaite')!.done).toBe(false);
    expect((await startTrack(s.ctx, U, { trackId: 'muscu-haut' })).ok).toBe(true);
    const q = (await s.store.listInstances(U, { period: 'daily' })).find((i) => i.origin === 'track')!;
    expect((await completeQuestAction(s.ctx, U, { instanceId: q.id, useInspiration: false })).ok).toBe(true);
    expect((await achievementProgress(s.ctx, U)).find((x) => x.id === 'journee-parfaite')!.done).toBe(true);
    expect(ABILITIES.length).toBe(6);
  });
});

describe('quêtes guidées multi-caractéristiques', () => {
  const salsa = catalog.find((t) => t.id === 'g-danse-salsa-t1')!;
  async function withGuidedQuest() {
    const s = await started();
    const inst = (await s.store.listInstances(U, { period: 'daily', status: 'accepted' }))[0];
    const { ability, difficulty, title, flavor, objective, tips, validation, tags, theme, secondary } = salsa;
    await s.store.updateInstance(U, inst.id, { snapshot: { ability, difficulty, title, flavor, objective, tips, validation, tags, theme, secondary } });
    return { s, id: inst.id };
  }
  const done = (s: ReturnType<typeof setup>, id: string) =>
    completeQuestAction(s.ctx, U, { instanceId: id, useInspiration: false, progress: 20 });

  it('répartit l’XP entre la caractéristique principale et les secondaires', async () => {
    const { s, id } = await withGuidedQuest();
    const before = (await s.store.getCharacter(U))!;
    const res = await done(s, id);
    expect(res.ok).toBe(true);
    const events = (await s.store.listXpEvents(U)).filter((e) => e.reason === 'quest' && e.instanceId === id);
    const by = Object.fromEntries(events.map((e) => [e.ability, e.amount]));
    expect(Object.keys(by).sort()).toEqual(['CHA', 'DEX', 'FOR']);
    expect(by.DEX).toBeGreaterThan(by.CHA);
    expect(by.CHA).toBeGreaterThan(by.FOR);
    const xp = res.ok ? res.data.xpAwarded : 0;
    expect(events.reduce((n, e) => n + e.amount, 0)).toBe(xp);
    const after = (await s.store.getCharacter(U))!;
    expect(after.abilityXp.CHA - before.abilityXp.CHA).toBe(by.CHA);
    expect(after.abilityXp.FOR - before.abilityXp.FOR).toBe(by.FOR);
  });
  it('l’annulation retire l’XP de chaque caractéristique', async () => {
    const { s, id } = await withGuidedQuest();
    await done(s, id);
    expect((await undoQuest(s.ctx, U, id)).ok).toBe(true);
    // Le bonus d’un trophée déjà débloqué reste acquis : on vérifie les mouvements de la quête elle-même.
    const events = (await s.store.listXpEvents(U)).filter((e) => e.reason === 'quest' || e.reason === 'undo');
    for (const a of ABILITIES) expect(events.filter((e) => e.ability === a).reduce((n, e) => n + e.amount, 0)).toBe(0);
    expect(events.filter((e) => e.reason === 'undo')).toHaveLength(3);
  });
});

describe('quêtes choisies et refaites', () => {
  const pickEasy = (s: Awaited<ReturnType<typeof started>>, taken: string[]) =>
    catalog.find((t) => t.difficulty === 'easy' && t.periods.includes('daily') && t.validation.type === 'simple' && !taken.includes(t.id))!;
  const todayIds = async (s: Awaited<ReturnType<typeof started>>) => (await s.store.listInstances(U, { period: 'daily' })).map((i) => i.templateId);
  const doneBy = async (s: Awaited<ReturnType<typeof started>>, id: string) => {
    const q = (await s.store.getInstance(U, id))!;
    const v = q.snapshot.validation;
    return completeQuestAction(s.ctx, U, {
      instanceId: id,
      useInspiration: false,
      progress: v.type === 'counter' ? v.target : v.type === 'timer' ? v.minutes : undefined,
      stepsDone: v.type === 'steps' ? v.steps.map(() => true) : undefined,
      journalText: v.type === 'journal' ? 'x'.repeat(60) : undefined,
    });
  };

  it('ajoute une quête du catalogue, acceptée et hors quota', async () => {
    const s = await started();
    const t = pickEasy(s, await todayIds(s));
    const r = await startQuest(s.ctx, U, { templateId: t.id, period: 'daily' });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.instance).toMatchObject({ status: 'accepted', free: true, origin: 'chosen', run: 1, templateId: t.id });
    expect(await startQuest(s.ctx, U, { templateId: t.id, period: 'daily' })).toMatchObject({ ok: false, error: 'already-active' });
    // le tirage du jour n'est pas perturbé
    expect((await s.store.listInstances(U, { period: 'daily' })).filter((i) => i.origin === 'chosen')).toHaveLength(1);
  });

  it('refuse une quête verrouillée, inconnue ou hors période', async () => {
    const s = await started();
    const locked = catalog.find((t) => t.difficulty === 'high' && t.ability === 'DEX' && t.periods.includes('weekly'))!;
    expect(await startQuest(s.ctx, U, { templateId: locked.id, period: 'weekly' })).toMatchObject({ ok: false, error: 'locked' });
    expect(await startQuest(s.ctx, U, { templateId: 'nope', period: 'daily' })).toMatchObject({ ok: false, error: 'not-found' });
    const t = pickEasy(s, await todayIds(s));
    const other = (['weekly', 'monthly', 'epic'] as const).find((p) => !t.periods.includes(p))!;
    expect(await startQuest(s.ctx, U, { templateId: t.id, period: other })).toMatchObject({ ok: false, error: 'invalid' });
  });

  it('refaire une quête : XP dégressive 100 % → 90 % → 80 %, puis plafond', async () => {
    const s = await started();
    const t = pickEasy(s, await todayIds(s));
    const xps: number[] = [];
    let last = (await startQuest(s.ctx, U, { templateId: t.id, period: 'daily' })) as { ok: true; instance: QuestInstance };
    for (let run = 1; run <= 3; run++) {
      const r = await doneBy(s, last.instance.id);
      expect(r.ok).toBe(true);
      if (!r.ok) return;
      xps.push(r.data.xpAwarded);
      expect(r.data.breakdown.repeat).toBe([1, 0.9, 0.8][run - 1]);
      if (run < 3) {
        last = (await redoQuest(s.ctx, U, last.instance.id)) as typeof last;
        expect(last.ok).toBe(true);
        expect(last.instance).toMatchObject({ origin: 'redo', run: run + 1, status: 'accepted', free: true });
      }
    }
    expect(xps[1]).toBe(Math.round(xps[0] * 0.9));
    expect(xps[2]).toBe(Math.round(xps[0] * 0.8));
    expect(await redoQuest(s.ctx, U, last.instance.id)).toMatchObject({ ok: false, error: 'run-limit' });
  });

  it('une quête du tirage peut aussi être refaite, et la série compte', async () => {
    const s = await started();
    const q = (await s.store.listInstances(U, { period: 'daily', status: 'accepted' }))[0];
    expect((await doneBy(s, q.id)).ok).toBe(true);
    const r = await redoQuest(s.ctx, U, q.id);
    expect(r.ok).toBe(true);
    expect((await s.store.getCharacter(U))!.streakCurrent).toBe(1);
  });

  it('le lendemain, « refaire » relance la quête dans la période en cours', async () => {
    const s = await started();
    const q = (await s.store.listInstances(U, { period: 'daily', status: 'accepted' }))[0];
    expect((await doneBy(s, q.id)).ok).toBe(true);
    s.advanceHours(24);
    await ensureQuests(s.ctx, U);
    const r = await redoQuest(s.ctx, U, q.id);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.instance).toMatchObject({ periodStart: '2026-10-06', run: 1, status: 'accepted' });
  });

  it('une quête proposée par le tirage est acceptée plutôt que dupliquée', async () => {
    const s = await started();
    const w = (await s.store.listInstances(U, { period: 'weekly', status: 'proposed' }))[0];
    const r = await startQuest(s.ctx, U, { templateId: w.templateId, period: 'weekly' });
    expect(r.ok && r.instance.id).toBe(w.id);
    expect((await s.store.listInstances(U, { period: 'weekly' })).filter((i) => i.templateId === w.templateId)).toHaveLength(1);
  });

  it('plafonne les quêtes ajoutées en cours', async () => {
    const s = await started();
    const taken = await todayIds(s);
    const pool = catalog.filter((t) => t.difficulty === 'easy' && t.periods.includes('daily') && !taken.includes(t.id)).slice(0, 9);
    let refused: string | undefined;
    for (const t of pool) {
      const r = await startQuest(s.ctx, U, { templateId: t.id, period: 'daily' });
      if (!r.ok) refused = r.error;
    }
    expect(refused).toBe('too-many-open');
  });

  it('mode manuel : 0 quête tirée par jour, le choix revient au joueur', async () => {
    const s = await started();
    await s.store.saveSettings(U, { ...(await s.store.getSettings(U)), dailyQuestCount: 0 });
    s.advanceHours(24);
    await ensureQuests(s.ctx, U);
    expect(await s.store.listInstances(U, { period: 'daily', from: '2026-10-06' })).toHaveLength(0);
    const t = pickEasy(s, []);
    expect((await startQuest(s.ctx, U, { templateId: t.id, period: 'daily' })).ok).toBe(true);
    await ensureQuests(s.ctx, U);
    expect(await s.store.listInstances(U, { period: 'daily', from: '2026-10-06' })).toHaveLength(1);
  });

  it('une quête choisie ne bloque pas le tirage et n’est pas pénalisée en Hardcore', async () => {
    const s = setup();
    const t = pickEasy(s as never, []);
    await createCharacter(s.ctx, U, heroInput);
    await s.store.saveSettings(U, { ...(await s.store.getSettings(U)), hardcore: true });
    const r = (await startQuest(s.ctx, U, { templateId: t.id, period: 'daily' })) as { ok: true; instance: QuestInstance };
    await abandonQuest(s.ctx, U, r.instance.id);
    expect((await s.store.listXpEvents(U)).some((e) => e.reason === 'hardcore')).toBe(false);
  });
});
