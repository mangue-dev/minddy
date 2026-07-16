-- minddy — état « lu » des sessions d'agent (bulle bleue « l'agent a terminé »)
--
-- Une SESSION d'agent = une issue (dédoublonnée par issue_id). On veut signaler à
-- l'utilisateur, par une bulle bleue sur la page /agents, le sélecteur de runs et
-- l'onglet Agents de la sidebar, qu'une session a de l'activité TERMINÉE qu'il n'a
-- pas encore consultée.
--
-- Deux briques :
--   1. `agent_session_reads` — horodatage « dernière consultation » par (user, issue),
--      posé par le client à l'ouverture de la session. Non-lu = une run a terminé
--      APRÈS ce timestamp. Strictement perso → RLS self-manage (cookie client).
--   2. `agent_runs.completed_at` — moment PRÉCIS où une run est passée `completed`.
--      `updated_at` ne convient pas : le heartbeat de la conversation ouverte le bump
--      en continu (même sur une run au repos), ce qui rallumerait la bulle à tort.
--      Un trigger stampe `completed_at` UNIQUEMENT sur la transition vers `completed`,
--      donc insensible aux heartbeats / webhooks PR ultérieurs.
--
-- Idempotent — safe to re-run.

-- ── 1. État « lu » par session ───────────────────────────────────────────────
create table if not exists public.agent_session_reads (
  user_id      uuid not null references auth.users(id) on delete cascade,
  issue_id     uuid not null references public.issues(id) on delete cascade,
  last_read_at timestamptz not null default now(),
  primary key (user_id, issue_id)
);

create index if not exists idx_agent_session_reads_user
  on public.agent_session_reads(user_id);

alter table public.agent_session_reads enable row level security;

drop policy if exists agent_session_reads_select on public.agent_session_reads;
create policy agent_session_reads_select on public.agent_session_reads for select
  using (user_id = (select auth.uid()));

drop policy if exists agent_session_reads_insert on public.agent_session_reads;
create policy agent_session_reads_insert on public.agent_session_reads for insert
  with check (user_id = (select auth.uid()));

drop policy if exists agent_session_reads_update on public.agent_session_reads;
create policy agent_session_reads_update on public.agent_session_reads for update
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

drop policy if exists agent_session_reads_delete on public.agent_session_reads;
create policy agent_session_reads_delete on public.agent_session_reads for delete
  using (user_id = (select auth.uid()));

-- ── 2. Horodatage précis de complétion d'une run ─────────────────────────────
alter table public.agent_runs
  add column if not exists completed_at timestamptz;

-- Stampe completed_at à la SEULE transition vers `completed` (insensible aux
-- updates ultérieurs : heartbeats, webhooks PR…). Une run qui recompose son cycle
-- (completed → running → completed après un tour de conversation) est re-stampée :
-- completed_at reflète toujours la DERNIÈRE fin d'agent.
create or replace function public.agent_runs_stamp_completed_at()
returns trigger language plpgsql as $$
begin
  if new.status = 'completed' and (old.status is distinct from 'completed') then
    new.completed_at := now();
  end if;
  return new;
end;
$$;

drop trigger if exists agent_runs_set_completed_at on public.agent_runs;
create trigger agent_runs_set_completed_at
  before update on public.agent_runs
  for each row execute function public.agent_runs_stamp_completed_at();

-- Backfill des runs déjà `completed` : updated_at est la meilleure approximation
-- disponible (elles ne sont plus heartbeatées, leur horloge est stable).
update public.agent_runs
  set completed_at = updated_at
  where status = 'completed' and completed_at is null;
