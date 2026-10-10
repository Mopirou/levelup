import { describe, expect, it } from 'vitest';
import {
  TRACK_DEMOTE_MISSES,
  TRACK_PROMOTE_HITS,
  TRACK_RUNGS,
  advanceOnCompletion,
  applyMisses,
  buildRungTemplates,
  effectiveRung,
  missedDays,
  revertCompletion,
  rungTemplateId,
  trackRungDifficulty,
  trackRungMinScore,
  trackShapes,
  type AbilityId,
  type QuestTemplate,
  type TrackState,
} from '../src';
import { TEST_RUNG_TEMPLATES, TEST_TRACKS, makeTrack } from './track-fixtures';

const state = (over: Partial<TrackState> = {}): TrackState => ({
  trackId: 'muscu-haut',
  status: 'active',
  rung: 1,
  hits: 0,
  lastDoneDate: null,
  lastCheckedDate: '2026-10-05',
  bestRung: 1,
  startedAt: '2026-10-05T07:00:00.000Z',
  ...over,
});

const scores = (v: number): Record<AbilityId, number> => ({ FOR: v, DEX: v, CON: v, INT: v, SAG: v, CHA: v });

describe('constantes et gabarits d’échelon', () => {
  it('score minimum par échelon : 1-4 → 0, 5-6 → 4, 7-8 → 6, 9-10 → 9', () => {
    const table = [0, 0, 0, 0, 0, 4, 4, 6, 6, 9, 9];
    for (let r = 1; r <= TRACK_RUNGS; r++) expect(trackRungMinScore(r)).toBe(table[r] ?? 0);
    expect([1, 4, 5, 6, 7, 8, 9, 10].map(trackRungMinScore)).toEqual([0, 0, 4, 4, 6, 6, 9, 9]);
  });

  it('difficulté par échelon : 1-3 facile, 4-6 modérée, 7-9 élevée, 10 expert', () => {
    expect([1, 3, 4, 6, 7, 9, 10].map(trackRungDifficulty)).toEqual(['easy', 'easy', 'medium', 'medium', 'high', 'high', 'expert']);
  });

  it('identifiant de gabarit sur deux chiffres', () => {
    expect(rungTemplateId('musculation-muscu-haut-du-corps', 3)).toBe('musculation-muscu-haut-du-corps-r03');
    expect(rungTemplateId('x', 10)).toBe('x-r10');
  });

  it('buildRungTemplates produit un gabarit quotidien par échelon, avec thème et secondaires', () => {
    const t = TEST_RUNG_TEMPLATES.filter((x) => x.trackId === 'course-fond');
    expect(t).toHaveLength(10);
    expect(t[0]).toMatchObject({ id: 'course-fond-r01', source: 'catalog', ability: 'CON', periods: ['daily'], theme: 'sport', trackId: 'course-fond', rung: 1, difficulty: 'easy' });
    expect(t[0].secondary).toEqual([{ ability: 'DEX', pct: 20 }]);
    expect(t[9].difficulty).toBe('expert');
    expect(TEST_RUNG_TEMPLATES.find((x) => x.id === 'muscu-haut-r01')!.secondary).toBeUndefined();
    expect(buildRungTemplates([])).toEqual([]);
  });

  it('trackShapes déduit caractéristique et nombre d’échelons des gabarits, en ignorant le reste', () => {
    const noise: QuestTemplate[] = [
      { ...TEST_RUNG_TEMPLATES[0], id: 'inactive', trackId: 'ghost', rung: 1, isActive: false },
      { ...TEST_RUNG_TEMPLATES[0], id: 'plain', trackId: null, rung: null },
      { ...TEST_RUNG_TEMPLATES[0], id: 'no-rung', trackId: 'ghost', rung: null },
    ];
    // ordre inversé : le tri par échelon doit rétablir l'ordre
    const shapes = trackShapes([...noise, ...[...TEST_RUNG_TEMPLATES].reverse()]);
    expect([...shapes.keys()].sort()).toEqual(TEST_TRACKS.map((t) => t.id).sort());
    expect(shapes.get('yoga-doux')!.ability).toBe('SAG');
    expect(shapes.get('yoga-doux')!.rungs.map((r) => r.rung)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  });
});

describe('effectiveRung', () => {
  const def = makeTrack('t', 'FOR');
  it('suit l’échelon courant quand le score suffit', () => {
    expect(effectiveRung(def, { rung: 4 }, scores(0))).toBe(4);
    expect(effectiveRung(def, { rung: 5 }, scores(4))).toBe(5);
    expect(effectiveRung(def, { rung: 8 }, scores(6))).toBe(8);
    expect(effectiveRung(def, { rung: 10 }, scores(9))).toBe(10);
  });
  it('plafonne au dernier échelon accessible', () => {
    expect(effectiveRung(def, { rung: 6 }, scores(3))).toBe(4);
    expect(effectiveRung(def, { rung: 8 }, scores(5))).toBe(6);
    expect(effectiveRung(def, { rung: 10 }, scores(8))).toBe(8);
    expect(effectiveRung(def, { rung: 9 }, scores(2))).toBe(4);
  });
  it('ne regarde que la caractéristique principale du parcours', () => {
    expect(effectiveRung(def, { rung: 7 }, { ...scores(2), FOR: 6 })).toBe(7);
    expect(effectiveRung(def, { rung: 7 }, { ...scores(20), FOR: 2 })).toBe(4);
  });
  it('reste entre 1 et le nombre d’échelons', () => {
    expect(effectiveRung(def, { rung: 0 }, scores(0))).toBe(1);
    expect(effectiveRung({ ability: 'FOR', rungs: [{ rung: 1 }, { rung: 2 }] }, { rung: 10 }, scores(20))).toBe(2);
  });
});

describe('jours manqués et descente', () => {
  it('ne fait rien pour un parcours en pause, jamais pointé ou déjà à jour', () => {
    const paused = state({ status: 'paused' });
    expect(applyMisses(paused, '2026-10-20', []).state).toBe(paused);
    const unchecked = state({ lastCheckedDate: null });
    expect(applyMisses(unchecked, '2026-10-20', []).state).toBe(unchecked);
    const upToDate = state({ lastCheckedDate: '2026-10-09' });
    expect(applyMisses(upToDate, '2026-10-10', [])).toEqual({ state: upToDate, missed: [], demoted: false });
    expect(missedDays(paused, '2026-10-20', [])).toEqual([]);
  });

  it('liste les jours manqués : ni jour validé, ni jour de repos, ni aujourd’hui', () => {
    const s = state({ lastCheckedDate: '2026-10-05' });
    expect(missedDays(s, '2026-10-10', ['2026-10-07'], ['2026-10-06'])).toEqual(['2026-10-08', '2026-10-09']);
    // lastDoneDate compte comme un jour validé
    expect(missedDays({ ...s, lastDoneDate: '2026-10-08' }, '2026-10-10', [])).toEqual(['2026-10-06', '2026-10-07', '2026-10-09']);
  });

  it(`${TRACK_DEMOTE_MISSES} jours manqués d’affilée font descendre d’un échelon et remettent hits à 0`, () => {
    const r = applyMisses(state({ rung: 3, hits: 4 }), '2026-10-10', []);
    expect(r.missed).toEqual(['2026-10-06', '2026-10-07', '2026-10-08', '2026-10-09']);
    expect(r.demoted).toBe(true);
    expect(r.state).toMatchObject({ rung: 2, hits: 0, lastCheckedDate: '2026-10-09' });
  });

  it('trois jours manqués ne suffisent pas, et la série en cours est recomptée au passage suivant', () => {
    const first = applyMisses(state({ rung: 3 }), '2026-10-09', []);
    expect(first.demoted).toBe(false);
    expect(first.missed).toHaveLength(3);
    // aucun jour réglé : le suivi reste à la veille de la série
    expect(first.state.lastCheckedDate).toBe('2026-10-05');
    const second = applyMisses(first.state, '2026-10-10', []);
    expect(second.state).toMatchObject({ rung: 2, lastCheckedDate: '2026-10-09' });
    // idem en passant par plusieurs petits pas
    const step1 = applyMisses(state({ rung: 3 }), '2026-10-07', []);
    const step2 = applyMisses(step1.state, '2026-10-08', []);
    const step3 = applyMisses(step2.state, '2026-10-10', []);
    expect(step3.state.rung).toBe(2);
  });

  it('un jour validé interrompt la série de jours manqués', () => {
    const r = applyMisses(state({ rung: 3 }), '2026-10-12', [], ['2026-10-08']);
    expect(r.demoted).toBe(false);
    expect(r.missed).toHaveLength(5);
    // série finale : 10-09, 10-10, 10-11 (3 jours) → en attente
    expect(r.state.lastCheckedDate).toBe('2026-10-08');
  });

  it('un jour de repos ne compte pas et ne casse pas la série de jours manqués', () => {
    const withRest = applyMisses(state({ rung: 3 }), '2026-10-10', ['2026-10-07']);
    expect(withRest.demoted).toBe(false);
    expect(withRest.missed).toEqual(['2026-10-06', '2026-10-08', '2026-10-09']);
    // le jour suivant, le 4e jour manqué (le repos ne remet rien à zéro) fait descendre
    expect(applyMisses(withRest.state, '2026-10-11', ['2026-10-07']).state.rung).toBe(2);
  });

  it('au plus une descente par passage, même après une longue absence', () => {
    const r = applyMisses(state({ rung: 8 }), '2026-11-20', []);
    expect(r.state.rung).toBe(7);
    // 45 jours manqués = 11 séries de 4 + 1 jour en attente (recompté au prochain passage)
    expect(r.state.lastCheckedDate).toBe('2026-11-18');
    expect(r.missed.length).toBeGreaterThan(30);
  });

  it('au échelon 1 : pas de descente mais hits remis à 0', () => {
    const r = applyMisses(state({ rung: 1, hits: 3 }), '2026-10-10', []);
    expect(r.state).toMatchObject({ rung: 1, hits: 0 });
    expect(r.demoted).toBe(false);
  });
});

describe('validation et annulation', () => {
  it(`${TRACK_PROMOTE_HITS} jours validés font monter d’un échelon, pas forcément d’affilée`, () => {
    let s = state();
    const days = ['2026-10-05', '2026-10-06', '2026-10-08', '2026-10-09'];
    for (const d of days) s = advanceOnCompletion(s, d);
    expect(s).toMatchObject({ rung: 1, hits: 4, lastDoneDate: '2026-10-09', bestRung: 1 });
    s = advanceOnCompletion(s, '2026-10-12');
    expect(s).toMatchObject({ rung: 2, hits: 0, lastDoneDate: '2026-10-12', bestRung: 2 });
  });

  it('une seconde validation le même jour ou sur un parcours en pause ne compte pas', () => {
    const once = advanceOnCompletion(state(), '2026-10-05');
    expect(advanceOnCompletion(once, '2026-10-05')).toBe(once);
    const paused = state({ status: 'paused' });
    expect(advanceOnCompletion(paused, '2026-10-05')).toBe(paused);
  });

  it('bestRung ne redescend pas et la date de dernière validation ne recule pas', () => {
    const s = advanceOnCompletion(state({ rung: 2, hits: 4, bestRung: 6, lastDoneDate: '2026-10-09' }), '2026-10-07');
    expect(s).toMatchObject({ rung: 3, bestRung: 6, lastDoneDate: '2026-10-09' });
  });

  it('au dernier échelon, hits plafonne au lieu de monter', () => {
    let s = state({ rung: 10, hits: 4, bestRung: 10 });
    s = advanceOnCompletion(s, '2026-10-06');
    expect(s).toMatchObject({ rung: 10, hits: TRACK_PROMOTE_HITS });
    s = advanceOnCompletion(s, '2026-10-07');
    expect(s).toMatchObject({ rung: 10, hits: TRACK_PROMOTE_HITS });
    // maxRung explicite (parcours plus court)
    expect(advanceOnCompletion(state({ rung: 3, hits: 4 }), '2026-10-06', 3)).toMatchObject({ rung: 3, hits: TRACK_PROMOTE_HITS });
  });

  it('revertCompletion défait un jour validé', () => {
    const after = advanceOnCompletion(state({ hits: 2, lastDoneDate: '2026-10-05' }), '2026-10-06');
    expect(revertCompletion(after, '2026-10-06', '2026-10-05')).toEqual(state({ hits: 2, lastDoneDate: '2026-10-05' }));
  });

  it('revertCompletion défait une montée d’échelon', () => {
    const before = state({ rung: 1, hits: 4, lastDoneDate: '2026-10-08' });
    const after = advanceOnCompletion(before, '2026-10-09');
    expect(after.rung).toBe(2);
    expect(revertCompletion(after, '2026-10-09', '2026-10-08')).toEqual(before);
  });

  it('revertCompletion : rien à défaire à l’échelon 1 sans validation, bestRung préservé s’il était plus haut', () => {
    expect(revertCompletion(state({ lastDoneDate: '2026-10-05' }), '2026-10-05', null)).toMatchObject({ rung: 1, hits: 0, lastDoneDate: null });
    // une autre date n'efface pas lastDoneDate
    expect(revertCompletion(state({ hits: 2, lastDoneDate: '2026-10-09' }), '2026-10-07')).toMatchObject({ hits: 1, lastDoneDate: '2026-10-09' });
    expect(revertCompletion(state({ rung: 4, hits: 0, bestRung: 7 }), '2026-10-07')).toMatchObject({ rung: 3, hits: 4, bestRung: 7 });
    expect(revertCompletion(state({ rung: 4, hits: 0, bestRung: 4 }), '2026-10-07')).toMatchObject({ rung: 3, hits: 4, bestRung: 3 });
  });
});
