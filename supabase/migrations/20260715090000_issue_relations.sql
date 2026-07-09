-- minddy — chantier « Relations entre issues » (MIN-25)
-- blocks / blocked-by / related between issues. Only TWO types are stored:
--   'blocks'   — directed: source_id blocks target_id (blocked_by is the inverse read)
--   'related'  — symmetric: canonicalized so source_id < target_id (one row per pair)
-- Both issues must belong to the same project as the relation row. Deleting an
-- issue cascades its relations. Idempotent — safe to re-run.

create table if not exists public.issue_relations (
  id         uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  source_id  uuid not null references public.issues(id) on delete cascade,
  target_id  uuid not null references public.issues(id) on delete cascade,
  type       text not null check (type in ('blocks','related')),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  check (source_id <> target_id),
  -- One row per (ordered) pair + type. 'related' is canonicalized below so the
  -- symmetric duplicate (B,A) collapses onto (A,B).
  unique (source_id, target_id, type)
);

create index if not exists idx_issue_relations_project on public.issue_relations(project_id);
create index if not exists idx_issue_relations_source on public.issue_relations(source_id);
create index if not exists idx_issue_relations_target on public.issue_relations(target_id);

-- Enforce same-project membership of both endpoints and canonicalize the
-- ordering of a symmetric 'related' pair (least id first) so the unique index
-- dedupes it regardless of the direction the caller passed.
create or replace function public.enforce_issue_relation()
returns trigger language plpgsql set search_path = public as $$
declare
  tmp uuid;
begin
  if not exists (
    select 1 from public.issues i
    where i.id = new.source_id and i.project_id = new.project_id
  ) then
    raise exception 'La source de la relation doit être dans le même projet';
  end if;
  if not exists (
    select 1 from public.issues i
    where i.id = new.target_id and i.project_id = new.project_id
  ) then
    raise exception 'La cible de la relation doit être dans le même projet';
  end if;

  if new.type = 'related' and new.source_id > new.target_id then
    tmp := new.source_id;
    new.source_id := new.target_id;
    new.target_id := tmp;
  end if;
  return new;
end;
$$;

drop trigger if exists issue_relations_enforce on public.issue_relations;
create trigger issue_relations_enforce
  before insert or update on public.issue_relations
  for each row execute function public.enforce_issue_relation();

-- ── RLS ──────────────────────────────────────────────────────────────────────
-- Add / read / remove = any project member; no update path (relations are
-- immutable links, edited by delete + re-insert).
alter table public.issue_relations enable row level security;

drop policy if exists issue_relations_select on public.issue_relations;
create policy issue_relations_select on public.issue_relations for select
  using (public.can_access_project(project_id));

drop policy if exists issue_relations_insert on public.issue_relations;
create policy issue_relations_insert on public.issue_relations for insert
  with check (public.can_access_project(project_id));

drop policy if exists issue_relations_delete on public.issue_relations;
create policy issue_relations_delete on public.issue_relations for delete
  using (public.can_access_project(project_id));

-- ── Realtime ─────────────────────────────────────────────────────────────────
-- The row carries project_id, so the generic project-scoped broadcaster fits.
drop trigger if exists issue_relations_broadcast on public.issue_relations;
create trigger issue_relations_broadcast
  after insert or update or delete on public.issue_relations
  for each row execute function public.broadcast_project_scoped();
