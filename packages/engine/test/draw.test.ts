import { describe, expect, it } from 'vitest';
import {
  ABILITIES,
  AbilityId,
  DIFFICULTIES,
  Difficulty,
  QuestTemplate,
  drawQuests,
  createRng,
  hashString,
  shuffle,
  weightedPick,
  lastDrawnMap,
  availableAgainOn,
} from '../src';

function makeCatalog(): QuestTemplate[] {
  const out: QuestTemplate[] = [];
  const counts: Record<Difficulty, number> = { easy: 14, medium: 12, high: 9, expert: 5 };
  for (const a of ABILITIES) {
    for (const d of DIFFICULTIES) {
      for (let i = 0; i < counts[d]; i++) {
        out.push({
          id: `${a}-${d}-${i}`,
          source: 'catalog',
          ability: a,
          difficulty: d,
          periods: d === 'easy' ? ['daily'] : d === 'medium' ? ['daily', 'weekly'] : d === 'high' ? ['weekly', 'monthly'] : ['weekly', 'monthly', 'epic'],
          title: `${a} ${d} ${i}`,
          flavor: '',
          objective: '',
          tips: [],
          validation: { type: 'simple' },
          tags: [],
        });
      }
    }
  }
  return out;
}

const templates = makeCatalog();
const scores: Record<AbilityId, number> = { FOR: 12, DEX: 12, CON: 12, INT: 12, SAG: 12, CHA: 12 };

const base = {
  characterId: 'char-1',
  period: 'daily' as const,
  periodStart: '2026-10-08',
  count: 4,
  level: 5,
  scores,
  masteries: ['FOR', 'CON'] as AbilityId[],
  templates,
  preferences: {},
  lastDrawn: {},
};

describe('tirage', () => {
  it('est déterministe pour une même graine', () => {
    const a = drawQuests(base).picks.map((t) => t.id);
    const b = drawQuests(base).picks.map((t) => t.id);
    expect(a).toEqual(b);
    expect(a).toHaveLength(4);
  });
  it('change le lendemain', () => {
    const a = drawQuests(base).picks.map((t) => t.id);
    const b = drawQuests({ ...base, periodStart: '2026-10-09' }).picks.map((t) => t.id);
    expect(a).not.toEqual(b);
  });
  it('pas de doublon de caractéristique en journalier (≤ 6)', () => {
    for (let d = 1; d <= 30; d++) {
      const r = drawQuests({ ...base, count: 6, periodStart: `2026-11-${String(d).padStart(2, '0')}` });
      const abilities = r.picks.map((t) => t.ability);
      expect(new Set(abilities).size).toBe(abilities.length);
    }
  });
  it('garantit une quête dans une caractéristique maîtrisée', () => {
    for (let d = 1; d <= 30; d++) {
      const r = drawQuests({ ...base, count: 3, level: 1, periodStart: `2026-11-${String(d).padStart(2, '0')}` });
      expect(r.picks.some((t) => base.masteries.includes(t.ability))).toBe(true);
    }
  });
  it('ne tire pas de quêtes exclues', () => {
    const excluded = Object.fromEntries(
      templates.filter((t) => t.ability === 'CHA').map((t) => [t.id, { templateId: t.id, isExcluded: true }]),
    );
    for (let d = 1; d <= 20; d++) {
      const r = drawQuests({ ...base, preferences: excluded, periodStart: `2026-11-${String(d).padStart(2, '0')}` });
      expect(r.picks.every((t) => t.ability !== 'CHA')).toBe(true);
    }
  });
  it('respecte l’anti-répétition de 7 jours', () => {
    const first = drawQuests(base).picks;
    const last = Object.fromEntries(first.map((t) => [t.id, '2026-10-08']));
    const next = drawQuests({ ...base, periodStart: '2026-10-12', lastDrawn: last });
    expect(next.picks.some((t) => first.some((f) => f.id === t.id))).toBe(false);
    expect(next.relaxed).toEqual([]);
  });
  it('relâche les règles si le catalogue est insuffisant (RG-12)', () => {
    const small = templates.filter((t) => t.difficulty === 'easy' && t.ability === 'FOR').slice(0, 3);
    const last = Object.fromEntries(small.map((t) => [t.id, '2026-10-07']));
    const r = drawQuests({ ...base, count: 3, level: 1, templates: small, lastDrawn: last });
    expect(r.picks).toHaveLength(3);
    expect(r.relaxed).toContain('anti-repeat');
    expect(r.relaxed).toContain('duplicate-ability');
  });
  it('les favorites sont plus souvent tirées', () => {
    const fav = templates.find((t) => t.id === 'INT-easy-0')!;
    let withFav = 0;
    let without = 0;
    for (let d = 1; d <= 200; d++) {
      const ps = `2027-0${1 + (d % 9)}-${String((d % 27) + 1).padStart(2, '0')}`;
      const seed = { ...base, count: 3, level: 1, periodStart: ps, characterId: `c${d}` };
      if (drawQuests({ ...seed, preferences: { [fav.id]: { templateId: fav.id, isFavorite: true } } }).picks.some((t) => t.id === fav.id)) withFav++;
      if (drawQuests(seed).picks.some((t) => t.id === fav.id)) without++;
    }
    expect(withFav).toBeGreaterThan(without);
  });
  it('les quêtes épinglées reviennent à chaque période', () => {
    const pinned = templates.find((t) => t.id === 'DEX-medium-3')!;
    for (let d = 1; d <= 10; d++) {
      const r = drawQuests({ ...base, periodStart: `2026-11-${String(d).padStart(2, '0')}`, preferences: { [pinned.id]: { templateId: pinned.id, isPinned: true } } });
      expect(r.picks[0].id).toBe(pinned.id);
      expect(r.picks).toHaveLength(4);
    }
  });
  it('pousse vers les caractéristiques faibles', () => {
    const lopsided: Record<AbilityId, number> = { FOR: 8, DEX: 15, CON: 15, INT: 15, SAG: 15, CHA: 15 };
    let weak = 0;
    let total = 0;
    for (let d = 1; d <= 300; d++) {
      const r = drawQuests({ ...base, count: 1, scores: lopsided, masteries: [], characterId: `x${d}`, periodStart: `2027-03-${String((d % 28) + 1).padStart(2, '0')}` });
      total++;
      if (r.picks[0].ability === 'FOR') weak++;
    }
    expect(weak / total).toBeGreaterThan(1 / 6 + 0.05);
  });
  it('niveau 1 : pas d’Expert dans une caractéristique faible, pas d’Élevé en journalier', () => {
    for (let d = 1; d <= 40; d++) {
      const r = drawQuests({ ...base, level: 1, count: 3, scores: { ...scores, FOR: 10 }, periodStart: `2027-01-${String((d % 28) + 1).padStart(2, '0')}` });
      expect(r.picks.every((t) => t.difficulty !== 'expert' && t.difficulty !== 'high')).toBe(true);
    }
  });
  it('hebdo et mensuel respectent les difficultés', () => {
    const w = drawQuests({ ...base, period: 'weekly', periodStart: '2026-10-05', count: 3, level: 6 });
    expect(w.picks.every((t) => t.periods.includes('weekly') && t.difficulty !== 'easy')).toBe(true);
    const m = drawQuests({ ...base, period: 'monthly', periodStart: '2026-10-01', count: 2, level: 10 });
    expect(m.picks.every((t) => t.difficulty === 'high' || t.difficulty === 'expert')).toBe(true);
    const lowM = drawQuests({ ...base, period: 'monthly', periodStart: '2026-10-01', count: 1, level: 1, scores: { ...scores, FOR: 8, DEX: 8, CON: 8, INT: 8, SAG: 8, CHA: 8 } });
    expect(lowM.picks.every((t) => t.difficulty === 'high')).toBe(true);
  });
  it('quêtes libres : plan de difficultés', () => {
    const r = drawQuests({ ...base, difficultyPlan: ['medium', 'high'], period: 'weekly', exclude: ['x'], seedSuffix: 'free' });
    expect(r.picks.map((t) => t.difficulty)).toEqual(['medium', 'high']);
  });
  it('relance : exclut la quête actuelle', () => {
    const cur = drawQuests(base).picks;
    const r = drawQuests({ ...base, count: 1, exclude: cur.map((t) => t.id), seedSuffix: 'reroll-1', skipPinned: true });
    expect(cur.some((t) => t.id === r.picks[0].id)).toBe(false);
  });
});

describe('utilitaires', () => {
  it('lastDrawnMap garde la période la plus récente', () => {
    const m = lastDrawnMap(
      [
        { templateId: 'a', period: 'daily', periodStart: '2026-10-01' },
        { templateId: 'a', period: 'daily', periodStart: '2026-10-05' },
        { templateId: 'a', period: 'weekly', periodStart: '2026-10-09' },
      ],
      'daily',
    );
    expect(m).toEqual({ a: '2026-10-05' });
    expect(availableAgainOn('daily', '2026-10-05')).toBe('2026-10-12');
  });
  it('rng déterministe', () => {
    const r1 = createRng('abc');
    const r2 = createRng('abc');
    expect([r1(), r1()]).toEqual([r2(), r2()]);
    expect(hashString('a')).not.toBe(hashString('b'));
    expect(createRng(5)()).toBeGreaterThanOrEqual(0);
    expect(shuffle([1, 2, 3, 4], createRng('s'))).toHaveLength(4);
    expect(weightedPick([], () => 1, createRng(1))).toBeUndefined();
    expect(weightedPick(['a', 'b'], (x) => (x === 'b' ? 1 : 0), createRng(1))).toBe('b');
  });
});
