// Écrit apps/mobile/public/env.js à partir des variables d'environnement de l'hébergeur (SUPABASE_URL, SUPABASE_ANON_KEY, PUBLIC_URL).
// La clé « anon » est publique par conception (la sécurité repose sur les règles RLS) ; ne jamais y mettre la clé service_role.
// Sans SUPABASE_URL, le fichier existant est conservé (mode local).
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const url = (process.env.SUPABASE_URL ?? '').trim();
const key = (process.env.SUPABASE_ANON_KEY ?? '').trim();
if (!url || !key) {
  console.log('write-env : SUPABASE_URL / SUPABASE_ANON_KEY absents, env.js inchangé (mode local).');
  process.exit(0);
}
if (/service_role/i.test(key)) {
  console.error('write-env : cette clé ressemble à une clé service_role. Utilise la clé « anon public ».');
  process.exit(1);
}
const publicUrl = (process.env.PUBLIC_URL ?? process.env.URL ?? process.env.CF_PAGES_URL ?? '').trim();
const file = join(dirname(fileURLToPath(import.meta.url)), '..', 'apps', 'mobile', 'public', 'env.js');
writeFileSync(
  file,
  `window.__LEVELUP_ENV__ = ${JSON.stringify({ supabaseUrl: url, supabaseAnonKey: key, ...(publicUrl ? { publicUrl } : {}) }, null, 2)};\n`,
);
console.log('write-env : env.js écrit pour', url);
