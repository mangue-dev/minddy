-- minddy — chantier 5 « Vues & onglets »
-- Saved views = a kanban's filters + sort + display, scoped to an onglet.
-- onglet 'all'  → shared views  (user_id NULL, any member can edit — open v1 governance)
-- onglet 'my'   → personal views (user_id = owner of the view)
-- The default "Toutes" view is virtual (not stored); these are the extra saved ones.
-- Idempotent — safe to re-run.

create table if not exists public.views (
  id         uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  onglet     text not null check (onglet in ('my', 'all')),
  user_id    uuid references auth.users(id) on delete cascade, -- NULL = shared
  name       text not null,
  filters    jsonb not null default '{}'::jsonb,
  sort       text not null default 'manual',
  display    jsonb not null default '{}'::jsonb,
  position   double precision not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_views_project on public.views(project_id);

alter table public.views enable row level security;

-- A user sees/edits shared views + their own personal views on accessible projects.
drop policy if exists views_select on public.views;
create policy views_select on public.views for select
  using (public.can_access_project(project_id) and (user_id is null or user_id = auth.uid()));

drop policy if exists views_insert on public.views;
create policy views_insert on public.views for insert
  with check (public.can_access_project(project_id) and (user_id is null or user_id = auth.uid()));

drop policy if exists views_update on public.views;
create policy views_update on public.views for update
  using (public.can_access_project(project_id) and (user_id is null or user_id = auth.uid()))
  with check (public.can_access_project(project_id) and (user_id is null or user_id = auth.uid()));

drop policy if exists views_delete on public.views;
create policy views_delete on public.views for delete
  using (public.can_access_project(project_id) and (user_id is null or user_id = auth.uid()));

drop trigger if exists views_set_updated_at on public.views;
create trigger views_set_updated_at
  before update on public.views
  for each row execute function public.set_updated_at();

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'views'
  ) then
    alter publication supabase_realtime add table public.views;
  end if;
end $$;
