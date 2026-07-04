-- minddy — chantier 2 « Projets »
-- projects + project_members + project_invitations, SECURITY DEFINER access
-- helpers, RLS, and Realtime publication. Idempotent — safe to re-run.
--
-- Multi-tenant model (cloned from AutoKap):
--   owner       = projects.owner_id
--   can see      = owner OR member          -> can_access_project()
--   can mutate   = owner only (the project itself, members, invitations)
--   member CRUD on project *content* comes with later tables (issues, …).

-- ── projects ────────────────────────────────────────────────────────────────
create table if not exists public.projects (
  id         uuid primary key default gen_random_uuid(),
  owner_id   uuid not null references auth.users(id) on delete cascade,
  name       text not null,
  key        text not null,
  color      text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

-- Key is unique per owner among *live* projects; soft-deleting frees the key.
create unique index if not exists idx_projects_owner_key_live
  on public.projects(owner_id, key)
  where deleted_at is null;

create index if not exists idx_projects_owner on public.projects(owner_id);

alter table public.projects enable row level security;

-- ── project_members ─────────────────────────────────────────────────────────
-- The owner is NOT stored here — only additional collaborators. The "owner"
-- role is synthesized in app code from projects.owner_id.
create table if not exists public.project_members (
  project_id uuid not null references public.projects(id) on delete cascade,
  user_id    uuid not null references auth.users(id) on delete cascade,
  role       text not null default 'member',
  added_by   uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  primary key (project_id, user_id)
);

create index if not exists idx_project_members_user on public.project_members(user_id);

alter table public.project_members enable row level security;

-- ── project_invitations ─────────────────────────────────────────────────────
create table if not exists public.project_invitations (
  id              uuid primary key default gen_random_uuid(),
  project_id      uuid not null references public.projects(id) on delete cascade,
  invited_email   text not null,
  invited_user_id uuid references auth.users(id) on delete set null,
  invited_by      uuid not null references auth.users(id) on delete cascade,
  status          text not null default 'pending'
                  check (status in ('pending', 'accepted', 'rejected', 'cancelled')),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  responded_at    timestamptz
);

create index if not exists idx_project_invitations_project
  on public.project_invitations(project_id, status, created_at desc);
create index if not exists idx_project_invitations_invited_user
  on public.project_invitations(invited_user_id, status, created_at desc);

-- Only one *pending* invite per (project, email); resolved ones allow re-invite.
create unique index if not exists idx_project_invitations_pending_unique
  on public.project_invitations(project_id, invited_email)
  where status = 'pending';

alter table public.project_invitations enable row level security;

-- ── Access helpers (SECURITY DEFINER, non-recursive) ─────────────────────────
-- SECURITY DEFINER + STABLE lets an RLS policy on one table consult another
-- without re-triggering that table's RLS (which would recurse). Kept split so
-- projects' policy calls is_project_member() and members' policy calls
-- is_project_owner() — never an inline subquery back into the same table.
create or replace function public.is_project_owner(project_uuid uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.projects
    where id = project_uuid and owner_id = auth.uid()
  );
$$;

create or replace function public.is_project_member(project_uuid uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.project_members
    where project_id = project_uuid and user_id = auth.uid()
  );
$$;

create or replace function public.can_access_project(project_uuid uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.is_project_owner(project_uuid)
      or public.is_project_member(project_uuid);
$$;

-- ── Shared updated_at trigger ────────────────────────────────────────────────
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists projects_set_updated_at on public.projects;
create trigger projects_set_updated_at
  before update on public.projects
  for each row execute function public.set_updated_at();

drop trigger if exists project_invitations_set_updated_at on public.project_invitations;
create trigger project_invitations_set_updated_at
  before update on public.project_invitations
  for each row execute function public.set_updated_at();

-- ── RLS: projects ────────────────────────────────────────────────────────────
drop policy if exists projects_select on public.projects;
create policy projects_select on public.projects for select
  using (auth.uid() = owner_id or public.is_project_member(id));

drop policy if exists projects_insert on public.projects;
create policy projects_insert on public.projects for insert
  with check (auth.uid() = owner_id);

drop policy if exists projects_update on public.projects;
create policy projects_update on public.projects for update
  using (auth.uid() = owner_id) with check (auth.uid() = owner_id);

drop policy if exists projects_delete on public.projects;
create policy projects_delete on public.projects for delete
  using (auth.uid() = owner_id);

-- ── RLS: project_members ─────────────────────────────────────────────────────
drop policy if exists project_members_select on public.project_members;
create policy project_members_select on public.project_members for select
  using (auth.uid() = user_id or public.is_project_owner(project_id));

drop policy if exists project_members_insert on public.project_members;
create policy project_members_insert on public.project_members for insert
  with check (public.is_project_owner(project_id));

drop policy if exists project_members_update on public.project_members;
create policy project_members_update on public.project_members for update
  using (public.is_project_owner(project_id)) with check (public.is_project_owner(project_id));

-- Owner can remove anyone; a member can remove themselves (leave).
drop policy if exists project_members_delete on public.project_members;
create policy project_members_delete on public.project_members for delete
  using (public.is_project_owner(project_id) or auth.uid() = user_id);

-- ── RLS: project_invitations ─────────────────────────────────────────────────
drop policy if exists project_invitations_select on public.project_invitations;
create policy project_invitations_select on public.project_invitations for select
  using (public.is_project_owner(project_id) or auth.uid() = invited_user_id);

drop policy if exists project_invitations_insert on public.project_invitations;
create policy project_invitations_insert on public.project_invitations for insert
  with check (public.is_project_owner(project_id));

drop policy if exists project_invitations_update_owner on public.project_invitations;
create policy project_invitations_update_owner on public.project_invitations for update
  using (public.is_project_owner(project_id)) with check (public.is_project_owner(project_id));

drop policy if exists project_invitations_update_invitee on public.project_invitations;
create policy project_invitations_update_invitee on public.project_invitations for update
  using (auth.uid() = invited_user_id) with check (auth.uid() = invited_user_id);

drop policy if exists project_invitations_delete on public.project_invitations;
create policy project_invitations_delete on public.project_invitations for delete
  using (public.is_project_owner(project_id));

-- ── Realtime publication ─────────────────────────────────────────────────────
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'projects'
  ) then
    alter publication supabase_realtime add table public.projects;
  end if;
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'project_members'
  ) then
    alter publication supabase_realtime add table public.project_members;
  end if;
end $$;
