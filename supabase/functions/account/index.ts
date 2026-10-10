// deno-lint-ignore-file no-explicit-any
// Edge Function `account` : export RGPD (portabilité) et suppression de compte.
import { createClient } from 'npm:@supabase/supabase-js@2';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });

async function listFiles(admin: any, folder: string): Promise<string[]> {
  const out: string[] = [];
  const { data } = await admin.storage.from('post-media').list(folder, { limit: 1000 });
  for (const f of data ?? []) out.push(`${folder}/${f.name}`);
  return out;
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  const url = Deno.env.get('SUPABASE_URL')!;
  const authHeader = req.headers.get('Authorization') ?? '';
  const userClient = createClient(url, Deno.env.get('SUPABASE_ANON_KEY')!, { global: { headers: { Authorization: authHeader } }, auth: { persistSession: false } });
  const admin = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } });
  const { data: u, error } = await userClient.auth.getUser();
  if (error || !u?.user) return json({ ok: false, error: 'unauthorized' }, 401);
  const userId = u.user.id;
  const { action, confirm } = await req.json().catch(() => ({}));

  try {
    if (action === 'export') {
      const sel = async (table: string, col = 'profile_id') => (await admin.from(table).select('*').eq(col, userId)).data ?? [];
      const files = await listFiles(admin, userId);
      const photos: { path: string; url: string | null }[] = [];
      for (const path of files) {
        const { data } = await admin.storage.from('post-media').createSignedUrl(path, 3600);
        photos.push({ path, url: data?.signedUrl ?? null });
      }
      return json({
        ok: true,
        exportedAt: new Date().toISOString(),
        account: { id: userId, email: u.user.email },
        profile: await sel('profiles', 'id'),
        character: await sel('characters'),
        settings: await sel('settings'),
        quests: await sel('quest_instances'),
        tracks: await sel('tracks'),
        customQuests: (await admin.from('quest_templates').select('*').eq('owner_id', userId)).data ?? [],
        preferences: await sel('quest_preferences'),
        xpEvents: await sel('xp_events'),
        achievements: await sel('unlocked_achievements'),
        journal: await sel('journal_entries'),
        restDays: await sel('rest_days'),
        posts: await sel('posts', 'author_id'),
        comments: await sel('comments', 'author_id'),
        reactions: await sel('reactions'),
        friendships: (await admin.from('friendships').select('*').or(`requester_id.eq.${userId},addressee_id.eq.${userId}`)).data ?? [],
        blocks: await sel('blocks', 'blocker_id'),
        photos,
      });
    }

    if (action === 'delete') {
      if (confirm !== true) return json({ ok: false, error: 'invalid', message: 'Confirmation requise.' }, 400);
      // Les photos sont retirées immédiatement (RG-26) ; le reste par la fonction SQL, puis purge à 30 jours.
      const files = await listFiles(admin, userId);
      if (files.length) await admin.storage.from('post-media').remove(files);
      const { error: e } = await userClient.rpc('request_account_deletion');
      if (e) throw e;
      return json({ ok: true });
    }
    return json({ ok: false, error: 'invalid' }, 400);
  } catch (e) {
    console.error(e);
    return json({ ok: false, error: 'server', message: String((e as Error).message ?? e) }, 500);
  }
});
