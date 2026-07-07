-- minddy — Triage (zone d'arrivage, plan §8)
-- A triage item is a lightweight proto-issue (title + description, no workflow
-- fields). It is fed by non-member sources (Numo later) and processed by a
-- human: accept (creates a real issue, keeps a link to it) or reject. Both
-- outcomes are kept as history (status) instead of deleting the row.
-- Idempotent — safe to re-run.

create table if not exists public.triage_items (
  id           uuid primary key default gen_random_uuid(),
  project_id   uuid not null references public.projects(id) on delete cascade,
  title        text not null,
  description  text,
  -- Attribution of the intake source ('numo', 'api', …). Free-form on purpose:
  -- it labels where the item came from, no logic branches on it.
  source       text not null default 'api',
  status       text not null default 'pending'
               check (status in ('pending', 'accepted', 'rejected')),
  -- The issue created when the item was accepted.
  issue_id     uuid references public.issues(id) on delete set null,
  processed_by uuid references auth.users(id) on delete set null,
  processed_at timestamptz,
  created_by   uuid references auth.users(id) on delete set null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create index if not exists idx_triage_items_project_status
  on public.triage_items(project_id, status);

alter table public.triage_items enable row level security;

-- Content CRUD = any project member (owner or member) via can_access_project().
drop policy if exists triage_items_select on public.triage_items;
create policy triage_items_select on public.triage_items for select
  using (public.can_access_project(project_id));

drop policy if exists triage_items_insert on public.triage_items;
create policy triage_items_insert on public.triage_items for insert
  with check (public.can_access_project(project_id));

drop policy if exists triage_items_update on public.triage_items;
create policy triage_items_update on public.triage_items for update
  using (public.can_access_project(project_id)) with check (public.can_access_project(project_id));

drop policy if exists triage_items_delete on public.triage_items;
create policy triage_items_delete on public.triage_items for delete
  using (public.can_access_project(project_id));

drop trigger if exists triage_items_set_updated_at on public.triage_items;
create trigger triage_items_set_updated_at
  before update on public.triage_items
  for each row execute function public.set_updated_at();

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'triage_items'
  ) then
    alter publication supabase_realtime add table public.triage_items;
  end if;
end $$;
