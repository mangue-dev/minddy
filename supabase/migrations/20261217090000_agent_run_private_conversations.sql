-- minddy — MIN-332 : une conversation avec Numo appartient à qui l'a eue.
--
-- CE QUI ÉTAIT FAUX. Depuis MIN-84 la base disait « un run SANS ticket n'est
-- visible que de son créateur » — la note du carnet est personnelle. Deux
-- problèmes, et le second est le plus gros :
--
--  1. La règle n'était portée que par `agent_runs_select` et
--     `agent_run_events_select`. `agent_run_messages_select` ne l'a jamais eue :
--     la file de steering d'un carnet — ce que son auteur écrit à l'agent —
--     s'énumérait par PostgREST pour tout membre du projet. Et les routes lisent
--     en clé service, donc aucune des trois ne les gardait (corrigé côté TS par
--     `lib/server/agent/run-access.ts`, qui dit exactement ce prédicat-ci).
--
--  2. LE CRITÈRE LUI-MÊME était trop étroit. Un run ANCRÉ À UN TICKET restait
--     lisible par tout le projet, alors qu'une conversation avec Numo sur un
--     ticket public reste un geste de travail individuel : le prompt qu'on a
--     écrit, la façon dont on a repris l'agent, ce qu'il a répondu. Ce que
--     l'équipe doit voir d'une conversation, c'est son RÉSULTAT — le ticket, la
--     branche, la pull request —, pas le brouillon.
--
-- LA RÈGLE, DÉSORMAIS. Un run appartient à son créateur, SAUF les trois qui ne
-- sont écrits à la première personne par personne :
--
--   • `routine_id`      — un passage de routine ; la routine est un objet du
--                         projet, ses exécutions se lisent dans son détail.
--   • `chain_id`        — une étape d'automatisation ; la chaîne est une règle du
--                         projet, et son `created_by` n'est pas un acteur mais le
--                         porteur de la règle. La réserver à lui rendrait
--                         invisible à tous le travail que le projet a déclenché.
--   • `pull_request_id` — une session de RELECTURE (MIN-168) : sujet public,
--                         sortie en commentaires publics, et la carte du fil de la
--                         PR est vue de tout le monde.
--
-- On garde le prédicat À L'IDENTIQUE dans les trois policies : c'est la même
-- phrase, et la faire diverger est précisément ce qui a produit ce ticket.
-- Idempotent — safe to re-run.

drop policy if exists agent_runs_select on public.agent_runs;
create policy agent_runs_select on public.agent_runs for select
  using (
    public.can_access_project(project_id)
    and (
      created_by = (select auth.uid())
      or routine_id is not null
      or chain_id is not null
      or pull_request_id is not null
    )
  );

drop policy if exists agent_run_events_select on public.agent_run_events;
create policy agent_run_events_select on public.agent_run_events for select
  using (exists (
    select 1 from public.agent_runs r
    where r.id = run_id
      and public.can_access_project(r.project_id)
      and (
        r.created_by = (select auth.uid())
        or r.routine_id is not null
        or r.chain_id is not null
        or r.pull_request_id is not null
      )
  ));

-- Celle qui manquait entièrement (20260807090000 : « membres du projet du run »).
drop policy if exists agent_run_messages_select on public.agent_run_messages;
create policy agent_run_messages_select on public.agent_run_messages for select
  using (exists (
    select 1 from public.agent_runs r
    where r.id = run_id
      and public.can_access_project(r.project_id)
      and (
        r.created_by = (select auth.uid())
        or r.routine_id is not null
        or r.chain_id is not null
        or r.pull_request_id is not null
      )
  ));

-- Les écritures restent au service client (aucune policy insert/update/delete sur
-- ces trois tables) : le resserrement ne change rien de ce côté.
