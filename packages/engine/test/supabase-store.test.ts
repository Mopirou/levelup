import { describe, expect, it } from 'vitest';
import { SupabaseStore, type QuestInstance, type TrackState } from '../src';

/** Faux client PostgREST : chaque `from(table)` renvoie un constructeur chaînable qui journalise les appels et se résout en `{ data, error }`. */
function fakeClient(respond: (table: string, calls: [string, unknown[]][]) => { data?: unknown; error?: unknown }) {
  const log: { table: string; calls: [string, unknown[]][] }[] = [];
  const client = {
    from(table: string) {
      const entry = { table, calls: [] as [string, unknown[]][] };
      log.push(entry);
      const proxy: any = new Proxy(
        {},
        {
          get(_t, prop: string) {
            if (prop === 'then') return (res: (v: unknown) => void) => res({ data: null, error: null, ...respond(table, entry.calls) });
            return (...args: unknown[]) => {
              entry.calls.push([prop, args]);
              return proxy;
            };
          },
        },
      );
      return proxy;
    },
  };
  return { client, log };
}

const track: TrackState = { trackId: 'musculation-x', status: 'paused', rung: 4, hits: 2, lastDoneDate: '2026-10-08', lastCheckedDate: '2026-10-09', bestRung: 6, startedAt: '2026-10-01T07:00:00.000Z' };

describe('SupabaseStore : parcours', () => {
  it('lit, enregistre (upsert sur profile_id,track_id) et supprime les parcours', async () => {
    const { client, log } = fakeClient((table) => ({
      data: table === 'tracks'
        ? [{ track_id: 'musculation-x', status: 'paused', rung: 4, hits: 2, last_done_date: '2026-10-08', last_checked_date: '2026-10-09', best_rung: 6, started_at: '2026-10-01T07:00:00.000Z' }, { track_id: 'b', status: 'active', rung: 1, hits: 0, last_done_date: null, last_checked_date: null, best_rung: 1, started_at: 'x' }]
        : null,
    }));
    const store = new SupabaseStore(client);
    const list = await store.listTracks('u1');
    expect(list[0]).toEqual(track);
    expect(list[1]).toMatchObject({ trackId: 'b', lastDoneDate: null, lastCheckedDate: null });

    await store.saveTrack('u1', track);
    const up = log.find((l) => l.calls.some(([m]) => m === 'upsert'))!;
    const [row, opts] = up.calls.find(([m]) => m === 'upsert')![1] as [Record<string, unknown>, { onConflict: string }];
    expect(up.table).toBe('tracks');
    expect(row).toEqual({ profile_id: 'u1', track_id: 'musculation-x', status: 'paused', rung: 4, hits: 2, last_done_date: '2026-10-08', last_checked_date: '2026-10-09', best_rung: 6, started_at: '2026-10-01T07:00:00.000Z' });
    expect(opts.onConflict).toBe('profile_id,track_id');

    await store.deleteTrack('u1', 'musculation-x');
    const del = log.filter((l) => l.calls.some(([m]) => m === 'delete')).pop()!;
    expect(del.calls.filter(([m]) => m === 'eq').map(([, a]) => a)).toEqual([['profile_id', 'u1'], ['track_id', 'musculation-x']]);
  });

  it('propage les erreurs de la base', async () => {
    const { client } = fakeClient(() => ({ error: { message: 'boom' } }));
    const store = new SupabaseStore(client);
    await expect(store.listTracks('u1')).rejects.toThrow('tracks.select: boom');
    await expect(store.saveTrack('u1', track)).rejects.toThrow('tracks.upsert: boom');
    await expect(store.deleteTrack('u1', 'x')).rejects.toThrow('tracks.delete: boom');
  });
});

describe('SupabaseStore : gabarits et instances de parcours', () => {
  it('lit les gabarits par pages (plus de 1000 lignes) avec track_id / rung', async () => {
    const row = (i: number, trackId: string | null) => ({
      id: `t${i}`, source: 'catalog', owner_id: null, ability: 'FOR', difficulty: 'easy', periods: ['daily'], title: 't', flavor: '', objective: '', tips: [], validation: { type: 'simple' }, tags: [], is_active: true,
      theme: null, secondary: [], track_id: trackId, rung: trackId ? i : null,
    });
    let page = 0;
    const { client, log } = fakeClient((table) => {
      if (table !== 'quest_templates') return {};
      page++;
      return { data: page === 1 ? Array.from({ length: 1000 }, (_, i) => row(i, null)) : [row(2000, 'p-x')] };
    });
    const out = await new SupabaseStore(client).listTemplates('u1');
    expect(out).toHaveLength(1001);
    expect(out[1000]).toMatchObject({ id: 't2000', trackId: 'p-x', rung: 2000 });
    expect(out[0]).not.toHaveProperty('trackId');
    const ranges = log.map((l) => l.calls.find(([m]) => m === 'range')![1]);
    expect(ranges).toEqual([[0, 999], [1000, 1999]]);
  });

  it('écrit et relit track_id / rung sur les instances', async () => {
    const inst: QuestInstance = {
      id: 'i1', templateId: 'p-x-r02', snapshot: { ability: 'FOR', difficulty: 'easy', title: 't', flavor: '', objective: '', tips: [], validation: { type: 'simple' }, tags: [] },
      period: 'daily', periodStart: '2026-10-05', periodEnd: '2026-10-05', status: 'proposed', progress: 0, xpAwarded: 0, inspirationUsed: false,
      free: false, run: 1, origin: 'track', trackId: 'p-x', rung: 2, acceptedAt: null, completedAt: null,
    };
    const { client, log } = fakeClient((table) => (table === 'quest_instances' ? { data: [{ id: 'i1', template_id: 'p-x-r02', snapshot: inst.snapshot, period: 'daily', period_start: '2026-10-05', period_end: '2026-10-05', status: 'proposed', progress: 0, steps_done: null, xp_awarded: 0, inspiration_used: false, is_free: false, run: 1, origin: 'track', accepted_at: null, completed_at: null, track_id: 'p-x', rung: 2 }] } : {}));
    const store = new SupabaseStore(client);
    await store.insertInstances('u1', [inst, { ...inst, id: 'i2', templateId: 'other', origin: 'draw', trackId: undefined, rung: undefined }]);
    const rows = log[0].calls.find(([m]) => m === 'upsert')![1][0] as Record<string, unknown>[];
    expect(rows[0]).toMatchObject({ origin: 'track', track_id: 'p-x', rung: 2 });
    expect(rows[1]).toMatchObject({ origin: 'draw', track_id: null, rung: null });
    const back = await store.listInstances('u1', { period: 'daily' });
    expect(back[0]).toMatchObject({ origin: 'track', trackId: 'p-x', rung: 2, free: false });
  });
});
