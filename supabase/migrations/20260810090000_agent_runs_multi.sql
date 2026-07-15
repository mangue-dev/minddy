-- Runs d'agent MULTIPLES par issue, itérant sur une PR partagée (MIN-68).
--
-- Avant : une issue = UNE session permanente. Chaque fin de tour reposait en
-- `needs_input`, statut ACTIF → tout nouveau lancement était refusé (alreadyRunning)
-- et rouvrait la session finie. Impossible de démarrer une run indépendante.
--
-- Après : une fin de tour marque le run `completed` (terminal). L'issue accepte
-- alors une NOUVELLE run froide, qui hérite de la branche/PR de la précédente. Le
-- statut `needs_input` ne désigne plus qu'un run SUSPENDU qui attend l'utilisateur
-- (ask_user, interruption, erreur) — il reste actif et bloque une seconde run.
--
-- Deux index suivent ce déplacement de sens :
--
--  1. Unicité du run ACTIF par issue. Le prédicat ne couvrait que queued/running :
--     une run froide pouvait donc s'insérer pendant qu'une run `needs_input`
--     traînait, mettant DEUX agents sur le même ticket (et sur la même branche).
--     `needs_input` rejoint le prédicat → « une seule run active à la fois » est
--     désormais garanti par la base, pas seulement par le garde applicatif
--     (activeRunForIssue → 409 alreadyRunning).
--
--  2. File du reaper de microVM. Elle ne listait que les runs `needs_input` ; un run
--     `completed` garde sa sandbox (reprise à chaud depuis sa conversation) et
--     fuiterait donc une microVM à chaque tour fini. `completed` rejoint le prédicat.

-- 0. Reprise des données existantes. Tous les runs d'avant MIN-68 se sont arrêtés
--    en `needs_input`, y compris ceux dont le tour était FINI (PR ouverte) : sans
--    ce rattrapage, leur issue resterait à jamais « occupée » et n'accepterait plus
--    aucune run froide — la feature serait morte sur tout ticket déjà passé par
--    l'agent. On marque donc `completed` les runs au repos ayant une PR.
--
--    Approximation assumée : `pr_number` persiste d'un tour à l'autre, donc un run
--    qui a ouvert sa PR au tour 1 puis s'est arrêté sur un `ask_user` au tour 2 est
--    lui aussi retourné (rien dans le schéma ne distingue les deux — le statut est
--    le même et `outcome` porte tantôt le résumé, tantôt la question). Coût pour ce
--    cas rare : sa question en attente peut être relue comme un résumé de travail
--    par une run froide ultérieure, et l'utilisateur doit relancer la conversation
--    au lieu de simplement répondre. Les deux restent possibles (un run `completed`
--    se reprend à chaud depuis sa conversation) — c'est moins grave qu'une issue
--    définitivement bloquée.
--
--    Les runs `needs_input` SANS PR sont laissés tels quels : jamais arrivés au
--    bout d'un tour, ce sont bien des runs suspendus.
update public.agent_runs
   set status = 'completed'
 where status = 'needs_input'
   and pr_number is not null;

-- 0 bis. Filet avant l'index UNIQUE : si une course historique a laissé deux runs
--        actifs sur la même issue, l'index refuserait de se créer. On ne garde que
--        le plus récent comme actif et on annule les autres.
update public.agent_runs a
   set status = 'canceled',
       error_message = coalesce(a.error_message, 'Superseded (MIN-68 active-run uniqueness)')
 where a.status in ('queued', 'running', 'needs_input')
   and exists (
     select 1
       from public.agent_runs b
      where b.issue_id = a.issue_id
        and b.status in ('queued', 'running', 'needs_input')
        and (b.created_at, b.id) > (a.created_at, a.id)
   );

-- 1. Unicité du run actif par issue.
drop index if exists public.idx_agent_runs_active_issue;
create unique index if not exists idx_agent_runs_active_issue
  on public.agent_runs(issue_id)
  where status in ('queued', 'running', 'needs_input');

-- 2. File du reaper : runs au repos dont la microVM est encore vivante.
drop index if exists public.idx_agent_runs_idle_sandbox;
create index if not exists idx_agent_runs_idle_sandbox
  on public.agent_runs (last_activity_at)
  where status in ('needs_input', 'completed')
    and sandbox_id is not null
    and sandbox_stopped_at is null;
