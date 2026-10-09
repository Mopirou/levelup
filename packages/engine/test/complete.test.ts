import { describe, expect, it } from 'vitest';
import {
  CharacterCore,
  QuestInstance,
  applyXp,
  buildRecap,
  canUndo,
  completeQuest,
  emptyStats,
  evaluateAchievements,
  expiredPartialXp,
  hardcorePenalty,
  interpolate,
  isReadyToComplete,
  newlyUnlocked,
  offlineCompletionAllowed,
  pickTavernMessage,
  progressRatio,
  scoresFromAssessment,
  isValidPointBuy,
  masteriesOf,
  pathAbilityOf,
  totalAbilityScoreSum,
  weekStartOf,
  validationTarget,
  type AchievementDef,
  type ClassDef,
  type TavernMessage,
  type SelfAssessmentQuestion,
  type RecapTemplates,
} from '../src';

const hero = (over: Partial<CharacterCore> = {}): CharacterCore => ({
  id: 'c1',
  name: 'Aldric',
  classId: 'barbare',
  pathId: null,
  baseScores: { FOR: 5, DEX: 2, CON: 5, INT: 2, SAG: 2, CHA: 2 },
  improvements: { FOR: 0, DEX: 0, CON: 0, INT: 0, SAG: 0, CHA: 0 },
  improvementsChosen: 0,
  totalXp: 0,
  abilityXp: { FOR: 0, DEX: 0, CON: 0, INT: 0, SAG: 0, CHA: 0 },
  level: 1,
  streakCurrent: 0,
  streakBest: 0,
  inspiration: 0,
  ...over,
});

const inst = (over: Partial<QuestInstance> = {}): QuestInstance => ({
  id: 'i1',
  templateId: 't1',
  snapshot: {
    ability: 'CON',
    difficulty: 'easy',
    title: 'T',
    flavor: '',
    objective: '',
    tips: [],
    validation: { type: 'simple' },
    tags: [],
  },
  period: 'daily',
  periodStart: '2026-10-08',
  periodEnd: '2026-10-08',
  status: 'accepted',
  progress: 0,
  xpAwarded: 0,
  inspirationUsed: false,
  ...over,
});

describe('validation d’une quête', () => {
  it('compteur : prêt à la cible', () => {
    const q = inst({ snapshot: { ...inst().snapshot, validation: { type: 'counter', target: 3, unit: 'séances' } }, progress: 2 });
    expect(isReadyToComplete(q)).toBe('incomplete');
    expect(isReadyToComplete({ ...q, progress: 3 })).toBeNull();
    expect(progressRatio(q)).toBeCloseTo(2 / 3);
    expect(validationTarget(q.snapshot.validation)).toBe(3);
  });
  it('étapes et chronomètre et journal', () => {
    const steps = inst({ snapshot: { ...inst().snapshot, validation: { type: 'steps', steps: ['a', 'b'] } }, stepsDone: [true, false] });
    expect(isReadyToComplete(steps)).toBe('incomplete');
    expect(isReadyToComplete({ ...steps, stepsDone: [true, true] })).toBeNull();
    expect(progressRatio(steps)).toBe(0.5);
    const timer = inst({ snapshot: { ...inst().snapshot, validation: { type: 'timer', minutes: 5 } }, progress: 4 });
    expect(isReadyToComplete(timer)).toBe('incomplete');
    expect(isReadyToComplete({ ...timer, progress: 5 })).toBeNull();
    const journal = inst({ snapshot: { ...inst().snapshot, validation: { type: 'journal' } } });
    expect(isReadyToComplete(journal, 'court')).toBe('journal-too-short');
    expect(isReadyToComplete(journal, 'x'.repeat(50))).toBeNull();
  });
});

describe('validation et XP', () => {
  it('quête facile Barbare niveau 1 : 10 + 2×5 = 20 XP (CON maîtrisée)', () => {
    const r = completeQuest({ character: hero(), masteries: ['FOR', 'CON'], instance: inst(), useInspiration: false });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.result.xpAwarded).toBe(20);
      expect(r.result.character.totalXp).toBe(20);
      expect(r.result.character.abilityXp.CON).toBe(20);
    }
  });
  it('refuse une quête non acceptée, déjà accomplie ou sans inspiration', () => {
    expect(completeQuest({ character: hero(), masteries: [], instance: inst({ status: 'proposed' }), useInspiration: false })).toEqual({ ok: false, error: 'not-accepted' });
    expect(completeQuest({ character: hero(), masteries: [], instance: inst({ status: 'completed' }), useInspiration: false })).toEqual({ ok: false, error: 'already-completed' });
    expect(completeQuest({ character: hero(), masteries: [], instance: inst(), useInspiration: true })).toEqual({ ok: false, error: 'no-inspiration' });
  });
  it('l’inspiration double l’XP et consomme un jeton', () => {
    const r = completeQuest({ character: hero({ inspiration: 2 }), masteries: [], instance: inst(), useInspiration: true });
    expect(r.ok && r.result.xpAwarded).toBe(20);
    expect(r.ok && r.result.character.inspiration).toBe(1);
  });
  it('plusieurs niveaux d’un coup (RG-05) et amélioration en attente', () => {
    const r = applyXp(hero({ totalXp: 0 }), 'INT', 600);
    expect(r.levelsGained).toEqual([2, 3, 4]);
    expect(r.pendingImprovements).toBe(1);
    expect(r.pendingPath).toBe(true);
  });
  it('la hausse de score est détectée', () => {
    const r = applyXp(hero({ abilityXp: { FOR: 0, DEX: 0, CON: 690, INT: 0, SAG: 0, CHA: 0 } }), 'CON', 20);
    // CON part de 5 : 690 XP donnent 2 points (200 + 250) ; le 3e coûte 300 et il n'en a que 260, donc pas encore
    expect(r.abilityUps).toEqual([]);
    const r2 = applyXp(hero({ abilityXp: { FOR: 0, DEX: 0, INT: 40, CON: 0, SAG: 0, CHA: 0 } }), 'INT', 20);
    // INT part de 2 : le premier point coûte 50 XP
    expect(r2.abilityUps).toEqual([{ ability: 'INT', from: 2, to: 3 }]);
  });
  it('l’annulation (XP négative) recalcule le niveau (RG-06)', () => {
    const up = applyXp(hero(), 'INT', 70);
    expect(up.character.level).toBe(2);
    const down = applyXp(up.character, 'INT', -70);
    expect(down.character.level).toBe(1);
    expect(down.levelsLost).toEqual([2]);
    expect(down.character.totalXp).toBe(0);
    const floor = applyXp(hero(), 'INT', -50);
    expect(floor.character.totalXp).toBe(0);
  });
  it('compteur expiré au prorata', () => {
    const q = inst({ snapshot: { ...inst().snapshot, difficulty: 'medium', validation: { type: 'counter', target: 4, unit: 'x' } }, progress: 2 });
    expect(expiredPartialXp(q, 1, [])).toBe(12);
    expect(expiredPartialXp({ ...q, progress: 1 }, 1, [])).toBe(0);
    expect(expiredPartialXp(inst(), 1, [])).toBe(0);
  });
  it('annulation sous 24 h, hardcore, hors ligne', () => {
    const now = Date.parse('2026-10-08T12:00:00Z');
    expect(canUndo('2026-10-08T00:00:00Z', now)).toBe(true);
    expect(canUndo('2026-10-06T00:00:00Z', now)).toBe(false);
    expect(canUndo(null, now)).toBe(false);
    expect(hardcorePenalty(inst())).toBe(1);
    expect(hardcorePenalty(inst({ snapshot: { ...inst().snapshot, difficulty: 'expert' } }))).toBe(10);
    const ps = Date.parse('2026-10-08T00:00:00Z');
    const pe = Date.parse('2026-10-08T23:59:59Z');
    expect(offlineCompletionAllowed(ps + 1000, ps + 3600000, ps, pe)).toBe(true);
    expect(offlineCompletionAllowed(ps + 1000, ps + 80 * 3600000, ps, pe)).toBe(false);
    expect(offlineCompletionAllowed(ps - 1000, ps + 3600000, ps, pe)).toBe(false);
  });
});

describe('classes', () => {
  const classes: ClassDef[] = [
    {
      id: 'magicien', name: 'Magicien', icon: '', masteries: ['INT', 'SAG'], profile: '', description: '', favoredQuests: [],
      paths: [
        { id: 'erudit', name: 'Érudit', ability: 'INT', title: '', description: '' },
        { id: 'ermite', name: 'Ermite', ability: 'SAG', title: '', description: '' },
      ],
    },
  ];
  it('maîtrises et voie', () => {
    expect(masteriesOf(classes, 'magicien')).toEqual(['INT', 'SAG']);
    expect(masteriesOf(classes, 'x')).toEqual([]);
    expect(pathAbilityOf(classes, 'magicien', 'ermite')).toBe('SAG');
    expect(pathAbilityOf(classes, 'magicien', null)).toBeNull();
    expect(weekStartOf('2026-10-08')).toBe('2026-10-05');
    expect(totalAbilityScoreSum({ FOR: 1, DEX: 1, CON: 1, INT: 1, SAG: 1, CHA: 1 })).toBe(6);
  });
});

describe('trophées', () => {
  const defs: AchievementDef[] = [
    { id: 'premier-pas', category: 'constance', name: 'Le Premier Pas', description: '', condition: { kind: 'quests_total', target: 1 }, xpBonus: 25 },
    { id: 'lourd', category: 'constance', name: 'Increvable', description: '', condition: { kind: 'streak_best', target: 100 }, xpBonus: 500 },
    { id: 'poly', category: 'equilibre', name: 'Polymathe', description: '', condition: { kind: 'all_scores_min', target: 14 }, xpBonus: 200 },
  ];
  it('évalue la progression et détecte les nouveaux', () => {
    const stats = { ...emptyStats(), questsTotal: 1, streakBest: 18 };
    const p = evaluateAchievements(defs, stats);
    expect(p.find((x) => x.id === 'premier-pas')!.done).toBe(true);
    expect(p.find((x) => x.id === 'lourd')).toMatchObject({ current: 18, target: 100, done: false });
    expect(newlyUnlocked(defs, stats, new Set()).map((d) => d.id)).toEqual(['premier-pas']);
    expect(newlyUnlocked(defs, stats, new Set(['premier-pas']))).toEqual([]);
  });
});

describe('narration', () => {
  it('interpole les variables', () => {
    expect(interpolate('Salut {name} ({x})', { name: 'Aldric' })).toBe('Salut Aldric ({x})');
  });
  const msgs: TavernMessage[] = [
    { id: 'a', text: 'Série {streak} pour {name}.', when: { streakMin: 5 } },
    { id: 'b', text: 'Générique.' },
    { id: 'c', text: 'Ta {weakest} s’endort.', when: { weakest: 'SAG' } },
  ];
  const ctx = {
    name: 'Alex', streak: 7, weakest: 'SAG' as const, strongest: 'INT' as const, weekday: 4, hour: 9, dayOfMonth: 8,
    dailyDone: 1, dailyTotal: 3, level: 5, inspiration: 1, daysAway: 0, totalQuests: 20, date: '2026-10-08',
  };
  it('choisit un message compatible et stable', () => {
    const m1 = pickTavernMessage(msgs, ctx);
    expect(m1).toBe(pickTavernMessage(msgs, ctx));
    expect(['Série 7 pour Alex.', 'Générique.', 'Ta Sagesse s’endort.']).toContain(m1);
    expect(pickTavernMessage([{ id: 'x', text: 'Seulement lundi', when: { monday: true } }], ctx)).toBe('Seulement lundi');
    expect(pickTavernMessage([], ctx)).toBe('');
  });
  it('filtre selon les conditions', () => {
    const only: TavernMessage[] = [{ id: 'x', text: 'rare', when: { streakMin: 50 } }, { id: 'y', text: 'ok', when: { daily: 'some', hourMin: 5, hourMax: 12 } }];
    expect(pickTavernMessage(only, ctx)).toBe('ok');
  });
  const templates: RecapTemplates = {
    openers: [{ trend: 'up', text: 'Belle semaine pour {name}.' }, { trend: 'first', text: 'Premier bilan.' }, { trend: 'down', text: 'Semaine calme.' }, { trend: 'flat', text: 'Stable.' }],
    best: [{ ability: 'INT', text: '{best} brille.' }],
    weak: [{ ability: 'DEX', text: '{weak} attend.' }],
    closers: [{ kind: 'week', text: 'À la semaine prochaine.' }, { kind: 'month', text: 'À bientôt.' }],
  };
  it('construit un bilan', () => {
    const r = buildRecap(
      {
        kind: 'week', name: 'Alex', xp: 620, xpPrev: 500, done: 11, proposed: 15,
        xpByAbility: { FOR: 80, DEX: 0, CON: 170, INT: 180, SAG: 40, CHA: 60 },
        doneByAbility: { FOR: 1, DEX: 0, CON: 3, INT: 3, SAG: 2, CHA: 2 },
        seed: 's',
      },
      templates,
    );
    expect(r.deltaPct).toBe(24);
    expect(r.successRate).toBe(73);
    expect(r.best).toBe('INT');
    expect(r.weakest).toBe('DEX');
    expect(r.narrative).toContain('Belle semaine pour Alex.');
    expect(r.narrative).toContain('Intelligence brille.');
    expect(r.narrative).toContain('Dextérité attend.');
    const empty = buildRecap(
      { kind: 'month', name: 'A', xp: 0, xpPrev: 0, done: 0, proposed: 0, xpByAbility: { FOR: 0, DEX: 0, CON: 0, INT: 0, SAG: 0, CHA: 0 }, doneByAbility: { FOR: 0, DEX: 0, CON: 0, INT: 0, SAG: 0, CHA: 0 }, seed: 'e' },
      templates,
    );
    expect(empty.best).toBeNull();
    expect(empty.deltaPct).toBeNull();
    expect(empty.successRate).toBe(0);
  });
});

describe('auto-évaluation', () => {
  const qs: SelfAssessmentQuestion[] = (['FOR', 'DEX', 'CON', 'INT', 'SAG', 'CHA'] as const).flatMap((a) => [
    { id: `${a}1`, ability: a, text: '', low: '', high: '' },
    { id: `${a}2`, ability: a, text: '', low: '', high: '' },
  ]);
  it('produit toujours une répartition valide', () => {
    const allMax = Object.fromEntries(qs.map((q) => [q.id, 5]));
    expect(isValidPointBuy(scoresFromAssessment(qs, allMax))).toBe(true);
    const allMin = Object.fromEntries(qs.map((q) => [q.id, 1]));
    expect(scoresFromAssessment(qs, allMin)).toEqual({ FOR: 2, DEX: 2, CON: 2, INT: 2, SAG: 2, CHA: 2 });
    expect(isValidPointBuy(scoresFromAssessment(qs, {}))).toBe(true);
    const mixed = { FOR1: 5, FOR2: 5, INT1: 4, INT2: 4, CHA1: 1, CHA2: 2 };
    const s = scoresFromAssessment(qs, mixed);
    expect(isValidPointBuy(s)).toBe(true);
    expect(s.FOR).toBeGreaterThan(s.CHA);
  });
});
