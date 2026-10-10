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
  TrackDef,
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
const tracks = load<TrackDef[]>('tracks.fr.json');
const themes = load<{ id: string; label: string; ability: AbilityId; secondary: { ability: AbilityId; pct: number }[]; activities: string[] }[]>('themes.fr.json');
const seedSql = readFileSync(join(__dirname, '..', '..', '..', 'supabase', 'seed.sql'), 'utf8');

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
  it('524 quêtes guidées : 26 disciplines, 131 activités × 4 paliers (jour, semaine, mois, épique)', () => {
    // 25 disciplines à 5 activités, plus Pompes (6e activité de la musculation) et la discipline Culture générale (5 activités)
    expect(guided).toHaveLength(524);
    const guidedThemes = new Set(guided.map((q) => q.theme));
    expect(guidedThemes.size).toBe(26);
    expect(guidedThemes.has('culture')).toBe(true);
    const tiers = { easy: 'daily', medium: 'weekly', high: 'monthly', expert: 'epic' } as const;
    for (const th of guidedThemes) {
      const own = guided.filter((q) => q.theme === th);
      const activities = th === 'musculation' ? 6 : 5;
      expect(own).toHaveLength(activities * 4);
      for (const d of Object.keys(tiers) as Difficulty[]) {
        const tier = own.filter((q) => q.difficulty === d);
        expect(tier).toHaveLength(activities);
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

describe('parcours de discipline', () => {
  const RUNGS = 10;
  const difficultyOfRung = (r: number): Difficulty => (r <= 3 ? 'easy' : r <= 6 ? 'medium' : r <= 9 ? 'high' : 'expert');
  const demand = (v: QuestTemplate['validation']): number =>
    v.type === 'counter' ? v.target : v.type === 'timer' ? v.minutes : v.type === 'steps' ? v.steps.length : v.type === 'journal' ? (v.minChars ?? 0) : 0;
  const slugOf = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  const habitThemes = ['nutrition', 'sommeil', 'mobilite', 'meditation'];
  const physicalThemes = new Set(quests.filter((q) => q.theme && q.tags.includes('sport')).map((q) => q.theme as string));

  it('un parcours par activité de chaque discipline (131), avec identifiants uniques', () => {
    const activityCount = themes.reduce((n, t) => n + t.activities.length, 0);
    expect(activityCount).toBe(131);
    expect(tracks).toHaveLength(activityCount);
    expect(new Set(tracks.map((t) => t.id)).size).toBe(tracks.length);
    for (const th of themes) {
      const own = tracks.filter((t) => t.theme === th.id);
      expect(own.map((t) => t.activity)).toEqual(th.activities);
      for (const t of own) expect(t.id).toBe(`${th.id}-${slugOf(t.activity)}`);
    }
  });
  it('le parcours Pompes (musculation) et la discipline Culture générale existent', () => {
    const pompes = tracks.find((t) => t.id === 'musculation-pompes')!;
    expect(pompes.ability).toBe('FOR');
    expect(themes.find((t) => t.id === 'musculation')!.activities).toContain('Pompes');
    const culture = tracks.filter((t) => t.theme === 'culture');
    expect(culture.map((t) => t.activity)).toEqual(['Histoire', 'Sciences', 'Géographie', 'Philosophie', 'Arts et patrimoine']);
    expect(themes.find((t) => t.id === 'culture')!.label).toBe('Culture générale');
    for (const t of culture) {
      expect(t.ability).toBe('INT');
      // article → documentaire → livre → expliquer à quelqu'un
      expect(t.rungs[0].objective).toMatch(/article/);
      expect(t.rungs[4].objective).toMatch(/documentaire/);
      expect(t.rungs[6].objective).toMatch(/livre/);
      expect(t.rungs[9].objective).toMatch(/expliquer/);
    }
  });
  it('10 échelons numérotés de 1 à 10, difficulté 1-3 easy, 4-6 medium, 7-9 high, 10 expert', () => {
    for (const t of tracks) {
      expect(t.rungs, t.id).toHaveLength(RUNGS);
      t.rungs.forEach((r, i) => {
        expect(r.rung, t.id).toBe(i + 1);
        expect(r.difficulty, `${t.id} r${r.rung}`).toBe(difficultyOfRung(r.rung));
      });
    }
  });
  it('textes non vides, titres lisibles et distincts, au moins deux conseils', () => {
    for (const t of tracks) {
      expect(t.label.trim().length, t.id).toBeGreaterThan(1);
      expect(t.blurb.trim().length, t.id).toBeGreaterThan(20);
      const titles = new Set<string>();
      for (const r of t.rungs) {
        const w = `${t.id} r${r.rung}`;
        expect(r.title.length, w).toBeGreaterThanOrEqual(6);
        expect(r.title.split(' ').length, w).toBeLessThanOrEqual(9);
        expect(r.objective.length, w).toBeGreaterThanOrEqual(10);
        expect(r.tips.length, w).toBeGreaterThanOrEqual(2);
        for (const tip of r.tips) expect(tip.trim(), w).not.toBe('');
        titles.add(r.title);
        expect(r.title + r.objective, w).not.toMatch(/undefined|NaN|[{}]/);
      }
      expect(titles.size, t.id).toBe(RUNGS);
    }
  });
  it('chaque échelon est strictement plus exigeant que le précédent (même type de validation)', () => {
    for (const t of tracks) {
      for (let i = 1; i < t.rungs.length; i++) {
        const prev = t.rungs[i - 1].validation;
        const cur = t.rungs[i].validation;
        expect(cur.type, `${t.id} r${i + 1}`).toBe(prev.type);
        expect(demand(cur), `${t.id} r${i + 1}`).toBeGreaterThan(demand(prev));
      }
    }
  });
  it('validations valides : jamais « simple », compteurs entiers, chronomètres en minutes, étapes remplies', () => {
    for (const t of tracks) {
      for (const r of t.rungs) {
        const v = r.validation;
        const w = `${t.id} r${r.rung}`;
        expect(v.type, w).not.toBe('simple');
        if (v.type === 'counter') {
          expect(Number.isInteger(v.target), w).toBe(true);
          expect(v.target, w).toBeGreaterThan(0);
          expect(v.unit.trim(), w).not.toBe('');
        }
        if (v.type === 'timer') {
          expect(Number.isInteger(v.minutes), w).toBe(true);
          expect(v.minutes, w).toBeGreaterThan(0);
        }
        if (v.type === 'steps') {
          expect(v.steps.length, w).toBeGreaterThanOrEqual(2);
          expect(new Set(v.steps).size, w).toBe(v.steps.length);
        }
        if (v.type === 'journal') expect(v.minChars ?? 0, w).toBeGreaterThan(0);
      }
    }
  });
  it('les cibles s’étagent d’une version allégée à un vrai défi (au moins ×2 entre le premier et le dernier échelon)', () => {
    // Cas particuliers volontaires : cibles choisies à la main pour rester raisonnables (sieste, grande randonnée, étapes d’habitudes).
    const special = new Set(['sommeil-sieste-recuperatrice', 'randonnee-randonnee-a-la-journee']);
    for (const t of tracks) {
      const first = demand(t.rungs[0].validation);
      const last = demand(t.rungs[RUNGS - 1].validation);
      expect(last, t.id).toBeGreaterThan(first);
      if (special.has(t.id) || t.rungs[0].validation.type === 'steps') continue;
      expect(last / first, t.id).toBeGreaterThanOrEqual(2);
    }
  });
  it('les échelons reprennent la quête du jour du catalogue (texte conservé à l’échelon de référence)', () => {
    for (const t of tracks) {
      const daily = quests.find((q) => q.id === `g-${t.id}-t1`);
      expect(daily, t.id).toBeDefined();
      const base = daily!.objective.replace(/\.$/, '');
      expect(t.rungs.some((r) => r.objective.includes(base)), t.id).toBe(true);
    }
  });
  it('caractéristiques et parts d’XP identiques à celles de la discipline', () => {
    for (const t of tracks) {
      const th = themes.find((x) => x.id === t.theme)!;
      expect(t.ability, t.id).toBe(th.ability);
      expect(t.secondary, t.id).toEqual(th.secondary);
      expect(t.secondary.some((s) => s.ability === t.ability), t.id).toBe(false);
      expect(t.secondary.reduce((n, s) => n + s.pct, 0), t.id).toBeLessThan(100);
      expect(quests.find((q) => q.theme === t.theme)!.ability, t.id).toBe(t.ability);
    }
  });
  it('les parcours physiques portent la mention de prudence à partir de l’échelon 7', () => {
    for (const t of tracks.filter((x) => physicalThemes.has(x.theme))) {
      for (const r of t.rungs) {
        const has = /adapte à ta condition/i.test(r.objective);
        expect(has, `${t.id} r${r.rung}`).toBe(r.rung >= 7);
      }
    }
  });
  it('la quête est quotidienne : aucune durée ni charge au-delà de ce qu’un adulte ferait chaque jour', () => {
    // Plafonds indépendants du générateur (contre-vérification) : minutes par jour selon le type d’activité.
    const minutesByTheme: Record<string, number> = {
      danse: 60, musculation: 60, pilates: 60, yoga: 60, cuisine: 90, botanique: 60, course: 60, natation: 60, 'arts-martiaux': 60,
      escalade: 60, musique: 90, theatre: 60, dessin: 90, langues: 60, programmation: 90, 'lecture-ecriture': 60, meditation: 30,
      bricolage: 90, randonnee: 90, cyclisme: 90, strategie: 90, sommeil: 20, nutrition: 30, entraide: 45, mobilite: 30, culture: 60,
    };
    const domestic = new Set(['botanique-plantes-d-interieur', 'botanique-herbes-aromatiques', 'botanique-compost-et-sol', 'bricolage-reparation', 'nutrition-planifier-ses-repas', 'nutrition-assiette-equilibree', 'nutrition-manger-en-pleine-conscience']);
    const exceptions: Record<string, number> = { 'randonnee-randonnee-a-la-journee': 180, 'pilates-pilates-gainage': 10 };
    // Efforts intenses répétés sur 5 jours : plafonds bas sur les compteurs.
    const countCaps: Record<string, number> = {
      'course-preparation-10-km': 10, 'cyclisme-velo-de-route': 30, 'cyclisme-sortie-longue-a-velo': 50, 'course-fractionne': 10,
      'arts-martiaux-judo': 25, 'musculation-kettlebell': 50, 'musculation-pompes': 30, 'course-cotes-et-denivele': 10, 'arts-martiaux-boxe': 10,
    };
    for (const t of tracks) {
      for (const r of t.rungs) {
        const v = r.validation;
        const w = `${t.id} r${r.rung}`;
        if (v.type === 'timer') {
          const cap = exceptions[t.id] ?? (domestic.has(t.id) ? 45 : minutesByTheme[t.theme]);
          expect(v.minutes, w).toBeLessThanOrEqual(cap);
        }
        if (v.type === 'counter' && countCaps[t.id]) expect(v.target, w).toBeLessThanOrEqual(countCaps[t.id]);
      }
    }
    // Dépend d’un tiers : un compteur de gestes, pas une durée.
    for (const t of tracks.filter((x) => x.theme === 'entraide')) {
      expect(t.rungs.every((r) => r.validation.type === 'counter' && r.validation.target <= 10), t.id).toBe(true);
    }
    // Batch cooking : plus de « 10 repas d’avance » chaque jour.
    const batch = tracks.find((t) => t.id === 'cuisine-batch-cooking')!;
    expect(batch.rungs.every((r) => r.validation.type === 'timer')).toBe(true);
    expect(batch.blurb).not.toMatch(/trop gras/);
  });
  it('les activités intenses rappellent le jour de repos dès l’échelon 5, et aucun conseil ne parle d’un cap hebdomadaire', () => {
    const intensive = ['course-preparation-10-km', 'course-fractionne', 'cyclisme-velo-de-route', 'cyclisme-sortie-longue-a-velo', 'randonnee-randonnee-a-la-journee',
      'arts-martiaux-judo', 'musculation-kettlebell', 'musculation-pompes', 'natation-endurance-en-piscine'];
    for (const id of intensive) {
      const t = tracks.find((x) => x.id === id)!;
      for (const r of t.rungs) {
        const has = r.tips.some((x) => /jour de repos/.test(x));
        if (r.rung >= 5) expect(has, `${id} r${r.rung}`).toBe(true);
      }
    }
    for (const t of tracks) for (const r of t.rungs) for (const tip of r.tips) expect(tip, `${t.id} r${r.rung}`).not.toMatch(/cap de la semaine/i);
  });
  it('accords singulier/pluriel et nombres annoncés cohérents avec la validation', () => {
    const singularS = new Set(['fois', 'pas', 'plus', 'dans', 'sans', 'vers', 'bras', 'repas', 'temps', 'corps', 'bois', 'mois', 'tapis', 'parcours', 'cours', 'jus', 'souris', 'croquis', 'pois']);
    for (const t of tracks) {
      for (const r of t.rungs) {
        const w = `${t.id} r${r.rung}`;
        const v = r.validation;
        const texts = [r.title, r.objective, ...(v.type === 'steps' ? v.steps : [])];
        for (const text of texts) {
          for (const m of text.matchAll(/(?<![\p{L}\p{N},.])1\s+(\p{L}+)(?:\s+(\p{L}+))?/gu)) {
            expect(!/s$/.test(m[1]) || singularS.has(m[1].toLowerCase()), `${w}: « ${m[0]} »`).toBe(true);
            const w2 = (m[2] ?? '').toLowerCase();
            expect(/(es|[^aeiou]s)$/.test(w2) && !singularS.has(w2) && !['des', 'les', 'ces', 'ses', 'mes', 'tes', 'nos', 'vos', 'après', 'puis', 'très', 'alors', 'jours'].includes(w2), `${w}: « ${m[0]} »`).toBe(false);
          }
          expect(text, w).not.toMatch(/(?<![\p{L}\p{N},.])1\s+fois[^.]*\bchacune?\b/u);
          expect(text, w).not.toMatch(/(?<![\p{L}\p{N},.])1\s+[^.:;]*?\bleurs\b/u);
        }
        if (v.type === 'steps') {
          for (const m of `${r.title} ${r.objective}`.matchAll(/(?<![\p{L}\p{N}])(\d+)\s+(étapes|gestes|réglages|zones|rappels|verres)/gu)) {
            expect(Number(m[1]), w).toBe(v.steps.length);
          }
        }
      }
    }
    const hydro = tracks.find((t) => t.id === 'nutrition-hydratation')!;
    const eight = hydro.rungs.find((r) => /8 verres/.test(r.title))!.validation;
    expect(eight.type === 'steps' && eight.steps.length).toBe(8);
  });
  it('les parcours d’habitudes ne parlent jamais de poids, de calories, de régime ni de maigrir', () => {
    const forbidden = /poids|calori|r[eé]gime|maigr|mincir|grossir|\bkilos?\b|\bkg\b/i;
    const habits = tracks.filter((t) => habitThemes.includes(t.theme));
    expect(habits).toHaveLength(20);
    for (const t of habits) {
      const text = [t.label, t.blurb, ...t.rungs.flatMap((r) => [r.title, r.objective, ...r.tips, JSON.stringify(r.validation)])].join(' ');
      expect(text, t.id).not.toMatch(forbidden);
    }
  });
  it('la sieste et l’hydratation restent raisonnables (sieste ≤ 20 minutes, hydratation par étapes)', () => {
    const sieste = tracks.find((t) => t.id === 'sommeil-sieste-recuperatrice')!;
    for (const r of sieste.rungs) expect(r.validation.type).toBe('timer');
    expect(Math.max(...sieste.rungs.map((r) => demand(r.validation)))).toBeLessThanOrEqual(20);
    const eau = tracks.find((t) => t.id === 'nutrition-hydratation')!;
    expect(eau.rungs.every((r) => r.validation.type === 'steps')).toBe(true);
    expect(Math.max(...eau.rungs.map((r) => demand(r.validation)))).toBeLessThanOrEqual(11);
  });
  it('les quêtes du catalogue libre ne contiennent aucun échelon de parcours', () => {
    expect(quests.every((q) => !q.trackId && !q.rung)).toBe(true);
    expect(quests.some((q) => /-r\d\d$/.test(q.id))).toBe(false);
  });

  describe('gabarits du seed', () => {
    it('un gabarit {parcours}-rNN par échelon, avec track_id et rung, source catalogue, période journalière', () => {
      expect(seedSql).toContain('is_active, track_id, rung) values');
      const lines = seedSql.split('\n');
      let found = 0;
      for (const t of tracks) {
        for (const r of t.rungs) {
          const id = `${t.id}-r${String(r.rung).padStart(2, '0')}`;
          const row = lines.find((l) => l.startsWith(`('${id}', 'catalog', '${t.ability}', '${r.difficulty}', array['daily']::text[]`));
          expect(row, id).toBeDefined();
          expect(/, true, '[^']+', \d+\),?$/.test(row!), id).toBe(true);
          expect(row!.includes(`, true, '${t.id}', ${r.rung})`), id).toBe(true);
          expect(row, id).toContain(`'${t.theme}'`);
          found++;
        }
      }
      expect(found).toBe(tracks.length * RUNGS);
    });
    it('le seed ne désactive jamais les gabarits d’échelons avec le catalogue libre', () => {
      const updates = seedSql.split('\n').filter((l) => l.startsWith('update public.quest_templates set is_active = false'));
      expect(updates).toHaveLength(2);
      expect(updates[0]).toContain('track_id is null');
      expect(updates[1]).toContain('track_id is not null');
    });
    it('les insertions sont idempotentes (on conflict) et à jour des quêtes guidées', () => {
      expect(seedSql.match(/on conflict \(id\) do update set/g)!.length).toBeGreaterThanOrEqual(6);
      expect(seedSql).toContain("('g-musculation-pompes-t1', 'catalog'");
      expect(seedSql).toContain("('g-culture-histoire-t1', 'catalog'");
    });
  });
});

describe('tirage sur le vrai catalogue', () => {
  const masteries: AbilityId[] = ['CON', 'SAG'];
  const scoresAt = (v: number) => ({ FOR: v, DEX: v, CON: v, INT: v, SAG: v, CHA: v });

  it('remplit toujours les quêtes demandées, de 1 à 20, sur un an de jours/semaines/mois', () => {
    for (const level of [1, 2, 5, 10, 17, 20]) {
      const scores = scoresAt(level < 5 ? 4 : 8);
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
        scores: scoresAt(4), masteries, templates: quests, preferences: {}, lastDrawn: {},
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
