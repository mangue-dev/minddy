-- minddy — MIN-168 : la review de PR devient un RUN de l'agent, ancré à une PR.
--
-- Jusqu'ici une review était une passe à part (`pr_review_runs` + un appel modèle
-- à sortie forcée sur un contexte pré-assemblé) : aucun tool, aucune exploration,
-- un diff tronqué à l'aveugle. Elle devient une session de l'agent comme les
-- autres — sandbox, boucle à outils, checkpoint, direct, quota, facturation,
-- reprise conversationnelle — avec un TROISIÈME ancrage à côté du ticket et du
-- carnet : la pull request.
--
-- Ce que cet ancrage change en base, et rien d'autre :
--   • `pull_request_id` sur `agent_runs` : le run se rattache à l'entité PR
--     (MIN-143), pas au numéro. `on delete cascade` — une PR effacée de minddy
--     n'a plus de session à montrer.
--   • `pr_head_sha` : le sha RELU par ce run. C'est lui qui répond à « relancer
--     la review aurait-il quelque chose de nouveau à lire ? », question que
--     l'écran pose au serveur (l'entrée de menu se grise tant que la tête n'a pas
--     bougé). Le sha COURANT de la PR vit dans `pull_requests.head_sha` et ne dit
--     rien de ce qui a été lu.
--   • un run actif à la fois par PR (index unique partiel, même prédicat que
--     `idx_agent_runs_active_issue`) : deux sessions sur le même diff, c'est deux
--     fois la dépense pour deux fois le même avis.
--   • RLS : un run de PR n'a pas de ticket, mais ce n'est pas pour autant un run
--     personnel comme le carnet — il commente une pull request que tout le
--     projet voit. Il est donc lisible par les membres du projet, comme un run de
--     ticket.
--
-- `pr_number` / `pr_url` / `pr_state` restent volontairement NULS sur un run de
-- review : ces colonnes disent « ce run a OUVERT cette PR », et c'est par elles
-- que la page Pull requests décide qu'un agent travaille sur le code. Une review
-- ne pousse rien ; la rattacher par là ferait dire à cette page qu'une session de
-- code est en cours.
--
-- Idempotent — safe to re-run.

-- ── L'ancrage ──────────────────────────────────────────────────────────────
alter table public.agent_runs
  add column if not exists pull_request_id uuid
    references public.pull_requests(id) on delete cascade;

alter table public.agent_runs
  add column if not exists pr_head_sha text;

-- Un seul run ACTIF par pull request. Prédicat aligné sur celui de
-- `idx_agent_runs_active_issue` (20260812090000) : seul le TRAVAIL occupe la PR.
create unique index if not exists idx_agent_runs_active_pr
  on public.agent_runs(pull_request_id)
  where status in ('queued', 'running');

-- Liste des sessions d'une PR, la plus récente en tête.
create index if not exists idx_agent_runs_pull_request
  on public.agent_runs(pull_request_id, created_at desc);

-- ── Ce qu'on demande au run ────────────────────────────────────────────────
-- Le CHECK de `intent` (20261004090000) énumère les quatre intentions de TICKET.
-- `review` est la cinquième, et elle ne parle pas d'un ticket : elle relit une
-- pull request. Sans cette ligne, tout lancement de relecture est refusé par la
-- base — la contrainte est le dernier mot, quoi que dise TypeScript.
alter table public.agent_runs drop constraint if exists agent_runs_intent_check;
alter table public.agent_runs add constraint agent_runs_intent_check
  check (intent is null or intent in ('implement','plan','verify','custom','review'));

-- ── Visibilité ─────────────────────────────────────────────────────────────
-- La policy de MIN-84 réservait tout run SANS ticket à son créateur, parce que le
-- seul run sans ticket était un run CARNET, dont le prompt est une note
-- personnelle. Un run de PR n'a pas de ticket non plus, mais il n'a rien de
-- personnel : son sujet est une pull request, sa sortie des commentaires publics.
-- Le laisser sous la règle du carnet le rendrait invisible à tous sauf à qui a
-- cliqué — y compris la carte du fil de la PR, que tout le monde voit.
drop policy if exists agent_runs_select on public.agent_runs;
create policy agent_runs_select on public.agent_runs for select
  using (
    public.can_access_project(project_id)
    and (
      issue_id is not null
      or pull_request_id is not null
      or created_by = (select auth.uid())
    )
  );

drop policy if exists agent_run_events_select on public.agent_run_events;
create policy agent_run_events_select on public.agent_run_events for select
  using (exists (
    select 1 from public.agent_runs r
    where r.id = run_id
      and public.can_access_project(r.project_id)
      and (
        r.issue_id is not null
        or r.pull_request_id is not null
        or r.created_by = (select auth.uid())
      )
  ));

-- Les écritures restent au service client (aucune policy insert/update/delete sur
-- `agent_runs` depuis 20260806090000) : ce nouvel ancrage ne change rien là.
