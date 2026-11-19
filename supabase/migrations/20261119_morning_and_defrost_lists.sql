-- Pokawa Kitchen — réorganisation des listes du matin et des décongélations
-- Migration idempotente : conserve les anciennes lignes pour préserver l'historique,
-- mais les désactive dans la liste de décongélation.

-- Les protéines sont suivies dans la production du matin, pas dans les décongélations.
update public.checklist_tasks
set active = false
where list_type = 'defrost'
  and upper(trim(title)) in (
    'STICKY RICE DECONG','GYOZAS LÉGUMES','GYOZA POULET',
    'SAUMON STOCK','THON STOCK','CREVETTE STOCK',
    'AVOCAT STOCK','MANGUE STOCK','RIZ STOCK'
  );

-- Le thon mariné existant devient la tâche de marinade du matin.
update public.checklist_tasks
set title = 'Marinade thon',
    group_name = 'Marinades',
    note = 'Après décongélation',
    active = true
where list_type = 'morning'
  and upper(trim(title)) = 'THON MARINÉ (G BAC/1KG)';

-- Ajout des étapes de marinade saumon et crevettes, sans créer de doublon.
insert into public.checklist_tasks
  (list_type, group_name, title, note, sort_order, active)
select 'morning','Marinades','Marinade saumon','Après la découpe du saumon',
       coalesce((select max(sort_order)+1 from public.checklist_tasks where list_type='morning'),0),true
where not exists (
  select 1 from public.checklist_tasks
  where list_type='morning' and lower(trim(title))='marinade saumon'
);

insert into public.checklist_tasks
  (list_type, group_name, title, note, sort_order, active)
select 'morning','Marinades','Marinade crevettes','Après décongélation',
       coalesce((select max(sort_order)+1 from public.checklist_tasks where list_type='morning'),0),true
where not exists (
  select 1 from public.checklist_tasks
  where list_type='morning' and lower(trim(title))='marinade crevettes'
);

-- La liste de décongélation contient désormais uniquement les produits demandés.
update public.checklist_tasks
set active = false
where list_type='defrost' and active=true;

insert into public.checklist_tasks
  (list_type, group_name, title, note, sort_order, active)
select 'defrost','Décongélations J+1',v.title,'',v.sort_order,true
from (values
  ('EDAMAME',0),
  ('LENTILLES BELUGA',1),
  ('KATSU',2),
  ('POULET TERIYAKI',3),
  ('SAUCE MASSAMAN',4),
  ('SAUCE TERIYAKI',5),
  ('COULIS MANGUE',6),
  ('COULIS FRAMBOISE',7)
) as v(title,sort_order)
where not exists (
  select 1 from public.checklist_tasks t
  where t.list_type='defrost' and lower(trim(t.title))=lower(v.title)
);
