import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  ABILITIES,
  MemoryStore,
  acceptQuest,
  applyBalance,
  completeQuestAction,
  createCharacter,
  ensureQuests,
  expiredPartialXp,
  recomputeCharacter,
  splitXp,
  startTrack,
  undoQuest,
  type AbilityId,
  type QuestInstance,
  type QuestTemplate,
  type ServerContext,
} from '../src';
import { TEST_RUNG_TEMPLATES } from './track-fixtures';

/**
 * Équilibrage d'XP (rattrapage / spécialisation) de bout en bout : validation, événements d'XP, annulation, recalcul.
 * Les parcours de test sont dans track-fixtures : muscu-haut (FOR), course-fond (CON + 20 % DEX).
 */
const catalog = JSON.parse(readFileSync(join(__dirname, '..', '..', 'content', 'data', 'quests.fr.json'), 'utf8')).map(
  (q: QuestTemplate) => ({ ...q, source: 'catalog' }),
) as QuestTemplate[];

const U = 'user-1';
let counter = 0;
const BALANCED = { FOR: 3, DEX: 3, CON: 3, INT: 3, SAG: 3, CHA: 3 };
type Scores = Record<AbilityId, number>;

const heroInput = {
  name: 'Aldric',
  classId: 'eclaireur',
  scores: { FOR: 5, DEX: 2, CON: 5, INT: 2, SAG: 2, CHA: 2 },
  portraitId: 'p1',
  frameColor: '#2f5a47',
  timezone: 'Europe/Paris',
};

/** Personnage dont les scores de départ sont imposés (la création n'accepte que l'achat de points). */
async function hero(scores: Scores) {
  const store = new MemoryStore([...catalog, ...TEST_RUNG_TEMPLATES]);
  let nowMs = Date.parse('2026-10-05T09:00:00+02:00');
  const ctx: ServerContext = { store, now: () => nowMs, uuid: () => `bal-${++counter}` };
  expect((await createCharacter(ctx, U, heroInput)).ok).toBe(true);
  const c = (await store.getCharacter(U))!;
  await store.saveCharacter(U, { ...c, baseScores: { ...scores } });
  return { store, ctx, setNow: (iso: string) => (nowMs = Date.parse(iso)) };
}
type S = Awaited<ReturnType<typeof hero>>;

async function trackQuest(s: S, trackId: string) {
  expect((await startTrack(s.ctx, U, { trackId })).ok).toBe(true);
  return (await s.store.listInstances(U, { period: 'daily' })).find((q) => q.trackId === trackId)!;
}

function finish(s: S, q: QuestInstance) {
  const v = q.snapshot.validation;
  return completeQuestAction(s.ctx, U, {
    instanceId: q.id,
    useInspiration: false,
    progress: v.type === 'counter' ? v.target : v.type === 'timer' ? v.minutes : undefined,
    stepsDone: v.type === 'steps' ? v.steps.map(() => true) : undefined,
    journalText: v.type === 'journal' ? 'x'.repeat(60) : undefined,
  });
}

const questEvents = async (s: S, id: string) => (await s.store.listXpEvents(U)).filter((e) => e.instanceId === id && e.reason === 'quest');
const sum = (xs: { amount: number }[]) => xs.reduce((n, e) => n + e.amount, 0);

async function expectOk(p: ReturnType<typeof finish>) {
  const r = await p;
  expect(r.ok).toBe(true);
  if (!r.ok) throw new Error(r.error);
  return r.data;
}

describe('équilibrage d’XP à la validation (moteur serveur)', () => {
  it('caractéristique en retard : +50 %, événements = montant versé, totaux cohérents', async () => {
    // FOR 2 contre une moyenne de 5 : écart −3
    const s = await hero({ FOR: 2, DEX: 5, CON: 5, INT: 5, SAG: 5, CHA: 5 });
    const q = await trackQuest(s, 'muscu-haut');
    const d = await expectOk(finish(s, q));
    const base = d.breakdown.total;
    expect(d.xpAwarded).toBe(Math.round(base * 1.5));
    expect(d.balance).toEqual([{ ability: 'FOR', factor: 1.5, base, awarded: d.xpAwarded }]);
    const events = await questEvents(s, q.id);
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ ability: 'FOR', amount: d.xpAwarded });
    expect((await s.store.getInstance(U, q.id))!.xpAwarded).toBe(d.xpAwarded);
    const c = (await s.store.getCharacter(U))!;
    expect(c.abilityXp.FOR).toBeGreaterThanOrEqual(d.xpAwarded); // + éventuel trophée de la première quête
    expect(c.totalXp).toBe(sum(await s.store.listXpEvents(U)));
  });

  it('caractéristique dominante : −25 % à +4, −50 % à +7', async () => {
    const mild = await hero({ FOR: 7, DEX: 3, CON: 3, INT: 3, SAG: 3, CHA: 3 });
    const dMild = await expectOk(finish(mild, await trackQuest(mild, 'muscu-haut')));
    expect(dMild.xpAwarded).toBe(Math.round(dMild.breakdown.total * 0.75));
    expect(dMild.balance?.[0]).toMatchObject({ ability: 'FOR', factor: 0.75 });

    const heavy = await hero({ FOR: 10, DEX: 3, CON: 3, INT: 3, SAG: 3, CHA: 3 });
    const dHeavy = await expectOk(finish(heavy, await trackQuest(heavy, 'muscu-haut')));
    expect(dHeavy.xpAwarded).toBe(Math.round(dHeavy.breakdown.total * 0.5));
    expect(dHeavy.balance?.[0]).toMatchObject({ ability: 'FOR', factor: 0.5 });
    expect(dHeavy.xpAwarded).toBeLessThan(dMild.xpAwarded);
  });

  it('scores équilibrés : aucun effet, pas de champ balance', async () => {
    const s = await hero(BALANCED);
    const d = await expectOk(finish(s, await trackQuest(s, 'muscu-haut')));
    expect(d.xpAwarded).toBe(d.breakdown.total);
    expect(d.balance).toBeUndefined();
  });

  it('quête répartie : chaque caractéristique est équilibrée avec les scores d’avant', async () => {
    // CON forte, DEX faible : course-fond = CON 80 % / DEX 20 %
    const scores = { FOR: 3, DEX: 2, CON: 10, INT: 3, SAG: 3, CHA: 3 };
    const s = await hero(scores);
    const q = await trackQuest(s, 'course-fond');
    const d = await expectOk(finish(s, q));
    const expected = applyBalance(splitXp(d.breakdown.total, 'CON', [{ ability: 'DEX', pct: 20 }]), scores);
    const events = await questEvents(s, q.id);
    expect(Object.fromEntries(events.map((e) => [e.ability, e.amount]))).toEqual(Object.fromEntries(expected.map((p) => [p.ability, p.amount])));
    expect(d.xpAwarded).toBe(sum(expected));
    expect(d.balance?.map((b) => b.ability).sort()).toEqual(['CON', 'DEX']);
    expect(d.balance!.find((b) => b.ability === 'CON')!.factor).toBe(0.5);
    expect(d.balance!.find((b) => b.ability === 'DEX')!.factor).toBe(1.5);
  });

  it('s’applique aussi aux quêtes du tirage « pour aller plus loin » (origin draw)', async () => {
    const scores = { FOR: 2, DEX: 2, CON: 9, INT: 2, SAG: 2, CHA: 2 };
    const s = await hero(scores);
    const proposed = (await s.store.listInstances(U, { period: 'daily', status: 'proposed' }))[0];
    expect(proposed.origin).toBe('draw');
    expect((await acceptQuest(s.ctx, U, proposed.id)).ok).toBe(true);
    const d = await expectOk(finish(s, proposed));
    const expected = applyBalance(splitXp(d.breakdown.total, proposed.snapshot.ability, proposed.snapshot.secondary), scores);
    expect(d.xpAwarded).toBe(sum(expected));
    expect(sum(await questEvents(s, proposed.id))).toBe(d.xpAwarded);
  });

  it('annulation symétrique : l’XP revient exactement à l’état d’avant, recalcul identique', async () => {
    const s = await hero({ FOR: 2, DEX: 5, CON: 5, INT: 5, SAG: 5, CHA: 5 });
    const q = await trackQuest(s, 'muscu-haut');
    const before = (await s.store.getCharacter(U))!;
    const d = await expectOk(finish(s, q));
    expect(d.balance).toBeDefined();
    expect((await undoQuest(s.ctx, U, q.id)).ok).toBe(true);

    const events = (await s.store.listXpEvents(U)).filter((e) => e.instanceId === q.id && (e.reason === 'quest' || e.reason === 'undo'));
    for (const a of ABILITIES) expect(sum(events.filter((e) => e.ability === a))).toBe(0);
    const undo = events.filter((e) => e.reason === 'undo');
    expect(undo).toHaveLength(1);
    expect(undo[0].amount).toBe(-d.xpAwarded); // le montant versé (équilibré), pas le montant de base

    // Le trophée de la première quête reste acquis : on compare l'XP de quête uniquement.
    const after = (await s.store.getCharacter(U))!;
    const achievementXp = sum((await s.store.listXpEvents(U)).filter((e) => e.reason === 'achievement'));
    expect(after.totalXp).toBe(before.totalXp + achievementXp);
    const rec = await recomputeCharacter(s.ctx, U);
    expect(rec!.totalXp).toBe(after.totalXp);
    expect(rec!.abilityXp).toEqual(after.abilityXp);
    expect((await s.store.getInstance(U, q.id))!.xpAwarded).toBe(0);
  });

  it('annulation : retire le montant versé même si les scores ont changé entre-temps', async () => {
    const s = await hero({ FOR: 2, DEX: 5, CON: 5, INT: 5, SAG: 5, CHA: 5 });
    const q = await trackQuest(s, 'muscu-haut');
    const d = await expectOk(finish(s, q));
    const c = (await s.store.getCharacter(U))!;
    // FOR devient dominante : un recalcul à partir de xpAwarded donnerait un autre montant
    await s.store.saveCharacter(U, { ...c, baseScores: { FOR: 12, DEX: 3, CON: 3, INT: 3, SAG: 3, CHA: 3 } });
    const before = (await s.store.getCharacter(U))!.abilityXp.FOR;
    expect((await undoQuest(s.ctx, U, q.id)).ok).toBe(true);
    const after = (await s.store.getCharacter(U))!.abilityXp.FOR;
    expect(before - after).toBe(d.xpAwarded);
  });

  it('valider, annuler, revalider : les montants se répètent et le registre reste équilibré', async () => {
    const s = await hero({ FOR: 2, DEX: 5, CON: 5, INT: 5, SAG: 5, CHA: 5 });
    const q = await trackQuest(s, 'muscu-haut');
    const a = await expectOk(finish(s, q));
    expect((await undoQuest(s.ctx, U, q.id)).ok).toBe(true);
    const b = await expectOk(finish(s, q));
    expect(b.xpAwarded).toBe(a.xpAwarded);
    expect((await undoQuest(s.ctx, U, q.id)).ok).toBe(true);
    const net = sum((await s.store.listXpEvents(U)).filter((e) => e.instanceId === q.id && (e.reason === 'quest' || e.reason === 'undo')));
    expect(net).toBe(0);
  });

  it('annulation sans événement (anciennes données) : retombe sur la répartition de xpAwarded', async () => {
    const s = await hero(BALANCED);
    const q = await trackQuest(s, 'muscu-haut');
    const d = await expectOk(finish(s, q));
    // Simule un registre purgé de l'événement de validation
    const events = await s.store.listXpEvents(U);
    const ud = s.store.data(U);
    ud.xpEvents.splice(0, ud.xpEvents.length, ...events.filter((e) => !(e.instanceId === q.id && e.reason === 'quest')));
    expect((await undoQuest(s.ctx, U, q.id)).ok).toBe(true);
    const undo = (await s.store.listXpEvents(U)).filter((e) => e.reason === 'undo');
    expect(sum(undo)).toBe(-d.xpAwarded);
  });

  it('l’expiration d’un compteur ne reçoit aucun équilibrage', async () => {
    // FOR très faible, tout le reste fort : un rattrapage s'appliquerait si l'expiration équilibrait
    const s = await hero({ FOR: 2, DEX: 8, CON: 8, INT: 8, SAG: 8, CHA: 8 });
    const w = (await s.store.listInstances(U, { period: 'weekly' }))[0];
    await acceptQuest(s.ctx, U, w.id);
    const snapshot = {
      ...w.snapshot,
      ability: 'FOR' as const,
      secondary: undefined,
      difficulty: 'medium' as const,
      validation: { type: 'counter' as const, target: 4, unit: 'séances' },
    };
    await s.store.updateInstance(U, w.id, { snapshot, progress: 4 });
    const full = (await s.store.getInstance(U, w.id))!;
    const char = (await s.store.getCharacter(U))!;
    const expectedXp = expiredPartialXp(full, char.level, ['FOR', 'CON'], null);
    expect(expectedXp).toBeGreaterThan(0);
    s.setNow('2026-10-13T09:00:00+02:00');
    const r = await ensureQuests(s.ctx, U);
    const exp = r.expired.find((x) => x.id === w.id)!;
    expect(exp.xpAwarded).toBe(expectedXp);
    const partial = (await s.store.listXpEvents(U)).filter((e) => e.reason === 'partial' && e.instanceId === w.id);
    expect(sum(partial)).toBe(expectedXp);
  });
});
