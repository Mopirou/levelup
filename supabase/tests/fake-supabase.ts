import type { PGlite } from '@electric-sql/pglite';

/**
 * Faux client supabase-js au-dessus de PGlite (rôle service : sans RLS).
 * Il ne couvre que le sous-ensemble utilisé par SupabaseStore (select/insert/upsert/update/delete, filtres simples,
 * tri, pagination) et renvoie des valeurs au format PostgREST (dates en texte ISO, jsonb en objets).
 */
type Filter = { col: string; op: string; val: unknown };

// PostgREST renvoie les dates en texte ISO ; PGlite les parse en Date par défaut.
const ident = (v: string) => v;
const ts = (v: string) => v.replace(' ', 'T').replace(/([+-]\d\d)$/, '$1:00');
const parsers = { 1082: ident, 1114: ts, 1184: ts };

export function fakeSupabase(pg: PGlite) {
  const db = { query: (sql: string, params?: unknown[]) => pg.query(sql, params, { parsers }) };
  const typeCache = new Map<string, Record<string, { udt: string }>>();

  async function columns(table: string) {
    if (!typeCache.has(table)) {
      const r = await db.query(`select column_name, udt_name from information_schema.columns where table_schema = 'public' and table_name = $1`, [table]);
      typeCache.set(table, Object.fromEntries((r.rows as { column_name: string; udt_name: string }[]).map((c) => [c.column_name, { udt: c.udt_name }])));
    }
    return typeCache.get(table)!;
  }

  const quote = (n: string) => `"${n}"`;

  class Query implements PromiseLike<any> {
    private mode: 'select' | 'insert' | 'upsert' | 'update' | 'delete' = 'select';
    private cols = '*';
    private wantRows = true;
    private countMode = false;
    private head = false;
    private filters: Filter[] = [];
    private ors: Filter[][] = [];
    private orders: { col: string; asc: boolean }[] = [];
    private range_: [number, number] | null = null;
    private limit_: number | null = null;
    private payload: any = null;
    private conflict: string[] | null = null;
    private ignoreDup = false;
    private single_: 'one' | 'maybe' | null = null;

    constructor(private table: string) {}

    select(cols = '*', opts?: { count?: string; head?: boolean }) {
      this.cols = cols;
      this.wantRows = true;
      if (opts?.count) this.countMode = true;
      if (opts?.head) this.head = true;
      return this;
    }
    insert(rows: any) { this.mode = 'insert'; this.payload = rows; this.wantRows = false; return this; }
    upsert(rows: any, opts?: { onConflict?: string; ignoreDuplicates?: boolean }) {
      this.mode = 'upsert';
      this.payload = rows;
      this.wantRows = false;
      this.conflict = opts?.onConflict ? opts.onConflict.split(',').map((s) => s.trim()) : null;
      this.ignoreDup = !!opts?.ignoreDuplicates;
      return this;
    }
    update(row: any) { this.mode = 'update'; this.payload = row; this.wantRows = false; return this; }
    delete() { this.mode = 'delete'; this.wantRows = false; return this; }
    eq(col: string, val: unknown) { this.filters.push({ col, op: '=', val }); return this; }
    in(col: string, val: unknown[]) { this.filters.push({ col, op: 'in', val }); return this; }
    gte(col: string, val: unknown) { this.filters.push({ col, op: '>=', val }); return this; }
    lte(col: string, val: unknown) { this.filters.push({ col, op: '<=', val }); return this; }
    lt(col: string, val: unknown) { this.filters.push({ col, op: '<', val }); return this; }
    is(col: string, val: unknown) { this.filters.push({ col, op: 'is', val }); return this; }
    or(expr: string) {
      // « source.eq.catalog,owner_id.eq.<uuid> »
      this.ors.push(
        expr.split(',').map((part) => {
          const [col, op, ...rest] = part.split('.');
          return { col, op: op === 'eq' ? '=' : op, val: rest.join('.') };
        }),
      );
      return this;
    }
    order(col: string, opts?: { ascending?: boolean }) { this.orders.push({ col, asc: opts?.ascending !== false }); return this; }
    limit(n: number) { this.limit_ = n; return this; }
    range(a: number, b: number) { this.range_ = [a, b]; return this; }
    maybeSingle() { this.single_ = 'maybe'; return this; }
    single() { this.single_ = 'one'; return this; }

    then<T1 = any, T2 = never>(res?: ((v: any) => T1 | PromiseLike<T1>) | null, rej?: ((e: any) => T2 | PromiseLike<T2>) | null) {
      return this.run().then(res, rej);
    }

    private where(params: unknown[]): string {
      const parts: string[] = [];
      const add = (f: Filter) => {
        if (f.op === 'in') {
          params.push(f.val);
          return `${quote(f.col)} = any($${params.length})`;
        }
        if (f.op === 'is') return `${quote(f.col)} is ${f.val === null ? 'null' : String(f.val)}`;
        params.push(f.val);
        return `${quote(f.col)} ${f.op} $${params.length}`;
      };
      for (const f of this.filters) parts.push(add(f));
      for (const group of this.ors) parts.push('(' + group.map(add).join(' or ') + ')');
      return parts.length ? ' where ' + parts.join(' and ') : '';
    }

    private async bind(row: Record<string, unknown>, params: unknown[]) {
      const meta = await columns(this.table);
      const names = Object.keys(row);
      const values = names.map((n) => {
        let v = row[n];
        const t = meta[n];
        if (!t) throw new Error(`colonne inconnue : ${this.table}.${n}`);
        if (v !== null && v !== undefined && (t.udt === 'jsonb' || t.udt === 'json')) v = JSON.stringify(v);
        params.push(v === undefined ? null : v);
        return t.udt === 'jsonb' ? `$${params.length}::jsonb` : `$${params.length}`;
      });
      return { names, values };
    }

    private async run(): Promise<{ data: any; error: any; count?: number }> {
      try {
        const params: unknown[] = [];
        let sql: string;
        if (this.mode === 'select') {
          const cols = this.cols === '*' ? '*' : this.cols.split(',').map((c) => quote(c.trim())).join(', ');
          if (this.head && this.countMode) {
            const r = await db.query(`select count(*)::int as n from ${quote(this.table)}${this.where(params)}`, params);
            return { data: null, error: null, count: (r.rows[0] as { n: number }).n };
          }
          sql = `select ${cols} from ${quote(this.table)}${this.where(params)}`;
          if (this.orders.length) sql += ' order by ' + this.orders.map((o) => `${quote(o.col)} ${o.asc ? 'asc' : 'desc'}`).join(', ');
          if (this.range_) sql += ` limit ${this.range_[1] - this.range_[0] + 1} offset ${this.range_[0]}`;
          else if (this.limit_ !== null) sql += ` limit ${this.limit_}`;
        } else if (this.mode === 'insert' || this.mode === 'upsert') {
          const rows: Record<string, unknown>[] = Array.isArray(this.payload) ? this.payload : [this.payload];
          let last: { rows: unknown[] } | undefined;
          for (const row of rows) {
            const p: unknown[] = [];
            const { names, values } = await this.bind(row, p);
            let st = `insert into ${quote(this.table)} (${names.map(quote).join(', ')}) values (${values.join(', ')})`;
            if (this.mode === 'upsert') {
              const target = this.conflict ?? [];
              const tgt = target.length ? `(${target.map(quote).join(', ')})` : '';
              if (this.ignoreDup) st += ` on conflict ${tgt} do nothing`;
              else {
                const sets = names.filter((n) => !target.includes(n)).map((n) => `${quote(n)} = excluded.${quote(n)}`);
                st += ` on conflict ${tgt} do update set ${sets.join(', ') || `${quote(target[0])} = excluded.${quote(target[0])}`}`;
              }
            }
            if (this.wantRows) st += ' returning *';
            last = await db.query(st, p);
          }
          return this.finish(last?.rows ?? []);
        } else if (this.mode === 'update') {
          const { names, values } = await this.bind(this.payload, params);
          sql = `update ${quote(this.table)} set ${names.map((n, i) => `${quote(n)} = ${values[i]}`).join(', ')}${this.where(params)}`;
          if (this.wantRows) sql += ' returning *';
        } else {
          sql = `delete from ${quote(this.table)}${this.where(params)}`;
        }
        const r = await db.query(sql, params);
        return this.finish(r.rows);
      } catch (e) {
        return { data: null, error: { message: (e as Error).message, code: (e as { code?: string }).code } };
      }
    }

    private finish(rows: unknown[]) {
      if (this.single_) {
        if (!rows.length && this.single_ === 'one') return { data: null, error: { message: 'Aucune ligne' } };
        return { data: rows[0] ?? null, error: null };
      }
      return { data: rows, error: null };
    }
  }

  return {
    from(table: string) {
      return new Query(table);
    },
  };
}
