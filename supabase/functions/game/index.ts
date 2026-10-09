// deno-lint-ignore-file no-explicit-any
// Edge Function `game` : toute la logique de jeu officielle (le serveur fait foi).
// Le moteur est le même code que celui de l'app (packages/engine, empaqueté dans ../_shared/engine.mjs).
import { createClient } from 'npm:@supabase/supabase-js@2';
// @ts-ignore — module généré par scripts/build-server-engine.mjs
import * as engine from '../_shared/engine.mjs';


const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-cron-secret',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json({ ok: false, error: 'method' }, 405);

  const url = Deno.env.get('SUPABASE_URL')!;
  const anon = Deno.env.get('SUPABASE_ANON_KEY')!;
  const service = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const admin = createClient(url, service, { auth: { persistSession: false } });
  const ctx = { store: new engine.SupabaseStore(admin), now: () => Date.now(), uuid: () => crypto.randomUUID() };

  let body: any;
  try {
    body = await req.json();
  } catch {
    return json({ ok: false, error: 'invalid' }, 400);
  }
  const { action, ...p } = body;

  // Tirage planifié pour tous les joueurs (appelé par pg_cron toutes les 15 minutes).
  if (action === 'draw-all') {
    if (req.headers.get('x-cron-secret') !== Deno.env.get('CRON_SECRET')) return json({ ok: false, error: 'forbidden' }, 403);
    const { data: chars } = await admin.from('characters').select('profile_id');
    let drawn = 0;
    for (const c of chars ?? []) {
      try {
        const r = await engine.ensureQuests(ctx, c.profile_id);
        drawn += r.created.length;
      } catch (e) {
        console.error('draw-all', c.profile_id, e);
      }
    }
    return json({ ok: true, drawn });
  }

  // Identification de l'utilisateur à partir de son jeton.
  const authHeader = req.headers.get('Authorization') ?? '';
  const userClient = createClient(url, anon, { global: { headers: { Authorization: authHeader } }, auth: { persistSession: false } });
  const { data: userData, error: authErr } = await userClient.auth.getUser();
  if (authErr || !userData?.user) return json({ ok: false, error: 'unauthorized' }, 401);
  const userId = userData.user.id;

  try {
    switch (action) {
      case 'ensure':
        return json({ ok: true, ...(await engine.ensureQuests(ctx, userId)) });
      case 'create-character':
        return json(await engine.createCharacter(ctx, userId, p));
      case 'accept':
        return json(await engine.acceptQuest(ctx, userId, p.instanceId));
      case 'abandon':
        return json(await engine.abandonQuest(ctx, userId, p.instanceId));
      case 'progress':
        return json(await engine.updateProgress(ctx, userId, p.instanceId, { progress: p.progress, stepsDone: p.stepsDone }));
      case 'start':
        return json(await engine.startQuest(ctx, userId, { templateId: p.templateId, period: p.period }));
      case 'redo':
        return json(await engine.redoQuest(ctx, userId, p.instanceId));
      case 'reroll':
        return json(await engine.rerollQuest(ctx, userId, p.instanceId));
      case 'tune':
        return json(await engine.tuneQuest(ctx, userId, p.instanceId, p.direction === 'harder' ? 'harder' : 'easier'));
      case 'complete':
        return json(await engine.completeQuestAction(ctx, userId, p));
      case 'undo':
        return json(await engine.undoQuest(ctx, userId, p.instanceId));
      case 'choose-path':
        return json(await engine.choosePath(ctx, userId, p.pathId));
      case 'choose-improvement':
        return json(await engine.chooseImprovement(ctx, userId, p.choice));
      case 'declare-rest':
        return json(await engine.declareRest(ctx, userId));
      case 'equip-title':
        return json(await engine.equipTitle(ctx, userId, p.title ?? null));
      case 'achievements':
        return json({ ok: true, progress: await engine.achievementProgress(ctx, userId) });
      case 'recompute': {
        const character = await engine.recomputeCharacter(ctx, userId);
        return json({ ok: true, character });
      }
      case 'reset-adventure': {
        // « Recommencer une nouvelle aventure » : remet le personnage à zéro, garde le compte et les compagnons.
        const tables = ['posts', 'journal_entries', 'rest_days', 'unlocked_achievements', 'xp_events', 'quest_preferences', 'quest_instances', 'characters'];
        for (const t of tables) {
          const col = t === 'posts' ? 'author_id' : 'profile_id';
          const { error } = await admin.from(t).delete().eq(col, userId);
          if (error) throw error;
        }
        await admin.from('settings').update({ oath: '', last_recap_week: null, last_recap_month: null }).eq('profile_id', userId);
        return json({ ok: true });
      }
      default:
        return json({ ok: false, error: 'invalid', message: `Action inconnue : ${action}` }, 400);
    }
  } catch (e) {
    console.error(action, e);
    return json({ ok: false, error: 'server', message: String((e as Error).message ?? e) }, 500);
  }
});
