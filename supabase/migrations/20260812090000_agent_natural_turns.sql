-- Agent conversationnel « débridé » : fin de tour NATURELLE, plus de `needs_input`.
--
-- Avant : deux repos distincts — `completed` (tour fini via le tool `finish`) et
-- `needs_input` (ask_user / interruption / erreur), ce dernier restant ACTIF et
-- bloquant tout nouveau lancement sur l'issue.
--
-- Après : les tools `finish` et `ask_user` n'existent plus. Un tour se termine
-- quand l'agent répond en texte ; une question de l'agent est une réponse comme
-- une autre. Il ne reste qu'UN repos : `completed` — la session attend le prochain
-- message dans sa conversation et n'occupe PLUS le ticket. « Un seul agent par
-- ticket en simultané » ne concerne donc plus que le TRAVAIL (queued/running).

-- 0. Reprise des données : tout run suspendu (`needs_input`) devient un run au
--    repos. Son checkpoint et sa sandbox sont intacts — la conversation se poursuit
--    exactement pareil (steer). Une éventuelle question `ask_user` en attente reste
--    lisible dans le fil d'événements.
update public.agent_runs
   set status = 'completed'
 where status = 'needs_input';

-- 1. Contrainte de statut : `needs_input` sort du vocabulaire.
alter table public.agent_runs
  drop constraint if exists agent_runs_status_check;
alter table public.agent_runs
  add constraint agent_runs_status_check
  check (status in ('queued','running','completed','failed','canceled'));

-- 2. Unicité du run ACTIF par issue : seul le TRAVAIL occupe le ticket. (Prédicat
--    plus étroit qu'avant → aucun risque de violation à la création.)
drop index if exists public.idx_agent_runs_active_issue;
create unique index if not exists idx_agent_runs_active_issue
  on public.agent_runs(issue_id)
  where status in ('queued', 'running');

-- 3. File du reaper de microVM : `completed` est désormais le seul repos.
drop index if exists public.idx_agent_runs_idle_sandbox;
create index if not exists idx_agent_runs_idle_sandbox
  on public.agent_runs (last_activity_at)
  where status = 'completed'
    and sandbox_id is not null
    and sandbox_stopped_at is null;
