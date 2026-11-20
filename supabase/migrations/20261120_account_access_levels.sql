-- Niveaux d'autorisation de Pokawa Kitchen.
-- Le champ role reste employee/manager pour conserver les politiques RLS existantes.
-- access_level distingue les trois profils de connexion.
alter table public.profiles
  add column if not exists access_level text;

update public.profiles
set access_level = case
  when role = 'manager' then 'manager_advanced'
  else 'employee'
end
where access_level is null;

alter table public.profiles
  alter column access_level set default 'employee',
  alter column access_level set not null;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.profiles'::regclass
      and conname = 'profiles_access_level_check'
  ) then
    alter table public.profiles
      add constraint profiles_access_level_check
      check (access_level in ('employee', 'manager_simple', 'manager_advanced'));
  end if;
end $$;
