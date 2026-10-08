-- Level Up — schéma V1 : le jeu et le social.
-- L'XP est un registre d'événements (xp_events) écrit uniquement par le serveur ; les totaux du personnage sont un cache recalculable.

create extension if not exists citext with schema extensions;
create extension if not exists pgcrypto with schema extensions;

-- ═══════════════════════════ Profils ═══════════════════════════

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  username extensions.citext not null unique,
  friend_code text not null unique,
  avatar_url text,
  birth_year int,
  created_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint username_format check (username ~ '^[A-Za-z0-9-]{3,20}$')
);

-- Pseudos réservés 90 jours après suppression de compte (RG-26).
create table public.username_reservations (
  username extensions.citext primary key,
  free_at timestamptz not null
);

create or replace function public.gen_friend_code(p_username text)
returns text language plpgsql as $$
declare
  base text := upper(regexp_replace(p_username, '[^A-Za-z0-9]', '', 'g'));
  code text;
begin
  loop
    code := 'ELAN-' || substr(base, 1, 8) || '-' || lpad((floor(random() * 10000))::int::text, 4, '0');
    exit when not exists (select 1 from public.profiles where friend_code = code);
  end loop;
  return code;
end $$;

create or replace function public.username_available(p_username text)
returns boolean language sql security definer set search_path = public as $$
  select p_username ~ '^[A-Za-z0-9-]{3,20}$'
    and not exists (select 1 from public.profiles where username = p_username)
    and not exists (select 1 from public.username_reservations where username = p_username and free_at > now());
$$;
grant execute on function public.username_available(text) to anon, authenticated;

-- Création automatique du profil à l'inscription (le pseudo vient des métadonnées).
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  wanted text := coalesce(new.raw_user_meta_data ->> 'username', '');
  final_name text;
begin
  if wanted !~ '^[A-Za-z0-9-]{3,20}$' then
    wanted := 'aventurier' || substr(replace(new.id::text, '-', ''), 1, 6);
  end if;
  final_name := wanted;
  if not public.username_available(final_name) then
    final_name := substr(wanted, 1, 14) || substr(replace(new.id::text, '-', ''), 1, 5);
  end if;
  insert into public.profiles (id, username, friend_code, birth_year)
  values (new.id, final_name, public.gen_friend_code(final_name), nullif(new.raw_user_meta_data ->> 'birth_year', '')::int);
  return new;
end $$;

create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- ═══════════════════════════ Jeu ═══════════════════════════

create table public.characters (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null unique references public.profiles (id) on delete cascade,
  name text not null check (char_length(name) between 2 and 30),
  class_id text not null,
  path_id text,
  portrait_id text not null default 'p01',
  frame_color text not null default '#2f5a47',
  motto text not null default '' check (char_length(motto) <= 80),
  title_equipped text,
  base_scores jsonb not null,
  improvements jsonb not null default '{"FOR":0,"DEX":0,"CON":0,"INT":0,"SAG":0,"CHA":0}',
  improvements_chosen int not null default 0,
  -- cache recalculable depuis xp_events
  total_xp int not null default 0,
  ability_xp jsonb not null default '{"FOR":0,"DEX":0,"CON":0,"INT":0,"SAG":0,"CHA":0}',
  level int not null default 1,
  streak_current int not null default 0,
  streak_best int not null default 0,
  inspiration int not null default 0 check (inspiration between 0 and 3),
  rerolls_date date,
  rerolls_used int not null default 0,
  created_at timestamptz not null default now()
);

create table public.quest_templates (
  id text primary key,
  source text not null check (source in ('catalog', 'custom')),
  owner_id uuid references public.profiles (id) on delete cascade,
  ability text not null check (ability in ('FOR','DEX','CON','INT','SAG','CHA')),
  difficulty text not null check (difficulty in ('easy','medium','high','expert')),
  periods text[] not null,
  title text not null,
  flavor text not null default '',
  objective text not null,
  tips text[] not null default '{}',
  validation jsonb not null,
  tags text[] not null default '{}',
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  constraint custom_has_owner check ((source = 'catalog' and owner_id is null) or (source = 'custom' and owner_id is not null))
);

create table public.quest_preferences (
  profile_id uuid not null references public.profiles (id) on delete cascade,
  template_id text not null references public.quest_templates (id) on delete cascade,
  is_favorite boolean not null default false,
  is_excluded boolean not null default false,
  is_pinned boolean not null default false,
  primary key (profile_id, template_id)
);

create table public.quest_instances (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles (id) on delete cascade,
  template_id text not null references public.quest_templates (id),
  snapshot jsonb not null,
  period text not null check (period in ('daily','weekly','monthly','epic')),
  period_start date not null,
  period_end date not null,
  status text not null check (status in ('proposed','accepted','completed','abandoned','expired')),
  progress numeric not null default 0,
  steps_done jsonb,
  xp_awarded int not null default 0,
  inspiration_used boolean not null default false,
  is_free boolean not null default false,
  accepted_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now()
);
create unique index quest_instances_unique_draw on public.quest_instances (profile_id, template_id, period, period_start);
create index quest_instances_period on public.quest_instances (profile_id, period, period_start);
create index quest_instances_status on public.quest_instances (profile_id, status);

create table public.xp_events (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles (id) on delete cascade,
  instance_id uuid references public.quest_instances (id) on delete set null,
  ability text not null check (ability in ('FOR','DEX','CON','INT','SAG','CHA')),
  amount int not null,
  reason text not null check (reason in ('quest','partial','achievement','undo','hardcore','bonus')),
  is_custom boolean not null default false,
  game_date date not null,
  created_at timestamptz not null default now()
);
create index xp_events_profile on public.xp_events (profile_id, game_date);

create table public.achievements (
  id text primary key,
  category text not null,
  name text not null,
  description text not null,
  hint text,
  condition jsonb not null,
  xp_bonus int not null default 0,
  title_unlocked text,
  is_secret boolean not null default false
);

create table public.unlocked_achievements (
  profile_id uuid not null references public.profiles (id) on delete cascade,
  achievement_id text not null references public.achievements (id),
  unlocked_at timestamptz not null default now(),
  primary key (profile_id, achievement_id)
);

create table public.journal_entries (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles (id) on delete cascade,
  instance_id uuid references public.quest_instances (id) on delete set null,
  text text not null,
  created_at timestamptz not null default now()
);

create table public.rest_days (
  profile_id uuid not null references public.profiles (id) on delete cascade,
  day date not null,
  primary key (profile_id, day)
);

create table public.settings (
  profile_id uuid primary key references public.profiles (id) on delete cascade,
  reset_hour int not null default 4 check (reset_hour between 0 and 6),
  daily_quest_count int not null default 6 check (daily_quest_count between 1 and 6),
  hardcore boolean not null default false,
  auto_share jsonb not null default '{"level":true,"achievement":true,"streak":true}',
  default_visibility text not null default 'friends' check (default_visibility in ('friends','private')),
  leaderboard_opt_in boolean not null default true,
  notif_prefs jsonb not null default '{}',
  timezone text not null default 'Europe/Paris',
  friend_requests_from text not null default 'everyone' check (friend_requests_from in ('everyone','code','nobody')),
  theme text not null default 'auto' check (theme in ('auto','light','dark')),
  sounds boolean not null default true,
  reduced_motion boolean not null default false,
  last_recap_week text,
  last_recap_month text,
  -- Le serment est strictement privé : il vit avec les réglages, jamais sur la fiche visible des amis.
  oath text not null default ''
);

-- ═══════════════════════════ Social ═══════════════════════════

create table public.friendships (
  id uuid primary key default gen_random_uuid(),
  requester_id uuid not null references public.profiles (id) on delete cascade,
  addressee_id uuid not null references public.profiles (id) on delete cascade,
  status text not null default 'pending' check (status in ('pending','accepted','declined')),
  created_at timestamptz not null default now(),
  accepted_at timestamptz,
  constraint no_self_friend check (requester_id <> addressee_id)
);
create unique index friendships_pair on public.friendships (least(requester_id, addressee_id), greatest(requester_id, addressee_id));
create index friendships_addressee on public.friendships (addressee_id, status);

create table public.posts (
  id uuid primary key default gen_random_uuid(),
  author_id uuid not null references public.profiles (id) on delete cascade,
  type text not null check (type in ('quest','photo','level_up','achievement','streak')),
  instance_id uuid references public.quest_instances (id) on delete set null,
  text text not null default '' check (char_length(text) <= 500),
  visibility text not null default 'friends' check (visibility in ('friends','private')),
  payload jsonb not null default '{}',
  hidden boolean not null default false,
  created_at timestamptz not null default now(),
  edited_at timestamptz,
  deleted_at timestamptz
);
create index posts_feed on public.posts (created_at desc);
create index posts_author on public.posts (author_id, created_at desc);

create table public.post_media (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.posts (id) on delete cascade,
  storage_path text not null,
  width int,
  height int,
  position int not null default 0,
  alt text,
  constraint media_max4 check (position between 0 and 3)
);
create index post_media_post on public.post_media (post_id);

create table public.reactions (
  post_id uuid not null references public.posts (id) on delete cascade,
  profile_id uuid not null references public.profiles (id) on delete cascade,
  kind text not null check (kind in ('bravo','inspirant','respect','rire')),
  created_at timestamptz not null default now(),
  primary key (post_id, profile_id)
);

create table public.comments (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.posts (id) on delete cascade,
  author_id uuid not null references public.profiles (id) on delete cascade,
  text text not null check (char_length(text) between 1 and 300),
  hidden boolean not null default false,
  created_at timestamptz not null default now(),
  deleted_at timestamptz
);
create index comments_post on public.comments (post_id, created_at);

create table public.blocks (
  blocker_id uuid not null references public.profiles (id) on delete cascade,
  blocked_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (blocker_id, blocked_id),
  constraint no_self_block check (blocker_id <> blocked_id)
);

create table public.reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid not null references public.profiles (id) on delete cascade,
  target_type text not null check (target_type in ('post','comment','profile')),
  target_id uuid not null,
  reason text not null,
  status text not null default 'open' check (status in ('open','actioned','dismissed')),
  created_at timestamptz not null default now(),
  unique (reporter_id, target_type, target_id)
);

create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles (id) on delete cascade,
  type text not null,
  payload jsonb not null default '{}',
  read_at timestamptz,
  created_at timestamptz not null default now()
);
create index notifications_profile on public.notifications (profile_id, created_at desc);

create table public.device_tokens (
  profile_id uuid not null references public.profiles (id) on delete cascade,
  token text not null,
  platform text not null check (platform in ('android','ios','web')),
  last_seen_at timestamptz not null default now(),
  primary key (profile_id, token)
);

-- Mots interdits (RG-24) : liste française, gérée côté base.
create table public.banned_words (word text primary key);
