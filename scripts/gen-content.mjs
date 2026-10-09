import { writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', 'packages', 'content');
const ABILITIES = ['FOR', 'DEX', 'CON', 'INT', 'SAG', 'CHA'];
const PERIOD = { J: 'daily', S: 'weekly', M: 'monthly', E: 'epic' };
const EXPECTED = { easy: 14, medium: 12, high: 9, expert: 5 };

const slug = (s) =>
  s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

function parseValidation(v) {
  if (v === 's') return { type: 'simple' };
  if (v === 'j') return { type: 'journal', minChars: 50 };
  const [k, ...rest] = v.split(':');
  if (k === 'c') return { type: 'counter', target: Number(rest[0]), unit: rest.slice(1).join(':') };
  if (k === 't') return { type: 'timer', minutes: Number(rest[0]) };
  if (k === 'e') return { type: 'steps', steps: rest.join(':').split('|') };
  throw new Error('validation inconnue ' + v);
}

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
  if (th.activities.length !== 5) throw new Error(`${th.id}: ${th.activities.length} activités (attendu 5)`);
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
