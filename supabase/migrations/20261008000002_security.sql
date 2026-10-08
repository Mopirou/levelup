-- Level Up — sécurité : Row Level Security sur 100 % des tables, fonctions sociales, anti-spam, modération.

-- ═══════════════════════════ Fonctions d'aide ═══════════════════════════

create or replace function public.is_friend(a uuid, b uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.friendships f
    where f.status = 'accepted'
      and ((f.requester_id = a and f.addressee_id = b) or (f.requester_id = b and f.addressee_id = a))
  );
$$;

create or replace function public.is_blocked_either(a uuid, b uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.blocks k
    where (k.blocker_id = a and k.blocked_id = b) or (k.blocker_id = b and k.blocked_id = a)
  );
$$;

create or replace function public.can_view_owner(viewer uuid, owner uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select viewer = owner or (public.is_friend(viewer, owner) and not public.is_blocked_either(viewer, owner));
$$;

-- ═══════════════════════════ RLS : activation ═══════════════════════════

alter table public.profiles enable row level security;
alter table public.username_reservations enable row level security;
alter table public.characters enable row level security;
alter table public.quest_templates enable row level security;
alter table public.quest_preferences enable row level security;
alter table public.quest_instances enable row level security;
alter table public.xp_events enable row level security;
alter table public.achievements enable row level security;
alter table public.unlocked_achievements enable row level security;
alter table public.journal_entries enable row level security;
alter table public.rest_days enable row level security;
alter table public.settings enable row level security;
alter table public.friendships enable row level security;
alter table public.posts enable row level security;
alter table public.post_media enable row level security;
alter table public.reactions enable row level security;
alter table public.comments enable row level security;
alter table public.blocks enable row level security;
alter table public.reports enable row level security;
alter table public.notifications enable row level security;
alter table public.device_tokens enable row level security;
alter table public.banned_words enable row level security;

-- ═══════════════════════════ Profils ═══════════════════════════

create policy profiles_select on public.profiles for select to authenticated
  using (id = auth.uid() or (deleted_at is null and not public.is_blocked_either(auth.uid(), id)));
create policy profiles_update_own on public.profiles for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid());
revoke update on public.profiles from authenticated;
grant update (username, avatar_url) on public.profiles to authenticated;

-- ═══════════════════════════ Jeu ═══════════════════════════

-- Fiche : le propriétaire et ses amis acceptés. Le serveur écrit les totaux ; le client ne change que l'apparence.
create policy characters_select on public.characters for select to authenticated
  using (public.can_view_owner(auth.uid(), profile_id));
create policy characters_update_own on public.characters for update to authenticated
  using (profile_id = auth.uid()) with check (profile_id = auth.uid());
revoke update on public.characters from authenticated;
grant update (name, portrait_id, frame_color, motto) on public.characters to authenticated;

create policy templates_select on public.quest_templates for select to authenticated
  using (source = 'catalog' or owner_id = auth.uid());
create policy templates_insert_custom on public.quest_templates for insert to authenticated
  with check (source = 'custom' and owner_id = auth.uid());
create policy templates_update_custom on public.quest_templates for update to authenticated
  using (owner_id = auth.uid()) with check (owner_id = auth.uid() and source = 'custom');

create policy prefs_all on public.quest_preferences for all to authenticated
  using (profile_id = auth.uid()) with check (profile_id = auth.uid());

-- Instances, registre d'XP, repos, journal : lecture par le propriétaire, écriture par le serveur uniquement.
create policy instances_select on public.quest_instances for select to authenticated using (profile_id = auth.uid());
create policy xp_events_select on public.xp_events for select to authenticated using (profile_id = auth.uid());
create policy rest_days_select on public.rest_days for select to authenticated using (profile_id = auth.uid());
create policy journal_select on public.journal_entries for select to authenticated using (profile_id = auth.uid());

create policy achievements_select on public.achievements for select to authenticated using (true);
create policy unlocked_select on public.unlocked_achievements for select to authenticated
  using (public.can_view_owner(auth.uid(), profile_id));

create policy settings_all on public.settings for all to authenticated
  using (profile_id = auth.uid()) with check (profile_id = auth.uid());

-- ═══════════════════════════ Social ═══════════════════════════

create policy friendships_select on public.friendships for select to authenticated
  using (requester_id = auth.uid() or addressee_id = auth.uid());
create policy friendships_delete on public.friendships for delete to authenticated
  using (requester_id = auth.uid() or addressee_id = auth.uid());

create policy posts_select on public.posts for select to authenticated using (
  author_id = auth.uid()   -- y compris supprimées : un UPDATE exige que la nouvelle ligne reste visible (le client filtre deleted_at)
  or (deleted_at is null and hidden = false and visibility = 'friends'
      and public.is_friend(author_id, auth.uid()) and not public.is_blocked_either(author_id, auth.uid()))
);
create policy posts_insert on public.posts for insert to authenticated with check (
  author_id = auth.uid()
  and type in ('photo', 'quest')
  and (instance_id is null or exists (
    select 1 from public.quest_instances qi where qi.id = instance_id and qi.profile_id = auth.uid() and qi.status = 'completed'))
);
create policy posts_update_own on public.posts for update to authenticated
  using (author_id = auth.uid()) with check (author_id = auth.uid());
revoke update on public.posts from authenticated;
grant update (text, visibility, deleted_at, edited_at) on public.posts to authenticated;

create policy post_media_select on public.post_media for select to authenticated
  using (exists (select 1 from public.posts p where p.id = post_id));
create policy post_media_insert on public.post_media for insert to authenticated
  with check (exists (select 1 from public.posts p where p.id = post_id and p.author_id = auth.uid())
              and storage_path like auth.uid()::text || '/%');
create policy post_media_delete on public.post_media for delete to authenticated
  using (exists (select 1 from public.posts p where p.id = post_id and p.author_id = auth.uid()));

create policy reactions_select on public.reactions for select to authenticated
  using (exists (select 1 from public.posts p where p.id = post_id)
         and not public.is_blocked_either(auth.uid(), profile_id));
create policy reactions_insert on public.reactions for insert to authenticated
  with check (profile_id = auth.uid() and exists (select 1 from public.posts p where p.id = post_id));
create policy reactions_update on public.reactions for update to authenticated
  using (profile_id = auth.uid()) with check (profile_id = auth.uid());
create policy reactions_delete on public.reactions for delete to authenticated using (profile_id = auth.uid());

create policy comments_select on public.comments for select to authenticated
  using (author_id = auth.uid()
         or (deleted_at is null and hidden = false
             and exists (select 1 from public.posts p where p.id = post_id)
             and not public.is_blocked_either(auth.uid(), author_id)));
create policy comments_insert on public.comments for insert to authenticated
  with check (author_id = auth.uid() and exists (select 1 from public.posts p where p.id = post_id));
create policy comments_update_own on public.comments for update to authenticated
  using (author_id = auth.uid()) with check (author_id = auth.uid());
revoke update on public.comments from authenticated;
grant update (deleted_at) on public.comments to authenticated;

create policy blocks_all on public.blocks for all to authenticated
  using (blocker_id = auth.uid()) with check (blocker_id = auth.uid());

create policy reports_insert on public.reports for insert to authenticated with check (reporter_id = auth.uid());

create policy notifications_select on public.notifications for select to authenticated using (profile_id = auth.uid());
create policy notifications_update on public.notifications for update to authenticated
  using (profile_id = auth.uid()) with check (profile_id = auth.uid());
revoke update on public.notifications from authenticated;
grant update (read_at) on public.notifications to authenticated;

create policy device_tokens_all on public.device_tokens for all to authenticated
  using (profile_id = auth.uid()) with check (profile_id = auth.uid());

-- ═══════════════════════════ Modération et anti-spam ═══════════════════════════

-- RG-24 : filtre de mots interdits à la publication et au commentaire.
create or replace function public.check_banned_words(p_text text)
returns void language plpgsql security definer set search_path = public as $$
declare w text;
begin
  if p_text is null or p_text = '' then return; end if;
  for w in select word from public.banned_words loop
    if lower(unaccent_simple(p_text)) ~ ('(^|[^a-z])' || w || '([^a-z]|$)') then
      raise exception 'community_rules' using errcode = 'P0001', hint = 'Ce message ne respecte pas les règles de la communauté';
    end if;
  end loop;
end $$;

-- Mise en forme minimale pour la comparaison (sans extension unaccent).
create or replace function public.unaccent_simple(t text)
returns text language sql immutable as $$
  select translate(t, 'àâäáãåçéèêëíìîïñóòôöõúùûüýÿœÀÂÄÁÃÅÇÉÈÊËÍÌÎÏÑÓÒÔÖÕÚÙÛÜÝŸŒ', 'aaaaaaceeeeiiiinooooouuuuyyoAAAAAACEEEEIIIINOOOOOUUUUYYO');
$$;

create or replace function public.on_post_write()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  perform public.check_banned_words(new.text);
  if tg_op = 'INSERT' and new.type in ('photo', 'quest') then
    -- RG-25 : 20 publications par jour au maximum.
    if (select count(*) from public.posts where author_id = new.author_id and created_at > now() - interval '24 hours') >= 20 then
      raise exception 'rate_limit_posts' using errcode = 'P0001', hint = 'Limite de 20 publications par jour atteinte';
    end if;
  end if;
  return new;
end $$;
create trigger posts_guard before insert or update of text on public.posts
  for each row execute function public.on_post_write();

create or replace function public.on_comment_write()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  perform public.check_banned_words(new.text);
  if tg_op = 'INSERT' and
     (select count(*) from public.comments where author_id = new.author_id and created_at > now() - interval '24 hours') >= 100 then
    raise exception 'rate_limit_comments' using errcode = 'P0001', hint = 'Limite de 100 commentaires par jour atteinte';
  end if;
  return new;
end $$;
create trigger comments_guard before insert or update of text on public.comments
  for each row execute function public.on_comment_write();

-- RG-23 : un contenu signalé par 3 personnes différentes est masqué en attendant la modération.
create or replace function public.on_report_insert()
returns trigger language plpgsql security definer set search_path = public as $$
declare n int;
begin
  select count(distinct reporter_id) into n from public.reports
    where target_type = new.target_type and target_id = new.target_id and status = 'open';
  if n >= 3 then
    if new.target_type = 'post' then update public.posts set hidden = true where id = new.target_id;
    elsif new.target_type = 'comment' then update public.comments set hidden = true where id = new.target_id;
    end if;
  end if;
  return new;
end $$;
create trigger reports_auto_hide after insert on public.reports
  for each row execute function public.on_report_insert();

-- ═══════════════════════════ Amis : demandes, réponses, blocage ═══════════════════════════

create or replace function public._send_friend_request(p_target uuid, p_via_code boolean)
returns text language plpgsql security definer set search_path = public as $$
declare
  me uuid := auth.uid();
  pref text;
  existing public.friendships;
  my_count int;
  their_count int;
begin
  if me is null then raise exception 'not_authenticated'; end if;
  -- Réponse neutre : on ne révèle jamais un blocage (RG-19).
  if p_target is null or p_target = me
     or not exists (select 1 from public.profiles where id = p_target and deleted_at is null)
     or public.is_blocked_either(me, p_target) then
    return 'not_found';
  end if;
  select friend_requests_from into pref from public.settings where profile_id = p_target;
  if coalesce(pref, 'everyone') = 'nobody' or (coalesce(pref, 'everyone') = 'code' and not p_via_code) then
    return 'not_found';
  end if;
  select * into existing from public.friendships
    where least(requester_id, addressee_id) = least(me, p_target) and greatest(requester_id, addressee_id) = greatest(me, p_target);
  if found then
    if existing.status = 'accepted' then return 'already_friends'; end if;
    if existing.status = 'pending' and existing.requester_id = p_target then
      update public.friendships set status = 'accepted', accepted_at = now() where id = existing.id;
      return 'accepted';
    end if;
    if existing.status = 'pending' then return 'already_sent'; end if;
    -- demande refusée auparavant : on peut redemander
    update public.friendships set status = 'pending', requester_id = me, addressee_id = p_target, created_at = now(), accepted_at = null
      where id = existing.id;
    return 'sent';
  end if;
  -- RG-25 : 50 demandes par jour.
  if (select count(*) from public.friendships where requester_id = me and created_at > now() - interval '24 hours') >= 50 then
    return 'rate_limit';
  end if;
  select count(*) into my_count from public.friendships where status = 'accepted' and (requester_id = me or addressee_id = me);
  select count(*) into their_count from public.friendships where status = 'accepted' and (requester_id = p_target or addressee_id = p_target);
  if my_count >= 200 then return 'limit_reached'; end if;
  if their_count >= 200 then return 'not_found'; end if;
  insert into public.friendships (requester_id, addressee_id) values (me, p_target);
  return 'sent';
end $$;

create or replace function public.send_friend_request(p_target uuid)
returns text language sql security definer set search_path = public as $$
  select public._send_friend_request(p_target, false);
$$;

create or replace function public.send_friend_request_by_code(p_code text)
returns text language plpgsql security definer set search_path = public as $$
declare target uuid;
begin
  select id into target from public.profiles where friend_code = upper(trim(p_code)) and deleted_at is null;
  return public._send_friend_request(target, true);
end $$;

create or replace function public.respond_friend_request(p_request uuid, p_accept boolean)
returns text language plpgsql security definer set search_path = public as $$
declare
  me uuid := auth.uid();
  f public.friendships;
  my_count int;
begin
  select * into f from public.friendships where id = p_request and addressee_id = me and status = 'pending';
  if not found then return 'not_found'; end if;
  if p_accept then
    select count(*) into my_count from public.friendships where status = 'accepted' and (requester_id = me or addressee_id = me);
    if my_count >= 200 then return 'limit_reached'; end if;
    update public.friendships set status = 'accepted', accepted_at = now() where id = p_request;
    return 'accepted';
  end if;
  update public.friendships set status = 'declined' where id = p_request;
  return 'declined';
end $$;

-- RG-21 : retrait silencieux, sans notification.
create or replace function public.remove_friend(p_friend uuid)
returns void language sql security definer set search_path = public as $$
  delete from public.friendships
  where least(requester_id, addressee_id) = least(auth.uid(), p_friend)
    and greatest(requester_id, addressee_id) = greatest(auth.uid(), p_friend);
$$;

-- RG-20 : bloquer supprime l'amitié et masque les contenus dans les deux sens.
create or replace function public.block_user(p_target uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if p_target = auth.uid() then return; end if;
  insert into public.blocks (blocker_id, blocked_id) values (auth.uid(), p_target) on conflict do nothing;
  delete from public.friendships
  where least(requester_id, addressee_id) = least(auth.uid(), p_target)
    and greatest(requester_id, addressee_id) = greatest(auth.uid(), p_target);
end $$;

-- ═══════════════════════════ Recherche et fiches ═══════════════════════════

create type public.profile_card as (
  profile_id uuid,
  username text,
  name text,
  level int,
  class_id text,
  portrait_id text,
  frame_color text,
  is_friend boolean,
  request_status text
);

create or replace function public._card(p_id uuid)
returns public.profile_card language sql stable security definer set search_path = public as $$
  select p.id, p.username::text, c.name, c.level, c.class_id, c.portrait_id, c.frame_color,
         public.is_friend(auth.uid(), p.id),
         (select case when f.status = 'pending' and f.requester_id = auth.uid() then 'sent'
                      when f.status = 'pending' then 'received' else f.status end
            from public.friendships f
            where least(f.requester_id, f.addressee_id) = least(auth.uid(), p.id)
              and greatest(f.requester_id, f.addressee_id) = greatest(auth.uid(), p.id))
  from public.profiles p left join public.characters c on c.profile_id = p.id
  where p.id = p_id and p.deleted_at is null and not public.is_blocked_either(auth.uid(), p.id);
$$;

create or replace function public.search_profiles(p_query text)
returns setof public.profile_card language sql stable security definer set search_path = public as $$
  select (public._card(p.id)).*
  from public.profiles p
  where char_length(trim(p_query)) >= 3
    and p.username ilike trim(p_query) || '%'
    and p.id <> auth.uid() and p.deleted_at is null
    and not public.is_blocked_either(auth.uid(), p.id)
    and coalesce((select friend_requests_from from public.settings s where s.profile_id = p.id), 'everyone') <> 'nobody'
  order by p.username limit 20;
$$;

create or replace function public.find_profile_by_code(p_code text)
returns public.profile_card language sql stable security definer set search_path = public as $$
  select public._card(p.id) from public.profiles p
  where p.friend_code = upper(trim(p_code)) and p.id <> auth.uid();
$$;

create or replace function public.get_profile_card(p_username text)
returns public.profile_card language sql stable security definer set search_path = public as $$
  select public._card(p.id) from public.profiles p where p.username = p_username;
$$;

-- Liste des compagnons avec leur dernière activité.
create type public.friend_row as (
  profile_id uuid,
  username text,
  name text,
  level int,
  class_id text,
  portrait_id text,
  frame_color text,
  last_title text,
  last_at timestamptz
);

create or replace function public.friends_overview()
returns setof public.friend_row language sql stable security definer set search_path = public as $$
  select p.id, p.username::text, c.name, c.level, c.class_id, c.portrait_id, c.frame_color,
         (select qi.snapshot ->> 'title' from public.quest_instances qi
            where qi.profile_id = p.id and qi.status = 'completed' order by qi.completed_at desc limit 1),
         (select qi.completed_at from public.quest_instances qi
            where qi.profile_id = p.id and qi.status = 'completed' order by qi.completed_at desc limit 1)
  from public.friendships f
  join public.profiles p on p.id = case when f.requester_id = auth.uid() then f.addressee_id else f.requester_id end
  left join public.characters c on c.profile_id = p.id
  where f.status = 'accepted' and (f.requester_id = auth.uid() or f.addressee_id = auth.uid())
    and p.deleted_at is null and not public.is_blocked_either(auth.uid(), p.id)
  order by 9 desc nulls last;
$$;

-- Demandes reçues et envoyées avec les informations de la carte.
create or replace function public.pending_requests()
returns table (id uuid, direction text, card public.profile_card, created_at timestamptz)
language sql stable security definer set search_path = public as $$
  select f.id,
         case when f.addressee_id = auth.uid() then 'received' else 'sent' end,
         public._card(case when f.addressee_id = auth.uid() then f.requester_id else f.addressee_id end),
         f.created_at
  from public.friendships f
  where f.status = 'pending' and (f.requester_id = auth.uid() or f.addressee_id = auth.uid())
  order by f.created_at desc;
$$;

-- ═══════════════════════════ Classement de la compagnie ═══════════════════════════

-- RG-27 / RG-28 : XP de la semaine ISO en cours ; l'XP des quêtes personnalisées est plafonnée à 30 % du total.
create or replace function public.weekly_leaderboard()
returns table (profile_id uuid, username text, name text, level int, class_id text, portrait_id text, frame_color text, xp bigint)
language plpgsql stable security definer set search_path = public as $$
declare
  tz text;
  week_start date;
begin
  select coalesce(s.timezone, 'Europe/Paris') into tz from public.settings s where s.profile_id = auth.uid();
  tz := coalesce(tz, 'Europe/Paris');
  week_start := date_trunc('week', (now() at time zone tz))::date;
  if not coalesce((select s2.leaderboard_opt_in from public.settings s2 where s2.profile_id = auth.uid()), true) then
    return;
  end if;
  return query
  with members as (
    select auth.uid() as id
    union
    select case when f.requester_id = auth.uid() then f.addressee_id else f.requester_id end
    from public.friendships f
    where f.status = 'accepted' and (f.requester_id = auth.uid() or f.addressee_id = auth.uid())
  ), eligible as (
    select m.id from members m
    left join public.settings s on s.profile_id = m.id
    where coalesce(s.leaderboard_opt_in, true) and not public.is_blocked_either(auth.uid(), m.id)
  ), sums as (
    select e.profile_id,
           coalesce(sum(e.amount) filter (where not e.is_custom), 0) as normal_xp,
           coalesce(sum(e.amount) filter (where e.is_custom), 0) as custom_xp
    from public.xp_events e
    where e.game_date >= week_start and e.profile_id in (select id from eligible)
    group by e.profile_id
  )
  select p.id, p.username::text, c.name, c.level, c.class_id, c.portrait_id, c.frame_color,
         greatest(s.normal_xp + least(s.custom_xp, (s.normal_xp * 3) / 7), 0)::bigint
  from eligible el
  join public.profiles p on p.id = el.id
  left join public.characters c on c.profile_id = p.id
  left join sums s on s.profile_id = p.id
  order by 8 desc nulls last, p.username;
end $$;

-- ═══════════════════════════ Notifications ═══════════════════════════

create or replace function public.notify_user(p_to uuid, p_type text, p_payload jsonb)
returns void language plpgsql security definer set search_path = public as $$
begin
  if p_to is null then return; end if;
  insert into public.notifications (profile_id, type, payload) values (p_to, p_type, p_payload);
end $$;

create or replace function public.on_friendship_change()
returns trigger language plpgsql security definer set search_path = public as $$
declare who text;
begin
  if tg_op = 'INSERT' and new.status = 'pending' then
    select username::text into who from public.profiles where id = new.requester_id;
    perform public.notify_user(new.addressee_id, 'friend_request', jsonb_build_object('from', new.requester_id, 'username', who, 'request', new.id));
  elsif tg_op = 'UPDATE' and new.status = 'accepted' and old.status <> 'accepted' then
    select username::text into who from public.profiles where id = new.addressee_id;
    perform public.notify_user(new.requester_id, 'friend_accepted', jsonb_build_object('from', new.addressee_id, 'username', who));
  end if;
  return new;
end $$;
create trigger friendships_notify after insert or update on public.friendships
  for each row execute function public.on_friendship_change();

create or replace function public.on_reaction_insert()
returns trigger language plpgsql security definer set search_path = public as $$
declare author uuid; who text;
begin
  select author_id into author from public.posts where id = new.post_id;
  if author is not null and author <> new.profile_id then
    select username::text into who from public.profiles where id = new.profile_id;
    perform public.notify_user(author, 'reaction', jsonb_build_object('post', new.post_id, 'from', new.profile_id, 'username', who, 'kind', new.kind));
  end if;
  return new;
end $$;
create trigger reactions_notify after insert on public.reactions
  for each row execute function public.on_reaction_insert();

create or replace function public.on_comment_insert()
returns trigger language plpgsql security definer set search_path = public as $$
declare author uuid; who text;
begin
  select author_id into author from public.posts where id = new.post_id;
  if author is not null and author <> new.author_id then
    select username::text into who from public.profiles where id = new.author_id;
    perform public.notify_user(author, 'comment', jsonb_build_object('post', new.post_id, 'from', new.author_id, 'username', who));
  end if;
  return new;
end $$;
create trigger comments_notify after insert on public.comments
  for each row execute function public.on_comment_insert();

-- Un ami atteint un niveau : prévenir les compagnons (publication automatique « level_up »).
create or replace function public.on_post_insert_notify()
returns trigger language plpgsql security definer set search_path = public as $$
declare who text; f record;
begin
  if new.type = 'level_up' and new.visibility = 'friends' then
    select username::text into who from public.profiles where id = new.author_id;
    for f in
      select case when requester_id = new.author_id then addressee_id else requester_id end as friend_id
      from public.friendships
      where status = 'accepted' and (requester_id = new.author_id or addressee_id = new.author_id)
    loop
      perform public.notify_user(f.friend_id, 'friend_level', jsonb_build_object('from', new.author_id, 'username', who, 'level', new.payload ->> 'level', 'post', new.id));
    end loop;
  end if;
  return new;
end $$;
create trigger posts_notify after insert on public.posts
  for each row execute function public.on_post_insert_notify();

create or replace function public.mark_notifications_read()
returns void language sql security definer set search_path = public as $$
  update public.notifications set read_at = now() where profile_id = auth.uid() and read_at is null;
$$;

-- ═══════════════════════════ Compte : suppression ═══════════════════════════

-- RG-26 : publications, photos (les fichiers sont retirés par la fonction `account`), commentaires et réactions
-- sont supprimés immédiatement ; les données personnelles sont effacées sous 30 jours ; le pseudo reste réservé 90 jours.
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
  update public.profiles set deleted_at = now() where id = me;
  insert into public.username_reservations (username, free_at) values (uname, now() + interval '90 days')
    on conflict (username) do update set free_at = excluded.free_at;
end $$;

create or replace function public.purge_deleted_accounts()
returns int language plpgsql security definer set search_path = public, auth as $$
declare n int;
begin
  with gone as (select id from public.profiles where deleted_at is not null and deleted_at < now() - interval '30 days')
  delete from auth.users where id in (select id from gone);
  get diagnostics n = row_count;
  return n;
end $$;

-- Les fonctions de purge ne sont appelables que par le serveur.
revoke all on function public.purge_deleted_accounts() from public, anon, authenticated;
revoke all on function public.notify_user(uuid, text, jsonb) from public, anon, authenticated;
revoke all on function public._send_friend_request(uuid, boolean) from public, anon, authenticated;
revoke all on function public._card(uuid) from public, anon;

-- ═══════════════════════════ Stockage des photos ═══════════════════════════

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('post-media', 'post-media', false, 10485760, array['image/jpeg', 'image/webp', 'image/png'])
on conflict (id) do nothing;

-- Écriture dans son propre dossier /{profile_id}/ ; lecture selon la visibilité de la publication (RLS de post_media).
create policy post_media_upload on storage.objects for insert to authenticated
  with check (bucket_id = 'post-media' and (storage.foldername(name))[1] = auth.uid()::text);
create policy post_media_update on storage.objects for update to authenticated
  using (bucket_id = 'post-media' and (storage.foldername(name))[1] = auth.uid()::text);
create policy post_media_remove on storage.objects for delete to authenticated
  using (bucket_id = 'post-media' and (storage.foldername(name))[1] = auth.uid()::text);
create policy post_media_read on storage.objects for select to authenticated
  using (bucket_id = 'post-media' and (
    (storage.foldername(name))[1] = auth.uid()::text
    or exists (select 1 from public.post_media pm where pm.storage_path = storage.objects.name)
  ));

-- ═══════════════════════════ Temps réel ═══════════════════════════

alter publication supabase_realtime add table public.posts;
alter publication supabase_realtime add table public.reactions;
alter publication supabase_realtime add table public.comments;
alter publication supabase_realtime add table public.notifications;
alter publication supabase_realtime add table public.friendships;
alter publication supabase_realtime add table public.quest_instances;
alter publication supabase_realtime add table public.characters;
