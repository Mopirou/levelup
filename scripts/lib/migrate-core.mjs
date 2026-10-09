// Cœur du runner de migrations : indépendant du pilote SQL (pg en production, PGlite dans les tests).
// Il suit les migrations déjà appliquées dans supabase_migrations.schema_migrations, la même table que la CLI Supabase,
// donc les deux outils peuvent cohabiter sans rejouer une migration.
import { createHash } from 'node:crypto';
import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

/**
 * @typedef {{ query: (text: string, params?: unknown[]) => Promise<{ rows: any[] }>, exec: (text: string) => Promise<unknown> }} Db
 */

const FILE = /^(\d+)_(.+)\.sql$/;

export function listMigrations(dir) {
  return readdirSync(dir)
    .map((file) => ({ file, m: FILE.exec(file) }))
    .filter((x) => x.m)
    .map((x) => ({ file: x.file, version: x.m[1], name: x.m[2], sql: readFileSync(join(dir, x.file), 'utf8') }))
    .sort((a, b) => a.version.localeCompare(b.version));
}

async function ensureTables(db) {
  await db.exec(`
    create schema if not exists supabase_migrations;
    create table if not exists supabase_migrations.schema_migrations (
      version text not null primary key,
      statements text[],
      name text
    );
    create table if not exists supabase_migrations.seed_state (
      name text primary key,
      hash text not null,
      applied_at timestamptz not null default now()
    );
  `);
}

/** Applique les migrations en attente (dans l'ordre), puis le seed s'il a changé. Retourne ce qui a été fait. */
export async function applyPending(/** @type {Db} */ db, { migrationsDir, seedPath, log = () => {} }) {
  await ensureTables(db);
  const applied = new Set((await db.query('select version from supabase_migrations.schema_migrations')).rows.map((r) => r.version));
  const pending = listMigrations(migrationsDir).filter((m) => !applied.has(m.version));
  const result = { migrations: /** @type {string[]} */ ([]), seeded: false };

  for (const m of pending) {
    log(`→ migration ${m.file}`);
    await db.exec('begin');
    try {
      await db.exec(m.sql);
      await db.query('insert into supabase_migrations.schema_migrations (version, name, statements) values ($1, $2, $3)', [m.version, m.name, [m.sql]]);
      await db.exec('commit');
    } catch (e) {
      await db.exec('rollback');
      throw new Error(`Migration ${m.file} refusée : ${e instanceof Error ? e.message : e}`);
    }
    result.migrations.push(m.file);
  }

  if (seedPath && existsSync(seedPath)) {
    const sql = readFileSync(seedPath, 'utf8');
    const hash = createHash('sha256').update(sql).digest('hex');
    const known = (await db.query('select hash from supabase_migrations.seed_state where name = $1', ['seed'])).rows[0]?.hash;
    if (known !== hash) {
      log('→ seed du catalogue (quêtes, trophées)');
      await db.exec('begin');
      try {
        await db.exec(sql);
        await db.query(
          `insert into supabase_migrations.seed_state (name, hash) values ('seed', $1)
           on conflict (name) do update set hash = excluded.hash, applied_at = now()`,
          [hash],
        );
        await db.exec('commit');
      } catch (e) {
        await db.exec('rollback');
        throw new Error(`Seed refusé : ${e instanceof Error ? e.message : e}`);
      }
      result.seeded = true;
    }
  }
  return result;
}
