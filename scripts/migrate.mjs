// Migrations automatiques : regarde si la base a du retard et l'applique si besoin (puis met le catalogue à jour).
//
//   npm run migrate              → no-op silencieux si aucune URL de base n'est configurée
//   npm run migrate -- --require → échoue si aucune URL n'est configurée (déploiement)
//
// URL de la base : SUPABASE_DB_URL (ou DATABASE_URL), p. ex. celle de « Settings → Database → Connection string ».
// En local avec `supabase start` : postgresql://postgres:postgres@127.0.0.1:54322/postgres
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { applyPending } from './lib/migrate-core.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const url = process.env.SUPABASE_DB_URL || process.env.DATABASE_URL;
const required = process.argv.includes('--require');

if (!url) {
  if (required) {
    console.error('migrate : SUPABASE_DB_URL manquant.');
    process.exit(1);
  }
  console.log('migrate : aucune base configurée (SUPABASE_DB_URL), migrations ignorées.');
  process.exit(0);
}

const { default: pg } = await import('pg');
const local = /@(localhost|127\.0\.0\.1|\[::1\])[:/]/.test(url);
const client = new pg.Client({ connectionString: url, ssl: local ? false : { rejectUnauthorized: false } });

try {
  await client.connect();
  // Un seul runner à la fois (plusieurs instances qui démarrent ensemble).
  await client.query('select pg_advisory_lock(7265001)');
  const db = { query: (t, p) => client.query(t, p), exec: (t) => client.query(t) };
  const r = await applyPending(db, {
    migrationsDir: join(root, 'supabase', 'migrations'),
    seedPath: join(root, 'supabase', 'seed.sql'),
    log: (m) => console.log(`migrate ${m}`),
  });
  console.log(
    r.migrations.length || r.seeded
      ? `migrate : ${r.migrations.length} migration(s) appliquée(s)${r.seeded ? ', catalogue mis à jour' : ''}.`
      : 'migrate : base à jour.',
  );
} catch (e) {
  console.error(`migrate : ${e instanceof Error ? e.message : e}`);
  process.exitCode = 1;
} finally {
  await client.end().catch(() => undefined);
}
