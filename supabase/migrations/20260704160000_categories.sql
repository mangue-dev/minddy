-- minddy — chantier 6 « Catégories »
-- Per-project labels (categories) + N–N link to issues. Managed by any member
-- (plan §9). Idempotent — safe to re-run.

create table if not exists public.categories (
  id         uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  name       text not null,
  color      text not null default '#6b7280',
  created_at timestamptz not null default now()
);

create index if not exists idx_categories_project on public.categories(project_id);

alter table public.categories enable row level security;

drop policy if exists categories_select on public.categories;
create policy categories_select on public.categories for select
  using (public.can_access_project(project_id));

drop policy if exists categories_insert on public.categories;
create policy categories_insert on public.categories for insert
  with check (public.can_access_project(project_id));

drop policy if exists categories_update on public.categories;
create policy categories_update on public.categories for update
  using (public.can_access_project(project_id)) with check (public.can_access_project(project_id));

drop policy if exists categories_delete on public.categories;
create policy categories_delete on public.categories for delete
  using (public.can_access_project(project_id));

-- ── issue ↔ category (N–N) ───────────────────────────────────────────────────
create table if not exists public.issue_categories (
  issue_id    uuid not null references public.issues(id) on delete cascade,
  category_id uuid not null references public.categories(id) on delete cascade,
  primary key (issue_id, category_id)
);

create index if not exists idx_issue_categories_category
  on public.issue_categories(category_id);

alter table public.issue_categories enable row level security;

-- Grand-child: access via the parent issue's project.
drop policy if exists issue_categories_select on public.issue_categories;
create policy issue_categories_select on public.issue_categories for select
  using (
    exists (
      select 1 from public.issues i
      where i.id = issue_categories.issue_id and public.can_access_project(i.project_id)
    )
  );

drop policy if exists issue_categories_insert on public.issue_categories;
create policy issue_categories_insert on public.issue_categories for insert
  with check (
    exists (
      select 1 from public.issues i
      where i.id = issue_categories.issue_id and public.can_access_project(i.project_id)
    )
  );

drop policy if exists issue_categories_delete on public.issue_categories;
create policy issue_categories_delete on public.issue_categories for delete
  using (
    exists (
      select 1 from public.issues i
      where i.id = issue_categories.issue_id and public.can_access_project(i.project_id)
    )
  );

-- Realtime for category CRUD (project-scoped). issue_categories assignment is
-- reconciled by client invalidation, so it's not published here.
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'categories'
  ) then
    alter publication supabase_realtime add table public.categories;
  end if;
end $$;
