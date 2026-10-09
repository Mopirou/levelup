import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  ABILITIES,
  AbilityId,
  AchievementDef,
  ClassDef,
  Difficulty,
  Period,
  QuestTemplate,
  SelfAssessmentQuestion,
  TavernMessage,
  addDays,
  drawQuests,
  lastDrawnMap,
  periodBounds,
  questCountFor,
  scoresFromAssessment,
  isValidPointBuy,
  pickTavernMessage,
  buildRecap,
  type RecapTemplates,
} from '../src';

const dir = join(__dirname, '..', '..', 'content', 'data');
const load = <T>(f: string): T => JSON.parse(readFileSync(join(dir, f), 'utf8'));

const quests = load<QuestTemplate[]>('quests.fr.json').map((q) => ({ ...q, source: 'catalog' as const }));
const classes = load<ClassDef[]>('classes.fr.json');
const achievements = load<AchievementDef[]>('achievements.fr.json');
const taverne = load<TavernMessage[]>('taverne.fr.json');
const recap = load<RecapTemplates>('recap-templates.fr.json');
const names = load<string[]>('names.fr.json');
const assessment = load<SelfAssessmentQuestion[]>('self-assessment.fr.json');
const levels = load<{ level: number; text: string }[]>('levels.fr.json');

describe('catalogue de quêtes', () => {
  const general = quests.filter((q) => !q.theme);
  const guided = quests.filter((q) => q.theme);
  it('240 quêtes générales : 40 par caractéristique, 14/12/9/5 par difficulté', () => {
    expect(general).toHaveLength(240);
    for (const a of ABILITIES) {
      const own = general.filter((q) => q.ability === a);
      expect(own).toHaveLength(40);
      const by = (d: Difficulty) => own.filter((q) => q.difficulty === d).length;
      expect([by('easy'), by('medium'), by('high'), by('expert')]).toEqual([14, 12, 9, 5]);
    }
  });
  it('identifiants uniques, textes complets, objectifs mesurables', () => {
    expect(new Set(quests.map((q) => q.id)).size).toBe(quests.length);
    for (const q of quests) {
      expect(q.title.length).toBeGreaterThanOrEqual(8);
      expect(q.flavor.length).toBeGreaterThan(30);
      expect(q.objective.length).toBeGreaterThanOrEqual(10);
      expect(q.tips.length).toBeGreaterThanOrEqual(2);
      expect(q.periods.length).toBeGreaterThan(0);
      expect(q.title.split(' ').length).toBeLessThanOrEqual(9);
    }
  });
  it('500 quêtes guidées : 25 disciplines × 5 activités × 4 paliers (jour, semaine, mois, épique)', () => {
    expect(guided).toHaveLength(500);
    const themes = new Set(guided.map((q) => q.theme));
    expect(themes.size).toBe(25);
    const tiers = { easy: 'daily', medium: 'weekly', high: 'monthly', expert: 'epic' } as const;
    for (const th of themes) {
      const own = guided.filter((q) => q.theme === th);
      expect(own).toHaveLength(20);
      for (const d of Object.keys(tiers) as Difficulty[]) {
        const tier = own.filter((q) => q.difficulty === d);
        expect(tier).toHaveLength(5);
        for (const q of tier) expect(q.periods).toEqual([tiers[d]]);
      }
    }
    for (const q of guided) {
      expect(q.tags).toContain('guidé');
      const total = (q.secondary ?? []).reduce((n, s) => n + s.pct, 0);
      expect(total).toBeGreaterThan(0);
      expect(total).toBeLessThan(100);
      expect((q.secondary ?? []).every((s) => s.ability !== q.ability)).toBe(true);
    }
  });
  it('les quêtes physiques Légendaires portent la mention de prudence', () => {
    for (const q of quests.filter((q) => q.difficulty === 'expert' && q.ability !== 'SAG' && q.tags.includes('sport'))) {
      expect(q.objective.toLowerCase()).toMatch(/adapte à ta condition/);
    }
  });
  it('les validations sont cohérentes', () => {
    for (const q of quests) {
      const v = q.validation;
      if (v.type === 'counter') expect(v.target).toBeGreaterThan(0);
      if (v.type === 'timer') expect(v.minutes).toBeGreaterThan(0);
      if (v.type === 'steps') expect(v.steps.length).toBeGreaterThanOrEqual(2);
    }
  });
});

describe('tirage sur le vrai catalogue', () => {
  const masteries: AbilityId[] = ['CON', 'SAG'];
  const scoresAt = (v: number) => ({ FOR: v, DEX: v, CON: v, INT: v, SAG: v, CHA: v });

  it('remplit toujours les quêtes demandées, de 1 à 20, sur un an de jours/semaines/mois', () => {
    for (const level of [1, 2, 5, 10, 17, 20]) {
      const scores = scoresAt(level < 5 ? 10 : 14);
      const history: { templateId: string; period: Period; periodStart: string }[] = [];
      let day = '2026-01-01';
      let relaxedTotal = 0;
      for (let i = 0; i < 365; i++) {
        for (const period of ['daily', 'weekly', 'monthly', 'epic'] as Period[]) {
          const b = periodBounds(period, day);
          if (b.start !== day && period !== 'daily') continue;
          const count = questCountFor(period, level);
          if (!count) continue;
          const r = drawQuests({
            characterId: 'abc', period, periodStart: b.start, count, level, scores, masteries, templates: quests,
            preferences: {}, lastDrawn: lastDrawnMap(history, period),
          });
          expect(r.picks.length).toBe(count);
          if (period === 'daily') expect(new Set(r.picks.map((p) => p.ability)).size).toBe(count);
          relaxedTotal += r.relaxed.length;
          for (const p of r.picks) history.push({ templateId: p.id, period, periodStart: b.start });
        }
        day = addDays(day, 1);
      }
      // le catalogue suffit presque toujours à respecter l'anti-répétition
      expect(relaxedTotal).toBeLessThan(120);
    }
  });
  it('au niveau 1, aucune quête Audacieuse ni Légendaire en journalier', () => {
    for (let i = 0; i < 100; i++) {
      const r = drawQuests({
        characterId: 'zz', period: 'daily', periodStart: addDays('2026-03-01', i), count: 3, level: 1,
        scores: scoresAt(10), masteries, templates: quests, preferences: {}, lastDrawn: {},
      });
      expect(r.picks.every((p) => p.difficulty === 'easy' || p.difficulty === 'medium')).toBe(true);
    }
  });
});

describe('autres contenus', () => {
  it('8 classes, 16 voies, maîtrises valides et distinctes', () => {
    expect(classes).toHaveLength(8);
    expect(classes.flatMap((c) => c.paths)).toHaveLength(16);
    expect(new Set(classes.map((c) => c.masteries.join('-'))).size).toBe(8);
    for (const c of classes) {
      expect(c.masteries).toHaveLength(2);
      expect(c.favoredQuests).toHaveLength(3);
      for (const f of c.favoredQuests) expect(quests.some((q) => q.title === f)).toBe(true);
    }
  });
  it('98 trophées uniques', () => {
    expect(achievements).toHaveLength(98);
    expect(new Set(achievements.map((a) => a.id)).size).toBe(98);
    for (const a of achievements) {
      expect(a.xpBonus).toBeGreaterThanOrEqual(25);
      expect(a.xpBonus).toBeLessThanOrEqual(500);
    }
  });
  it('150 messages du tavernier, 20 textes de niveau, 200 noms, 12 questions', () => {
    expect(taverne).toHaveLength(150);
    expect(levels).toHaveLength(20);
    expect(names).toHaveLength(200);
    expect(assessment).toHaveLength(12);
    for (const a of ABILITIES) expect(assessment.filter((q) => q.ability === a)).toHaveLength(2);
    expect(recap.openers.length + recap.best.length + recap.weak.length + recap.closers.length).toBe(120);
  });
  it('le tavernier trouve toujours un message', () => {
    for (let d = 0; d < 60; d++) {
      for (const h of [2, 7, 12, 16, 19, 23]) {
        const msg = pickTavernMessage(taverne, {
          name: 'Alex', streak: d % 12, weakest: ABILITIES[d % 6], strongest: ABILITIES[(d + 1) % 6], weekday: (d % 7) + 1,
          hour: h, dayOfMonth: (d % 28) + 1, dailyDone: d % 4, dailyTotal: 3, level: (d % 20) + 1, inspiration: d % 4,
          daysAway: d % 9, totalQuests: d * 3, date: addDays('2026-10-01', d),
        });
        expect(msg.length).toBeGreaterThan(10);
        expect(msg).not.toMatch(/\{\w+\}/);
      }
    }
  });
  it('le bilan produit un récit pour chaque caractéristique dominante', () => {
    for (const a of ABILITIES) {
      const xpByAbility = { FOR: 10, DEX: 10, CON: 10, INT: 10, SAG: 10, CHA: 10 };
      xpByAbility[a] = 200;
      const r = buildRecap(
        { kind: 'week', name: 'Alex', xp: 250, xpPrev: 100, done: 8, proposed: 12, xpByAbility, doneByAbility: { FOR: 1, DEX: 1, CON: 1, INT: 1, SAG: 1, CHA: 1 }, seed: a },
        recap,
      );
      expect(r.best).toBe(a);
      expect(r.narrative.length).toBeGreaterThan(40);
      expect(r.narrative).not.toMatch(/\{\w+\}/);
    }
  });
  it('l’auto-évaluation donne une répartition valide', () => {
    expect(isValidPointBuy(scoresFromAssessment(assessment, Object.fromEntries(assessment.map((q) => [q.id, 4]))))).toBe(true);
  });
});
