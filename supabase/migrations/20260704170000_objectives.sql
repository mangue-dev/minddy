-- minddy — chantier 7 « Objectifs »
-- An objective groups issues toward a common goal. Member-managed (plan §9).
-- Progress (done/total) is computed from linked issues, not stored.
-- Idempotent — safe to re-run.

create table if not exists public.objectives (
  id           uuid primary key default gen_random_uuid(),
  project_id   uuid not null references public.projects(id) on delete cascade,
  name         text not null,
  description  text,
  status       text not null default 'planned'
               check (status in ('planned', 'in_progress', 'done', 'canceled')),
  lead_user_id uuid references auth.users(id) on delete set null,
  target_date  date,
  color        text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create index if not exists idx_objectives_project on public.objectives(project_id);

alter table public.objectives enable row level security;

drop policy if exists objectives_select on public.objectives;
create policy objectives_select on public.objectives for select
  using (public.can_access_project(project_id));

drop policy if exists objectives_insert on public.objectives;
create policy objectives_insert on public.objectives for insert
  with check (public.can_access_project(project_id));

drop policy if exists objectives_update on public.objectives;
create policy objectives_update on public.objectives for update
  using (public.can_access_project(project_id)) with check (public.can_access_project(project_id));

drop policy if exists objectives_delete on public.objectives;
create policy objectives_delete on public.objectives for delete
  using (public.can_access_project(project_id));

drop trigger if exists objectives_set_updated_at on public.objectives;
create trigger objectives_set_updated_at
  before update on public.objectives
  for each row execute function public.set_updated_at();

-- Link issues to an objective (0 or 1). Deleting an objective detaches its issues.
alter table public.issues
  add column if not exists objective_id uuid references public.objectives(id) on delete set null;

create index if not exists idx_issues_objective on public.issues(objective_id);

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'objectives'
  ) then
    alter publication supabase_realtime add table public.objectives;
  end if;
end $$;
