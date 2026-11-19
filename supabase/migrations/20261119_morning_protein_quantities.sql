-- Pokawa Kitchen — fiches protéines du matin avec quantités dédiées
-- Conserve les lignes et leurs validations existantes en renommant les tâches.

update public.checklist_tasks
set title='Saumon',
    group_name='Riz et protéines',
    note='Inventaire · À couper · À mariner',
    active=true
where list_type='morning'
  and upper(trim(title))='SAUMON (2.5KG/G BAC)';

update public.checklist_tasks
set title='Thon',
    group_name='Riz et protéines',
    note='À décongeler · À mariner',
    active=true
where list_type='morning'
  and upper(trim(title)) in ('MARINADE THON','THON MARINÉ (G BAC/1KG)');

update public.checklist_tasks
set title='Crevettes',
    group_name='Riz et protéines',
    note='À décongeler · À mariner',
    active=true
where list_type='morning'
  and upper(trim(title))='MARINADE CREVETTES';

-- Désactive les anciennes fiches séparées de marinade, sans supprimer leur historique.
update public.checklist_tasks
set active=false
where list_type='morning'
  and upper(trim(title)) in ('MARINADE SAUMON','MARINADE THON','MARINADE CREVETTES');

-- Crée une fiche si une des protéines n'existait pas encore.
insert into public.checklist_tasks (list_type,group_name,title,note,sort_order,active)
select 'morning','Riz et protéines',v.title,v.note,
       coalesce((select max(sort_order)+1 from public.checklist_tasks where list_type='morning'),0)+v.position,true
from (values
  ('Saumon','Inventaire · À couper · À mariner',0),
  ('Thon','À décongeler · À mariner',1),
  ('Crevettes','À décongeler · À mariner',2)
) as v(title,note,position)
where not exists (
  select 1 from public.checklist_tasks t
  where t.list_type='morning' and lower(trim(t.title))=lower(v.title)
);
