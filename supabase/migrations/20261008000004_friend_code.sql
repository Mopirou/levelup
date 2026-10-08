-- Le code ami suit le pseudo : à l'inscription le pseudo est provisoire (« aventurier… »), il est choisi dans Le Seuil.
-- Tant que le code ami est celui du pseudo provisoire, il est régénéré quand le pseudo change.
create or replace function public.on_username_change()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.username is distinct from old.username and old.username::text like 'aventurier%' and old.friend_code like 'ELAN-AVENTURI%' then
    new.friend_code := public.gen_friend_code(new.username::text);
  end if;
  return new;
end $$;

create trigger profiles_friend_code before update of username on public.profiles
  for each row execute function public.on_username_change();
