// Génère supabase/seed.sql à partir des fichiers JSON de contenu (le contenu vit hors du code).
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const data = (f) => JSON.parse(readFileSync(join(root, 'packages', 'content', 'data', f), 'utf8'));

const q = (s) => `'${String(s).replace(/'/g, "''")}'`;
const arr = (a) => (a.length ? `array[${a.map(q).join(', ')}]::text[]` : `'{}'::text[]`);
const json = (o) => `${q(JSON.stringify(o))}::jsonb`;

const quests = data('quests.fr.json');
const achievements = data('achievements.fr.json');
const tracks = data('tracks.fr.json');

// Un gabarit par échelon de parcours : id `{parcours}-r{NN}`, jamais tiré ni listé dans le catalogue libre (track_id renseigné).
const physicalThemes = new Set(quests.filter((t) => t.theme && t.tags.includes('sport')).map((t) => t.theme));
const rungTemplates = tracks.flatMap((t) =>
  t.rungs.map((r) => ({
    id: `${t.id}-r${String(r.rung).padStart(2, '0')}`,
    ability: t.ability,
    difficulty: r.difficulty,
    periods: ['daily'],
    title: r.title,
    flavor: t.blurb,
    objective: r.objective,
    tips: r.tips,
    validation: r.validation,
    tags: ['parcours', t.theme, ...(physicalThemes.has(t.theme) ? ['sport'] : [])],
    theme: t.theme,
    secondary: t.secondary,
    trackId: t.id,
    rung: r.rung,
  })),
);
if (new Set(rungTemplates.map((t) => t.id)).size !== rungTemplates.length) throw new Error('gabarits d’échelons en double');

// Mots interdits (RG-24) : base de départ, à compléter par la modération. Comparés sans accents ni majuscules.
const banned = [
  'connard', 'connasse', 'salope', 'pute', 'encule', 'enculer', 'enfoire', 'fdp', 'ntm', 'nique ta mere', 'niquer',
  'batard', 'petasse', 'bougnoule', 'youpin', 'pede', 'tarlouze', 'sale race', 'sale arabe', 'sale noir', 'sale juif',
  'ta gueule', 'va te faire foutre', 'cretin', 'debile', 'abruti', 'ordure', 'sous-merde', 'trou du cul',
];

let sql = '-- Fichier généré par scripts/gen-seed.mjs — ne pas modifier à la main.\n\n';

sql += '-- ═══ Catalogue de quêtes ═══\n';
sql += 'insert into public.quest_templates (id, source, ability, difficulty, periods, title, flavor, objective, tips, validation, tags, theme, secondary, is_active) values\n';
sql += quests
  .map(
    (t) =>
      `(${q(t.id)}, 'catalog', ${q(t.ability)}, ${q(t.difficulty)}, ${arr(t.periods)}, ${q(t.title)}, ${q(t.flavor)}, ${q(t.objective)}, ${arr(t.tips)}, ${json(t.validation)}, ${arr(t.tags)}, ${t.theme ? q(t.theme) : 'null'}, ${json(t.secondary ?? [])}, true)`,
  )
  .join(',\n');
sql += `\non conflict (id) do update set ability = excluded.ability, difficulty = excluded.difficulty, periods = excluded.periods,
  title = excluded.title, flavor = excluded.flavor, objective = excluded.objective, tips = excluded.tips,
  validation = excluded.validation, tags = excluded.tags, theme = excluded.theme, secondary = excluded.secondary, is_active = true;\n\n`;
// Une quête retirée du catalogue est désactivée, jamais supprimée : des instances existantes y font référence.
sql += `update public.quest_templates set is_active = false where source = 'catalog' and track_id is null and is_active and id <> all (${arr(quests.map((t) => t.id))});\n\n`;

sql += '-- ═══ Échelons des parcours de discipline (un gabarit par échelon, jamais tiré au sort) ═══\n';
const CHUNK = 250;
for (let i = 0; i < rungTemplates.length; i += CHUNK) {
  sql += 'insert into public.quest_templates (id, source, ability, difficulty, periods, title, flavor, objective, tips, validation, tags, theme, secondary, is_active, track_id, rung) values\n';
  sql += rungTemplates
    .slice(i, i + CHUNK)
    .map(
      (t) =>
        `(${q(t.id)}, 'catalog', ${q(t.ability)}, ${q(t.difficulty)}, ${arr(t.periods)}, ${q(t.title)}, ${q(t.flavor)}, ${q(t.objective)}, ${arr(t.tips)}, ${json(t.validation)}, ${arr(t.tags)}, ${q(t.theme)}, ${json(t.secondary)}, true, ${q(t.trackId)}, ${t.rung})`,
    )
    .join(',\n');
  sql += `\non conflict (id) do update set ability = excluded.ability, difficulty = excluded.difficulty, periods = excluded.periods,
  title = excluded.title, flavor = excluded.flavor, objective = excluded.objective, tips = excluded.tips,
  validation = excluded.validation, tags = excluded.tags, theme = excluded.theme, secondary = excluded.secondary, is_active = true,
  track_id = excluded.track_id, rung = excluded.rung;\n\n`;
}
// Un échelon retiré (parcours renommé ou supprimé) est désactivé, jamais supprimé : des instances existantes y font référence.
sql += `update public.quest_templates set is_active = false where source = 'catalog' and track_id is not null and is_active and id <> all (${arr(rungTemplates.map((t) => t.id))});\n\n`;

sql += '-- ═══ Trophées ═══\n';
sql += 'insert into public.achievements (id, category, name, description, hint, condition, xp_bonus, title_unlocked, is_secret) values\n';
sql += achievements
  .map(
    (a) =>
      `(${q(a.id)}, ${q(a.category)}, ${q(a.name)}, ${q(a.description)}, ${a.hint ? q(a.hint) : 'null'}, ${json(a.condition)}, ${a.xpBonus}, ${a.titleUnlocked ? q(a.titleUnlocked) : 'null'}, ${a.isSecret ? 'true' : 'false'})`,
  )
  .join(',\n');
sql += `\non conflict (id) do update set category = excluded.category, name = excluded.name, description = excluded.description,
  hint = excluded.hint, condition = excluded.condition, xp_bonus = excluded.xp_bonus,
  title_unlocked = excluded.title_unlocked, is_secret = excluded.is_secret;\n\n`;

sql += '-- ═══ Mots interdits ═══\n';
sql += `insert into public.banned_words (word) values ${banned.map((w) => `(${q(w)})`).join(', ')} on conflict do nothing;\n`;

writeFileSync(join(root, 'supabase', 'seed.sql'), sql);
console.log(`seed.sql : ${quests.length} quêtes, ${rungTemplates.length} échelons de parcours, ${achievements.length} trophées, ${banned.length} mots interdits`);
