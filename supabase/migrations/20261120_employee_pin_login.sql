-- PIN employé : stockage haché et journal de limitation des tentatives.
create extension if not exists pgcrypto;

create table if not exists public.employee_pin_credentials (
  employee_id uuid primary key references public.profiles(id) on delete cascade,
  pin_salt text not null,
  pin_hash text not null,
  updated_at timestamptz not null default now()
);

create table if not exists public.employee_pin_attempts (
  id bigint generated always as identity primary key,
  employee_name text not null,
  ip_hash text not null,
  created_at timestamptz not null default now()
);

create index if not exists employee_pin_attempts_recent_idx
  on public.employee_pin_attempts (ip_hash, created_at desc);

alter table public.employee_pin_credentials enable row level security;
alter table public.employee_pin_attempts enable row level security;
revoke all on public.employee_pin_credentials from anon, authenticated;
revoke all on public.employee_pin_attempts from anon, authenticated;
grant all on public.employee_pin_credentials to service_role;
grant all on public.employee_pin_attempts to service_role;
