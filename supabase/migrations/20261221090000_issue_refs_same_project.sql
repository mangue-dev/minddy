-- minddy — MIN-339 : les références sortantes d'un ticket restent dans son projet.
--
-- `issues.objective_id` et `issues.duplicate_of_id` sont des `uuid` nus. Rien,
-- dans la base, ne dit qu'ils désignent quelque chose du MÊME projet — et les
-- cœurs d'écriture (lib/server/create-issue.ts, lib/server/update-issue.ts)
-- tournent en clé service, RLS contournée. La garde applicative posée par
-- MIN-339 ferme les chemins d'aujourd'hui ; ce trigger ferme ceux de demain,
-- exactement comme `enforce_one_level_subissues` (20260704180000) le fait déjà
-- pour `parent_id` — c'est d'ailleurs pourquoi `parent_id` n'est pas repris ici.
--
-- Ce que ça évite pour de bon, côté objectif : `issues_sync_objective_status`
-- (20260729090000) est `security definer` et recalcule le statut de l'objectif
-- désigné, sans rien vérifier. Un `objective_id` étranger fait donc ÉCRIRE le
-- trigger chez un autre locataire — pas seulement lire.
--
-- `before insert or update of objective_id, duplicate_of_id` : sur un UPDATE, le
-- trigger ne se déclenche que si l'une des deux colonnes est dans le SET.
-- PostgREST n'envoie que les champs du patch, donc les écritures courantes ne le
-- paient pas, et une ligne héritée qui pointerait déjà de travers n'explose pas
-- au premier changement de statut — elle se corrige au moment où on y retouche.
--
-- Idempotent — safe to re-run.

create or replace function public.enforce_issue_refs_same_project()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if new.objective_id is not null and not exists (
    select 1 from public.objectives o
    where o.id = new.objective_id and o.project_id = new.project_id
  ) then
    raise exception 'L''objectif doit être dans le même projet';
  end if;

  if new.duplicate_of_id is not null and not exists (
    select 1 from public.issues i
    where i.id = new.duplicate_of_id and i.project_id = new.project_id
  ) then
    raise exception 'Le ticket dupliqué doit être dans le même projet';
  end if;

  return new;
end;
$$;

drop trigger if exists issues_refs_same_project on public.issues;
create trigger issues_refs_same_project
  before insert or update of objective_id, duplicate_of_id on public.issues
  for each row execute function public.enforce_issue_refs_same_project();
