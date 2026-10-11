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
  await db.exec(read('migrations/20261009000002_interests_and_tuning.sql'));
  await db.exec(read('migrations/20261009000003_rescale_base_scores.sql'));
  await db.exec(read('migrations/20261010000001_quest_runs.sql'));
  await db.exec(read('migrations/20261011000001_tracks.sql'));
  await db.exec(read('migrations/20261011000002_free_quest_default.sql'));
  await db.exec(read('migrations/20261012000001_adventure.sql'));
  await db.exec(read('migrations/20261013000001_raids.sql'));
  await db.exec(read('migrations/20261014000001_seasons.sql'));
  await db.exec(read('migrations/20261015000001_daily_chest.sql'));
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
  it('contient 764 quêtes (hors échelons), 98 trophées et la liste de mots interdits', async () => {
    // les gabarits d'échelon des parcours (track_id renseigné) s'ajoutent aux 764 quêtes du catalogue libre
    expect((await admin(`select count(*)::int n from quest_templates where source = 'catalog' and track_id is null`))[0].n).toBe(764);
    expect((await admin(`select count(*)::int n from quest_templates where track_id is null and theme is not null and jsonb_array_length(secondary) > 0`))[0].n).toBe(524);
    expect((await admin(`select count(*)::int n from achievements`))[0].n).toBe(98);
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
    expect((await as(ids.bob, `select count(*)::int n from quest_templates where source = 'catalog' and track_id is null`))[0].n).toBe(764);
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

describe('migration des scores de départ (échelle 8-15 → 2-5)', () => {
  const legacy = '00000000-0000-0000-0000-0000000000e1';
  const current = '00000000-0000-0000-0000-0000000000e2';
  const scoresOf = async (id: string) => (await admin(`select base_scores s from public.characters where profile_id = $1`, [id]))[0].s;

  it('ramène un ancien personnage à 2-5 en gardant ses proportions, sans toucher aux nouveaux', async () => {
    await mkUser(legacy, 'legacy');
    await mkUser(current, 'current');
    await admin(`update public.characters set base_scores = '{"FOR":13,"DEX":13,"CON":13,"INT":12,"SAG":12,"CHA":12}' where profile_id = $1`, [legacy]);
    await admin(`update public.characters set base_scores = '{"FOR":5,"DEX":2,"CON":5,"INT":2,"SAG":2,"CHA":2}' where profile_id = $1`, [current]);

    await db.exec(read('migrations/20261009000003_rescale_base_scores.sql'));
    expect(await scoresOf(legacy)).toEqual({ FOR: 3, DEX: 3, CON: 3, INT: 3, SAG: 3, CHA: 3 });
    expect(await scoresOf(current)).toEqual({ FOR: 5, DEX: 2, CON: 5, INT: 2, SAG: 2, CHA: 2 });
    // les personnages créés avec l'ancienne répartition de test (15/8) passent aussi à l'échelle 2-5
    expect(await scoresOf(ids.alice)).toEqual({ FOR: 4, DEX: 2, CON: 4, INT: 2, SAG: 2, CHA: 2 });

    // rejouer la migration ne change plus rien
    await db.exec(read('migrations/20261009000003_rescale_base_scores.sql'));
    expect(await scoresOf(legacy)).toEqual({ FOR: 3, DEX: 3, CON: 3, INT: 3, SAG: 3, CHA: 3 });
    expect(await scoresOf(ids.alice)).toEqual({ FOR: 4, DEX: 2, CON: 4, INT: 2, SAG: 2, CHA: 2 });
  });
});

describe('parcours de discipline (tracks)', () => {
  const trackId = 'testeur-parcours-fictif';
  const tplId = `${trackId}-r01`;
  const insertTemplate = (id: string, track: string | null, rung: number | null, source = 'catalog') =>
    admin(
      `insert into quest_templates (id, source, ability, difficulty, periods, title, objective, validation, track_id, rung)
       values ($1, $4, 'FOR', 'easy', '{daily}', 'Pompes', 'Faire des pompes', '{"type":"simple"}', $2, $3)`,
      [id, track, rung, source],
    );
  const insertInstance = (day: string, origin: string, track: string | null, rung: number | null) =>
    admin(
      `insert into quest_instances (profile_id, template_id, snapshot, period, period_start, period_end, status, origin, track_id, rung)
       values ($1, $2, '{"title":"Pompes"}', 'daily', $3, $3, 'proposed', $4, $5, $6)`,
      [ids.alice, tplId, day, origin, track, rung],
    );

  it('crée la table avec les colonnes prévues et la RLS activée', async () => {
    const cols = await admin(`select column_name, is_nullable from information_schema.columns
      where table_schema = 'public' and table_name = 'tracks' order by ordinal_position`);
    expect(cols.map((c) => c.column_name)).toEqual(['profile_id', 'track_id', 'status', 'rung', 'hits', 'last_done_date', 'last_checked_date', 'best_rung', 'started_at']);
    expect(cols.filter((c) => c.is_nullable === 'YES').map((c) => c.column_name)).toEqual(['last_done_date', 'last_checked_date']);
    expect((await admin(`select relrowsecurity r from pg_class where oid = 'public.tracks'::regclass`))[0].r).toBe(true);
  });

  it('applique les valeurs par défaut et les contraintes', async () => {
    await admin(`insert into tracks (profile_id, track_id) values ($1, $2)`, [ids.alice, trackId]);
    const [t] = await admin(`select status, rung, hits, best_rung, started_at is not null s from tracks where profile_id = $1`, [ids.alice]);
    expect(t).toEqual({ status: 'active', rung: 1, hits: 0, best_rung: 1, s: true });
    await expect(admin(`insert into tracks (profile_id, track_id) values ($1, $2)`, [ids.alice, trackId])).rejects.toThrow(); // clé (profil, parcours)
    await expect(admin(`insert into tracks (profile_id, track_id, status) values ($1, 'x', 'stopped')`, [ids.alice])).rejects.toThrow();
    await expect(admin(`insert into tracks (profile_id, track_id, rung) values ($1, 'x', 0)`, [ids.alice])).rejects.toThrow();
    await expect(admin(`insert into tracks (profile_id, track_id, hits) values ($1, 'x', -1)`, [ids.alice])).rejects.toThrow();
    await expect(admin(`insert into tracks (profile_id, track_id, best_rung) values ($1, 'x', 0)`, [ids.alice])).rejects.toThrow();
    await expect(admin(`insert into tracks (profile_id, track_id) values ('00000000-0000-0000-0000-0000000000ff', 'x')`)).rejects.toThrow(); // profil inconnu
  });

  it('seul le propriétaire lit ses parcours (même pas un ami, même pas un anonyme)', async () => {
    await admin(`insert into tracks (profile_id, track_id, status, rung) values ($1, 'danse-salsa', 'paused', 4)`, [ids.bob]);
    expect((await as(ids.alice, `select track_id from tracks order by track_id`)).map((r) => r.track_id)).toEqual([trackId]);
    expect(await as(ids.bob, `select track_id, rung from tracks`)).toEqual([{ track_id: 'danse-salsa', rung: 4 }]);
    // alice et bob sont amis à ce stade : leurs parcours restent privés
    expect((await admin(`select public.is_friend($1, $2) f`, [ids.alice, ids.bob]))[0].f).toBe(true);
    expect(await as(ids.bob, `select * from tracks where profile_id = $1`, [ids.alice])).toEqual([]);
    expect(await as(ids.cleo, `select * from tracks`)).toEqual([]);
    expect(await as(null, `select * from tracks`)).toEqual([]);
  });

  it('un client ne peut ni créer, ni modifier, ni supprimer un parcours (écriture réservée au serveur)', async () => {
    await expect(as(ids.cleo, `insert into tracks (profile_id, track_id) values ($1, 'forge')`, [ids.cleo])).rejects.toThrow();
    await expect(as(ids.alice, `update tracks set rung = 10, best_rung = 10 where profile_id = $1`, [ids.alice])).rejects.toThrow();
    await expect(as(ids.alice, `delete from tracks where profile_id = $1`, [ids.alice])).rejects.toThrow();
    await expect(as(ids.bob, `update tracks set rung = 10 where profile_id = $1`, [ids.alice])).rejects.toThrow();
    expect((await admin(`select rung, best_rung from tracks where profile_id = $1`, [ids.alice]))[0]).toEqual({ rung: 1, best_rung: 1 });
  });

  it('ajoute track_id et rung aux gabarits et aux instances', async () => {
    for (const table of ['quest_templates', 'quest_instances']) {
      const cols = await admin(
        `select column_name n, data_type t, is_nullable nl from information_schema.columns
         where table_schema = 'public' and table_name = $1 and column_name in ('track_id', 'rung') order by 1`,
        [table],
      );
      expect(cols).toEqual([{ n: 'rung', t: 'integer', nl: 'YES' }, { n: 'track_id', t: 'text', nl: 'YES' }]);
    }
  });

  it('un gabarit d’échelon est du catalogue, lisible par tous les authentifiés, unique par (parcours, échelon)', async () => {
    await insertTemplate(tplId, trackId, 1);
    expect(await as(ids.cleo, `select id, track_id, rung from quest_templates where id = $1`, [tplId])).toEqual([{ id: tplId, track_id: trackId, rung: 1 }]);
    expect((await as(ids.bob, `select count(*)::int n from quest_templates where track_id = $1`, [trackId]))[0].n).toBe(1);
    await expect(insertTemplate(`${trackId}-bis`, trackId, 1)).rejects.toThrow(); // doublon (parcours, échelon)
    await insertTemplate(`${trackId}-r02`, trackId, 2);
    await expect(insertTemplate('sans-rung', trackId, null)).rejects.toThrow(); // parcours sans échelon
    await expect(insertTemplate('sans-track', null, 3)).rejects.toThrow(); // échelon sans parcours
    await expect(insertTemplate('rung-zero', trackId, 0)).rejects.toThrow();
  });

  it('un joueur ne peut pas rattacher une quête personnalisée à un parcours', async () => {
    await expect(
      as(ids.cleo, `insert into quest_templates (id, source, owner_id, ability, difficulty, periods, title, objective, validation, track_id, rung)
        values ('custom-track', 'custom', $1, 'FOR', 'easy', '{daily}', 'x', 'y', '{"type":"simple"}', $2, 7)`, [ids.cleo, trackId]),
    ).rejects.toThrow();
    await as(ids.cleo, `insert into quest_templates (id, source, owner_id, ability, difficulty, periods, title, objective, validation)
      values ('custom-cleo', 'custom', $1, 'FOR', 'easy', '{daily}', 'x', 'y', '{"type":"simple"}')`, [ids.cleo]);
    await expect(as(ids.cleo, `update quest_templates set track_id = 'forge', rung = 1 where id = 'custom-cleo'`)).rejects.toThrow();
  });

  it('accepte origin = track avec parcours et échelon, et rejette une origine inconnue', async () => {
    await insertInstance('2026-10-11', 'track', trackId, 1);
    expect(await as(ids.alice, `select origin, track_id, rung, run from quest_instances where origin = 'track'`)).toEqual([{ origin: 'track', track_id: trackId, rung: 1, run: 1 }]);
    expect(await as(ids.bob, `select * from quest_instances where origin = 'track'`)).toEqual([]);
    await expect(insertInstance('2026-10-12', 'inconnue', null, null)).rejects.toThrow();
    // les trois autres origines existantes restent valides
    await insertInstance('2026-10-13', 'draw', null, null);
    await insertInstance('2026-10-14', 'chosen', null, null);
    await insertInstance('2026-10-15', 'redo', null, null);
    // l'index unique des tirages est conservé : même gabarit, même jour, même passage = refusé
    await expect(insertInstance('2026-10-11', 'track', trackId, 1)).rejects.toThrow();
  });

  it('la migration est rejouable sans perdre de données ni de contraintes', async () => {
    const counts = async () => ({
      tracks: (await admin(`select count(*)::int n from tracks`))[0].n,
      templates: (await admin(`select count(*)::int n from quest_templates where track_id = '${trackId}'`))[0].n,
      instances: (await admin(`select count(*)::int n from quest_instances where origin = 'track'`))[0].n,
    });
    const before = await counts();
    expect(before).toEqual({ tracks: 2, templates: 2, instances: 1 });
    await db.exec(read('migrations/20261011000001_tracks.sql'));
    await db.exec(read('migrations/20261011000001_tracks.sql'));
    expect(await counts()).toEqual(before);
    expect((await admin(`select count(*)::int n from pg_policies where tablename = 'tracks'`))[0].n).toBe(1);
    await expect(admin(`insert into tracks (profile_id, track_id, rung) values ($1, 'x', 0)`, [ids.alice])).rejects.toThrow();
    await expect(as(ids.alice, `delete from tracks`)).rejects.toThrow();
    await expect(insertInstance('2026-10-16', 'inconnue', null, null)).rejects.toThrow();
  });

  it('les parcours disparaissent avec le compte (cascade à la purge)', async () => {
    const gone = '00000000-0000-0000-0000-0000000000e9';
    await mkUser(gone, 'partant');
    await admin(`insert into tracks (profile_id, track_id) values ($1, 'cuisine-pates')`, [gone]);
    await admin(`update profiles set deleted_at = now() - interval '31 days' where id = $1`, [gone]);
    expect((await admin(`select purge_deleted_accounts() n`))[0].n).toBe(1);
    expect((await admin(`select count(*)::int n from tracks where profile_id = $1`, [gone]))[0].n).toBe(0);
    expect((await admin(`select count(*)::int n from tracks`))[0].n).toBe(2); // ceux d'alice et de bob restent
  });
});

describe('suggestions « Pour aller plus loin » par jour (daily_quest_count)', () => {
  const file = 'migrations/20261011000002_free_quest_default.sql';
  const legacy = '00000000-0000-0000-0000-0000000000f1';
  const custom = '00000000-0000-0000-0000-0000000000f2';
  const count = async (id: string) => (await admin(`select daily_quest_count n from settings where profile_id = $1`, [id]))[0].n;

  it('le défaut de la colonne est 2 et la contrainte 0 à 6 est conservée', async () => {
    expect((await admin(`select column_default d from information_schema.columns where table_schema = 'public' and table_name = 'settings' and column_name = 'daily_quest_count'`))[0].d).toBe('2');
    await admin(`insert into auth.users (id, email) values ($1, 'neuf@ex.fr')`, ['00000000-0000-0000-0000-0000000000f0']);
    await admin(`insert into settings (profile_id) values ($1)`, ['00000000-0000-0000-0000-0000000000f0']);
    expect(await count('00000000-0000-0000-0000-0000000000f0')).toBe(2);
    await expect(admin(`update settings set daily_quest_count = 7 where profile_id = $1`, ['00000000-0000-0000-0000-0000000000f0'])).rejects.toThrow();
    await expect(admin(`update settings set daily_quest_count = -1 where profile_id = $1`, ['00000000-0000-0000-0000-0000000000f0'])).rejects.toThrow();
    await admin(`update settings set daily_quest_count = 0 where profile_id = $1`, ['00000000-0000-0000-0000-0000000000f0']);
    await admin(`update settings set daily_quest_count = 6 where profile_id = $1`, ['00000000-0000-0000-0000-0000000000f0']);
  });

  it('ramène à 2 les anciens réglages à 6, sans toucher aux valeurs choisies, et se rejoue sans effet', async () => {
    await mkUser(legacy, 'ancien');
    await mkUser(custom, 'choisi');
    await admin(`update settings set daily_quest_count = 6 where profile_id = $1`, [legacy]);
    await admin(`update settings set daily_quest_count = 4 where profile_id = $1`, [custom]);
    await db.exec(read(file));
    expect(await count(legacy)).toBe(2);
    expect(await count(custom)).toBe(4);
    // rejouée, la migration laisse les autres valeurs intactes (le runner ne l'applique de toute façon qu'une fois)
    await db.exec(read(file));
    expect(await count(legacy)).toBe(2);
    expect(await count(custom)).toBe(4);
    expect((await admin(`select column_default d from information_schema.columns where table_schema = 'public' and table_name = 'settings' and column_name = 'daily_quest_count'`))[0].d).toBe('2');
  });
});

describe('aventure : ressources, équipement, coffres, donjons', () => {
  const file = 'migrations/20261012000001_adventure.sql';
  const item = (profile: string, slot: string, equipped: boolean, rarity = 'rare', ability = 'FOR') =>
    admin(`insert into inventory_items (profile_id, template_id, rarity, slot, ability, equipped) values ($1, 'epee-du-sentier', $2, $3, $4, $5)`, [profile, rarity, slot, ability, equipped]);
  const chest = (profile: string, source: string, key: string, rarity = 'bois') =>
    admin(`insert into chests (profile_id, rarity, source, source_key) values ($1, $2, $3, $4)`, [profile, rarity, source, key]);
  const adv = '00000000-0000-0000-0000-0000000000d1';
  const other = '00000000-0000-0000-0000-0000000000d2';
  beforeAll(async () => {
    await mkUser(adv, 'eclaireur-adv');
    await mkUser(other, 'compagnon-adv');
  });

  it('ajoute les ressources au personnage avec des valeurs par défaut sûres', async () => {
    const [c] = await admin(`select gold, fragments, keys, chest_pity, chest_opens_today, chest_opens_date, expedition_started_at is not null as exp from characters where profile_id = $1`, [adv]);
    expect(c).toEqual({ gold: 0, fragments: 0, keys: 0, chest_pity: {}, chest_opens_today: 0, chest_opens_date: null, exp: true });
    await expect(admin(`update characters set gold = -1 where profile_id = $1`, [adv])).rejects.toThrow();
    await expect(admin(`update characters set fragments = -1 where profile_id = $1`, [adv])).rejects.toThrow();
    await expect(admin(`update characters set keys = 4 where profile_id = $1`, [adv])).rejects.toThrow();
    await expect(admin(`update characters set keys = -1 where profile_id = $1`, [adv])).rejects.toThrow();
    await expect(admin(`update characters set chest_opens_today = -1 where profile_id = $1`, [adv])).rejects.toThrow();
    await admin(`update characters set keys = 3, gold = 10, chest_pity = '{"bronze":4,"or:legendaire":2}' where profile_id = $1`, [adv]);
    expect((await admin(`select chest_pity->>'bronze' b from characters where profile_id = $1`, [adv]))[0].b).toBe('4');
    await admin(`update characters set keys = 0, gold = 0, chest_pity = '{}' where profile_id = $1`, [adv]);
  });

  it('objets : raretés, emplacements, caractéristiques et niveaux contrôlés', async () => {
    await expect(item(adv, 'arme', false, 'mythique')).rejects.toThrow();
    await expect(item(adv, 'dos', false)).rejects.toThrow();
    await expect(item(adv, 'arme', false, 'rare', 'LUK')).rejects.toThrow();
    await expect(admin(`insert into inventory_items (profile_id, template_id, rarity, slot, ability, level) values ($1, 'x', 'rare', 'arme', 'FOR', 11)`, [adv])).rejects.toThrow();
    await expect(admin(`insert into inventory_items (profile_id, template_id, rarity, slot, ability, level) values ($1, 'x', 'rare', 'arme', 'FOR', -1)`, [adv])).rejects.toThrow();
    await expect(item('00000000-0000-0000-0000-0000000000ff', 'arme', false)).rejects.toThrow(); // profil inconnu
    await item(adv, 'arme', false);
    const [it] = await admin(`select level, equipped, id is not null as has_id, created_at is not null as has_date from inventory_items where profile_id = $1`, [adv]);
    expect(it).toEqual({ level: 0, equipped: false, has_id: true, has_date: true });
    await admin(`delete from inventory_items where profile_id = $1`, [adv]);
  });

  it('un seul objet équipé par emplacement et par joueur', async () => {
    await item(adv, 'arme', true);
    await expect(item(adv, 'arme', true)).rejects.toThrow(); // second équipé, même emplacement
    await item(adv, 'arme', false); // plusieurs objets non équipés dans l’emplacement : autorisé
    await item(adv, 'arme', false);
    await item(adv, 'tete', true); // un autre emplacement : autorisé
    await item(other, 'arme', true); // un autre joueur : autorisé
    const [spare] = await admin(`select id from inventory_items where profile_id = $1 and slot = 'arme' and not equipped limit 1`, [adv]);
    await expect(admin(`update inventory_items set equipped = true where id = $1`, [spare.id])).rejects.toThrow();
    // remplacement : on retire d’abord l’ancien, puis on équipe le nouveau (ordre suivi par le moteur)
    await admin(`update inventory_items set equipped = false where profile_id = $1 and slot = 'arme'`, [adv]);
    await admin(`update inventory_items set equipped = true where id = $1`, [spare.id]);
    expect((await admin(`select count(*)::int n from inventory_items where profile_id = $1 and slot = 'arme' and equipped`, [adv]))[0].n).toBe(1);
    await admin(`delete from inventory_items where profile_id in ($1, $2)`, [adv, other]);
  });

  it('coffres : idempotence par (joueur, source, clé), sources et raretés contrôlées', async () => {
    await chest(adv, 'quest', '2026-10-12');
    await expect(chest(adv, 'quest', '2026-10-12', 'or')).rejects.toThrow(); // même jour, même source : un seul coffre
    await chest(adv, 'rung', '2026-10-12'); // autre source, même clé
    await chest(adv, 'quest', '2026-10-13'); // autre jour
    await chest(other, 'quest', '2026-10-12'); // autre joueur
    await expect(chest(adv, 'quest', '2026-10-14', 'diamant')).rejects.toThrow();
    await expect(chest(adv, 'cadeau', '1')).rejects.toThrow();
    const [c] = await admin(`select opened_at, instance_id, created_at is not null as has_date from chests where profile_id = $1 and source_key = '2026-10-13'`, [adv]);
    expect(c).toEqual({ opened_at: null, instance_id: null, has_date: true });
    // un coffre ouvert garde sa clé : aucun nouveau coffre pour la même source et la même clé
    await admin(`update chests set opened_at = now() where profile_id = $1 and source_key = '2026-10-13'`, [adv]);
    await expect(chest(adv, 'quest', '2026-10-13')).rejects.toThrow();
    await admin(`delete from chests where profile_id in ($1, $2)`, [adv, other]);
  });

  it('progression des donjons : une ligne par joueur et donjon, bornes de salle', async () => {
    await admin(`insert into dungeon_progress (profile_id, dungeon_id) values ($1, 'dj-yoga')`, [adv]);
    expect((await admin(`select best_room, boss_defeated_tier, last_run_date from dungeon_progress where profile_id = $1`, [adv]))[0]).toEqual({ best_room: 0, boss_defeated_tier: 0, last_run_date: null });
    await expect(admin(`insert into dungeon_progress (profile_id, dungeon_id) values ($1, 'dj-yoga')`, [adv])).rejects.toThrow();
    await expect(admin(`update dungeon_progress set best_room = 7 where profile_id = $1`, [adv])).rejects.toThrow();
    await expect(admin(`update dungeon_progress set best_room = -1 where profile_id = $1`, [adv])).rejects.toThrow();
    await expect(admin(`update dungeon_progress set boss_defeated_tier = -1 where profile_id = $1`, [adv])).rejects.toThrow();
    await admin(`update dungeon_progress set best_room = 6, boss_defeated_tier = 1 where profile_id = $1`, [adv]);
    await admin(`delete from dungeon_progress where profile_id = $1`, [adv]);
  });

  it('RLS : chacun lit ses lignes seulement ; aucune écriture côté client', async () => {
    await item(ids.alice, 'arme', true);
    await chest(ids.alice, 'quest', 'rls');
    await admin(`insert into dungeon_progress (profile_id, dungeon_id, best_room) values ($1, 'dj-yoga', 3)`, [ids.alice]);
    for (const t of ['inventory_items', 'chests', 'dungeon_progress']) {
      expect((await admin(`select relrowsecurity r from pg_class where oid = 'public.${t}'::regclass`))[0].r).toBe(true);
      expect((await as(ids.alice, `select * from ${t}`)).length).toBe(1);
      expect(await as(ids.bob, `select * from ${t}`)).toEqual([]);
      expect(await as(ids.bob, `select * from ${t} where profile_id = $1`, [ids.alice])).toEqual([]);
      expect(await as(null, `select * from ${t}`)).toEqual([]);
      await expect(as(ids.alice, `delete from ${t}`)).rejects.toThrow();
    }
    await expect(as(ids.alice, `insert into inventory_items (profile_id, template_id, rarity, slot, ability) values ($1, 'x', 'legendaire', 'arme', 'FOR')`, [ids.alice])).rejects.toThrow();
    await expect(as(ids.alice, `update inventory_items set level = 10, rarity = 'legendaire' where profile_id = $1`, [ids.alice])).rejects.toThrow();
    await expect(as(ids.alice, `insert into chests (profile_id, rarity, source, source_key) values ($1, 'mythique', 'quest', 'triche')`, [ids.alice])).rejects.toThrow();
    await expect(as(ids.alice, `update chests set opened_at = null where profile_id = $1`, [ids.alice])).rejects.toThrow();
    await expect(as(ids.alice, `insert into dungeon_progress (profile_id, dungeon_id, best_room) values ($1, 'dj-danse', 6)`, [ids.alice])).rejects.toThrow();
    await expect(as(ids.alice, `update dungeon_progress set best_room = 6 where profile_id = $1`, [ids.alice])).rejects.toThrow();
    await expect(as(null, `insert into chests (profile_id, rarity, source, source_key) values ($1, 'bois', 'quest', 'anon')`, [ids.alice])).rejects.toThrow();
  });

  it('RLS : les ressources du personnage ne sont modifiables que par le serveur', async () => {
    await expect(as(ids.alice, `update characters set gold = 99999 where profile_id = $1`, [ids.alice])).rejects.toThrow();
    await expect(as(ids.alice, `update characters set keys = 3 where profile_id = $1`, [ids.alice])).rejects.toThrow();
    await expect(as(ids.alice, `update characters set fragments = 999, chest_opens_today = 0 where profile_id = $1`, [ids.alice])).rejects.toThrow();
    await expect(as(ids.alice, `update characters set chest_pity = '{"or":99}' where profile_id = $1`, [ids.alice])).rejects.toThrow();
    // l’apparence reste modifiable
    await as(ids.alice, `update characters set motto = 'Toujours plus loin' where profile_id = $1`, [ids.alice]);
    expect((await as(ids.alice, `select gold, keys from characters where profile_id = $1`, [ids.alice]))[0]).toEqual({ gold: 0, keys: 0 });
  });

  it('la migration est rejouable sans perdre de données ni de contraintes', async () => {
    const counts = async () => ({
      items: (await admin(`select count(*)::int n from inventory_items`))[0].n,
      chests: (await admin(`select count(*)::int n from chests`))[0].n,
      dungeons: (await admin(`select count(*)::int n from dungeon_progress`))[0].n,
      policies: (await admin(`select count(*)::int n from pg_policies where tablename in ('inventory_items', 'chests', 'dungeon_progress')`))[0].n,
    });
    const before = await counts();
    expect(before).toMatchObject({ items: 1, chests: 1, dungeons: 1, policies: 3 });
    await db.exec(read(file));
    await db.exec(read(file));
    expect(await counts()).toEqual(before);
    await expect(item(ids.alice, 'arme', true)).rejects.toThrow(); // l’index d’unicité est conservé
    await expect(chest(ids.alice, 'quest', 'rls')).rejects.toThrow();
    await expect(as(ids.alice, `delete from chests`)).rejects.toThrow();
    await expect(as(ids.alice, `update characters set gold = 5 where profile_id = $1`, [ids.alice])).rejects.toThrow();
  });

  it('le contenu du joueur disparaît avec le compte (cascade à la purge)', async () => {
    const gone = '00000000-0000-0000-0000-0000000000e8';
    await mkUser(gone, 'aventurier');
    await item(gone, 'arme', true);
    await chest(gone, 'quest', 'purge');
    await admin(`insert into dungeon_progress (profile_id, dungeon_id) values ($1, 'dj-yoga')`, [gone]);
    await admin(`update profiles set deleted_at = now() - interval '31 days' where id = $1`, [gone]);
    expect((await admin(`select purge_deleted_accounts() n`))[0].n).toBe(1);
    for (const t of ['inventory_items', 'chests', 'dungeon_progress']) {
      expect((await admin(`select count(*)::int n from ${t} where profile_id = $1`, [gone]))[0].n).toBe(0);
      expect((await admin(`select count(*)::int n from ${t}`))[0].n).toBe(1); // ceux d’alice restent
    }
  });
});

describe('raids d’amis : équipes, plafond de 6, amis uniquement, RLS', () => {
  const file = 'migrations/20261013000001_raids.sql';
  const R = Array.from({ length: 8 }, (_, i) => `00000000-0000-0000-0000-00001300000${i + 1}`);
  const [r1, r2, r3, r4, r5, r6, r7, r8] = R;
  const MON = '2026-10-12';
  const NEXT_MON = '2026-10-19';
  const befriend = (a: string, b: string) =>
    admin(`insert into friendships (requester_id, addressee_id, status, accepted_at) values ($1, $2, 'accepted', now()) on conflict do nothing`, [a, b]);
  const mkTeam = async (leader: string, week = MON) => {
    const [t] = await admin(`insert into raid_teams (week_start, leader_id) values ($1, $2) returning id`, [week, leader]);
    await admin(`insert into raid_members (team_id, profile_id, week_start, status, invited_by, joined_at) values ($1, $2, $3, 'joined', $2, now())`, [t.id, leader, week]);
    return t.id as string;
  };
  const member = (team: string, profile: string, by: string, status = 'joined', week = MON) =>
    admin(`insert into raid_members (team_id, profile_id, week_start, status, invited_by, joined_at) values ($1, $2, $3, $4, $5, ${status === 'joined' ? 'now()' : 'null'})`, [team, profile, week, status, by]);
  const wipe = async () => {
    await admin(`delete from raid_teams`);
  };

  beforeAll(async () => {
    for (const [i, id] of R.entries()) await mkUser(id, `raider${i + 1}`);
    for (const id of [r2, r3, r4, r5, r6, r7]) await befriend(r1, id);
  });

  it('crée les quatre tables, avec la RLS activée', async () => {
    for (const t of ['raid_teams', 'raid_members', 'raid_damage', 'raid_encouragements']) {
      expect((await admin(`select relrowsecurity r from pg_class where oid = 'public.${t}'::regclass`))[0].r).toBe(true);
    }
    expect((await admin(`select count(*)::int n from pg_policies where tablename like 'raid_%'`))[0].n).toBe(4);
  });

  it('une équipe vit une semaine ISO : le lundi seulement, l’issue est cohérente', async () => {
    await expect(admin(`insert into raid_teams (week_start, leader_id) values ('2026-10-13', $1)`, [r1])).rejects.toThrow(); // un mardi
    const id = await mkTeam(r1);
    await expect(admin(`update raid_teams set resolved_at = now() where id = $1`, [id])).rejects.toThrow(); // clôture sans issue
    await expect(admin(`update raid_teams set outcome = 'victory' where id = $1`, [id])).rejects.toThrow(); // issue sans clôture
    await expect(admin(`update raid_teams set resolved_at = now(), outcome = 'triomphe' where id = $1`, [id])).rejects.toThrow();
    await expect(admin(`update raid_teams set resolved_at = now(), outcome = 'victory', max_hp = 0 where id = $1`, [id])).rejects.toThrow();
    await admin(`update raid_teams set resolved_at = now(), outcome = 'victory', max_hp = 11500, total_damage = 12000, victory_day = '2026-10-13' where id = $1`, [id]);
    await expect(member(id, r2, r1, 'joined', NEXT_MON)).rejects.toThrow(); // la semaine du membre est celle de l'équipe
    await wipe();
  });

  it('seuls les amis du chef peuvent entrer dans l’équipe (invitation comprise)', async () => {
    const id = await mkTeam(r1);
    await expect(member(id, r8, r1, 'invited')).rejects.toThrow(/raid_not_friend/); // inconnu
    await expect(member(id, r8, r1, 'joined')).rejects.toThrow(/raid_not_friend/);
    await member(id, r2, r1, 'invited');
    await admin(`insert into friendships (requester_id, addressee_id, status) values ($1, $2, 'pending')`, [r1, r8]);
    await expect(member(id, r8, r1, 'invited')).rejects.toThrow(/raid_not_friend/); // demande en attente seulement
    await admin(`insert into blocks (blocker_id, blocked_id) values ($1, $2)`, [r3, r1]);
    await expect(member(id, r3, r1, 'invited')).rejects.toThrow(/raid_not_friend/); // ami bloqué
    await admin(`delete from blocks where blocker_id = $1`, [r3]);
    await member(id, r3, r1, 'invited');
    await admin(`delete from friendships where requester_id = $1 and addressee_id = $2`, [r1, r8]);
    await wipe();
  });

  it('6 membres joints au plus', async () => {
    const id = await mkTeam(r1);
    for (const p of [r2, r3, r4, r5, r6]) await member(id, p, r1);
    expect((await admin(`select count(*)::int n from raid_members where team_id = $1 and status = 'joined'`, [id]))[0].n).toBe(6);
    await expect(member(id, r7, r1)).rejects.toThrow(/raid_full/);
    // Les invitations ne comptent pas : on peut inviter, mais pas faire entrer
    await member(id, r7, r1, 'invited');
    await expect(admin(`update raid_members set status = 'joined', joined_at = now() where team_id = $1 and profile_id = $2`, [id, r7])).rejects.toThrow(/raid_full/);
    // Une place se libère : le 7e entre
    await admin(`delete from raid_members where team_id = $1 and profile_id = $2`, [id, r6]);
    await admin(`update raid_members set status = 'joined', joined_at = now() where team_id = $1 and profile_id = $2`, [id, r7]);
    expect((await admin(`select count(*)::int n from raid_members where team_id = $1 and status = 'joined'`, [id]))[0].n).toBe(6);
    await expect(admin(`update raid_members set joined_at = null where team_id = $1 and profile_id = $2`, [id, r7])).rejects.toThrow(); // joint sans date
    await wipe();
  });

  it('un joueur est joint dans une seule équipe par semaine', async () => {
    const a = await mkTeam(r1);
    const b = await mkTeam(r2);
    await member(a, r4, r1);
    await befriend(r2, r4);
    await expect(member(b, r4, r2)).rejects.toThrow(/one_team_per_week/);
    await member(b, r4, r2, 'invited'); // invité dans plusieurs équipes : autorisé
    await expect(admin(`update raid_members set status = 'joined', joined_at = now() where team_id = $1 and profile_id = $2`, [b, r4])).rejects.toThrow(/one_team_per_week/);
    // La semaine suivante, le même joueur peut former une nouvelle équipe
    await mkTeam(r4, NEXT_MON);
    // Un doublon dans la même équipe est refusé
    await expect(member(a, r4, r1)).rejects.toThrow();
    await wipe();
  });

  it('dégâts : un coup par joueur et par jour (toutes équipes), bornes, cascade au départ du membre', async () => {
    const a = await mkTeam(r1);
    await member(a, r2, r1);
    const hit = (team: string, p: string, day: string, dmg = 100, enc = 0) =>
      admin(`insert into raid_damage (team_id, profile_id, game_date, damage, base_damage, encouragements) values ($1, $2, $3, $4, $4, $5)`, [team, p, day, dmg, enc]);
    await hit(a, r1, MON);
    await expect(hit(a, r1, MON)).rejects.toThrow();
    await hit(a, r1, '2026-10-13');
    await hit(a, r2, MON, 250, 2);
    await expect(hit(a, r1, '2026-10-14', -1)).rejects.toThrow();
    await expect(hit(a, r1, '2026-10-14', 10, 6)).rejects.toThrow();
    await expect(hit(a, r3, MON)).rejects.toThrow(); // r3 n'est pas membre
    // r2 part : ses dégâts partent avec lui, et son coup du jour est de nouveau libre dans une autre équipe
    await befriend(r4, r5);
    const b = await mkTeam(r4);
    await admin(`delete from raid_members where team_id = $1 and profile_id = $2`, [a, r2]);
    expect((await admin(`select count(*)::int n from raid_damage where profile_id = $1`, [r2]))[0].n).toBe(0);
    await befriend(r4, r2);
    await member(b, r2, r4);
    await hit(b, r2, MON);
    await expect(hit(b, r2, MON)).rejects.toThrow();
    await wipe();
  });

  it('encouragements : un par ami et par jour, entre membres, pas à soi-même', async () => {
    const a = await mkTeam(r1);
    await member(a, r2, r1);
    const enc = (from: string, to: string, day = MON) => admin(`insert into raid_encouragements (team_id, from_id, to_id, game_date) values ($1, $2, $3, $4)`, [a, from, to, day]);
    await enc(r1, r2);
    await expect(enc(r1, r2)).rejects.toThrow();
    await enc(r2, r1);
    await enc(r1, r2, '2026-10-13');
    await expect(enc(r1, r1)).rejects.toThrow();
    await expect(enc(r1, r3)).rejects.toThrow(); // r3 n'est pas dans l'équipe
    await admin(`delete from raid_members where team_id = $1 and profile_id = $2`, [a, r2]);
    expect((await admin(`select count(*)::int n from raid_encouragements where team_id = $1`, [a]))[0].n).toBe(0);
    await wipe();
  });

  it('RLS : les membres lisent leur équipe ; un invité voit son invitation ; les autres ne voient rien', async () => {
    const a = await mkTeam(r1);
    await member(a, r2, r1);
    await member(a, r3, r1, 'invited');
    await admin(`insert into raid_damage (team_id, profile_id, game_date, damage, base_damage) values ($1, $2, $3, 500, 500)`, [a, r1, MON]);
    await admin(`insert into raid_encouragements (team_id, from_id, to_id, game_date) values ($1, $2, $3, $4)`, [a, r2, r1, MON]);
    // Membre joint : tout
    expect((await as(r2, `select * from raid_teams`)).length).toBe(1);
    expect((await as(r2, `select * from raid_members`)).length).toBe(3);
    expect((await as(r2, `select * from raid_damage`)).length).toBe(1);
    expect((await as(r2, `select * from raid_encouragements`)).length).toBe(1);
    // Invité : l'équipe et sa propre ligne seulement, ni les autres membres, ni les dégâts
    expect((await as(r3, `select * from raid_teams`)).length).toBe(1);
    expect(await as(r3, `select profile_id from raid_members`)).toEqual([{ profile_id: r3 }]);
    expect(await as(r3, `select * from raid_damage`)).toEqual([]);
    expect(await as(r3, `select * from raid_encouragements`)).toEqual([]);
    // Étranger et anonyme : rien
    for (const who of [r8, null]) {
      for (const t of ['raid_teams', 'raid_members', 'raid_damage', 'raid_encouragements']) expect(await as(who, `select * from ${t}`)).toEqual([]);
    }
    await wipe();
  });

  it('RLS : aucune écriture côté client, sur aucune table de raid', async () => {
    const a = await mkTeam(r1);
    await member(a, r2, r1);
    await admin(`insert into raid_damage (team_id, profile_id, game_date, damage, base_damage) values ($1, $2, $3, 500, 500)`, [a, r1, MON]);
    await admin(`insert into raid_encouragements (team_id, from_id, to_id, game_date) values ($1, $2, $3, $4)`, [a, r2, r1, MON]);
    const attempts = [
      `insert into raid_teams (week_start, leader_id) values ('${MON}', '${r1}')`,
      `update raid_teams set max_hp = 1`,
      `delete from raid_teams`,
      `insert into raid_members (team_id, profile_id, week_start, status, invited_by) values ('${a}', '${r4}', '${MON}', 'invited', '${r1}')`,
      `update raid_members set status = 'joined', joined_at = now()`,
      `delete from raid_members`,
      `insert into raid_damage (team_id, profile_id, game_date, damage, base_damage) values ('${a}', '${r2}', '${MON}', 999999, 999999)`,
      `update raid_damage set damage = 999999`,
      `delete from raid_damage`,
      `insert into raid_encouragements (team_id, from_id, to_id, game_date) values ('${a}', '${r1}', '${r2}', '${MON}')`,
      `delete from raid_encouragements`,
    ];
    for (const who of [r1, r2, null]) for (const sql of attempts) await expect(as(who, sql)).rejects.toThrow();
    expect(await admin(`select damage from raid_damage`)).toEqual([{ damage: 500 }]);
    // Les fonctions serveur ne sont pas appelables par un joueur
    await expect(as(r1, `select raid_detach_profile($1)`, [r2])).rejects.toThrow();
    await expect(as(r1, `select notify_user($1, 'raid_invite', '{}')`, [r2])).rejects.toThrow();
    await wipe();
  });

  it('notify_user accepte les types de raid (le serveur seul les crée)', async () => {
    for (const type of ['raid_invite', 'raid_encouraged', 'raid_victory']) {
      await admin(`select notify_user($1, $2, $3::jsonb)`, [r1, type, JSON.stringify({ username: 'x', team: 't' })]);
    }
    const rows = await as(r1, `select type from notifications where type like 'raid_%' order by type`);
    expect(rows.map((n: any) => n.type)).toEqual(['raid_encouraged', 'raid_invite', 'raid_victory']);
    await admin(`delete from notifications where type like 'raid_%'`);
  });

  it('can_view_owner : seul un ami accepté non bloqué est joignable', async () => {
    expect((await admin(`select can_view_owner($1, $2) ok`, [r1, r2]))[0].ok).toBe(true);
    expect((await admin(`select can_view_owner($1, $2) ok`, [r1, r8]))[0].ok).toBe(false);
  });

  it('raid_detach_profile : passe la main au plus ancien membre, supprime les équipes vides et les invitations du chef', async () => {
    const a = await mkTeam(r1);
    await admin(`update raid_members set joined_at = now() - interval '2 days' where team_id = $1 and profile_id = $2`, [a, r1]);
    await member(a, r2, r1);
    await admin(`update raid_members set joined_at = now() - interval '1 day' where team_id = $1 and profile_id = $2`, [a, r2]);
    await member(a, r3, r1);
    await member(a, r4, r1, 'invited');
    await admin(`insert into raid_damage (team_id, profile_id, game_date, damage, base_damage) values ($1, $2, $3, 10, 10)`, [a, r1, MON]);
    await admin(`select raid_detach_profile($1)`, [r1]);
    expect((await admin(`select leader_id from raid_teams where id = $1`, [a]))[0].leader_id).toBe(r2);
    expect((await admin(`select profile_id from raid_members where team_id = $1 order by profile_id`, [a])).map((m: any) => m.profile_id)).toEqual([r2, r3]);
    expect((await admin(`select count(*)::int n from raid_damage where team_id = $1`, [a]))[0].n).toBe(0);
    await admin(`select raid_detach_profile($1)`, [r2]);
    await admin(`select raid_detach_profile($1)`, [r3]);
    expect((await admin(`select count(*)::int n from raid_teams`))[0].n).toBe(0);
    await wipe();
  });

  it('un raid clos garde son historique quand un membre part, mais passe la main du chef', async () => {
    const a = await mkTeam(r1);
    await member(a, r2, r1);
    await admin(`update raid_teams set resolved_at = now(), outcome = 'defeat', max_hp = 11500, total_damage = 10 where id = $1`, [a]);
    await admin(`select raid_detach_profile($1)`, [r1]);
    expect((await admin(`select count(*)::int n from raid_members where team_id = $1`, [a]))[0].n).toBe(2);
    expect((await admin(`select leader_id from raid_teams where id = $1`, [a]))[0].leader_id).toBe(r2);
    await wipe();
  });

  it('la demande de suppression de compte retire le joueur de ses raids en cours', async () => {
    const gone = '00000000-0000-0000-0000-000013000009';
    await mkUser(gone, 'raideur-sorti');
    await befriend(gone, r2);
    const a = await mkTeam(gone);
    await member(a, r2, gone);
    await as(gone, `select request_account_deletion()`);
    expect((await admin(`select leader_id from raid_teams where id = $1`, [a]))[0].leader_id).toBe(r2);
    expect((await admin(`select count(*)::int n from raid_members where team_id = $1 and profile_id = $2`, [a, gone]))[0].n).toBe(0);
    // Purge à 30 jours : plus aucune trace du compte
    await admin(`update profiles set deleted_at = now() - interval '31 days' where id = $1`, [gone]);
    await admin(`select purge_deleted_accounts()`);
    expect((await admin(`select count(*)::int n from raid_members where profile_id = $1`, [gone]))[0].n).toBe(0);
    expect((await admin(`select count(*)::int n from raid_teams where id = $1`, [a]))[0].n).toBe(1);
    await wipe();
  });

  it('la purge d’un chef de raid clos ne détruit pas l’historique des autres', async () => {
    const lead = '00000000-0000-0000-0000-00001300000a';
    await mkUser(lead, 'chef-parti');
    await befriend(lead, r2);
    const a = await mkTeam(lead);
    await member(a, r2, lead);
    await admin(`insert into raid_damage (team_id, profile_id, game_date, damage, base_damage) values ($1, $2, $3, 77, 77)`, [a, r2, MON]);
    await admin(`update raid_teams set resolved_at = now(), outcome = 'defeat', max_hp = 11500, total_damage = 77 where id = $1`, [a]);
    await as(lead, `select request_account_deletion()`); // le chef passe la main à r2
    await admin(`update profiles set deleted_at = now() - interval '31 days' where id = $1`, [lead]);
    await admin(`select purge_deleted_accounts()`);
    expect((await admin(`select leader_id from raid_teams where id = $1`, [a]))[0].leader_id).toBe(r2);
    expect(await admin(`select damage from raid_damage where team_id = $1`, [a])).toEqual([{ damage: 77 }]);
    await wipe();
  });

  it('la migration est rejouable sans perdre de données ni de contraintes', async () => {
    const a = await mkTeam(r1);
    await member(a, r2, r1);
    await admin(`insert into raid_damage (team_id, profile_id, game_date, damage, base_damage) values ($1, $2, $3, 10, 10)`, [a, r1, MON]);
    const counts = async () => ({
      teams: (await admin(`select count(*)::int n from raid_teams`))[0].n,
      members: (await admin(`select count(*)::int n from raid_members`))[0].n,
      damage: (await admin(`select count(*)::int n from raid_damage`))[0].n,
      policies: (await admin(`select count(*)::int n from pg_policies where tablename like 'raid_%'`))[0].n,
      triggers: (await admin(`select count(*)::int n from pg_trigger where tgname = 'raid_members_guard'`))[0].n,
    });
    const before = await counts();
    expect(before).toEqual({ teams: 1, members: 2, damage: 1, policies: 4, triggers: 1 });
    await db.exec(read(file));
    await db.exec(read(file));
    expect(await counts()).toEqual(before);
    await expect(member(a, r8, r1)).rejects.toThrow(/raid_not_friend/); // le garde-fou est conservé
    await expect(as(r1, `delete from raid_members`)).rejects.toThrow();
    await wipe();
  });
});

describe('saisons : classement de puissance entre amis, cadre de portrait, équipement visible', () => {
  const file = 'migrations/20261014000001_seasons.sql';
  const S = Array.from({ length: 5 }, (_, i) => `00000000-0000-0000-0000-00001400000${i + 1}`);
  const [s1, s2, s3, s4, s5] = S;
  const befriend = (a: string, b: string) =>
    admin(`insert into friendships (requester_id, addressee_id, status, accepted_at) values ($1, $2, 'accepted', now()) on conflict do nothing`, [a, b]);
  const score = async (p: string, season: string, power: number, first = '2026-10-05', last = '2026-10-12') => {
    await admin(`select record_season_power($1, $2, $3, $4::date)`, [p, season, power, first]);
    if (last !== first) await admin(`select record_season_power($1, $2, $3, $4::date)`, [p, season, power, last]);
  };
  const wipe = async () => {
    await admin(`delete from season_scores`);
    await admin(`delete from season_results`);
  };

  beforeAll(async () => {
    for (const [i, id] of S.entries()) await mkUser(id, `saisonnier${i + 1}`);
    await befriend(s1, s2);
    await befriend(s1, s3);
    await befriend(s2, s3);
  });

  it('ajoute la puissance et le cadre au personnage, avec des valeurs par défaut sûres et contrôlées', async () => {
    const [c] = await admin(`select power, frame_style from characters where profile_id = $1`, [s1]);
    expect(c).toEqual({ power: 0, frame_style: null });
    await expect(admin(`update characters set power = -1 where profile_id = $1`, [s1])).rejects.toThrow();
    await expect(admin(`update characters set frame_style = 'platine' where profile_id = $1`, [s1])).rejects.toThrow();
    await expect(admin(`update characters set frame_style = 'S1:platine' where profile_id = $1`, [s1])).rejects.toThrow();
    await admin(`update characters set frame_style = 'S1:or', power = 120 where profile_id = $1`, [s1]);
    expect((await admin(`select frame_style from characters where profile_id = $1`, [s1]))[0].frame_style).toBe('S1:or');
    await admin(`update characters set frame_style = null, power = 0 where profile_id = $1`, [s1]);
  });

  it('le coffre de fin de saison a la source « season », unique par saison', async () => {
    await admin(`insert into chests (profile_id, rarity, source, source_key) values ($1, 'or', 'season', 'S1')`, [s1]);
    await expect(admin(`insert into chests (profile_id, rarity, source, source_key) values ($1, 'or', 'season', 'S1')`, [s1])).rejects.toThrow();
    await admin(`insert into chests (profile_id, rarity, source, source_key) values ($1, 'or', 'season', 'S2')`, [s1]);
    await expect(admin(`insert into chests (profile_id, rarity, source, source_key) values ($1, 'or', 'hasard', 'S1')`, [s1])).rejects.toThrow();
    await admin(`delete from chests where profile_id = $1 and source = 'season'`, [s1]);
  });

  it('les tables ont la RLS activée, une lecture propriétaire et aucune écriture client', async () => {
    for (const t of ['season_scores', 'season_results']) {
      expect((await admin(`select relrowsecurity r from pg_class where oid = 'public.${t}'::regclass`))[0].r).toBe(true);
    }
    await score(s1, 'S1', 100);
    await admin(`insert into season_results (profile_id, season_key, rank, participants, power, frame) values ($1, 'S1', 1, 3, 100, 'or')`, [s1]);
    expect(await as(s1, `select season_key from season_scores`)).toEqual([{ season_key: 'S1' }]);
    // un ami ne lit ni la puissance brute ni les résultats d'un autre
    expect(await as(s2, `select * from season_scores`)).toEqual([]);
    expect(await as(s2, `select * from season_results`)).toEqual([]);
    await expect(as(s1, `insert into season_scores (profile_id, season_key, power, first_day, last_day) values ($1, 'S1', 999999, '2026-10-05', '2026-10-05')`, [s1])).rejects.toThrow();
    await expect(as(s1, `update season_scores set power = 999999`)).rejects.toThrow();
    await expect(as(s1, `delete from season_scores`)).rejects.toThrow();
    await expect(as(s1, `insert into season_results (profile_id, season_key, power) values ($1, 'S9', 1)`, [s1])).rejects.toThrow();
    // colonnes réservées au serveur
    await expect(as(s1, `update characters set power = 99999 where profile_id = $1`, [s1])).rejects.toThrow();
    await expect(as(s1, `update characters set frame_style = 'S1:or' where profile_id = $1`, [s1])).rejects.toThrow();
    await wipe();
  });

  it('record_season_power : premier jour conservé, dernier jour et puissance mis à jour, jamais accessible au client', async () => {
    await admin(`select record_season_power($1, 'S1', 50, '2026-10-05'::date)`, [s1]);
    await admin(`select record_season_power($1, 'S1', 80, '2026-10-12'::date)`, [s1]);
    await admin(`select record_season_power($1, 'S1', 70, '2026-10-08'::date)`, [s1]); // date intermédiaire : bornes inchangées
    const [r] = await admin(`select power, first_day::text f, last_day::text l from season_scores where profile_id = $1`, [s1]);
    expect(r).toEqual({ power: 70, f: '2026-10-05', l: '2026-10-12' });
    expect((await admin(`select count(*)::int n from season_scores`))[0].n).toBe(1);
    await expect(admin(`select record_season_power($1, 'saison-un', 5, '2026-10-05'::date)`, [s1])).rejects.toThrow(); // clé invalide
    await expect(as(s1, `select record_season_power($1, 'S1', 999, '2026-10-05'::date)`, [s1])).rejects.toThrow();
    await expect(as(s1, `select season_ranking($1, 'S1')`, [s1])).rejects.toThrow();
    await expect(as(s1, `select * from _season_rows($1, 'S1')`, [s1])).rejects.toThrow();
    await wipe();
  });

  it('season_leaderboard : soi et les amis qui acceptent, par puissance décroissante', async () => {
    await score(s1, 'S1', 100);
    await score(s2, 'S1', 250);
    await score(s3, 'S1', 180);
    await score(s4, 'S1', 999); // inconnu de s1 : n'apparaît pas
    const rows = await as(s1, `select username, power from season_leaderboard('S1')`);
    expect(rows).toEqual([
      { username: 'saisonnier2', power: 250 },
      { username: 'saisonnier3', power: 180 },
      { username: 'saisonnier1', power: 100 },
    ]);
    const full = await as(s1, `select * from season_leaderboard('S1') limit 1`);
    expect(Object.keys(full[0])).toEqual(['profile_id', 'username', 'name', 'level', 'class_id', 'portrait_id', 'frame_color', 'frame_style', 'power']);
    // une autre saison est vide, sauf soi-même (à 0)
    expect(await as(s1, `select username, power from season_leaderboard('S2')`)).toEqual([{ username: 'saisonnier1', power: 0 }]);
  });

  it('season_leaderboard : respecte l’opt-in, le blocage, la suppression de compte et les clés invalides', async () => {
    await admin(`update settings set leaderboard_opt_in = false where profile_id = $1`, [s2]);
    expect((await as(s1, `select username from season_leaderboard('S1')`)).map((r) => r.username)).toEqual(['saisonnier3', 'saisonnier1']);
    expect(await as(s2, `select * from season_leaderboard('S1')`)).toEqual([]); // qui refuse n'en voit aucun
    await admin(`update settings set leaderboard_opt_in = true where profile_id = $1`, [s2]);

    await admin(`insert into blocks (blocker_id, blocked_id) values ($1, $2)`, [s3, s1]);
    expect((await as(s1, `select username from season_leaderboard('S1')`)).map((r) => r.username)).toEqual(['saisonnier2', 'saisonnier1']);
    expect((await as(s3, `select username from season_leaderboard('S1')`)).map((r) => r.username)).toEqual(['saisonnier2', 'saisonnier3']);
    await admin(`delete from blocks`);

    expect(await as(s1, `select * from season_leaderboard('n''importe quoi')`)).toEqual([]);
    expect(await as(s1, `select * from season_leaderboard(null)`)).toEqual([]);
    await expect(as(null, `select * from season_leaderboard('S1')`)).rejects.toThrow(); // réservé aux comptes connectés

    await admin(`update profiles set deleted_at = now() where id = $1`, [s3]);
    expect((await as(s1, `select username from season_leaderboard('S1')`)).map((r) => r.username)).toEqual(['saisonnier2', 'saisonnier1']);
    await admin(`update profiles set deleted_at = null where id = $1`, [s3]);
  });

  it('season_ranking (serveur) : même classement en jsonb pour le joueur désigné', async () => {
    const r = (await admin(`select season_ranking($1, 'S1') r`, [s1]))[0].r as { profile_id: string; power: number }[];
    expect(r.map((x) => [x.profile_id, x.power])).toEqual([[s2, 250], [s3, 180], [s1, 100]]);
    expect((await admin(`select season_ranking($1, 'S7') r`, [s5]))[0].r).toEqual([{ profile_id: s5, power: 0 }]);
    await admin(`update settings set leaderboard_opt_in = false where profile_id = $1`, [s1]);
    expect((await admin(`select season_ranking($1, 'S1') r`, [s1]))[0].r).toEqual([]);
    await admin(`update settings set leaderboard_opt_in = true where profile_id = $1`, [s1]);
  });

  it('résultat de saison : une seule ligne par joueur et par saison (idempotence), cadre contrôlé', async () => {
    await admin(`insert into season_results (profile_id, season_key, rank, participants, power, frame) values ($1, 'S1', 2, 3, 100, 'argent')`, [s1]);
    await expect(admin(`insert into season_results (profile_id, season_key, rank, participants, power, frame) values ($1, 'S1', 1, 3, 100, 'or')`, [s1])).rejects.toThrow();
    await expect(admin(`insert into season_results (profile_id, season_key, rank, participants, power, frame) values ($1, 'S2', 0, 3, 100, 'or')`, [s1])).rejects.toThrow(); // rang >= 1
    await expect(admin(`insert into season_results (profile_id, season_key, rank, participants, power, frame) values ($1, 'S2', 1, 3, 100, 'platine')`, [s1])).rejects.toThrow();
    await admin(`insert into season_results (profile_id, season_key, rank, participants, power, frame) values ($1, 'S2', null, 0, 100, null)`, [s1]); // non classé, sans récompense
    await admin(`delete from season_results`);
  });

  it('get_profile_gear : le joueur et ses amis voient les objets équipés et la puissance, personne d’autre', async () => {
    await admin(`update characters set power = 321, frame_style = 'S1:argent' where profile_id = $1`, [s2]);
    await admin(`insert into inventory_items (profile_id, template_id, rarity, slot, ability, level, equipped) values
      ($1, 'epee-du-sentier', 'epique', 'arme', 'FOR', 3, true),
      ($1, 'casque-de-fer', 'rare', 'tete', 'CON', 0, true),
      ($1, 'hache-du-forgeron', 'legendaire', 'arme', 'FOR', 0, false)`, [s2]);
    const mine = (await as(s2, `select get_profile_gear('saisonnier2') g`))[0].g;
    expect(mine).toEqual({
      power: 321,
      frameStyle: 'S1:argent',
      items: [
        { slot: 'arme', templateId: 'epee-du-sentier', rarity: 'epique', level: 3 },
        { slot: 'tete', templateId: 'casque-de-fer', rarity: 'rare', level: 0 },
      ],
    });
    // un ami voit la même chose ; l'objet du sac (non équipé) reste privé
    expect((await as(s1, `select get_profile_gear('saisonnier2') g`))[0].g).toEqual(mine);
    // un inconnu, un ami bloqué, un profil supprimé ou inexistant : rien
    expect((await as(s4, `select get_profile_gear('saisonnier2') g`))[0].g).toBeNull();
    await admin(`insert into blocks (blocker_id, blocked_id) values ($1, $2)`, [s2, s1]);
    expect((await as(s1, `select get_profile_gear('saisonnier2') g`))[0].g).toBeNull();
    await admin(`delete from blocks`);
    expect((await as(s1, `select get_profile_gear('personne') g`))[0]?.g ?? null).toBeNull();
    await admin(`update profiles set deleted_at = now() where id = $1`, [s2]);
    expect((await as(s1, `select get_profile_gear('saisonnier2') g`))[0]?.g ?? null).toBeNull();
    await admin(`update profiles set deleted_at = null where id = $1`, [s2]);
    await expect(as(null, `select get_profile_gear('saisonnier2')`)).rejects.toThrow();
    await admin(`delete from inventory_items where profile_id = $1`, [s2]);
    expect((await as(s2, `select get_profile_gear('saisonnier2') g`))[0].g.items).toEqual([]);
  });

  it('la suppression de compte retire le joueur du classement, la purge efface ses données de saison', async () => {
    await admin(`insert into season_results (profile_id, season_key, rank, participants, power, frame) values ($1, 'S1', 1, 3, 250, 'or')`, [s2]);
    await as(s2, `select request_account_deletion()`);
    expect((await as(s1, `select username from season_leaderboard('S1')`)).map((r) => r.username)).not.toContain('saisonnier2');
    await admin(`update profiles set deleted_at = now() - interval '31 days' where id = $1`, [s2]);
    await admin(`select purge_deleted_accounts()`);
    expect((await admin(`select count(*)::int n from season_scores where profile_id = $1`, [s2]))[0].n).toBe(0);
    expect((await admin(`select count(*)::int n from season_results where profile_id = $1`, [s2]))[0].n).toBe(0);
  });

  it('la migration est rejouable sans perdre de données ni de contraintes', async () => {
    await wipe();
    await score(s1, 'S1', 100);
    await admin(`insert into season_results (profile_id, season_key, rank, participants, power, frame) values ($1, 'S1', 1, 2, 100, 'or')`, [s1]);
    await admin(`insert into chests (profile_id, rarity, source, source_key) values ($1, 'or', 'season', 'S1')`, [s1]);
    const counts = async () => ({
      scores: (await admin(`select count(*)::int n from season_scores`))[0].n,
      results: (await admin(`select count(*)::int n from season_results`))[0].n,
      policies: (await admin(`select count(*)::int n from pg_policies where tablename like 'season_%'`))[0].n,
      chests: (await admin(`select count(*)::int n from chests where source = 'season'`))[0].n,
    });
    const before = await counts();
    expect(before).toEqual({ scores: 1, results: 1, policies: 2, chests: 1 });
    await db.exec(read(file));
    await db.exec(read(file));
    expect(await counts()).toEqual(before);
    await expect(admin(`insert into chests (profile_id, rarity, source, source_key) values ($1, 'or', 'season', 'S1')`, [s1])).rejects.toThrow(); // unicité conservée
    await expect(admin(`insert into chests (profile_id, rarity, source, source_key) values ($1, 'or', 'hasard', 'x')`, [s1])).rejects.toThrow(); // contrainte de source conservée
    expect((await as(s1, `select count(*)::int n from season_leaderboard('S1')`))[0].n).toBe(1);
    await wipe();
    await admin(`delete from chests where source = 'season'`);
  });
});
