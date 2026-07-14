-- minddy — MIN-46 : Agent de code cloud (numo)
--
-- Squelette d'orchestration multi-jobs, calqué sur le système de génération
-- d'AutoKap (github_generation_jobs + checkpoint), adapté au Vercel Sandbox.
-- Un run édite le code d'un dépôt lié (MIN-47) dans une microVM isolée, pousse
-- une branche et ouvre UNE PR par ticket. Comme un run dépasse souvent la
-- limite 300s d'une fonction Vercel, il se SUSPEND à une frontière sûre : l'état
-- du repo est poussé sur la branche (durable dans git), seul l'historique de
-- messages LLM + le sandbox_id vont dans `checkpoint`, le run repasse `queued`
-- et une auto-invocation (+ cron filet) le reprend.
--
--  • agent_runs        = un run par (issue, tentative), avec son checkpoint.
--  • agent_run_events  = flux append-only (live view : thinking/tool/commit…).
--  • claim_agent_run   = claim CAS atomique (le seul verrou), service-role only.
--
-- RLS : lecture = membres du projet (can_access_project) ; TOUTES les écritures
-- passent par le service client avec gate TS (pattern api_keys / git). Aucune
-- policy d'écriture. Idempotent — safe to re-run.

-- ── Runs de l'agent ────────────────────────────────────────────────────────
create table if not exists public.agent_runs (
  id                uuid primary key default gen_random_uuid(),
  project_id        uuid not null references public.projects(id) on delete cascade,
  issue_id          uuid not null references public.issues(id) on delete cascade,
  repo_link_id      uuid references public.project_git_links(id) on delete set null,
  connection_id     uuid references public.git_connections(id) on delete set null,
  -- Cycle de vie. 'needs_input' = l'agent attend une réponse (tool ask_user).
  status            text not null default 'queued'
                      check (status in ('queued','running','completed','failed','canceled','needs_input')),
  triggered_by      text not null default 'button'
                      check (triggered_by in ('button','chat','mention')),
  created_by        uuid references auth.users(id) on delete set null,
  prompt            text,                          -- consigne libre (au-delà de l'issue)
  model             text,                          -- modèle résolu, figé au lancement
  model_forced      boolean not null default false,-- true si imposé (run/numo)
  key_mode          text not null default 'platform'
                      check (key_mode in ('platform','byok')),
  base_branch       text,                          -- branche de base clonée
  branch_name       text,                          -- branche de travail du run
  pr_number         integer,
  pr_url            text,
  pr_state          text check (pr_state in ('draft','open','merged','closed')),
  sandbox_id        text,                          -- Vercel Sandbox vivant (reconnect)
  checkpoint        jsonb,                         -- {messages, counters…} de reprise
  continuations     integer not null default 0,    -- nb de reprises suspend→resume
  attempts          integer not null default 0,    -- nb de claims (retries crash)
  not_before        timestamptz not null default now(), -- curseur « dû maintenant »
  started_at        timestamptz,                   -- reset à chaque claim (wall-clock du chunk)
  window_started_at timestamptz,                   -- persiste : wall-clock global du run
  run_id            uuid,                          -- regroupe les appels dans ai_usage
  cost_usd          numeric(12,6) not null default 0,
  outcome           text,
  error_message     text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

-- Un seul run actif par issue (dedup — évite deux agents sur le même ticket).
create unique index if not exists idx_agent_runs_active_issue
  on public.agent_runs(issue_id) where status in ('queued','running');
-- File du drain : les runs dus, les plus anciens d'abord.
create index if not exists idx_agent_runs_due
  on public.agent_runs(not_before) where status = 'queued';
-- Sweeper des runs bloqués (running trop vieux).
create index if not exists idx_agent_runs_running
  on public.agent_runs(started_at) where status = 'running';
create index if not exists idx_agent_runs_issue    on public.agent_runs(issue_id);
create index if not exists idx_agent_runs_project   on public.agent_runs(project_id);
-- Sync webhook : retrouver le run par (dépôt, numéro de PR).
create index if not exists idx_agent_runs_pr
  on public.agent_runs(repo_link_id, pr_number) where pr_number is not null;

alter table public.agent_runs enable row level security;

-- Lecture = tout membre du projet (live view + review de la PR). Écritures =
-- service client uniquement (pas de policy insert/update/delete).
drop policy if exists agent_runs_select on public.agent_runs;
create policy agent_runs_select on public.agent_runs for select
  using (public.can_access_project(project_id));

drop trigger if exists agent_runs_set_updated_at on public.agent_runs;
create trigger agent_runs_set_updated_at
  before update on public.agent_runs
  for each row execute function public.set_updated_at();

-- ── Flux d'événements (live view) ──────────────────────────────────────────
create table if not exists public.agent_run_events (
  id          uuid primary key default gen_random_uuid(),
  run_id      uuid not null references public.agent_runs(id) on delete cascade,
  seq         integer not null,          -- monotone par run (polling ?after=<seq>)
  type        text not null
                check (type in ('status','thinking','tool_call','tool_result',
                                'commit','pr_opened','error','summary')),
  payload     jsonb,
  created_at  timestamptz not null default now()
);

create unique index if not exists idx_agent_run_events_run_seq
  on public.agent_run_events(run_id, seq);

alter table public.agent_run_events enable row level security;

-- Lecture = membres du projet du run parent. Insert = service client.
drop policy if exists agent_run_events_select on public.agent_run_events;
create policy agent_run_events_select on public.agent_run_events for select
  using (exists (
    select 1 from public.agent_runs r
    where r.id = run_id and public.can_access_project(r.project_id)
  ));

-- ── Claim CAS atomique ─────────────────────────────────────────────────────
-- Le SEUL verrou : le prédicat `status = 'queued'` fait que seul un appelant
-- gagne l'UPDATE ; les drains/cron/kick concurrents reçoivent 0 ligne. Reset
-- started_at (wall-clock du chunk), ancre window_started_at au 1er claim,
-- incrémente attempts. SECURITY DEFINER, réservé au service_role.
create or replace function public.claim_agent_run(p_run_id uuid)
returns setof public.agent_runs
language sql
security definer
set search_path = public
as $$
  update public.agent_runs
     set status = 'running',
         started_at = now(),
         window_started_at = coalesce(window_started_at, now()),
         attempts = attempts + 1
   where id = p_run_id and status = 'queued'
  returning *;
$$;

revoke all on function public.claim_agent_run(uuid) from public;
grant execute on function public.claim_agent_run(uuid) to service_role;

-- ── Défaut racine du modèle de l'agent ─────────────────────────────────────
-- Miroir du fallback dans lib/ai-model-config.ts (clé agent_model). Surchargé
-- au runtime par la préférence user puis par l'override du run.
insert into public.app_config (key, value)
values ('agent_model', 'deepseek/deepseek-v4-flash')
on conflict (key) do nothing;
