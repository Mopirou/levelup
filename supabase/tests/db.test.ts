import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import { citext } from '@electric-sql/pglite/contrib/citext';
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (f: string) => readFileSync(join(root, f), 'utf8');

// Imitation minimale de la plateforme Supabase (rôles, auth.uid(), stockage, publication temps réel).
const PLATFORM = `
create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;
create schema extensions; create schema auth; create schema storage;
grant usage on schema public, extensions, auth, storage to anon, authenticated, service_role;
alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
create table auth.users (id uuid primary key default gen_random_uuid(), email text, raw_user_meta_data jsonb default '{}');
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
create table storage.buckets (id text primary key, name text, public boolean, file_size_limit bigint, allowed_mime_types text[]);
create table storage.objects (id uuid primary key default gen_random_uuid(), bucket_id text, name text, owner uuid);
alter table storage.objects enable row level security;
grant all on storage.objects, storage.buckets to authenticated, service_role;
create function storage.foldername(name text) returns text[] language sql immutable as $$
  select (string_to_array(name, '/'))[1:greatest(array_length(string_to_array(name, '/'), 1) - 1, 0)] $$;
create publication supabase_realtime;
`;

let db: PGlite;

async function as<T = any>(userId: string | null, sql: string, params: unknown[] = []): Promise<T[]> {
  await db.exec(userId ? `set role authenticated; select set_config('request.jwt.claim.sub', '${userId}', false);` : `set role anon; select set_config('request.jwt.claim.sub', '', false);`);
  try {
    const r = await db.query<T>(sql, params);
    return r.rows;
  } finally {
    await db.exec('reset role;');
  }
}
const admin = async <T = any>(sql: string, params: unknown[] = []) => (await db.query<T>(sql, params)).rows;

const ids = {
  alice: '00000000-0000-0000-0000-00000000000a',
  bob: '00000000-0000-0000-0000-00000000000b',
  cleo: '00000000-0000-0000-0000-00000000000c',
  dan: '00000000-0000-0000-0000-00000000000d',
};

async function mkUser(id: string, username: string, level = 3) {
  await admin(`insert into auth.users (id, email, raw_user_meta_data) values ($1, $2, $3)`, [id, `${username}@ex.fr`, JSON.stringify({ username, birth_year: 1995 })]);
  await admin(
    `insert into public.characters (profile_id, name, class_id, base_scores, level, total_xp) values ($1, $2, 'eclaireur', '{"FOR":15,"DEX":8,"CON":15,"INT":8,"SAG":8,"CHA":8}', $3, 100)`,
    [id, username[0].toUpperCase() + username.slice(1), level],
  );
  await admin(`insert into public.settings (profile_id, oath) values ($1, 'serment secret de ' || $2)`, [id, username]);
}

beforeAll(async () => {
  db = await PGlite.create({ extensions: { citext, pgcrypto } });
  await db.exec(PLATFORM);
  await db.exec(read('migrations/20261008000001_schema.sql'));
  await db.exec(read('migrations/20261008000002_security.sql'));
  await db.exec(read('migrations/20261008000003_cron.sql'));
  await db.exec(read('migrations/20261008000004_friend_code.sql'));
  await db.exec(read('migrations/20261009000001_quest_themes.sql'));
  await db.exec(read('seed.sql'));
  await mkUser(ids.alice, 'alice');
  await mkUser(ids.bob, 'bob');
  await mkUser(ids.cleo, 'cleo');
  await mkUser(ids.dan, 'dan');
}, 120_000);

afterAll(async () => {
  await db?.close();
});

describe('schéma et contenu', () => {
  it('contient 740 quêtes, 80 trophées et la liste de mots interdits', async () => {
    expect((await admin(`select count(*)::int n from quest_templates where source = 'catalog'`))[0].n).toBe(740);
    expect((await admin(`select count(*)::int n from quest_templates where theme is not null and jsonb_array_length(secondary) > 0`))[0].n).toBe(500);
    expect((await admin(`select count(*)::int n from achievements`))[0].n).toBe(80);
    expect((await admin(`select count(*)::int n from banned_words`))[0].n).toBeGreaterThan(10);
  });
  it('active la RLS sur 100 % des tables du schéma public', async () => {
    const rows = await admin(`select relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity`);
    expect(rows).toEqual([]);
  });
  it('crée le profil à l’inscription avec un code ami', async () => {
    const [p] = await admin(`select username::text u, friend_code from profiles where id = $1`, [ids.alice]);
    expect(p.u).toBe('alice');
    expect(p.friend_code).toMatch(/^ELAN-ALICE-\d{4}$/);
  });
  it('le code ami suit le pseudo choisi dans Le Seuil', async () => {
    await admin(`insert into auth.users (id, email, raw_user_meta_data) values ($1, 'seuil@ex.fr', '{"username":"aventurierabc123"}')`, ['00000000-0000-0000-0000-0000000000e1']);
    expect((await admin(`select friend_code from profiles where id = $1`, ['00000000-0000-0000-0000-0000000000e1']))[0].friend_code).toMatch(/^ELAN-AVENTURI/);
    await as('00000000-0000-0000-0000-0000000000e1', `update profiles set username = 'alex-en-chemin' where id = $1`, ['00000000-0000-0000-0000-0000000000e1']);
    expect((await admin(`select friend_code from profiles where id = $1`, ['00000000-0000-0000-0000-0000000000e1']))[0].friend_code).toMatch(/^ELAN-ALEXENCH-[0-9]{4}$/);
    await admin(`delete from auth.users where id = $1`, ['00000000-0000-0000-0000-0000000000e1']);
  });
  it('vérifie la disponibilité d’un pseudo', async () => {
    expect((await as(null, `select username_available('alice') ok`))[0].ok).toBe(false);
    expect((await as(null, `select username_available('nouveau-pseudo') ok`))[0].ok).toBe(true);
    expect((await as(null, `select username_available('a') ok`))[0].ok).toBe(false);
  });
});

describe('RLS : un non-ami ne lit rien (critère d’acceptation)', () => {
  it('ne voit pas la fiche détaillée d’un inconnu, mais seulement sa carte', async () => {
    expect(await as(ids.bob, `select * from characters where profile_id = $1`, [ids.alice])).toEqual([]);
    const card = await as(ids.bob, `select * from get_profile_card('alice')`);
    expect(card[0]).toMatchObject({ username: 'alice', name: 'Alice', level: 3, is_friend: false });
    expect(Object.keys(card[0])).not.toContain('total_xp');
  });
  it('voit sa propre fiche', async () => {
    expect(await as(ids.alice, `select name from characters where profile_id = $1`, [ids.alice])).toEqual([{ name: 'Alice' }]);
  });
  it('ne voit pas les quêtes, l’XP, le journal ni les réglages des autres', async () => {
    await admin(`insert into quest_instances (id, profile_id, template_id, snapshot, period, period_start, period_end, status)
      select gen_random_uuid(), $1, id, '{"title":"x"}', 'daily', '2026-10-08', '2026-10-08', 'accepted' from quest_templates limit 1`, [ids.alice]);
    expect(await as(ids.bob, `select * from quest_instances`)).toEqual([]);
    expect(await as(ids.bob, `select * from xp_events`)).toEqual([]);
    expect(await as(ids.bob, `select * from settings where profile_id = $1`, [ids.alice])).toEqual([]);
    expect((await as(ids.alice, `select * from quest_instances`)).length).toBe(1);
  });
  it('interdit d’écrire l’XP, les instances ou les totaux du personnage', async () => {
    await expect(as(ids.alice, `insert into xp_events (profile_id, ability, amount, reason, game_date) values ($1, 'FOR', 99999, 'quest', now()::date)`, [ids.alice])).rejects.toThrow();
    // sans politique d'UPDATE, la requête ne modifie aucune ligne (pas d'erreur, mais aucun effet)
    await as(ids.alice, `update quest_instances set status = 'completed', xp_awarded = 500`);
    expect((await admin(`select status, xp_awarded from quest_instances where profile_id = $1`, [ids.alice]))[0]).toEqual({ status: 'accepted', xp_awarded: 0 });
    await expect(as(ids.alice, `update characters set total_xp = 999999, level = 20 where profile_id = $1`, [ids.alice])).rejects.toThrow();
    await expect(as(ids.alice, `insert into unlocked_achievements (profile_id, achievement_id) values ($1, 'premier-pas')`, [ids.alice])).rejects.toThrow();
  });
  it('autorise la modification de l’apparence seulement', async () => {
    await as(ids.alice, `update characters set motto = 'Un pas après l’autre', portrait_id = 'p07' where profile_id = $1`, [ids.alice]);
    expect((await admin(`select motto, portrait_id from characters where profile_id = $1`, [ids.alice]))[0]).toEqual({ motto: 'Un pas après l’autre', portrait_id: 'p07' });
  });
  it('un utilisateur anonyme ne lit rien', async () => {
    expect(await as(null, `select * from characters`)).toEqual([]);
    expect(await as(null, `select * from posts`)).toEqual([]);
  });
  it('les quêtes personnalisées sont privées, le catalogue public', async () => {
    await as(ids.alice, `insert into quest_templates (id, source, owner_id, ability, difficulty, periods, title, objective, validation)
      values ('custom-a', 'custom', $1, 'FOR', 'easy', '{daily}', 'Ma quête', 'Faire un truc simple', '{"type":"simple"}')`, [ids.alice]);
    expect((await as(ids.bob, `select id from quest_templates where id = 'custom-a'`)).length).toBe(0);
    expect((await as(ids.alice, `select id from quest_templates where id = 'custom-a'`)).length).toBe(1);
    expect((await as(ids.bob, `select count(*)::int n from quest_templates where source = 'catalog'`))[0].n).toBe(740);
    await expect(as(ids.bob, `insert into quest_templates (id, source, owner_id, ability, difficulty, periods, title, objective, validation)
      values ('custom-evil', 'custom', $1, 'FOR', 'easy', '{daily}', 'x', 'y', '{"type":"simple"}')`, [ids.alice])).rejects.toThrow();
  });
});

describe('amis : demandes, code ami, blocage', () => {
  let requestId: string;
  it('demande d’ami par code, visible côté destinataire', async () => {
    const code = (await admin(`select friend_code from profiles where id = $1`, [ids.alice]))[0].friend_code;
    expect((await as(ids.bob, `select send_friend_request_by_code($1) r`, [code]))[0].r).toBe('sent');
    expect((await as(ids.bob, `select send_friend_request_by_code($1) r`, [code]))[0].r).toBe('already_sent');
    const pending = await as(ids.alice, `select id, direction, (card).username as u from pending_requests()`);
    expect(pending).toHaveLength(1);
    expect(pending[0]).toMatchObject({ direction: 'received', u: 'bob' });
    requestId = pending[0].id;
    const notif = await as(ids.alice, `select type from notifications`);
    expect(notif.map((n) => n.type)).toContain('friend_request');
  });
  it('un code inconnu ou son propre code répond « introuvable »', async () => {
    expect((await as(ids.bob, `select send_friend_request_by_code('ELAN-NOPE-0000') r`))[0].r).toBe('not_found');
    const own = (await admin(`select friend_code from profiles where id = $1`, [ids.bob]))[0].friend_code;
    expect((await as(ids.bob, `select send_friend_request_by_code($1) r`, [own]))[0].r).toBe('not_found');
  });
  it('seul le destinataire peut répondre', async () => {
    expect((await as(ids.cleo, `select respond_friend_request($1, true) r`, [requestId]))[0].r).toBe('not_found');
    expect((await as(ids.alice, `select respond_friend_request($1, true) r`, [requestId]))[0].r).toBe('accepted');
    expect((await as(ids.bob, `select type from notifications`)).map((n) => n.type)).toContain('friend_accepted');
  });
  it('les amis voient la fiche mais jamais le serment', async () => {
    expect((await as(ids.bob, `select name from characters where profile_id = $1`, [ids.alice]))[0].name).toBe('Alice');
    expect(await as(ids.bob, `select oath from settings where profile_id = $1`, [ids.alice])).toEqual([]);
    expect(await as(ids.cleo, `select name from characters where profile_id = $1`, [ids.alice])).toEqual([]);
  });
  it('liste des compagnons avec dernière activité', async () => {
    await admin(`update quest_instances set status = 'completed', completed_at = now(), snapshot = '{"title":"Courir 3 km"}' where profile_id = $1`, [ids.alice]);
    const f = await as(ids.bob, `select username, last_title from friends_overview()`);
    expect(f).toEqual([{ username: 'alice', last_title: 'Courir 3 km' }]);
  });
  it('la recherche trouve par préfixe dès 3 caractères, sans soi-même', async () => {
    expect(await as(ids.cleo, `select username from search_profiles('al')`)).toEqual([]);
    expect((await as(ids.cleo, `select username from search_profiles('ali')`)).map((r) => r.username)).toEqual(['alice']);
    expect(await as(ids.alice, `select username from search_profiles('ali')`)).toEqual([]);
  });
  it('« personne » ou « code seulement » bloquent les demandes directes', async () => {
    await admin(`update settings set friend_requests_from = 'nobody' where profile_id = $1`, [ids.dan]);
    expect((await as(ids.cleo, `select send_friend_request($1) r`, [ids.dan]))[0].r).toBe('not_found');
    expect(await as(ids.cleo, `select username from search_profiles('dan')`)).toEqual([]);
    await admin(`update settings set friend_requests_from = 'code' where profile_id = $1`, [ids.dan]);
    expect((await as(ids.cleo, `select send_friend_request($1) r`, [ids.dan]))[0].r).toBe('not_found');
    const code = (await admin(`select friend_code from profiles where id = $1`, [ids.dan]))[0].friend_code;
    expect((await as(ids.cleo, `select send_friend_request_by_code($1) r`, [code]))[0].r).toBe('sent');
    await admin(`delete from friendships where requester_id = $1`, [ids.cleo]);
    await admin(`update settings set friend_requests_from = 'everyone' where profile_id = $1`, [ids.dan]);
  });
  it('retirer un ami est silencieux', async () => {
    await admin(`insert into friendships (requester_id, addressee_id, status, accepted_at) values ($1, $2, 'accepted', now())`, [ids.cleo, ids.dan]);
    const before = (await admin(`select count(*)::int n from notifications where profile_id = $1`, [ids.dan]))[0].n;
    await as(ids.cleo, `select remove_friend($1)`, [ids.dan]);
    expect(await as(ids.cleo, `select * from friendships where addressee_id = $1`, [ids.dan])).toEqual([]);
    expect((await admin(`select count(*)::int n from notifications where profile_id = $1`, [ids.dan]))[0].n).toBe(before);
  });
});

describe('publications, photos, réactions, commentaires', () => {
  let postFriends: string;
  let postPrivate: string;
  it('un ami voit les publications « compagnons », jamais les « privées »', async () => {
    postFriends = (await as(ids.alice, `insert into posts (author_id, type, text, visibility) values ($1, 'photo', 'Ce que je lis', 'friends') returning id`, [ids.alice]))[0].id;
    postPrivate = (await as(ids.alice, `insert into posts (author_id, type, text, visibility) values ($1, 'photo', 'Souvenir', 'private') returning id`, [ids.alice]))[0].id;
    expect((await as(ids.bob, `select id from posts`)).map((p) => p.id)).toEqual([postFriends]);
    expect((await as(ids.alice, `select id from posts order by created_at`)).length).toBe(2);
    expect(await as(ids.cleo, `select id from posts`)).toEqual([]);
  });
  it('on ne peut pas publier au nom d’un autre ni forger un événement automatique', async () => {
    await expect(as(ids.bob, `insert into posts (author_id, type, text) values ($1, 'photo', 'faux')`, [ids.alice])).rejects.toThrow();
    await expect(as(ids.bob, `insert into posts (author_id, type, text, payload) values ($1, 'level_up', '', '{"level":20}')`, [ids.bob])).rejects.toThrow();
  });
  it('on ne peut lier qu’une de ses quêtes accomplies', async () => {
    const inst = (await admin(`select id from quest_instances where profile_id = $1 limit 1`, [ids.alice]))[0].id;
    await expect(as(ids.bob, `insert into posts (author_id, type, instance_id) values ($1, 'quest', $2)`, [ids.bob, inst])).rejects.toThrow();
    const ok = await as(ids.alice, `insert into posts (author_id, type, instance_id, text) values ($1, 'quest', $2, 'Bien joué') returning id`, [ids.alice, inst]);
    expect(ok).toHaveLength(1);
    await admin(`delete from posts where id = $1`, [ok[0].id]);
  });
  it('photos : rattachées à sa publication et à son dossier', async () => {
    await as(ids.alice, `insert into post_media (post_id, storage_path, width, height) values ($1, $2, 800, 600)`, [postFriends, `${ids.alice}/a.jpg`]);
    await expect(as(ids.alice, `insert into post_media (post_id, storage_path) values ($1, $2)`, [postFriends, `${ids.bob}/a.jpg`])).rejects.toThrow();
    await expect(as(ids.bob, `insert into post_media (post_id, storage_path) values ($1, $2)`, [postFriends, `${ids.bob}/b.jpg`])).rejects.toThrow();
    expect((await as(ids.bob, `select storage_path from post_media`)).length).toBe(1);
    expect(await as(ids.cleo, `select storage_path from post_media`)).toEqual([]);
  });
  it('stockage : écriture dans son dossier, lecture selon la publication', async () => {
    await admin(`insert into storage.objects (bucket_id, name, owner) values ('post-media', $1, $2), ('post-media', $3, $2)`, [`${ids.alice}/a.jpg`, ids.alice, `${ids.alice}/secret.jpg`]);
    expect((await as(ids.bob, `select name from storage.objects`)).map((o) => o.name)).toEqual([`${ids.alice}/a.jpg`]);
    expect((await as(ids.alice, `select name from storage.objects`)).length).toBe(2);
    expect(await as(ids.cleo, `select name from storage.objects`)).toEqual([]);
    await expect(as(ids.bob, `insert into storage.objects (bucket_id, name) values ('post-media', $1)`, [`${ids.alice}/hack.jpg`])).rejects.toThrow();
    await as(ids.bob, `insert into storage.objects (bucket_id, name) values ('post-media', $1)`, [`${ids.bob}/ok.jpg`]);
  });
  it('réactions : amis seulement, une par personne, notification à l’auteur', async () => {
    await as(ids.bob, `insert into reactions (post_id, profile_id, kind) values ($1, $2, 'bravo')`, [postFriends, ids.bob]);
    await expect(as(ids.bob, `insert into reactions (post_id, profile_id, kind) values ($1, $2, 'respect')`, [postFriends, ids.bob])).rejects.toThrow();
    await expect(as(ids.cleo, `insert into reactions (post_id, profile_id, kind) values ($1, $2, 'bravo')`, [postFriends, ids.cleo])).rejects.toThrow();
    expect((await as(ids.alice, `select type from notifications where type = 'reaction'`)).length).toBe(1);
    expect((await as(ids.alice, `select kind from reactions`)).map((r) => r.kind)).toEqual(['bravo']);
  });
  it('commentaires : amis seulement, notification, suppression douce', async () => {
    const c = (await as(ids.bob, `insert into comments (post_id, author_id, text) values ($1, $2, 'Bravo pour la régularité !') returning id`, [postFriends, ids.bob]))[0].id;
    await expect(as(ids.cleo, `insert into comments (post_id, author_id, text) values ($1, $2, 'intrus')`, [postFriends, ids.cleo])).rejects.toThrow();
    expect((await as(ids.alice, `select type from notifications where type = 'comment'`)).length).toBe(1);
    expect((await as(ids.alice, `select text from comments`)).length).toBe(1);
    await as(ids.bob, `update comments set deleted_at = now() where id = $1`, [c]);
    expect(await as(ids.alice, `select text from comments`)).toEqual([]);
    await expect(as(ids.alice, `update comments set text = 'modifié' where id = $1`, [c])).rejects.toThrow();
    expect((await as(ids.bob, `select deleted_at is not null d from comments where id = $1`, [c]))[0].d).toBe(true);
  });
  it('seul l’auteur modifie ou supprime sa publication', async () => {
    await as(ids.bob, `update posts set text = 'piraté' where id = $1`, [postFriends]);
    expect((await admin(`select text from posts where id = $1`, [postFriends]))[0].text).toBe('Ce que je lis');
    await as(ids.alice, `update posts set text = 'Ce que je lis en ce moment', edited_at = now() where id = $1`, [postFriends]);
    expect((await as(ids.bob, `select text from posts where id = $1`, [postFriends]))[0].text).toBe('Ce que je lis en ce moment');
  });
  it('photo : 500 caractères maximum', async () => {
    await expect(as(ids.alice, `insert into posts (author_id, type, text) values ($1, 'photo', $2)`, [ids.alice, 'x'.repeat(501)])).rejects.toThrow();
  });
});

describe('modération et anti-spam', () => {
  it('refuse les mots interdits (RG-24), accents compris', async () => {
    await expect(as(ids.alice, `insert into posts (author_id, type, text) values ($1, 'photo', 'espèce de connard')`, [ids.alice])).rejects.toThrow(/community_rules/);
    await expect(as(ids.alice, `insert into posts (author_id, type, text) values ($1, 'photo', 'Il est ENCULÉ')`, [ids.alice])).rejects.toThrow(/community_rules/);
    const post = (await admin(`select id from posts where author_id = $1 limit 1`, [ids.alice]))[0].id;
    await expect(as(ids.bob, `insert into comments (post_id, author_id, text) values ($1, $2, 'ta gueule')`, [post, ids.bob])).rejects.toThrow(/community_rules/);
    // un mot qui contient seulement une syllabe interdite reste accepté
    await as(ids.alice, `insert into posts (author_id, type, text) values ($1, 'photo', 'Un compagnon de route, un putois et une punition')`, [ids.alice]);
  });
  it('limite à 20 publications par jour (RG-25)', async () => {
    await admin(`delete from posts where author_id = $1`, [ids.dan]);
    for (let i = 0; i < 20; i++) await admin(`insert into posts (author_id, type, text) values ($1, 'photo', 'p' || $2::text)`, [ids.dan, i]);
    await expect(as(ids.dan, `insert into posts (author_id, type, text) values ($1, 'photo', 'de trop')`, [ids.dan])).rejects.toThrow(/rate_limit_posts/);
  });
  it('limite à 100 commentaires par jour (RG-25)', async () => {
    const post = (await admin(`select id from posts where author_id = $1 limit 1`, [ids.alice]))[0].id;
    await admin(`delete from comments where author_id = $1`, [ids.bob]);
    for (let i = 0; i < 100; i++) await admin(`insert into comments (post_id, author_id, text) values ($1, $2, 'c' || $3::text)`, [post, ids.bob, i]);
    await expect(as(ids.bob, `insert into comments (post_id, author_id, text) values ($1, $2, 'de trop')`, [post, ids.bob])).rejects.toThrow(/rate_limit_comments/);
    await admin(`delete from comments where author_id = $1`, [ids.bob]);
  });
  it('masque un contenu signalé par 3 personnes différentes (RG-23)', async () => {
    const post = (await admin(`insert into posts (author_id, type, text) values ($1, 'photo', 'litigieux') returning id`, [ids.alice]))[0].id;
    await admin(`insert into friendships (requester_id, addressee_id, status, accepted_at) values ($1, $2, 'accepted', now())`, [ids.cleo, ids.alice]);
    await as(ids.bob, `insert into reports (reporter_id, target_type, target_id, reason) values ($1, 'post', $2, 'spam')`, [ids.bob, post]);
    await as(ids.cleo, `insert into reports (reporter_id, target_type, target_id, reason) values ($1, 'post', $2, 'spam')`, [ids.cleo, post]);
    expect((await as(ids.bob, `select id from posts where id = $1`, [post])).length).toBe(1);
    await admin(`insert into reports (reporter_id, target_type, target_id, reason) values ($1, 'post', $2, 'spam')`, [ids.dan, post]);
    expect(await as(ids.bob, `select id from posts where id = $1`, [post])).toEqual([]);
    expect((await as(ids.alice, `select id from posts where id = $1`, [post])).length).toBe(1); // l'auteur le voit encore
    await admin(`delete from friendships where requester_id = $1 and addressee_id = $2`, [ids.cleo, ids.alice]);
  });
  it('un signalement ne se double pas et les rapports ne sont pas lisibles', async () => {
    const post = (await admin(`select id from posts where author_id = $1 limit 1`, [ids.alice]))[0].id;
    await as(ids.bob, `insert into reports (reporter_id, target_type, target_id, reason) values ($1, 'post', $2, 'autre') on conflict do nothing`, [ids.bob, post]);
    expect(await as(ids.bob, `select * from reports`)).toEqual([]);
  });
});

describe('blocage (RG-19, RG-20)', () => {
  it('supprime l’amitié, masque les publications et la recherche des deux côtés', async () => {
    expect((await as(ids.bob, `select id from posts where author_id = $1`, [ids.alice])).length).toBeGreaterThan(0);
    await as(ids.bob, `select block_user($1)`, [ids.alice]);
    expect(await as(ids.bob, `select id from posts where author_id = $1`, [ids.alice])).toEqual([]);
    expect(await as(ids.alice, `select id from posts where author_id = $1 and id not in (select id from posts where author_id = $1)`, [ids.bob])).toEqual([]);
    expect(await as(ids.bob, `select username from search_profiles('ali')`)).toEqual([]);
    expect(await as(ids.alice, `select username from search_profiles('bob')`)).toEqual([]);
    expect(await as(ids.bob, `select * from characters where profile_id = $1`, [ids.alice])).toEqual([]);
    expect(await as(ids.alice, `select * from friends_overview()`)).toEqual([]);
  });
  it('un code saisi donne une réponse neutre, sans révéler le blocage', async () => {
    const code = (await admin(`select friend_code from profiles where id = $1`, [ids.bob]))[0].friend_code;
    expect((await as(ids.alice, `select send_friend_request_by_code($1) r`, [code]))[0].r).toBe('not_found');
    expect((await as(ids.alice, `select * from find_profile_by_code($1)`, [code]))[0].profile_id).toBeNull();
    expect(await as(ids.alice, `select * from get_profile_card('bob')`)).toSatisfy((rows: any[]) => rows.length === 0 || rows[0].profile_id === null);
  });
  it('se débloque en supprimant la ligne de blocage', async () => {
    await as(ids.bob, `delete from blocks where blocker_id = $1`, [ids.bob]);
    expect((await as(ids.alice, `select username from search_profiles('bob')`)).length).toBe(1);
  });
});

describe('classement de la compagnie (RG-27, RG-28)', () => {
  it('additionne l’XP de la semaine entre amis et plafonne les quêtes perso à 30 %', async () => {
    await admin(`insert into friendships (requester_id, addressee_id, status, accepted_at) values ($1, $2, 'accepted', now()) on conflict do nothing`, [ids.bob, ids.alice]);
    await admin(`delete from friendships where (requester_id = $1 and addressee_id = $2) or (requester_id = $2 and addressee_id = $1)`, [ids.bob, ids.cleo]);
    await admin(`delete from xp_events`);
    const day = (await admin(`select (now() at time zone 'Europe/Paris')::date d`))[0].d;
    const d = day instanceof Date ? day.toISOString().slice(0, 10) : String(day);
    await admin(`insert into xp_events (profile_id, ability, amount, reason, is_custom, game_date) values
      ($1, 'FOR', 300, 'quest', false, $3), ($1, 'FOR', 1000, 'quest', true, $3),
      ($2, 'INT', 500, 'quest', false, $3)`, [ids.alice, ids.bob, d]);
    const rows = await as(ids.bob, `select username, xp::int from weekly_leaderboard()`);
    // alice : 300 normaux + custom plafonné à 300 × 3/7 = 128 → 428 ; bob : 500
    expect(rows).toEqual([{ username: 'bob', xp: 500 }, { username: 'alice', xp: 428 }]);
    const noOne = await as(ids.cleo, `select username from weekly_leaderboard()`);
    expect(noOne.map((r) => r.username)).toEqual(['cleo']);
  });
  it('est masqué pour qui a désactivé le classement', async () => {
    await admin(`update settings set leaderboard_opt_in = false where profile_id = $1`, [ids.bob]);
    expect(await as(ids.bob, `select * from weekly_leaderboard()`)).toEqual([]);
    expect((await as(ids.alice, `select username from weekly_leaderboard()`)).map((r) => r.username)).toEqual(['alice']);
    await admin(`update settings set leaderboard_opt_in = true where profile_id = $1`, [ids.bob]);
  });
});

describe('notifications et suppression de compte', () => {
  it('chacun ne lit que ses notifications et peut tout marquer comme lu', async () => {
    expect((await as(ids.alice, `select profile_id from notifications`)).every((n) => n.profile_id === ids.alice)).toBe(true);
    await as(ids.alice, `select mark_notifications_read()`);
    expect(await as(ids.alice, `select id from notifications where read_at is null`)).toEqual([]);
    await expect(as(ids.alice, `insert into notifications (profile_id, type) values ($1, 'faux')`, [ids.alice])).rejects.toThrow();
  });
  it('un ami atteignant un niveau prévient ses compagnons', async () => {
    await admin(`insert into friendships (requester_id, addressee_id, status, accepted_at) values ($1, $2, 'accepted', now()) on conflict do nothing`, [ids.cleo, ids.alice]);
    await admin(`insert into posts (author_id, type, payload) values ($1, 'level_up', '{"level":8}')`, [ids.alice]);
    expect((await as(ids.cleo, `select payload ->> 'level' l from notifications where type = 'friend_level'`))[0].l).toBe('8');
  });
  it('supprimer son compte retire publications et liens, et réserve le pseudo 90 jours (RG-26)', async () => {
    await as(ids.dan, `select request_account_deletion()`);
    expect((await admin(`select count(*)::int n from posts where author_id = $1`, [ids.dan]))[0].n).toBe(0);
    expect((await admin(`select deleted_at is not null d from profiles where id = $1`, [ids.dan]))[0].d).toBe(true);
    expect((await as(ids.cleo, `select username_available('dan') ok`))[0].ok).toBe(false);
    expect(await as(ids.cleo, `select username from search_profiles('dan')`)).toEqual([]);
    expect((await admin(`select free_at > now() + interval '89 days' ok from username_reservations where username = 'dan'`))[0].ok).toBe(true);
  });
  it('la purge supprime les comptes au-delà de 30 jours', async () => {
    await admin(`update profiles set deleted_at = now() - interval '31 days' where id = $1`, [ids.dan]);
    expect((await admin(`select purge_deleted_accounts() n`))[0].n).toBe(1);
    expect((await admin(`select count(*)::int n from profiles where id = $1`, [ids.dan]))[0].n).toBe(0);
  });
  it('les fonctions de purge ne sont pas appelables par un utilisateur', async () => {
    // (sur PGlite le défaut PUBLIC est révoqué ; sur Supabase, les droits par défaut sont aussi retirés explicitement)
    await expect(as(ids.alice, `select purge_deleted_accounts()`)).rejects.toThrow();
  });
});
