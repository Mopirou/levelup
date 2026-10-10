import { writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', 'packages', 'content');
const ABILITIES = ['FOR', 'DEX', 'CON', 'INT', 'SAG', 'CHA'];
const PERIOD = { J: 'daily', S: 'weekly', M: 'monthly', E: 'epic' };
const EXPECTED = { easy: 14, medium: 12, high: 9, expert: 5 };

const { slug, parseValidation } = await import(pathToFileURL(join(root, 'src', 'util.mjs')).href);

const quests = [];
for (const a of ABILITIES) {
  const file = join(root, 'src', 'quests', `quests-${a.toLowerCase()}.mjs`);
  const { default: rows } = await import(pathToFileURL(file).href);
  const counts = { easy: 0, medium: 0, high: 0, expert: 0 };
  for (const [difficulty, per, title, flavor, objective, tips, validation, tags] of rows) {
    counts[difficulty]++;
    quests.push({
      id: `${a.toLowerCase()}-${difficulty}-${slug(title)}`,
      ability: a,
      difficulty,
      periods: [...per].map((c) => PERIOD[c]),
      title,
      flavor,
      objective,
      tips,
      validation: parseValidation(validation),
      tags,
    });
  }
  for (const d of Object.keys(EXPECTED)) {
    if (counts[d] !== EXPECTED[d]) throw new Error(`${a}: ${d} = ${counts[d]} (attendu ${EXPECTED[d]})`);
  }
}
// ───────────── Quêtes guidées par discipline (4 paliers : jour, semaine, mois, épique) ─────────────
const { default: guidedTasks } = await import(pathToFileURL(join(root, 'src', 'guided-tasks.mjs')).href);
const { default: themeRows } = await import(pathToFileURL(join(root, 'src', 'guided.mjs')).href);
const TIERS = [
  { n: 1, difficulty: 'easy', period: 'daily' },
  { n: 2, difficulty: 'medium', period: 'weekly' },
  { n: 3, difficulty: 'high', period: 'monthly' },
  { n: 4, difficulty: 'expert', period: 'epic' },
];
const PRUDENCE = ' Adapte à ta condition et consulte un professionnel au besoin.';
const themes = [];
let guidedCount = 0;
for (const th of themeRows) {
  // 5 activités par discipline ; la musculation en compte 6 (parcours « Pompes »).
  const expectedActivities = th.id === 'musculation' ? 6 : 5;
  if (th.activities.length !== expectedActivities) throw new Error(`${th.id}: ${th.activities.length} activités (attendu ${expectedActivities})`);
  const secondary = th.secondary.map(([ability, pct]) => ({ ability, pct }));
  if (secondary.reduce((n, s) => n + s.pct, 0) >= 100) throw new Error(`${th.id}: parts secondaires >= 100`);
  // Le temps de référence ne sert qu'à calibrer le nombre de séances : on ne montre aucune durée au joueur.
  const [day, weekMin] = th.time;
  const perWeek = Math.min(Math.max(Math.round(weekMin / day), 2), 4);
  const sessions = [1, perWeek, perWeek * 3, perWeek * 10];
  themes.push({ id: th.id, label: th.label, blurb: th.blurb, ability: th.primary, secondary, activities: th.activities.map((a) => a[0]) });
  for (const [name, doing, why, flow, tech, goal] of th.activities) {
    const task = guidedTasks[th.id]?.[name];
    if (!task) throw new Error(`${th.id}/${name}: tâches précises manquantes (guided-tasks.mjs)`);
    const [dayTitle, dayObjective, dayVal, weekTitle, weekObjective, weekVal, unit] = task;
    const tags = ['guidé', th.id, ...(th.physical ? ['sport'] : [])];
    const mk = (tier, extra) => {
      quests.push({
        id: `g-${th.id}-${slug(name)}-t${tier.n}`, ability: th.primary, difficulty: tier.difficulty, periods: [tier.period],
        ...extra, tags, theme: th.id, secondary,
      });
      guidedCount++;
    };
    mk(TIERS[0], {
      title: dayTitle,
      flavor: why,
      objective: dayObjective,
      tips: [flow, tech],
      validation: parseValidation(dayVal),
    });
    mk(TIERS[1], {
      title: weekTitle,
      flavor: `${why} Quelques séances par semaine donnent des progrès visibles.`,
      objective: weekObjective,
      tips: [tech, 'Répartis tes séances sur plusieurs jours et coche-les au fur et à mesure.'],
      validation: parseValidation(weekVal),
    });
    mk(TIERS[2], {
      title: `${name}, ${sessions[2]} fois ce mois-ci`,
      flavor: `${why} Un mois de pratique régulière installe l’habitude et le niveau.`,
      objective: `Faire ${sessions[2]} ${unit} sur le mois, à raison de quelques-uns par semaine.`,
      tips: [tech, 'Planifie tes créneaux à l’avance et note ta progression chaque semaine.'],
      validation: { type: 'counter', target: sessions[2], unit },
    });
    mk(TIERS[3], {
      title: `${name}, ${sessions[3]} fois au total`,
      flavor: `${why} Un grand objectif, qui demande de la constance sur la durée.`,
      objective: `Faire ${sessions[3]} ${unit} sur la durée, jusqu’à ${goal}.${th.physical ? PRUDENCE : ''}`,
      tips: [tech, 'Fixe-toi un point d’étape toutes les deux semaines pour mesurer ta progression.'],
      validation: { type: 'counter', target: sessions[3], unit },
    });
  }
}
mkdirSync(join(root, 'data'), { recursive: true });
writeFileSync(join(root, 'data', 'themes.fr.json'), JSON.stringify(themes, null, 2) + '\n');

const ids = new Set(quests.map((q) => q.id));
if (ids.size !== quests.length) throw new Error('identifiants en double');
mkdirSync(join(root, 'data'), { recursive: true });
writeFileSync(join(root, 'data', 'quests.fr.json'), JSON.stringify(quests, null, 2) + '\n');
const byPeriod = { daily: 0, weekly: 0, monthly: 0, epic: 0 };
for (const q of quests) for (const p of q.periods) byPeriod[p]++;
console.log(`${quests.length} quêtes générées`, byPeriod);

// ───────────── Parcours de discipline (10 échelons par activité) ─────────────
const { buildTracks, RUNG_COUNT, HABIT_THEMES, HABIT_FORBIDDEN, capOf, fm, INTENSIVE, REST_TIP } = await import(pathToFileURL(join(root, 'src', 'tracks.mjs')).href);
const tracks = buildTracks();
const DIFFICULTY_OF = (r) => (r <= 3 ? 'easy' : r <= 6 ? 'medium' : r <= 9 ? 'high' : 'expert');
const demand = (v) => (v.type === 'counter' ? v.target : v.type === 'timer' ? v.minutes : v.type === 'steps' ? v.steps.length : v.type === 'journal' ? v.minChars : 0);
// Mots qui se terminent par « s » au singulier (ou invariables) : « 1 repas », « 1 fois », « 1 croquis »…
const SINGULAR_S = new Set(['fois', 'pas', 'plus', 'dans', 'sans', 'vers', 'bras', 'repas', 'temps', 'corps', 'bois', 'mois', 'tapis', 'parcours', 'cours', 'jus', 'souris', 'croquis', 'pois', 'kata']);
/**
 * Fautes d'accord d'un nombre « 1 » dans un texte : « 1 croquis rapides », « 1 fois … chacune », « 1 arbre … leurs feuilles »,
 * « 1 pompes ». Renvoie la liste des extraits fautifs.
 */
function pluralSlips(text) {
  const out = [];
  const ONE = /(?<![\p{L}\p{N},.])1\s+(\p{L}+)(?:\s+(\p{L}+))?/gu;
  for (const m of text.matchAll(ONE)) {
    const [w1, w2] = [m[1].toLowerCase(), (m[2] ?? '').toLowerCase()];
    if (/s$/.test(w1) && !SINGULAR_S.has(w1)) out.push(m[0]);
    else if (/(es|[^aeiou]s)$/.test(w2) && !SINGULAR_S.has(w2) && !['des', 'les', 'ces', 'ses', 'mes', 'tes', 'nos', 'vos', 'après', 'puis', 'très', 'alors', 'jours'].includes(w2)) out.push(m[0]);
  }
  for (const m of text.matchAll(/(?<![\p{L}\p{N},.])1\s+[^.:;]*?\b(chacune?s?|chacuns|leurs|ceux|ils|elles)\b/gu)) out.push(m[0]);
  return out;
}
const trackIds = new Set();
let rungCount = 0;
const expectedTracks = themeRows.reduce((n, t) => n + t.activities.length, 0);
if (tracks.length !== expectedTracks) throw new Error(`parcours: ${tracks.length} (attendu ${expectedTracks}, un par activité)`);
for (const t of tracks) {
  const where = `parcours ${t.id}`;
  if (trackIds.has(t.id)) throw new Error(`${where}: identifiant en double`);
  trackIds.add(t.id);
  const theme = themeRows.find((x) => x.id === t.theme);
  if (!theme || !theme.activities.some((a) => a[0] === t.activity)) throw new Error(`${where}: discipline ou activité inconnue`);
  if (t.ability !== theme.primary) throw new Error(`${where}: caractéristique principale ≠ discipline`);
  if (JSON.stringify(t.secondary) !== JSON.stringify(theme.secondary.map(([ability, pct]) => ({ ability, pct })))) throw new Error(`${where}: secondaires ≠ discipline`);
  if (!t.label.trim() || !t.blurb.trim()) throw new Error(`${where}: libellé ou description vide`);
  if (t.rungs.length !== RUNG_COUNT) throw new Error(`${where}: ${t.rungs.length} échelons (attendu ${RUNG_COUNT})`);
  const titles = new Set();
  const key = `${t.theme}/${t.activity}`;
  t.rungs.forEach((r, i) => {
    const w = `${where} échelon ${i + 1}`;
    rungCount++;
    if (r.rung !== i + 1) throw new Error(`${w}: numéro ${r.rung}`);
    if (r.difficulty !== DIFFICULTY_OF(r.rung)) throw new Error(`${w}: difficulté ${r.difficulty}`);
    if (!r.title.trim() || r.title.length < 6 || r.title.split(' ').length > 9) throw new Error(`${w}: titre invalide « ${r.title} »`);
    if (titles.has(r.title)) throw new Error(`${w}: titre en double « ${r.title} »`);
    titles.add(r.title);
    if (!r.objective.trim() || r.objective.length < 10) throw new Error(`${w}: objectif vide`);
    if (r.tips.length < 2 || r.tips.some((x) => !x.trim())) throw new Error(`${w}: conseils manquants`);
    const v = r.validation;
    if (v.type === 'counter' && !(Number.isInteger(v.target) && v.target > 0 && v.unit)) throw new Error(`${w}: compteur invalide`);
    if (v.type === 'timer' && !(Number.isInteger(v.minutes) && v.minutes > 0)) throw new Error(`${w}: chronomètre invalide`);
    if (v.type === 'steps' && (v.steps.length < 2 || v.steps.some((x) => !x.trim()))) throw new Error(`${w}: étapes invalides`);
    if (v.type === 'journal' && !(v.minChars > 0)) throw new Error(`${w}: journal invalide`);
    if (v.type === 'simple') throw new Error(`${w}: un échelon « simple » ne monte pas en exigence`);
    if (i > 0) {
      const prev = t.rungs[i - 1].validation;
      if (prev.type !== v.type) throw new Error(`${w}: le type de validation change (${prev.type} → ${v.type})`);
      if (!(demand(v) > demand(prev))) throw new Error(`${w}: exigence non croissante (${demand(prev)} → ${demand(v)})`);
    }
    if (theme.physical && r.rung >= 7 && !/adapte à ta condition/i.test(r.objective)) throw new Error(`${w}: mention de prudence manquante`);

    // Plafond quotidien (gestes quotidiens : voir CAP_BY_ACTIVITY et TIMER_CAP_BY_THEME dans tracks.mjs).
    const cap = capOf(t.theme, t.activity, v.type);
    if (v.type === 'timer' && cap === undefined) throw new Error(`${w}: aucun plafond quotidien défini pour ${key}`);
    if (cap !== undefined && (v.type === 'timer' || v.type === 'counter') && demand(v) > cap) {
      throw new Error(`${w}: ${demand(v)} ${v.type === 'timer' ? 'minutes' : v.unit} par jour dépasse le plafond quotidien de ${cap} (${key})`);
    }
    // La quête est quotidienne : jamais de « cap de la semaine » ni de nombre de séances dans les conseils.
    // (Le « cap à long terme » de l'échelon 10 est un objectif ponctuel, il peut parler de séances ou de semaines.)
    if (r.tips.filter((x) => !x.startsWith('Ton cap à long terme')).some((x) => /cap de la semaine|\b\d+ séances?/i.test(x))) throw new Error(`${w}: un conseil parle de séances ou de semaine alors que la quête est quotidienne`);
    // Activités intenses : rappel du jour de repos dès l'échelon 5.
    if (INTENSIVE.has(key) && r.rung >= 5 && !r.tips.some((x) => x.includes(REST_TIP))) throw new Error(`${w}: conseil de récupération manquant (activité intense)`);
    // Accords : « 1 croquis rapides », « 1 fois … chacune », « 1 arbre … leurs feuilles », etc.
    const slips = [r.title, r.objective, ...r.tips, ...(v.type === 'steps' ? v.steps : [])].flatMap(pluralSlips);
    if (slips.length) throw new Error(`${w}: accord singulier/pluriel douteux « ${slips[0]} »`);
    // Le nombre annoncé dans le texte doit être celui de la validation (étapes, compteur, chronomètre).
    if (v.type === 'steps') {
      for (const m of `${r.title} ${r.objective}`.matchAll(/(?<![\p{L}\p{N}])(\d+)\s+(étapes|gestes|réglages|zones|rappels|verres)/gu)) {
        if (Number(m[1]) !== v.steps.length) throw new Error(`${w}: « ${m[0]} » mais ${v.steps.length} étapes`);
      }
    }
    if (v.type === 'counter' && !`${r.title} ${r.objective}`.includes(String(v.target))) throw new Error(`${w}: la cible ${v.target} n’apparaît pas dans le texte`);
    if (v.type === 'timer' && !`${r.title} ${r.objective}`.includes(fm(v.minutes))) throw new Error(`${w}: la durée « ${fm(v.minutes)} » n’apparaît pas dans le texte`);
    if (HABIT_THEMES.includes(t.theme)) {
      const text = [t.label, t.blurb, r.title, r.objective, ...r.tips, JSON.stringify(v)].join(' ');
      if (HABIT_FORBIDDEN.test(text)) throw new Error(`${w}: vocabulaire interdit dans un parcours d’habitudes`);
    }
  });
}
writeFileSync(join(root, 'data', 'tracks.fr.json'), JSON.stringify(tracks, null, 2) + '\n');
console.log(`${tracks.length} parcours, ${rungCount} échelons générés`);

// ───────────── Trophées, tavernier, bilans, noms ─────────────
const write = (name, data) => writeFileSync(join(root, 'data', name), JSON.stringify(data, null, 2) + '\n');
const imp = async (p) => (await import(pathToFileURL(join(root, 'src', p)).href)).default;

const achRows = await imp('achievements.mjs');
const achievements = achRows.map(([id, category, name, description, condition, xpBonus, titleUnlocked, isSecret, hint]) => ({
  id, category, name, description, condition, xpBonus, titleUnlocked: titleUnlocked ?? null,
  ...(isSecret ? { isSecret: true, hint } : {}),
}));
if (new Set(achievements.map((a) => a.id)).size !== achievements.length) throw new Error('trophées en double');
if (achievements.length !== 98) throw new Error(`trophées: ${achievements.length} (attendu 98)`);
write('achievements.fr.json', achievements);

const tavRows = await imp('taverne.mjs');
const taverne = tavRows.map(([text, when], i) => ({ id: `tav-${String(i + 1).padStart(3, '0')}`, text, ...(Object.keys(when ?? {}).length ? { when } : {}) }));
if (taverne.length !== 150) throw new Error(`taverne: ${taverne.length} (attendu 150)`);
write('taverne.fr.json', taverne);

const recap = await imp('recap.mjs');
const recapCount = recap.openers.length + recap.best.length + recap.weak.length + recap.closers.length;
if (recapCount !== 120) throw new Error(`recap: ${recapCount} (attendu 120)`);
write('recap-templates.fr.json', recap);

const names = [...new Set(await imp('names.mjs'))].slice(0, 200);
if (names.length !== 200) throw new Error(`noms: ${names.length} (attendu 200)`);
write('names.fr.json', names);
console.log(`${achievements.length} trophées, ${taverne.length} messages, ${recapCount} phrases de bilan, ${names.length} noms`);
