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
  validation = excluded.validation, tags = excluded.tags, theme = excluded.theme, secondary = excluded.secondary;\n\n`;

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
console.log(`seed.sql : ${quests.length} quêtes, ${achievements.length} trophées, ${banned.length} mots interdits`);
