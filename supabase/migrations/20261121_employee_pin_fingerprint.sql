-- Empreinte HMAC-like (hash + secret serveur) pour éviter la réutilisation d'un PIN.
-- Le PIN brut n'est jamais stocké.
alter table public.employee_pin_credentials
  add column if not exists pin_fingerprint text;

create unique index if not exists employee_pin_credentials_fingerprint_uidx
  on public.employee_pin_credentials (pin_fingerprint)
  where pin_fingerprint is not null;
