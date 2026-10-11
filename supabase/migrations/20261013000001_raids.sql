-- Raids d'amis (V2) : un boss mondial par semaine ISO, des équipes de 2 à 6 amis. Voir docs/DONJONS.md §8.
-- Migration idempotente : elle peut être rejouée sans erreur.
-- Toutes les écritures passent par la fonction `game` (rôle service) ; un joueur ne peut que lire les lignes de ses équipes.

-- ═══════════════════════════ Tables ═══════════════════════════

-- Une équipe par semaine : `week_start` est le lundi de la semaine ISO.
create table if not exists public.raid_teams (
  id uuid primary key default gen_random_uuid(),
  week_start date not null check (extract(isodow from week_start) = 1),
  leader_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  -- Clôture paresseuse : victoire dès que le boss tombe, sinon à la première lecture après le dimanche.
  resolved_at timestamptz,
  outcome text check (outcome in ('victory', 'defeat', 'void')),
  -- PV et dégâts figés à la clôture
  max_hp int check (max_hp > 0),
  total_damage int check (total_damage >= 0),
  victory_day date,
  unique (id, week_start),
  check ((resolved_at is null) = (outcome is null))
);

create index if not exists raid_teams_week on public.raid_teams (week_start);

-- Membres et invitations. Un joueur ne peut être `joined` que dans une équipe par semaine (index unique partiel).
create table if not exists public.raid_members (
  team_id uuid not null,
  profile_id uuid not null references public.profiles (id) on delete cascade,
  week_start date not null,
  status text not null default 'invited' check (status in ('invited', 'joined')),
  -- Le chef pour un invité ; le joueur lui-même pour le chef. Efface si l'inviteur est purgé : le membre reste.
  invited_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  joined_at timestamptz,
  primary key (team_id, profile_id),
  foreign key (team_id, week_start) references public.raid_teams (id, week_start) on delete cascade,
  check ((status = 'joined') = (joined_at is not null))
);

create unique index if not exists raid_members_one_team_per_week on public.raid_members (profile_id, week_start) where status = 'joined';
create index if not exists raid_members_profile on public.raid_members (profile_id, week_start);

-- Un coup par joueur et par jour de jeu (toutes équipes confondues). `damage = floor(base_damage × (1 + 5 % × encouragements))`.
-- Quitter l'équipe emporte les dégâts du joueur (cascade).
create table if not exists public.raid_damage (
  team_id uuid not null,
  profile_id uuid not null,
  game_date date not null,
  damage int not null check (damage >= 0),
  base_damage int not null check (base_damage >= 0),
  encouragements int not null default 0 check (encouragements between 0 and 5),
  primary key (team_id, profile_id, game_date),
  unique (profile_id, game_date),
  foreign key (team_id, profile_id) references public.raid_members (team_id, profile_id) on delete cascade
);

-- Un encouragement par ami et par jour.
create table if not exists public.raid_encouragements (
  team_id uuid not null,
  from_id uuid not null,
  to_id uuid not null,
  game_date date not null,
  created_at timestamptz not null default now(),
  primary key (team_id, from_id, to_id, game_date),
  check (from_id <> to_id),
  foreign key (team_id, from_id) references public.raid_members (team_id, profile_id) on delete cascade,
  foreign key (team_id, to_id) references public.raid_members (team_id, profile_id) on delete cascade
);

-- ═══════════════════════════ Garde-fous : 6 membres au plus, amis uniquement ═══════════════════════════

-- Verrouille l'équipe pour sérialiser les arrivées simultanées, puis refuse la 7e personne et tout invité qui n'est pas
-- un ami (accepté, non bloqué) du chef au moment de l'invitation.
create or replace function public.raid_members_guard()
returns trigger language plpgsql security definer set search_path = public as $$
declare lead uuid; n int;
begin
  select leader_id into lead from public.raid_teams where id = new.team_id for update;
  if lead is null then return new; end if;
  if tg_op = 'INSERT' and new.profile_id <> lead and not public.can_view_owner(lead, new.profile_id) then
    raise exception 'raid_not_friend' using errcode = 'check_violation';
  end if;
  if new.status = 'joined' and (tg_op = 'INSERT' or old.status <> 'joined') then
    select count(*) into n from public.raid_members where team_id = new.team_id and status = 'joined' and profile_id <> new.profile_id;
    if n >= 6 then
      raise exception 'raid_full' using errcode = 'check_violation';
    end if;
  end if;
  return new;
end $$;

drop trigger if exists raid_members_guard on public.raid_members;
create trigger raid_members_guard before insert or update on public.raid_members
  for each row execute function public.raid_members_guard();

-- ═══════════════════════════ Sécurité : lecture membres, écriture rôle service ═══════════════════════════

alter table public.raid_teams enable row level security;
alter table public.raid_members enable row level security;
alter table public.raid_damage enable row level security;
alter table public.raid_encouragements enable row level security;

-- Aides pour les politiques (security definer : évite la récursion de RLS entre raid_teams et raid_members).
create or replace function public.raid_team_joined(p_team uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.raid_members where team_id = p_team and profile_id = auth.uid() and status = 'joined');
$$;

create or replace function public.raid_team_visible(p_team uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.raid_members where team_id = p_team and profile_id = auth.uid());
$$;

drop policy if exists raid_teams_select on public.raid_teams;
create policy raid_teams_select on public.raid_teams for select to authenticated using (public.raid_team_visible(id));
drop policy if exists raid_members_select on public.raid_members;
create policy raid_members_select on public.raid_members for select to authenticated
  using (profile_id = auth.uid() or public.raid_team_joined(team_id));
drop policy if exists raid_damage_select on public.raid_damage;
create policy raid_damage_select on public.raid_damage for select to authenticated using (public.raid_team_joined(team_id));
drop policy if exists raid_encouragements_select on public.raid_encouragements;
create policy raid_encouragements_select on public.raid_encouragements for select to authenticated using (public.raid_team_joined(team_id));

revoke insert, update, delete on public.raid_teams from anon, authenticated;
revoke insert, update, delete on public.raid_members from anon, authenticated;
revoke insert, update, delete on public.raid_damage from anon, authenticated;
revoke insert, update, delete on public.raid_encouragements from anon, authenticated;

-- ═══════════════════════════ Quitter les raids (suppression de compte, nouvelle aventure) ═══════════════════════════

-- Retire le joueur de ses raids en cours (dégâts compris), passe la main au plus ancien membre quand il était chef, et supprime
-- les équipes devenues vides. Les raids clos gardent leur historique jusqu'à la purge du compte.
create or replace function public.raid_detach_profile(p_profile uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  delete from public.raid_members where invited_by = p_profile and profile_id <> p_profile and status = 'invited';
  delete from public.raid_members
    where profile_id = p_profile and team_id in (select id from public.raid_teams where resolved_at is null);
  update public.raid_teams t
    set leader_id = (select m.profile_id from public.raid_members m where m.team_id = t.id and m.status = 'joined' and m.profile_id <> p_profile
                     order by m.joined_at, m.profile_id limit 1)
    where t.leader_id = p_profile
      and exists (select 1 from public.raid_members m where m.team_id = t.id and m.status = 'joined' and m.profile_id <> p_profile);
  delete from public.raid_teams t
    where t.resolved_at is null and not exists (select 1 from public.raid_members m where m.team_id = t.id and m.status = 'joined');
end $$;

revoke all on function public.raid_detach_profile(uuid) from public, anon, authenticated;
grant execute on function public.raid_detach_profile(uuid) to service_role;

-- RG-26 : la demande de suppression retire aussi le joueur de ses raids (le reste part à la purge, par cascade).
create or replace function public.request_account_deletion()
returns void language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); uname text;
begin
  select username::text into uname from public.profiles where id = me;
  delete from public.reactions where profile_id = me;
  delete from public.comments where author_id = me;
  delete from public.posts where author_id = me;
  delete from public.friendships where requester_id = me or addressee_id = me;
  delete from public.notifications where profile_id = me;
  delete from public.device_tokens where profile_id = me;
  perform public.raid_detach_profile(me);
  update public.profiles set deleted_at = now() where id = me;
  insert into public.username_reservations (username, free_at) values (uname, now() + interval '90 days')
    on conflict (username) do update set free_at = excluded.free_at;
end $$;
