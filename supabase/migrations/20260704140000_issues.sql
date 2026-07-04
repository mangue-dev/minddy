-- minddy — chantier 3 « Issues (cœur) »
-- issues table + RLS (any project member can CRUD content) + a per-project
-- identifier counter (CLÉ-numéro) + Realtime. Idempotent — safe to re-run.
-- Deferred to later chantiers: objective_id (7), parent_id/sub-issues (8),
-- categories (6), comments & activity (9).

-- Per-project issue counter lives on projects (atomic bump via function below).
alter table public.projects add column if not exists issue_seq integer not null default 0;

-- ── issues ───────────────────────────────────────────────────────────────────
create table if not exists public.issues (
  id           uuid primary key default gen_random_uuid(),
  project_id   uuid not null references public.projects(id) on delete cascade,
  number       integer not null,
  title        text not null,
  description  text,
  status       text not null default 'backlog'
               check (status in ('backlog','todo','in_progress','in_review','done','canceled')),
  priority     text not null default 'none'
               check (priority in ('none','urgent','high','medium','low')),
  effort       text check (effort in ('xs','s','m','l','xl')),
  assignee_id  uuid references auth.users(id) on delete set null,
  due_date     date,
  position     double precision not null default 0,
  created_by   uuid references auth.users(id) on delete set null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  completed_at timestamptz,
  unique (project_id, number)
);

create index if not exists idx_issues_project on public.issues(project_id);
create index if not exists idx_issues_project_status on public.issues(project_id, status);
create index if not exists idx_issues_assignee on public.issues(assignee_id);

alter table public.issues enable row level security;

-- Content CRUD = any project member (owner or member) via can_access_project().
drop policy if exists issues_select on public.issues;
create policy issues_select on public.issues for select
  using (public.can_access_project(project_id));

drop policy if exists issues_insert on public.issues;
create policy issues_insert on public.issues for insert
  with check (public.can_access_project(project_id));

drop policy if exists issues_update on public.issues;
create policy issues_update on public.issues for update
  using (public.can_access_project(project_id)) with check (public.can_access_project(project_id));

drop policy if exists issues_delete on public.issues;
create policy issues_delete on public.issues for delete
  using (public.can_access_project(project_id));

drop trigger if exists issues_set_updated_at on public.issues;
create trigger issues_set_updated_at
  before update on public.issues
  for each row execute function public.set_updated_at();

-- ── per-project identifier counter (atomic) ──────────────────────────────────
-- Row-locking UPDATE ... RETURNING guarantees no two issues get the same number.
-- Restricted to service_role so it can't be spammed directly by clients; the
-- create-issue route calls it after verifying project access.
create or replace function public.next_issue_number(p_project_id uuid)
returns integer language sql security definer set search_path = public as $$
  update public.projects
     set issue_seq = issue_seq + 1
   where id = p_project_id
  returning issue_seq;
$$;

revoke all on function public.next_issue_number(uuid) from public, anon, authenticated;
grant execute on function public.next_issue_number(uuid) to service_role;

-- ── Realtime ─────────────────────────────────────────────────────────────────
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'issues'
  ) then
    alter publication supabase_realtime add table public.issues;
  end if;
end $$;
