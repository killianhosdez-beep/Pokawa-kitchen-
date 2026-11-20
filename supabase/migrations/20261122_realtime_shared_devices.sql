-- Pokawa Kitchen — synchronisation temps réel entre appareils.
-- Les clients abonnés à Supabase Realtime rechargent les données partagées
-- dès qu'une tâche, une validation, un contexte de journée, un compte ou un
-- événement d'historique change.

do $$
declare
  table_name text;
  required_tables text[] := array[
    'profiles',
    'checklist_tasks',
    'checklist_completions',
    'daily_context',
    'audit_events'
  ];
begin
  if not exists (
    select 1 from pg_publication where pubname = 'supabase_realtime'
  ) then
    raise exception 'La publication supabase_realtime est absente. Active Realtime dans le projet Supabase avant cette migration.';
  end if;

  foreach table_name in array required_tables loop
    if to_regclass(format('public.%I', table_name)) is null then
      raise exception 'La table public.% n''existe pas. Vérifie les migrations de base avant d''activer la synchronisation.', table_name;
    end if;

    if not exists (
      select 1
      from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = table_name
    ) then
      execute format('alter publication supabase_realtime add table public.%I', table_name);
    end if;
  end loop;
end $$;
