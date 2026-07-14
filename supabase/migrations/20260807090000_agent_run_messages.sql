-- minddy — MIN-46 : Steering de l'agent de code (vraie session)
--
-- File de messages utilisateur adressés à un run EN COURS. Deux usages, un seul
-- mécanisme :
--   • steering  — l'utilisateur oriente un run running/queued sans l'annuler ;
--   • réponse   — l'utilisateur répond à un `ask_user` (run needs_input), ce qui
--                 débloque le run (l'endpoint le repasse `queued`).
-- La boucle agentique draine les messages non consommés À LA FRONTIÈRE DE ROUND
-- (avant le prochain appel LLM), les injecte comme messages `user`, puis les
-- marque consommés. `consumed_at is null` = en attente.
--
-- RLS : lecture = membres du projet du run (comme agent_run_events) ; écritures
-- = service client uniquement (l'endpoint /steer authentifie + gate en TS).
-- Idempotent — safe to re-run.

create table if not exists public.agent_run_messages (
  id           uuid primary key default gen_random_uuid(),
  run_id       uuid not null references public.agent_runs(id) on delete cascade,
  content      text not null,
  created_by   uuid references auth.users(id) on delete set null,
  consumed_at  timestamptz,                    -- null = en attente de drain
  created_at   timestamptz not null default now()
);

-- File d'attente : les messages non consommés d'un run, les plus anciens d'abord.
create index if not exists idx_agent_run_messages_pending
  on public.agent_run_messages(run_id, created_at) where consumed_at is null;
create index if not exists idx_agent_run_messages_run
  on public.agent_run_messages(run_id);

alter table public.agent_run_messages enable row level security;

-- Lecture = membres du projet du run parent. Insert/update = service client.
drop policy if exists agent_run_messages_select on public.agent_run_messages;
create policy agent_run_messages_select on public.agent_run_messages for select
  using (exists (
    select 1 from public.agent_runs r
    where r.id = run_id and public.can_access_project(r.project_id)
  ));

-- ── Nouveau type d'event : le message user injecté (affiché dans le live view) ─
-- Le CHECK inline de agent_run_events.type est auto-nommé <table>_<col>_check.
alter table public.agent_run_events drop constraint if exists agent_run_events_type_check;
alter table public.agent_run_events add constraint agent_run_events_type_check
  check (type in ('status','thinking','tool_call','tool_result',
                  'commit','pr_opened','error','summary','user_message'));
