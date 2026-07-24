-- Runs d'agent SANS ticket (MIN-84) : l'agent se découple du système de tickets
-- pour être lançable depuis le carnet de tâches (scratchpad).
--
-- Un run « carnet » est ancré à un PROJET (le dépôt à cloner) + une INSTRUCTION
-- libre (la note), sans issue : `issue_id` devient nullable. Chaque run carnet est
-- sa propre conversation (reprise à chaud via /steer, déjà indexée sur le run) —
-- aucune lignée ni héritage de branche/PR entre runs carnet.
--
-- L'index unique partiel `idx_agent_runs_active_issue` reste correct tel quel :
-- les NULL y sont distincts, donc plusieurs runs carnet peuvent être actifs en
-- même temps sans jamais entrer en collision avec la règle « un agent actif par
-- ticket ».
--
-- Visibilité : le carnet est STRICTEMENT PERSONNEL — le prompt d'un run carnet
-- (la note) ne doit pas être lisible par les autres membres du projet. La policy
-- de lecture des runs (et celle des events, qui la suit via le run parent) est
-- donc resserrée : un run sans issue n'est visible que par son créateur.
-- Idempotent — safe to re-run.

alter table public.agent_runs alter column issue_id drop not null;

drop policy if exists agent_runs_select on public.agent_runs;
create policy agent_runs_select on public.agent_runs for select
  using (
    public.can_access_project(project_id)
    and (issue_id is not null or created_by = (select auth.uid()))
  );

drop policy if exists agent_run_events_select on public.agent_run_events;
create policy agent_run_events_select on public.agent_run_events for select
  using (exists (
    select 1 from public.agent_runs r
    where r.id = run_id
      and public.can_access_project(r.project_id)
      and (r.issue_id is not null or r.created_by = (select auth.uid()))
  ));
