// deno-lint-ignore-file no-explicit-any
// Edge Function `push` : envoie une notification push (FCM / APNs via FCM) quand une ligne est créée dans `notifications`.
// À brancher avec un Database Webhook (table notifications, évènement INSERT) pointant vers cette fonction.
// Secrets requis : FCM_SERVICE_ACCOUNT (JSON du compte de service Firebase) et PUSH_WEBHOOK_SECRET.
// Sans ces secrets, la fonction ne fait rien (l'app reste utilisable : les notifications sont aussi dans « Le Corbeau »).
import { createClient } from 'npm:@supabase/supabase-js@2';

const encoder = new TextEncoder();
const b64url = (buf: ArrayBuffer | string) => {
  const bytes = typeof buf === 'string' ? encoder.encode(buf) : new Uint8Array(buf);
  let s = '';
  bytes.forEach((b) => (s += String.fromCharCode(b)));
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};

async function accessToken(sa: any): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const header = b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const claim = b64url(JSON.stringify({
    iss: sa.client_email, scope: 'https://www.googleapis.com/auth/firebase.messaging', aud: 'https://oauth2.googleapis.com/token', iat: now, exp: now + 3600,
  }));
  const pem = sa.private_key.replace(/-----[^-]+-----/g, '').replace(/\s/g, '');
  const der = Uint8Array.from(atob(pem), (c) => c.charCodeAt(0));
  const key = await crypto.subtle.importKey('pkcs8', der, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, encoder.encode(`${header}.${claim}`));
  const jwt = `${header}.${claim}.${b64url(sig)}`;
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: jwt }),
  });
  const j = await res.json();
  if (!j.access_token) throw new Error('FCM auth: ' + JSON.stringify(j));
  return j.access_token;
}

const REACTION: Record<string, string> = { bravo: 'Bravo, aventurier', inspirant: 'Inspirant', respect: 'Respect', rire: 'Rire' };

function message(n: any): { title: string; body: string; pref: string } | null {
  const who = n.payload?.username ?? 'Un compagnon';
  switch (n.type) {
    case 'friend_request': return { title: 'On frappe à la porte', body: `${who} souhaite rejoindre ta compagnie.`, pref: 'friendRequests' };
    case 'friend_accepted': return { title: 'Nouveau compagnon', body: `${who} a accepté ta demande.`, pref: 'friendRequests' };
    case 'reaction': return { title: 'Un encouragement', body: `${who} : « ${REACTION[n.payload?.kind] ?? 'Bravo'} ».`, pref: 'reactions' };
    case 'comment': return { title: 'Un commentaire', body: `${who} a commenté ta publication.`, pref: 'comments' };
    case 'friend_level': return { title: 'Une montée en niveau', body: `${who} atteint le niveau ${n.payload?.level}.`, pref: 'reactions' };
    default: return null;
  }
}

Deno.serve(async (req: Request) => {
  const secret = Deno.env.get('PUSH_WEBHOOK_SECRET');
  const saRaw = Deno.env.get('FCM_SERVICE_ACCOUNT');
  if (!saRaw || !secret) return new Response(JSON.stringify({ ok: true, skipped: 'push non configuré' }), { status: 200 });
  if (req.headers.get('x-webhook-secret') !== secret) return new Response('forbidden', { status: 403 });

  const payload = await req.json().catch(() => null);
  const n = payload?.record;
  if (!n) return new Response(JSON.stringify({ ok: true }), { status: 200 });
  const msg = message(n);
  if (!msg) return new Response(JSON.stringify({ ok: true }), { status: 200 });

  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } });
  const { data: s } = await admin.from('settings').select('notif_prefs').eq('profile_id', n.profile_id).maybeSingle();
  if (s?.notif_prefs && s.notif_prefs[msg.pref] === false) return new Response(JSON.stringify({ ok: true, skipped: 'préférence' }), { status: 200 });

  const { data: tokens } = await admin.from('device_tokens').select('token').eq('profile_id', n.profile_id);
  if (!tokens?.length) return new Response(JSON.stringify({ ok: true, skipped: 'aucun appareil' }), { status: 200 });

  const sa = JSON.parse(saRaw);
  const token = await accessToken(sa);
  const results = await Promise.all(
    tokens.map(async (t: any) => {
      const res = await fetch(`https://fcm.googleapis.com/v1/projects/${sa.project_id}/messages:send`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: { token: t.token, notification: { title: msg.title, body: msg.body }, data: { type: n.type, id: String(n.id) } } }),
      });
      if (res.status === 404 || res.status === 400) await admin.from('device_tokens').delete().eq('token', t.token);
      return res.status;
    }),
  );
  return new Response(JSON.stringify({ ok: true, sent: results }), { status: 200 });
});
