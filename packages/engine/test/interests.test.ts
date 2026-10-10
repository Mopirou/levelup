import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  MemoryStore,
  QuestTemplate,
  ServerContext,
  abilityScores,
  acceptQuest,
  activityOf,
  completeQuestAction,
  createCharacter,
  defaultSettings,
  drawQuests,
  interestKey,
  interestWeight,
  nextTune,
  sanitizeInterests,
  slugify,
  tuneQuest,
  tunedTarget,
  tuneXpScale,
  updateProgress,
  type QuestInstance,
} from '../src';

const catalog = JSON.parse(readFileSync(join(__dirname, '..', '..', 'content', 'data', 'quests.fr.json'), 'utf8')).map(
  (q: QuestTemplate) => ({ ...q, source: 'catalog' }),
) as QuestTemplate[];

const U = 'user-1';
let counter = 0;
const hero = {
  name: 'Aldric',
  classId: 'eclaireur',
  scores: { FOR: 3, DEX: 3, CON: 3, INT: 3, SAG: 3, CHA: 3 },
  portraitId: 'p1',
  frameColor: '#2f5a47',
  timezone: 'Europe/Paris',
};

function setup() {
  const store = new MemoryStore(catalog);
  const ctx: ServerContext = { store, now: () => Date.parse('2026-10-05T09:00:00+02:00'), uuid: () => `id-${++counter}` };
  return { store, ctx };
}

describe('centres d’intérêt', () => {
  it('retrouve la discipline et l’activité d’une quête guidée, et slugifie comme le générateur', () => {
    const q = catalog.find((t) => t.id === 'g-langues-espagnol-t1')!;
    expect(q.theme).toBe('langues');
    expect(activityOf(q)).toBe('espagnol');
    expect(interestKey('langues', 'Espagnol')).toBe('langues:espagnol');
    // Toutes les quêtes guidées doivent correspondre à une clé « discipline:activité » reconstructible depuis leur nom
    for (const t of catalog.filter((x) => x.theme)) expect(activityOf(t)).toMatch(/^[a-z0-9-]+$/);
    expect(slugify('Pâtes fraîches')).toBe('pates-fraiches');
    expect(slugify('Taï-chi')).toBe('tai-chi');
  });

  it('nettoie les clés invalides et les doublons', () => {
    expect(sanitizeInterests(['cuisine', 'cuisine', 'langues:espagnol', 'X Y', 12, '<script>', ''])).toEqual(['cuisine', 'langues:espagnol']);
    expect(sanitizeInterests('cuisine')).toEqual([]);
  });

  it('pondère : activité choisie > discipline > activités écartées > discipline ignorée', () => {
    const es = catalog.find((t) => t.id === 'g-langues-espagnol-t1')!;
    const en = catalog.find((t) => t.id === 'g-langues-anglais-t1')!;
    const cuisine = catalog.find((t) => t.id === 'g-cuisine-pain-maison-t1')!;
    const general = catalog.find((t) => !t.theme)!;
    expect(interestWeight(general, ['langues'])).toBe(1);
    expect(interestWeight(es, [])).toBeLessThan(1);
    expect(interestWeight(es, ['langues'])).toBeGreaterThan(1);
    expect(interestWeight(es, ['langues', 'langues:espagnol'])).toBeGreaterThan(interestWeight(es, ['langues']));
    expect(interestWeight(en, ['langues', 'langues:espagnol'])).toBeLessThan(interestWeight(es, ['langues', 'langues:espagnol']));
    expect(interestWeight(cuisine, ['langues'])).toBeLessThan(0.2);
  });

  it('n’oriente plus le tirage : les centres d’intérêt sont ignorés (remplacés par les parcours)', () => {
    const scores = abilityScores({ baseScores: { FOR: 4, DEX: 4, CON: 4, INT: 4, SAG: 4, CHA: 4 }, improvements: { FOR: 0, DEX: 0, CON: 0, INT: 0, SAG: 0, CHA: 0 }, abilityXp: { FOR: 0, DEX: 0, CON: 0, INT: 0, SAG: 0, CHA: 0 } });
    for (let d = 1; d <= 30; d++) {
      const input = {
        characterId: `c-${d}`, period: 'daily' as const, periodStart: `2026-11-${String((d % 28) + 1).padStart(2, '0')}`, count: 3, level: 5, scores, masteries: [],
        templates: catalog, preferences: {}, lastDrawn: {},
      };
      expect(drawQuests({ ...input, interests: ['cuisine'] }).picks.map((t) => t.id)).toEqual(drawQuests(input).picks.map((t) => t.id));
    }
  });

  it('enregistre les intérêts à la création (sans effet sur le tirage)', async () => {
    const { store, ctx } = setup();
    const r = await createCharacter(ctx, U, { ...hero, interests: ['programmation', 'oups!'] });
    expect(r.ok).toBe(true);
    expect((await store.getSettings(U)).interests).toEqual(['programmation']);
    // Plus de quêtes imposées : seules des propositions facultatives sont tirées.
    const dailies = await store.listInstances(U, { period: 'daily' });
    expect(dailies.length).toBeGreaterThan(0);
    expect(dailies.every((q) => q.free && q.status === 'proposed')).toBe(true);
  });

  it('les anciens réglages sans intérêts restent valides', () => {
    expect(defaultSettings().interests).toEqual([]);
  });
});

describe('trop dur / trop facile', () => {
  it('calcule des cibles naturelles et refuse ce qui ne change rien', () => {
    expect(tunedTarget(20, -1)).toBe(10);
    expect(tunedTarget(20, 1)).toBe(30);
    expect(tunedTarget(200, 1)).toBe(300);
    expect(tunedTarget(25, -1)).toBe(13);
    expect(nextTune(0, { type: 'counter', target: 1, unit: 'fois' }, 'easier')).toBeNull();
    expect(nextTune(0, { type: 'simple' }, 'easier')).toBeNull();
    expect(nextTune(-1, { type: 'counter', target: 20, unit: 'pompes' }, 'easier')).toBeNull();
    expect(nextTune(-1, { type: 'counter', target: 20, unit: 'pompes' }, 'harder')).toBe(0);
  });

  async function dailyCounter() {
    const { store, ctx } = setup();
    await createCharacter(ctx, U, hero);
    // Impose une quête à compteur connue pour que le test soit déterministe.
    const tpl = catalog.find((t) => t.id === 'for-easy-pompes-20-aujourd-hui')!;
    const inst: QuestInstance = {
      id: 'q-pompes', templateId: tpl.id, snapshot: { ability: tpl.ability, difficulty: tpl.difficulty, title: tpl.title, flavor: tpl.flavor, objective: tpl.objective, tips: tpl.tips, validation: tpl.validation, tags: tpl.tags },
      period: 'daily', periodStart: '2026-10-05', periodEnd: '2026-10-05', status: 'accepted', progress: 0, xpAwarded: 0, inspirationUsed: false, acceptedAt: null, completedAt: null,
    };
    await store.insertInstances(U, [inst]);
    return { store, ctx, tpl };
  }

  it('allège la quête, réduit l’XP en proportion et mémorise le choix pour les prochains tirages', async () => {
    const { store, ctx, tpl } = await dailyCounter();
    const r = await tuneQuest(ctx, U, 'q-pompes', 'easier');
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.instance.snapshot.validation).toEqual({ type: 'counter', target: 10, unit: 'pompes' });
    expect(r.instance.snapshot.tune).toBe(-1);
    expect(r.instance.snapshot.baseTarget).toBe(20);
    expect(tuneXpScale(r.instance.snapshot)).toBe(0.5);
    expect((await store.getPreferences(U))[tpl.id].tune).toBe(-1);

    // 10 pompes suffisent, pour la moitié de l'XP.
    const up = await updateProgress(ctx, U, 'q-pompes', { progress: 10 });
    expect(up.ok).toBe(true);
    const done = await completeQuestAction(ctx, U, { instanceId: 'q-pompes', progress: 10, useInspiration: false });
    expect(done.ok).toBe(true);
    if (!done.ok) return;
    // 10 XP de base × 0,5 = 5 XP, plus la maîtrise éventuelle (non réduite)
    expect(done.data.xpAwarded).toBe(5 + done.data.breakdown.mastery);
    expect(done.data.xpAwarded).toBeLessThan(10 + done.data.breakdown.mastery);
  });

  it('renforce la quête, et revenir en arrière rétablit la quête d’origine', async () => {
    const { ctx, store } = await dailyCounter();
    const harder = await tuneQuest(ctx, U, 'q-pompes', 'harder');
    expect(harder.ok && harder.instance.snapshot.validation).toEqual({ type: 'counter', target: 30, unit: 'pompes' });
    const back = await tuneQuest(ctx, U, 'q-pompes', 'easier');
    expect(back.ok).toBe(true);
    if (!back.ok) return;
    expect(back.instance.snapshot.validation).toEqual({ type: 'counter', target: 20, unit: 'pompes' });
    expect(back.instance.snapshot.tune).toBeUndefined();
    expect(back.instance.snapshot.baseTarget).toBeUndefined();
    expect((await store.getPreferences(U))['for-easy-pompes-20-aujourd-hui'].tune).toBe(0);
    // plus de deux crans d'un côté
    const again = await tuneQuest(ctx, U, 'q-pompes', 'easier');
    expect(again.ok).toBe(true);
    const tooFar = await tuneQuest(ctx, U, 'q-pompes', 'easier');
    expect(tooFar.ok).toBe(false);
  });

  it('refuse les quêtes qui n’ont pas de cible et les quêtes terminées', async () => {
    const { store, ctx } = setup();
    await createCharacter(ctx, U, hero);
    const simple = catalog.find((t) => t.validation.type === 'simple' && t.periods.includes('daily'))!;
    await store.insertInstances(U, [{
      id: 'q-simple', templateId: simple.id, snapshot: { ability: simple.ability, difficulty: simple.difficulty, title: simple.title, flavor: simple.flavor, objective: simple.objective, tips: simple.tips, validation: simple.validation, tags: simple.tags },
      period: 'daily', periodStart: '2026-10-05', periodEnd: '2026-10-05', status: 'accepted', progress: 0, xpAwarded: 0, inspirationUsed: false, acceptedAt: null, completedAt: null,
    }]);
    const r = await tuneQuest(ctx, U, 'q-simple', 'easier');
    expect(r.ok).toBe(false);
    await acceptQuest(ctx, U, 'q-simple');
    await completeQuestAction(ctx, U, { instanceId: 'q-simple', useInspiration: false });
    const after = await tuneQuest(ctx, U, 'q-simple', 'harder');
    expect(after.ok).toBe(false);
  });

  it('réapplique le réglage mémorisé quand la quête revient au tirage', async () => {
    const { store, ctx, tpl } = await dailyCounter();
    await tuneQuest(ctx, U, 'q-pompes', 'harder');
    const prefs = await store.getPreferences(U);
    expect(prefs[tpl.id].tune).toBe(1);
    // Un autre jour, la pompe est tirée avec la cible renforcée
    const templates = [tpl];
    const scores = abilityScores({ baseScores: { FOR: 4, DEX: 4, CON: 4, INT: 4, SAG: 4, CHA: 4 }, improvements: { FOR: 0, DEX: 0, CON: 0, INT: 0, SAG: 0, CHA: 0 }, abilityXp: { FOR: 0, DEX: 0, CON: 0, INT: 0, SAG: 0, CHA: 0 } });
    const draw = drawQuests({ characterId: 'x', period: 'daily', periodStart: '2026-10-20', count: 1, level: 1, scores, masteries: [], templates, preferences: prefs, lastDrawn: {} });
    expect(draw.picks[0].id).toBe(tpl.id);
  });
});
