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

-- Empreinte HMAC-like (hash + secret serveur) pour empêcher la réutilisation
-- du même PIN par plusieurs comptes sans stocker le PIN en clair.
alter table public.employee_pin_credentials
  add column if not exists pin_fingerprint text;

create unique index if not exists employee_pin_credentials_fingerprint_uidx
  on public.employee_pin_credentials (pin_fingerprint)
  where pin_fingerprint is not null;
