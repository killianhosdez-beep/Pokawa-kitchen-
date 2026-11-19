-- Pokawa Kitchen — suivi des quantités réellement produites
-- À exécuter dans l'éditeur SQL du projet Supabase avant d'activer le mode connecté.
-- Sans cette migration, les colonnes supplémentaires envoyées par l'application
-- ne seront pas reconnues par la table checklist_completions.

alter table if exists public.checklist_completions
  add column if not exists requested_quantity text,
  add column if not exists actual_quantity text,
  add column if not exists shortfall_reason text,
  add column if not exists shortfall_comment text;

create index if not exists checklist_completions_shortfall_date_idx
  on public.checklist_completions (work_date)
  where shortfall_reason is not null;

comment on column public.checklist_completions.requested_quantity is
  'Quantité demandée pour cette préparation, enregistrée lors de la validation.';
comment on column public.checklist_completions.actual_quantity is
  'Quantité réellement produite par l''équipe.';
comment on column public.checklist_completions.shortfall_reason is
  'Motif obligatoire lorsque la quantité réellement produite est inférieure à la quantité demandée.';
comment on column public.checklist_completions.shortfall_comment is
  'Précision complémentaire, notamment lorsque le motif choisi est Autre.';
