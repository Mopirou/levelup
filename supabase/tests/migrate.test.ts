import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
// @ts-expect-error module JS sans types
import { applyPending } from '../../scripts/lib/migrate-core.mjs';

describe('migrations automatiques', () => {
  let pg: PGlite;
  let dir: string;
  const db = () => ({
    query: (t: string, p?: unknown[]) => pg.query(t, p as any[]),
    exec: (t: string) => pg.exec(t),
  });
  const run = () => applyPending(db(), { migrationsDir: dir, seedPath: join(dir, 'seed.sql') });
  const write = (name: string, sql: string) => writeFileSync(join(dir, name), sql);

  beforeAll(async () => {
    pg = new PGlite();
    dir = mkdtempSync(join(tmpdir(), 'lu-mig-'));
    write('20260101000001_a.sql', 'create table public.a (id int primary key);');
    write('20260101000002_b.sql', 'create table public.b (id int primary key);');
    write('seed.sql', 'insert into public.a values (1) on conflict do nothing;');
  });
  afterAll(async () => {
    await pg.close();
    rmSync(dir, { recursive: true, force: true });
  });

  it('applique tout sur une base vide, dans l’ordre, puis le seed', { timeout: 30_000 }, async () => {
    const r = await run();
    expect(r.migrations).toEqual(['20260101000001_a.sql', '20260101000002_b.sql']);
    expect(r.seeded).toBe(true);
    expect((await pg.query('select count(*)::int n from public.a')).rows[0]).toEqual({ n: 1 });
  });

  it('ne fait rien quand la base est à jour', async () => {
    const r = await run();
    expect(r).toEqual({ migrations: [], seeded: false });
  });

  it('n’applique que la nouvelle migration, et rejoue le seed seulement s’il a changé', async () => {
    write('20260102000001_c.sql', 'alter table public.a add column label text;');
    write('seed.sql', "insert into public.a (id, label) values (2, 'x') on conflict do nothing;");
    const r = await run();
    expect(r.migrations).toEqual(['20260102000001_c.sql']);
    expect(r.seeded).toBe(true);
    expect((await pg.query('select count(*)::int n from public.a')).rows[0]).toEqual({ n: 2 });
  });

  it('annule une migration en erreur sans bloquer la base ni la marquer appliquée', async () => {
    write('20260103000001_bad.sql', 'create table public.ok (id int); select * from table_inexistante;');
    await expect(run()).rejects.toThrow(/20260103000001_bad\.sql/);
    expect((await pg.query(`select to_regclass('public.ok') as t`)).rows[0]).toEqual({ t: null });
    expect((await pg.query(`select count(*)::int n from supabase_migrations.schema_migrations where version = '20260103000001'`)).rows[0]).toEqual({ n: 0 });
    // une fois corrigée, elle s'applique
    write('20260103000001_bad.sql', 'create table public.ok (id int);');
    expect((await run()).migrations).toEqual(['20260103000001_bad.sql']);
  });

  it('reconnaît les migrations déjà appliquées par la CLI Supabase (même table de suivi)', async () => {
    write('20260104000001_d.sql', 'create table public.d (id int);');
    await pg.exec(`insert into supabase_migrations.schema_migrations (version, name) values ('20260104000001', 'd')`);
    expect((await run()).migrations).toEqual([]);
  });
});
