-- minddy — le triage et le cycle s'excluent (MIN-32).
--
-- Le triage, c'est du travail pas encore décidé ; le cycle, c'est l'engagement
-- de le faire maintenant. Un ticket ne peut donc pas être les deux à la fois :
--   • passer un ticket en triage le SORT de son cycle (silencieusement, comme
--     une réaffectation ailleurs le fait déjà) ;
--   • un ticket en triage ne peut pas être ajouté à un cycle.
--
-- La règle rejoint l'invariant cycle/affectation dans LE MÊME trigger : c'est
-- le seul endroit que tous les chemins d'écriture (UI, Numo, MCP, édition
-- groupée, moteur de remplissage) traversent forcément. Le cœur applicatif
-- (lib/server/update-issue.ts) fait la même chose en amont — pas pour la
-- garantie, qui est ici, mais pour écrire l'événement d'activité et réveiller
-- le tableau ouvert. Idempotent.

create or replace function public.enforce_issue_cycle()
returns trigger language plpgsql set search_path = public as $$
declare
  owner uuid;
begin
  if new.cycle_id is not null then
    if new.status = 'triage' then
      new.cycle_id := null;
    else
      select user_id into owner from public.cycles where id = new.cycle_id;
      if owner is null or new.assignee_id is distinct from owner then
        new.cycle_id := null;
      end if;
    end if;
  end if;
  return new;
end;
$$;

-- Rattrapage des lignes écrites avant la règle : un ticket en triage qui traîne
-- dans un cycle en sort. Aucun impact sur les cycles clos (leur
-- `completed_points` ne compte que le "done").
update public.issues
  set cycle_id = null
  where cycle_id is not null and status = 'triage';
