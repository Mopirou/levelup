// Parcours de discipline : une échelle de 10 échelons par activité de chaque discipline guidée.
//
// Tout est généré de façon déterministe à partir de `guided.mjs` (disciplines et activités) et `guided-tasks.mjs`
// (quêtes précises du jour et de la semaine). L'échelon de référence reprend la quête du jour actuelle de l'activité ;
// les échelons plus bas la simplifient (≈ ×0,5), les plus hauts la durcissent jusqu'à ≈ ×4 (parfois moins quand
// une cible trop haute serait absurde ou dangereuse : sieste, hydratation, course…). Voir docs/PARCOURS.md.
//
// Progression des quêtes « simple » et « étapes » (sans chiffre à faire monter) :
//   – par défaut, un chronomètre calé sur le temps de séance de la discipline (`time[0]`) : ≈ ×0,5 → ×4 ;
//   – pour quelques habitudes (hydratation, rituel du soir, chambre, étirements du soir), des étapes ajoutées une à une ;
//   – quelques cas particuliers à valeurs choisies à la main (sieste, grande randonnée, circuit d'haltères, pompes, culture) ;
//   – pour les activités qui dépendent d'un tiers (entraide), un compteur de gestes plutôt qu'une durée.
//
// La quête d'un parcours est QUOTIDIENNE : chaque échelle est donc plafonnée à ce qu'un adulte ferait raisonnablement
// chaque jour pour cette activité (voir « Plafonds quotidiens » ci-dessous, vérifiés à la génération par gen-content.mjs).

import themeRows from './guided.mjs';
import guidedTasks from './guided-tasks.mjs';
import { slug, parseValidation } from './util.mjs';

export const RUNG_COUNT = 10;
/** Disciplines « habitudes » : jamais de suivi du poids, des calories ni de régime. */
export const HABIT_THEMES = ['nutrition', 'sommeil', 'mobilite', 'meditation'];
export const HABIT_FORBIDDEN = /poids|calori|r[eé]gime|maigr/i;
const PRUDENCE = ' Adapte à ta condition et consulte un professionnel au besoin.';

const difficultyOf = (rung) => (rung <= 3 ? 'easy' : rung <= 6 ? 'medium' : rung <= 9 ? 'high' : 'expert');
const noDot = (s) => s.replace(/[.\s]+$/, '');

// ───────────────────────────── Échelles de nombres ─────────────────────────────

// Pas d'arrondi « naturel » (même esprit que `niceTarget` du moteur, avec un pas de 5 dès 20).
const stepCount = (x) => (x < 15 ? 1 : x < 100 ? 5 : x < 500 ? 10 : 50);
const stepMinutes = (x) => (x < 10 ? 1 : x < 15 ? 2 : x < 60 ? 5 : 10);
const STEP = { counter: stepCount, journal: stepCount, timer: stepMinutes };
const niceOf = (kind, n) => {
  const g = STEP[kind](n);
  return Math.max(1, Math.round(n / g) * g);
};
const aboveOf = (kind, x) => {
  const g = STEP[kind](x);
  return (Math.floor(x / g) + 1) * g;
};
const belowOf = (kind, x) => {
  const g = STEP[kind](x - 1);
  return Math.ceil(x / g) * g - g;
};

/**
 * Dix cibles strictement croissantes. L'échelon de référence (`ref`, normalement 4) vaut exactement `base` ;
 * en dessous on descend vers ≈ ×0,5, au-dessus on monte vers ≈ `maxMult` (plus si les petites bases l'exigent).
 */
export function ladder(kind, base, { maxMult = 4, cap = Infinity } = {}) {
  const ref = Math.min(4, base);
  const build = (mult) => {
    const v = new Array(RUNG_COUNT + 1).fill(0);
    v[ref] = base;
    for (let r = ref - 1; r >= 1; r--) {
      let c = niceOf(kind, base * Math.pow(0.5, (ref - r) / (ref - 1)));
      if (c >= v[r + 1]) c = belowOf(kind, v[r + 1]);
      v[r] = c;
    }
    for (let r = ref + 1; r <= RUNG_COUNT; r++) {
      const c = niceOf(kind, base * Math.pow(mult, (r - ref) / (RUNG_COUNT - ref)));
      v[r] = Math.max(c, aboveOf(kind, v[r - 1]));
    }
    return v.slice(1);
  };
  // Plafond quotidien : on réduit le multiplicateur jusqu'à ce que le dernier échelon tienne sous le plafond.
  let mult = Math.min(maxMult, cap / base);
  let values = build(mult);
  while (values[RUNG_COUNT - 1] > cap && mult > 1.001) values = build((mult -= 0.02));
  if (values[RUNG_COUNT - 1] > cap) throw new Error(`ladder(${kind}, ${base}): plafond ${cap} impossible à tenir en ${RUNG_COUNT} échelons`);
  return { ref, values };
}

/** 20 → « 20 minutes » ; 80 → « 1 h 20 » */
export function fm(n) {
  if (n < 60) return `${n} minute${n > 1 ? 's' : ''}`;
  const h = Math.floor(n / 60);
  const m = n % 60;
  return m ? `${h} h ${String(m).padStart(2, '0')}` : `${h} h`;
}

const singular = (w) => (/[^aiu]s$/.test(w) && !/^(fois|plus|dans|pas|bras)$/.test(w) ? w.slice(0, -1) : w);
const unitFor = (unit, n) => (n === 1 ? unit.split(' ').map(singular).join(' ') : unit);

/** Remplace le premier nombre `from` d'un texte par `to` (et met le mot qui suit au singulier si `to` vaut 1). */
function swapNumber(text, from, to) {
  const re = new RegExp(`(?<![\\p{L}\\p{N}])${from}(?![\\p{L}\\p{N}])(\\s+)?(\\p{L}+)?`, 'u');
  const m = re.exec(text);
  if (!m) return null;
  const word = m[2] ? (to === 1 ? singular(m[2]) : m[2]) : '';
  const out = text.slice(0, m.index) + String(to) + (m[1] ?? '') + word + text.slice(m.index + m[0].length);
  // Une liste chiffrée après les deux-points ne correspondrait plus au nouveau total : on garde les noms seulement.
  const i = out.indexOf(' : ');
  if (i >= 0 && m.index < i && /\d/.test(out.slice(i + 3))) return out.slice(0, i + 3) + out.slice(i + 3).replace(/(?<![\p{L}\p{N}])\d+\s+/gu, '');
  return out;
}

/** Idem pour une durée : « 20 minutes » → « 1 h 20 ». */
function swapMinutes(text, from, to) {
  const re = new RegExp(`(?<![\\p{L}\\p{N}])${from}\\s+minutes?`, 'u');
  const m = re.exec(text);
  if (!m) return null;
  return text.slice(0, m.index) + fm(to) + text.slice(m.index + m[0].length);
}

// ───────────────────────────── Plafonds quotidiens ─────────────────────────────

/**
 * Plafond de l'échelon 10 d'un chronomètre, en minutes PAR JOUR, selon la discipline. Repères adoptés :
 *   soins domestiques et courses (plantes, compost, repas) ≤ 30-45 min ; entretien d'un petit corps de métier ≤ 45 min ;
 *   cours et séances guidées, entraînement et sport ≤ 60 min ; loisirs créatifs, jeux, cuisine d'un plat ≤ 90 min ;
 *   méditation et respiration ≤ 30 min ; sieste ≤ 20 min.
 */
export const TIMER_CAP_BY_THEME = {
  danse: 60, musculation: 60, pilates: 60, yoga: 60, cuisine: 90, botanique: 45, course: 60, natation: 60, 'arts-martiaux': 60,
  escalade: 60, musique: 90, theatre: 60, dessin: 90, langues: 60, programmation: 90, 'lecture-ecriture': 60, meditation: 30,
  bricolage: 90, randonnee: 90, cyclisme: 90, strategie: 90, sommeil: 20, nutrition: 30, entraide: 45, mobilite: 30, culture: 60,
};

/**
 * Plafonds propres à une activité (clé « discipline/activité »), en minutes pour un chronomètre et en unités pour un compteur.
 * Ils l'emportent sur le plafond de la discipline. Les gestes physiques intensifs, répétés sur 5 jours pour monter d'un échelon,
 * sont volontairement bas (échelons 8-10 raisonnables).
 */
export const CAP_BY_ACTIVITY = {
  // chronomètres : soins et tâches domestiques
  'botanique/Plantes d’intérieur': 30,
  'botanique/Herbes aromatiques': 30,
  'botanique/Compost et sol': 30,
  'botanique/Potager': 60,
  'bricolage/Réparation': 45,
  'nutrition/Planifier ses repas': 30,
  'nutrition/Assiette équilibrée': 30,
  'nutrition/Manger en pleine conscience': 30,
  // chronomètres : séances physiques
  'escalade/Renfo pour grimpeurs': 45,
  'escalade/Souplesse du grimpeur': 45,
  'cyclisme/VTT': 75,
  'cyclisme/Vélo d’appartement': 60,
  'cyclisme/Vélo au quotidien': 60,
  'randonnee/Marche nordique': 60,
  'randonnee/Randonnée à la journée': 180,
  'pilates/Pilates gainage': 10,
  // chronomètres : loisirs et pratiques mentales
  'theatre/Éloquence': 45,
  'musique/Chant et solfège': 60,
  'lecture-ecriture/Poésie': 45,
  'strategie/Sudoku et logique': 60,
  'meditation/Cohérence cardiaque': 15,
  'meditation/Respiration profonde': 15,
  'sommeil/Respiration pour dormir': 15,
  // compteurs : efforts physiques intensifs
  'musculation/Pompes': 30,
  'musculation/Kettlebell': 50,
  'musculation/Muscu haut du corps': 90,
  'musculation/Dos et tirage': 90,
  'musculation/Jambes et fessiers': 100,
  'musculation/Corps entier haltères': 90,
  'course/Préparation 10 km': 10,
  'course/Fractionné': 10,
  'course/Côtes et dénivelé': 10,
  'course/Marche-course': 15,
  'cyclisme/Vélo de route': 30,
  'cyclisme/Sortie longue à vélo': 50,
  'arts-martiaux/Judo': 25,
  'arts-martiaux/Boxe': 10,
  'arts-martiaux/Karaté': 15,
  'natation/Crawl': 30,
  'natation/Brasse': 30,
  'natation/Dos crawlé': 25,
  'natation/Endurance en piscine': 60,
  'escalade/Bloc débutant': 15,
  'pilates/Pilates jambes et fessiers': 90,
  'randonnee/Marche en dénivelé': 300,
  // compteurs : apprentissage et entraide (un tiers est impliqué)
  'langues/Langue des signes': 20,
  'nutrition/Lire les étiquettes': 10,
  'entraide/Aide à un voisin': 10,
  'entraide/Bénévolat associatif': 10,
  'entraide/Cuisine solidaire': 10,
  'entraide/Soutien scolaire': 10,
  'entraide/Visite et écoute': 10,
};

/** Plafond quotidien d'une activité : propre à l'activité, sinon (chronomètres seulement) celui de sa discipline. */
export function capOf(themeId, name, kind) {
  const own = CAP_BY_ACTIVITY[`${themeId}/${name}`];
  if (own !== undefined) return own;
  return kind === 'timer' ? TIMER_CAP_BY_THEME[themeId] : undefined;
}

/**
 * Activités physiques intenses : un jour de repos entre deux séances est normal, d'où une mention de récupération
 * dans les conseils dès l'échelon 5 (et des plafonds bas, voir ci-dessus).
 */
export const INTENSIVE = new Set([
  'course/Footing facile', 'course/Fractionné', 'course/Préparation 10 km', 'course/Côtes et dénivelé', 'course/Marche-course',
  'musculation/Muscu haut du corps', 'musculation/Jambes et fessiers', 'musculation/Dos et tirage', 'musculation/Corps entier haltères',
  'musculation/Kettlebell', 'musculation/Pompes',
  'cyclisme/Vélo de route', 'cyclisme/VTT', 'cyclisme/Sortie longue à vélo',
  'escalade/Bloc débutant', 'escalade/Escalade technique', 'escalade/Grimpe en voie', 'escalade/Renfo pour grimpeurs',
  'arts-martiaux/Boxe', 'arts-martiaux/Judo', 'arts-martiaux/Karaté', 'arts-martiaux/Self-défense',
  'natation/Crawl', 'natation/Brasse', 'natation/Dos crawlé', 'natation/Endurance en piscine',
  'randonnee/Marche en dénivelé', 'randonnee/Randonnée à la journée',
  'danse/Hip-hop', 'danse/Zumba', 'pilates/Pilates gainage',
]);
export const REST_TIP = 'Un jour de repos entre deux séances intenses est normal : mets le parcours en pause ou déclare un jour de repos.';

// ───────────────────────────── Cas particuliers ─────────────────────────────

/** Habitudes à étapes ajoutées une à une : l'échelon r compte r + 1 étapes (`pool.slice(0, r)` plus la conclusion). */
const STEP_HABITS = {
  'sommeil/Rituel du soir': {
    unit: 'gestes',
    refRung: 2,
    pool: [
      'Éteindre les écrans', 'Baisser la lumière', 'Faire un geste calme (lecture, étirements)', 'Préparer les affaires du lendemain',
      'Boire une tisane ou un verre d’eau', 'Ranger un peu la pièce où tu es', 'Faire quelques étirements doux',
      'Lire quelques pages', 'Respirer lentement pendant cinq minutes', 'Noter trois choses positives de la journée',
    ],
    closer: 'Te coucher à l’heure prévue',
    title: (k) => `Rituel du soir, ${k} gestes`,
    objective: (k) => `Suivre ton rituel du soir en ${k} gestes, cochés un à un dans l’ordre, pour finir la journée en douceur.`,
  },
  'sommeil/Chambre propice au sommeil': {
    unit: 'réglages',
    refRung: 2,
    pool: [
      'Aérer la chambre', 'Baisser la température', 'Retirer écrans et lumières', 'Fermer les volets ou les rideaux',
      'Ranger les affaires qui traînent', 'Changer ou retendre les draps si besoin', 'Mettre le téléphone en mode avion, loin du lit',
      'Couvrir ou éteindre les petites lumières de veille', 'Régler le réveil et le poser hors de portée', 'Prévoir un verre d’eau près du lit',
    ],
    closer: 'Vérifier que la chambre est calme, sombre et fraîche',
    title: (k) => `Chambre, ${k} réglages`,
    objective: (k) => `Préparer ta chambre pour la nuit en ${k} réglages, à cocher un par un.`,
  },
  'sommeil/Étirements du soir': {
    unit: 'zones',
    refRung: 2,
    pool: [
      'Étirement du dos', 'Étirement des hanches', 'Étirement de la nuque', 'Étirement des épaules', 'Étirement des mollets',
      'Étirement des cuisses', 'Étirement des poignets et des mains', 'Étirement des pieds', 'Torsion douce allongé(e)',
      'Respiration lente de relâchement', 'Relaxation finale : relâcher chaque zone du corps',
    ],
    closer: null,
    title: (k) => `Étirements du soir, ${k} zones`,
    objective: (k) => `Finir ta journée avec ${k} étirements ou relâchements doux, sans jamais forcer, juste avant de te coucher.`,
  },
  'nutrition/Hydratation': {
    unit: 'rappels',
    refRung: 7,
    pool: [
      'Un verre d’eau au réveil', 'Un verre d’eau avec le petit-déjeuner', 'Un verre d’eau en milieu de matinée',
      'Un verre d’eau avant le déjeuner', 'Un verre d’eau avec le déjeuner', 'Un verre d’eau en début d’après-midi',
      'Un verre d’eau à la pause de l’après-midi', 'Un verre d’eau avant le dîner',
      'Une gourde ou une bouteille remplie et prête pour le lendemain', 'Une boisson sucrée remplacée par de l’eau ou une tisane',
    ],
    closer: 'Une tisane ou un verre d’eau en soirée',
    title: (k) => `Hydratation, ${k} étapes`,
    // 7 verres du jour + la boisson du soir : le titre « 8 verres » correspond bien aux 8 étapes de l'échelon.
    ref: { title: 'Hydratation, 8 verres', suffix: ' Garde une gourde à portée de main.' },
    objective: (k) => `Avancer dans ta routine d’hydratation : ${k} étapes à cocher dans la journée (eau, tisanes, gourde).`,
  },
};

const CULTURE_SUBJECT = {
  Histoire: 'd’histoire',
  Sciences: 'de sciences',
  'Géographie': 'de géographie',
  Philosophie: 'de philosophie',
  'Arts et patrimoine': 'sur l’art ou le patrimoine',
};
const CULTURE_LABELS = [
  'un article rapide', 'un article complet', 'deux articles croisés', null, 'un court documentaire', 'un podcast résumé',
  'un chapitre de livre', 'un chapitre expliqué', 'un documentaire raconté', 'un livre expliqué à quelqu’un',
];
const cultureObjective = (S) => [
  (t) => `Pendant ${t}, lire un article ${S} et retenir une idée.`,
  (t) => `Pendant ${t}, lire un article ${S} en entier et retenir deux idées.`,
  (t) => `Pendant ${t}, lire deux articles ${S} sur le même sujet et noter ce qui les distingue.`,
  null,
  (t) => `Pendant ${t}, regarder un court documentaire ou une vidéo de vulgarisation ${S} et noter trois idées.`,
  (t) => `Pendant ${t}, écouter un podcast ou regarder un reportage ${S}, puis le résumer en cinq lignes.`,
  (t) => `Pendant ${t}, lire un chapitre de livre ${S} et en faire une fiche de synthèse.`,
  (t) => `Pendant ${t}, lire un chapitre de livre ${S}, noter les idées clés, puis les expliquer à voix haute en trois minutes.`,
  (t) => `Pendant ${t}, regarder un documentaire entier ${S}, puis le raconter à quelqu’un.`,
  (t) => `Pendant ${t}, lire une bonne partie d’un livre ${S} ou un long dossier, puis expliquer ce que tu en as retenu à quelqu’un et répondre à ses questions.`,
];

const pompesObjective = (n, r) => {
  if (r <= 3) return `Faire ${n} pompes sur les genoux, corps aligné, en une ou plusieurs séries.`;
  if (r <= 6) return `Faire ${n} pompes classiques, poitrine proche du sol, en une ou plusieurs séries.`;
  if (r <= 8) return `Faire ${n} pompes avec une descente lente de trois secondes, en une ou plusieurs séries.`;
  return `Faire ${n} pompes variées (mains rapprochées ou pieds surélevés), en gardant le corps gainé.`;
};

/** Compteur d'entraide : les gestes dépendent d'un tiers, donc un compteur de petits gestes plutôt qu'une durée. */
const gestes = (unit, title, objective) => ({
  kind: 'counter', base: 3, unit, converted: true,
  title: (n) => title(n, unitFor(unit, n)),
  objective: (n) => objective(n, unitFor(unit, n)),
});

/**
 * Cas particuliers par « discipline/activité ». Champs possibles :
 * kind, base, unit, maxMult, values (cibles choisies à la main), refRung (null = aucun échelon repris tel quel),
 * converted (force la conversion « simple/étapes → compteur ou chronomètre »),
 * title(n, r) et objective(n, r) (sinon textes dérivés de la quête du jour), ref (texte exact de l'échelon de référence),
 * blurb (description du parcours) et goal (cap à long terme affiché à l'échelon 10), quand le texte de la quête ne convient pas.
 * Le plafond quotidien vient de CAP_BY_ACTIVITY / TIMER_CAP_BY_THEME.
 */
const SPECS = {
  // ── Musculation et efforts intenses : multiplicateur 3 par défaut (voir specOf), plafonds dans CAP_BY_ACTIVITY.
  'musculation/Pompes': {
    values: [5, 6, 8, 10, 12, 15, 18, 20, 25, 30], refRung: 4,
    objective: (n, r) => pompesObjective(n, r),
    goal: 'réussir 30 pompes bien gainées, en une ou deux séries',
  },
  'musculation/Jambes et fessiers': { maxMult: 2.5 },
  'pilates/Pilates jambes et fessiers': { maxMult: 3 },
  'musculation/Corps entier haltères': {
    kind: 'counter', base: 30, unit: 'répétitions',
    title: (n) => `Haltères, ${n} répétitions`,
    objective: (n) => `Faire ${n} répétitions au total avec haltères, à répartir entre squats, développés et rowings.`,
    ref: 'Faire un circuit avec haltères : 10 squats, 10 développés et 10 rowings.',
  },
  'musculation/Kettlebell': { maxMult: 2.5 },
  'course/Footing facile': { maxMult: 3, goal: 'courir une heure à allure facile' },
  'course/Préparation 10 km': { values: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10], refRung: 3 },
  'course/Fractionné': { values: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10], refRung: 6 },
  'course/Côtes et dénivelé': { values: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10], refRung: 5 },
  'course/Marche-course': { maxMult: 2.5 },
  'cyclisme/Vélo de route': { values: [6, 8, 10, 12, 15, 18, 21, 24, 27, 30], refRung: 5 },
  'cyclisme/Sortie longue à vélo': { values: [12, 15, 18, 21, 24, 27, 30, 35, 40, 50], refRung: 7 },
  'arts-martiaux/Judo': { maxMult: 2.5 },
  'arts-martiaux/Boxe': { values: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10], refRung: 3 },
  'arts-martiaux/Karaté': { maxMult: 3 },
  'natation/Crawl': { maxMult: 3 },
  'natation/Brasse': { maxMult: 3 },
  'natation/Dos crawlé': { maxMult: 3 },
  'natation/Endurance en piscine': { maxMult: 3 },
  'escalade/Bloc débutant': { maxMult: 3 },
  'randonnee/Marche en dénivelé': { maxMult: 3 },
  'randonnee/Randonnée à la journée': {
    kind: 'timer', values: [60, 75, 90, 105, 120, 135, 150, 160, 170, 180], refRung: 10,
    title: (n) => `Randonnée, ${fm(n)} de marche`,
    objective: (n) => `Faire une randonnée d’environ ${fm(n)} de marche, avec une pause pour manger.`,
    ref: 'Faire une randonnée d’une journée avec pause pique-nique, soit environ 3 h de marche effective.',
  },
  // ── Autres compteurs
  'yoga/Yoga équilibres': {
    objective: (n) => `Tenir ${n} ${n === 1 ? 'posture' : 'postures'} d’équilibre (arbre, guerrier III, aigle), en alternant les côtés.`,
  },
  'mobilite/Étirements complets': {
    maxMult: 2,
    objective: (n) => `Étirer ${n} zones du corps, de la nuque aux mollets, 30 secondes par zone.`,
  },
  'mobilite/Grand écart': {
    maxMult: 3,
    objective: (n) =>
      n === 1
        ? 'Tenir une fois la position préparatoire du grand écart, pendant 30 secondes.'
        : `Tenir ${n} fois la position préparatoire du grand écart, 30 secondes à chaque fois.`,
  },
  'botanique/Reconnaître les arbres': {
    objective: (n) =>
      n === 1
        ? 'Identifier 1 arbre autour de toi grâce à ses feuilles, son écorce ou ses fruits.'
        : `Identifier ${n} arbres autour de toi grâce à leurs feuilles, leur écorce ou leurs fruits.`,
  },
  'dessin/Croquis urbain': {
    objective: (n) => `Faire ${n} ${n === 1 ? 'croquis rapide' : 'croquis rapides'} de ce que tu vois dehors : bâtiments, passants, mobilier.`,
  },
  'langues/Langue des signes': { maxMult: 2 },
  'lecture-ecriture/Journal de bord': {
    kind: 'journal', maxMult: 8,
    title: (n) => `Journal de bord, ${n} caractères`,
    objective: (n) => `Écrire dans ton journal ce que tu as vécu aujourd’hui et ce que tu en retiens, sur au moins ${n} caractères.`,
  },
  'sommeil/Sieste récupératrice': {
    kind: 'timer', values: [5, 6, 7, 8, 10, 12, 14, 16, 18, 20], refRung: 10,
    title: (n) => `Sieste, ${fm(n)}`,
    objective: (n) => `Faire une sieste de ${fm(n)} en début d’après-midi, sans te forcer à dormir.`,
  },
  'meditation/Cohérence cardiaque': { maxMult: 3 },
  'meditation/Respiration profonde': { maxMult: 3 },
  'sommeil/Respiration pour dormir': { maxMult: 3 },

  // ── Chronomètres issus d'une quête « simple » : base de départ (échelon 4) choisie selon l'activité, plafond quotidien en tête.
  'cuisine/Pâtes fraîches': { base: 30 },
  'cuisine/Pain maison': { base: 30 },
  'cuisine/Cuisine du monde': { base: 30 },
  'cuisine/Pâtisserie': { base: 30 },
  'cuisine/Batch cooking': {
    // Un « batch cooking » ne se refait pas chaque jour : on mesure le temps passé à préparer des repas pour les jours suivants.
    kind: 'timer', base: 30, converted: true,
    objective: (n) => `Pendant ${fm(n)}, préparer à l’avance des repas ou des bases (riz, légumes, protéines) pour les jours qui viennent.`,
    blurb: 'Préparer à l’avance évite les repas improvisés et fait gagner du temps toute la semaine.',
  },
  'botanique/Plantes d’intérieur': { base: 10 },
  'botanique/Potager': { base: 20 },
  'botanique/Herbes aromatiques': { base: 10 },
  'botanique/Compost et sol': { base: 10 },
  'musique/Chant et solfège': { base: 20 },
  'theatre/Improvisation': { base: 20 },
  'theatre/Éloquence': { base: 15 },
  'lecture-ecriture/Poésie': { base: 15 },
  'bricolage/Réparation': { base: 15 },
  'randonnee/Rando facile': { base: 45 },
  'randonnee/Randonnée en forêt': { base: 45 },
  'cyclisme/VTT': { base: 30 },
  'cyclisme/Vélo au quotidien': { base: 20 },
  'strategie/Sudoku et logique': { base: 20 },
  'nutrition/Planifier ses repas': { base: 10 },
  'nutrition/Assiette équilibrée': { base: 10 },
  'nutrition/Manger en pleine conscience': { base: 10 },
  'escalade/Renfo pour grimpeurs': { base: 15 },
  'escalade/Souplesse du grimpeur': { base: 15 },

  // ── Entraide : un tiers est concerné, donc un compteur de gestes (sans durée) plutôt qu'un chronomètre.
  'entraide/Aide à un voisin': gestes(
    'services',
    (n, u) => `Voisin, ${n} ${u}`,
    (n, u) => `Rendre ${n} ${u} autour de toi, à un voisin, un proche ou un collègue : tenir une porte, porter des courses, relever un colis, donner un coup de main.`,
  ),
  'entraide/Bénévolat associatif': gestes(
    'actions',
    (n, u) => `Association, ${n} ${u}`,
    (n, u) => `Faire ${n} ${u} pour une association : la contacter, relayer son appel, trier des dons, préparer une mission, aider sur place.`,
  ),
  'entraide/Cuisine solidaire': gestes(
    'portions',
    (n, u) => `Cuisine solidaire, ${n} ${u}`,
    (n, u) => `Cuisiner ${n} ${u} de plus pour quelqu’un qui en a besoin, ou pour un repas ou une distribution solidaire.`,
  ),
  'entraide/Soutien scolaire': gestes(
    'exercices',
    (n, u) => `Soutien scolaire, ${n} ${u}`,
    (n, u) => `Aider un élève à comprendre et à faire ${n} ${u}, en l’accompagnant plutôt qu’en donnant la réponse.`,
  ),
  'entraide/Visite et écoute': gestes(
    'personnes',
    (n, u) => `Visite, ${n} ${u}`,
    (n, u) => `Prendre des nouvelles de ${n} ${u === 'personne' ? 'personne isolée ou âgée (appel, message ou visite) et l’écouter' : 'personnes isolées ou âgées (appel, message ou visite) et les écouter'}.`,
  ),
};

// ───────────────────────────── Construction d'un parcours ─────────────────────────────

/** Spécification de l'échelle d'une activité : valeurs numériques et textes de chaque échelon. */
function specOf(theme, a) {
  const key = `${theme.id}/${a.name}`;
  const ov = SPECS[key] ?? {};
  // Les habitudes à étapes n'ont pas d'échelle numérique (voir stepRungs).
  if (STEP_HABITS[key]) return { key, ov, ladder: null, ref: null };
  const dv = a.dayVal;
  const timeBase = theme.time[0];
  let kind;
  let base;
  let unit = null;
  if (dv.type === 'counter') (kind = 'counter'), (base = dv.target), (unit = dv.unit);
  else if (dv.type === 'timer') (kind = 'timer'), (base = dv.minutes);
  else if (dv.type === 'journal') (kind = 'journal'), (base = dv.minChars);
  else (kind = 'timer'), (base = timeBase);
  const converted = ov.converted ?? (dv.type === 'simple' || dv.type === 'steps');
  kind = ov.kind ?? kind;
  base = ov.base ?? base;
  unit = ov.unit ?? unit;
  // Multiplicateur final : 3 pour une séance guidée convertie ou une activité intense, 4 sinon ; le plafond quotidien prime.
  const maxMult = ov.maxMult ?? ((converted && theme.physical) || INTENSIVE.has(key) ? 3 : 4);
  const cap = capOf(theme.id, a.name, kind);
  let lad;
  if (ov.values) {
    lad = { ref: ov.refRung ?? 4, values: ov.values };
    if (ov.values.length !== RUNG_COUNT || ov.values.some((v, i) => i > 0 && v <= ov.values[i - 1])) throw new Error(`${key}: values doit compter ${RUNG_COUNT} cibles strictement croissantes`);
    if (cap !== undefined && ov.values[RUNG_COUNT - 1] > cap) throw new Error(`${key}: values dépasse le plafond ${cap}`);
    if (!converted && ov.refRung && ov.values[ov.refRung - 1] !== base) throw new Error(`${key}: l’échelon de référence ${ov.refRung} doit valoir ${base}`);
  } else lad = ladder(kind, base, { maxMult, cap });
  const ref = ov.values ? (ov.refRung ?? null) : lad.ref;
  return { key, ov, kind, base, unit, maxMult, cap, converted, ladder: lad, ref };
}

/** Titre et objectif d'un échelon numérique (compteur, chronomètre ou journal). */
function numericRung(theme, a, s, r) {
  const n = s.ladder.values[r - 1];
  const isRef = s.ref === r;
  const { ov } = s;
  const u = s.unit ? unitFor(s.unit, n) : '';
  const time = fm(n);

  let title;
  if (ov.title) title = ov.title(n, r);
  else if (isRef && !s.converted) title = a.dayTitle;
  else if (s.kind === 'counter') title = swapNumber(a.dayTitle, s.base, n) ?? `${a.name}, ${n} ${u}`;
  else if (s.kind === 'timer' && !s.converted) title = swapMinutes(a.dayTitle, s.base, n) ?? `${a.name}, ${time}`;
  else title = `${a.name}, ${time}`;

  let objective;
  if (isRef) {
    const more = s.kind === 'timer' ? `Prévois au moins ${time}.` : `Vise au moins ${n} ${u}.`;
    objective = ov.ref ?? (s.converted ? `${a.dayObjective} ${more}` : a.dayObjective);
  }
  else if (ov.objective) objective = ov.objective(n, r, s.ref);
  else if (s.kind === 'counter') objective = swapNumber(a.dayObjective, s.base, n);
  else if (s.kind === 'timer' && !s.converted) {
    objective = swapMinutes(a.dayObjective, s.base, n) ?? `${noDot(a.dayObjective)}, pendant ${time}.`;
  } else if (s.kind === 'timer') objective = `Pendant ${time} : ${a.doing}.`;
  if (!objective) throw new Error(`${s.key}: objectif introuvable pour l’échelon ${r} (cible ${n}) — ajouter un cas dans SPECS`);

  const validation =
    s.kind === 'counter' ? { type: 'counter', target: n, unit: u } : s.kind === 'timer' ? { type: 'timer', minutes: n } : { type: 'journal', minChars: n };
  return { title, objective, validation };
}

/** Échelons d'une habitude à étapes ajoutées (r + 1 étapes à l'échelon r). */
function stepRungs(cfg, a) {
  return Array.from({ length: RUNG_COUNT }, (_, i) => {
    const r = i + 1;
    const steps = cfg.closer && r >= 3 ? [...cfg.pool.slice(0, r), cfg.closer] : cfg.pool.slice(0, r + 1);
    const isRef = cfg.refRung === r;
    return {
      title: isRef ? (cfg.ref?.title ?? a.dayTitle) : cfg.title(r + 1),
      objective: isRef ? a.dayObjective + (cfg.ref?.suffix ?? "") : cfg.objective(r + 1),
      validation: { type: 'steps', steps },
    };
  });
}

/** Échelons de culture générale : article → documentaire → livre → expliquer à quelqu'un (chronomètre). */
function cultureRungs(a, s) {
  const S = CULTURE_SUBJECT[a.name];
  const texts = cultureObjective(S);
  return Array.from({ length: RUNG_COUNT }, (_, i) => {
    const r = i + 1;
    const n = s.ladder.values[i];
    const label = CULTURE_LABELS[i];
    return {
      title: label ? `${a.name}, ${label}` : a.dayTitle,
      objective: texts[i] ? texts[i](fm(n)) : a.dayObjective,
      validation: { type: 'timer', minutes: n },
    };
  });
}

const GENERIC_TIPS = [
  'Commence en douceur : l’important est de t’y mettre.',
  'Prends ton rythme et reste régulier, même sur de petites séances.',
  'Un peu chaque jour vaut mieux qu’un gros effort isolé.',
  'Cet échelon est ta base : installe-le bien avant de monter.',
  'Note ce qui t’a paru facile ou difficile pour ajuster la suite.',
  'Les progrès se voient quand tu restes constant plusieurs jours.',
  'Prépare ton créneau à l’avance pour ne pas repousser.',
  'Si c’est trop dur aujourd’hui, mieux vaut en faire un peu moins que rien.',
  'Tu approches du sommet : soigne la qualité plutôt que la vitesse.',
  'Savoure ce niveau : peu de gens vont jusque-là.',
];
const PHYSICAL_TIP = 'Écoute ton corps : réduis ou arrête dès qu’une douleur apparaît.';

/**
 * Deux conseils par échelon. La quête d'un parcours est quotidienne : aucun conseil ne parle de « semaine » ni de nombre de séances.
 * Les activités intenses rappellent dès l'échelon 5 qu'un jour de repos est normal.
 */
function tipsOf(theme, a, r, s) {
  let generic = GENERIC_TIPS[r - 1];
  if (INTENSIVE.has(s.key) && r >= 5) generic = r >= 7 ? `${REST_TIP} ${PHYSICAL_TIP}` : REST_TIP;
  else if (theme.physical && r >= 7) generic = PHYSICAL_TIP;
  let specific;
  if (r === 10) specific = `Ton cap à long terme : ${s.ov.goal ?? a.goal}.`;
  else if (r % 2 === 1) specific = a.flow;
  else specific = a.tech;
  return [specific, generic];
}

export function buildTracks() {
  // Garde-fou contre les fautes de frappe : chaque clé de SPECS, des plafonds et des activités intenses doit viser une activité réelle.
  const known = new Set(themeRows.flatMap((th) => th.activities.map((a) => `${th.id}/${a[0]}`)));
  for (const [label, keys] of [['SPECS', Object.keys(SPECS)], ['CAP_BY_ACTIVITY', Object.keys(CAP_BY_ACTIVITY)], ['INTENSIVE', [...INTENSIVE]], ['STEP_HABITS', Object.keys(STEP_HABITS)]]) {
    for (const k of keys) if (!known.has(k)) throw new Error(`${label}: activité inconnue « ${k} »`);
  }
  const tracks = [];
  for (const theme of themeRows) {
    const secondary = theme.secondary.map(([ability, pct]) => ({ ability, pct }));
    for (const [name, doing, why, flow, tech, goal] of theme.activities) {
      const task = guidedTasks[theme.id]?.[name];
      if (!task) throw new Error(`${theme.id}/${name}: tâches précises manquantes (guided-tasks.mjs)`);
      const [dayTitle, dayObjective, dayValRaw, , weekObjective] = task;
      const a = { name, doing, why, flow, tech, goal, dayTitle, dayObjective, dayVal: parseValidation(dayValRaw), weekObjective };
      const s = specOf(theme, a);
      let rows;
      if (STEP_HABITS[s.key]) rows = stepRungs(STEP_HABITS[s.key], a);
      else if (theme.id === 'culture') rows = cultureRungs(a, s);
      else rows = Array.from({ length: RUNG_COUNT }, (_, i) => numericRung(theme, a, s, i + 1));
      const rungs = rows.map((row, i) => {
        const rung = i + 1;
        const objective = theme.physical && rung >= 7 ? row.objective + PRUDENCE : row.objective;
        return { rung, difficulty: difficultyOf(rung), title: row.title, objective, tips: tipsOf(theme, a, rung, s), validation: row.validation };
      });
      tracks.push({
        id: `${theme.id}-${slug(name)}`,
        theme: theme.id,
        activity: name,
        label: name,
        blurb: s.ov.blurb ?? why,
        ability: theme.primary,
        secondary,
        rungs,
      });
    }
  }
  return tracks;
}

export default buildTracks;
