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

// ───────────── Classes D&D (voir docs/CLASSES.md) ─────────────
const CLASS_IDS = ['guerrier', 'paladin', 'rodeur', 'clerc', 'barde', 'roublard', 'magicien'];
const classes = await imp('classes.mjs');
if (classes.map((c) => c.id).join() !== CLASS_IDS.join()) throw new Error(`classes: identifiants attendus ${CLASS_IDS.join(', ')}`);
const questTitles = new Set(quests.map((q) => q.title));
const masteryCount = Object.fromEntries(ABILITIES.map((a) => [a, 0]));
for (const c of classes) {
  const where = `classe ${c.id}`;
  if (!c.name.trim() || !c.icon.trim() || !c.profile.trim() || !c.description.trim()) throw new Error(`${where}: texte vide`);
  if (c.masteries.length !== 2 || c.masteries[0] === c.masteries[1] || !c.masteries.every((a) => ABILITIES.includes(a))) throw new Error(`${where}: 2 maîtrises distinctes attendues`);
  for (const a of c.masteries) masteryCount[a]++;
  if (c.favoredQuests.length !== 3) throw new Error(`${where}: 3 quêtes favorites attendues`);
  for (const f of c.favoredQuests) {
    if (!questTitles.has(f)) throw new Error(`${where}: quête favorite inconnue « ${f} »`);
    const q = quests.find((x) => x.title === f);
    if (!c.masteries.includes(q.ability)) throw new Error(`${where}: « ${f} » (${q.ability}) n’est pas une maîtrise de la classe`);
  }
  if (c.paths.length !== 2 || c.paths[0].ability === c.paths[1].ability) throw new Error(`${where}: 2 voies d’affinités différentes attendues`);
  for (const p of c.paths) {
    if (!p.id.startsWith(`${c.id}-`) || !ABILITIES.includes(p.ability) || !p.name.trim() || !p.title.trim() || !p.description.trim()) throw new Error(`voie invalide : ${p.id}`);
  }
}
if (new Set(classes.map((c) => [...c.masteries].sort().join('-'))).size !== 7) throw new Error('classes: 7 couples de maîtrises distincts attendus');
// Aucune caractéristique ignorée, aucune monopolisée : chaque discipline (caractéristique principale) trouve au moins 2 classes.
for (const a of ABILITIES) if (masteryCount[a] < 2 || masteryCount[a] > 3) throw new Error(`classes: ${a} est maîtrisée par ${masteryCount[a]} classes (2 ou 3 attendues)`);
for (const th of themeRows) if (!classes.some((c) => c.masteries.includes(th.primary))) throw new Error(`discipline ${th.id}: aucune classe ne maîtrise ${th.primary}`);
write('classes.fr.json', classes);

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

// ───────────── Aventure : équipement et donjons (voir docs/DONJONS.md) ─────────────
const SLOTS = ['arme', 'tete', 'torse', 'mains', 'bottes', 'amulette'];
const itemRows = await imp('items.mjs');
const { default: setRows, SET_BONUSES } = await import(pathToFileURL(join(root, 'src', 'sets.mjs')).href);
const setOf = new Map();
for (const [setId, , , , , pieces] of setRows) for (const id of Object.values(pieces)) setOf.set(id, setId);
const items = itemRows.map(([id, slot, ability, name, glyph, blurb, classId]) => ({ id, slot, ability, name, glyph, blurb, classId: classId ?? null, setId: setOf.get(id) ?? null }));
if (new Set(items.map((i) => i.id)).size !== items.length) throw new Error('objets en double');
// V4 : 54 modèles = 7 classes × 6 emplacements + 12 universels (2 par emplacement), chaque emplacement couvre les 6 caractéristiques.
if (items.length !== 54) throw new Error(`objets: ${items.length} (attendu 54)`);
for (const s of SLOTS) {
  const inSlot = items.filter((i) => i.slot === s);
  if (inSlot.length !== 9) throw new Error(`objets: ${inSlot.length} pour l’emplacement ${s} (attendu 9)`);
  if (inSlot.filter((i) => !i.classId).length !== 2) throw new Error(`objets: 2 universels attendus pour l’emplacement ${s}`);
  for (const a of ABILITIES) if (!inSlot.some((i) => i.ability === a)) throw new Error(`objets: aucune caractéristique ${a} pour l’emplacement ${s}`);
  for (const c of classes) if (inSlot.filter((i) => i.classId === c.id).length !== 1) throw new Error(`objets: 1 objet de ${c.id} attendu pour l’emplacement ${s}`);
}
for (const c of classes) {
  const mine = items.filter((i) => i.classId === c.id);
  for (const m of c.masteries) if (mine.filter((i) => i.ability === m).length !== 3) throw new Error(`objets: ${c.id} doit avoir 3 pièces en ${m}`);
}
for (const i of items) {
  if (!SLOTS.includes(i.slot) || !ABILITIES.includes(i.ability) || !i.name.trim() || !i.glyph.trim() || !i.blurb.trim()) throw new Error(`objet invalide : ${i.id}`);
  if (i.classId && !CLASS_IDS.includes(i.classId)) throw new Error(`objet ${i.id} : classe inconnue ${i.classId}`);
}
write('items.fr.json', items);

// ───────────── Panoplies de classe : 7 sets de 6 pièces, une par emplacement ─────────────
const sets = setRows.map(([id, name, glyph, ability, blurb, pieces]) => ({ id, name, glyph, ability, blurb, pieces, bonuses: SET_BONUSES }));
if (sets.map((x) => x.id).join() !== CLASS_IDS.join()) throw new Error('sets: un set par classe attendu, dans l’ordre des classes');
const usedPieces = new Set();
for (const st of sets) {
  if (st.ability !== classes.find((c) => c.id === st.id).masteries[0] || !st.name.trim() || !st.glyph.trim() || !st.blurb.trim()) throw new Error(`set invalide : ${st.id}`);
  if (Object.keys(st.pieces).length !== SLOTS.length) throw new Error(`set ${st.id} : une pièce par emplacement attendue`);
  for (const s of SLOTS) {
    const it = items.find((i) => i.id === st.pieces[s]);
    if (!it || it.slot !== s) throw new Error(`set ${st.id} : pièce invalide pour l’emplacement ${s}`);
    if (it.classId !== st.id) throw new Error(`set ${st.id} : ${it.id} n’est pas un objet de la classe`);
    if (usedPieces.has(it.id)) throw new Error(`set ${st.id} : ${it.id} figure dans deux sets`);
    usedPieces.add(it.id);
  }
}
if (!SET_BONUSES.every((b, i, a) => b.pieces > 0 && b.pp > 0 && (i === 0 || (b.pieces > a[i - 1].pieces && b.pp > a[i - 1].pp)))) throw new Error('sets: bonus croissants attendus');
write('sets.fr.json', sets);

// ───────────── Sorts et capacités de classe : 8 par classe (2-2-2-1-1) ─────────────
const RARITY_PLAN = ['commun', 'commun', 'peu_commun', 'peu_commun', 'rare', 'rare', 'epique', 'legendaire'];
const FAMILIES = ['xp', 'stat', 'raid', 'gold', 'chest', 'dungeon'];
const spellRows = await imp('spells.mjs');
const spells = spellRows.map(([id, classId, rarity, family, ability, name, glyph, blurb]) => ({ id, classId, rarity, family, ability, name, glyph, blurb }));
if (spells.length !== 56 || new Set(spells.map((x) => x.id)).size !== 56) throw new Error(`sorts: 56 capacités distinctes attendues (${spells.length})`);
for (const cl of classes) {
  const mine = spells.filter((x) => x.classId === cl.id);
  if (mine.map((x) => x.rarity).join() !== RARITY_PLAN.join()) throw new Error(`sorts: ${cl.id} doit suivre la structure 2-2-2-1-1 (communes à légendaire)`);
}
for (const x of spells) {
  if (!FAMILIES.includes(x.family) || !(ABILITIES.includes(x.ability) || x.ability === 'all') || !x.name.trim() || !x.glyph.trim() || !x.blurb.trim()) throw new Error(`sort invalide : ${x.id}`);
  const cl = classes.find((k) => k.id === x.classId);
  if (!cl) throw new Error(`sort ${x.id} : classe inconnue`);
  if (x.family === 'xp' && x.ability !== 'all' && !cl.masteries.includes(x.ability)) throw new Error(`sort ${x.id} : l’XP vise une maîtrise de la classe`);
  if (x.ability === 'all' && x.family !== 'xp') throw new Error(`sort ${x.id} : « all » est réservé à la famille xp`);
}
for (const a of ABILITIES) if (!spells.some((x) => x.ability === a)) throw new Error(`sorts: aucune capacité pour ${a}`);
write('spells.fr.json', spells);

// ───────────── Collection « Bestiaire & Reliques » : 60 cartes (16 / 14 / 12 / 10 / 8 par rareté) ─────────────
const CARD_PLAN = { commun: 16, peu_commun: 14, rare: 12, epique: 10, legendaire: 8 };
const cardRows = await imp('cards.mjs');
const cards = cardRows.map(([id, kind, rarity, name, glyph, blurb]) => ({ id, kind, rarity, name, glyph, blurb }));
if (new Set(cards.map((c) => c.id)).size !== cards.length) throw new Error('cartes: identifiants distincts attendus');
for (const [rarity, n] of Object.entries(CARD_PLAN)) {
  if (cards.filter((c) => c.rarity === rarity).length !== n) throw new Error(`cartes: ${n} cartes ${rarity} attendues`);
}
for (const c of cards) {
  if (!['bestiaire', 'relique'].includes(c.kind) || !c.name.trim() || !c.glyph.trim() || !c.blurb.trim()) throw new Error(`carte invalide : ${c.id}`);
}
write('cards.fr.json', cards);

const { buildDungeons } = await import(pathToFileURL(join(root, 'src', 'dungeons.mjs')).href);
const dungeons = buildDungeons(themeRows);
if (dungeons.length !== themeRows.length || dungeons.length !== new Set(tracks.map((t) => t.theme)).size) throw new Error('donjons: un par thème de parcours attendu');
write('dungeons.fr.json', dungeons);
console.log(`${items.length} objets, ${sets.length} sets, ${spells.length} capacités, ${cards.length} cartes, ${dungeons.length} donjons`);
