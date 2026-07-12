-- minddy — « Objectifs : pièces jointes + activité (+ @Numo) »
-- Aligns objectives on issues: they gain attachments, an activity log and a
-- comment thread (mentions, notifications, @Numo). Rather than parallel
-- objective_* tables, the three activity tables become POLYMORPHIC — each row
-- hangs off exactly one of an issue OR an objective. The issue path is
-- untouched (columns added, nothing removed). Idempotent — safe to re-run.

-- ── attachments ──────────────────────────────────────────────────────────────
-- Already carries project_id, so its RLS (can_access_project(project_id)) and
-- its delete policy (created_by) work unchanged for objective attachments.
alter table public.attachments alter column issue_id drop not null;
alter table public.attachments
  add column if not exists objective_id uuid references public.objectives(id) on delete cascade;
create index if not exists idx_attachments_objective on public.attachments(objective_id)
  where objective_id is not null;

-- ── comments ─────────────────────────────────────────────────────────────────
alter table public.comments alter column issue_id drop not null;
alter table public.comments
  add column if not exists objective_id uuid references public.objectives(id) on delete cascade;
create index if not exists idx_comments_objective on public.comments(objective_id, created_at)
  where objective_id is not null;

-- Read: a member of the parent's project (issue OR objective).
drop policy if exists comments_select on public.comments;
create policy comments_select on public.comments for select
  using (
    exists (
      select 1 from public.issues i
      where i.id = comments.issue_id and public.can_access_project(i.project_id)
    )
    or exists (
      select 1 from public.objectives o
      where o.id = comments.objective_id and public.can_access_project(o.project_id)
    )
  );

-- Insert (client path — the server writes via the service role): any member of
-- the parent's project, as themselves.
drop policy if exists comments_insert on public.comments;
create policy comments_insert on public.comments for insert
  with check (
    author_id = auth.uid()
    and (
      exists (
        select 1 from public.issues i
        where i.id = comments.issue_id and public.can_access_project(i.project_id)
      )
      or exists (
        select 1 from public.objectives o
        where o.id = comments.objective_id and public.can_access_project(o.project_id)
      )
    )
  );
-- update / delete stay author-only — unaffected by the parent kind.

-- ── issue_events (activity log — now issue OR objective) ─────────────────────
alter table public.issue_events alter column issue_id drop not null;
alter table public.issue_events
  add column if not exists objective_id uuid references public.objectives(id) on delete cascade;
create index if not exists idx_issue_events_objective on public.issue_events(objective_id, created_at)
  where objective_id is not null;

drop policy if exists issue_events_select on public.issue_events;
create policy issue_events_select on public.issue_events for select
  using (
    exists (
      select 1 from public.issues i
      where i.id = issue_events.issue_id and public.can_access_project(i.project_id)
    )
    or exists (
      select 1 from public.objectives o
      where o.id = issue_events.objective_id and public.can_access_project(o.project_id)
    )
  );

-- ── Exactly-one-parent constraints (guarded — existing rows all have issue_id) ─
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'attachments_parent_ck') then
    alter table public.attachments
      add constraint attachments_parent_ck
      check ((issue_id is not null) <> (objective_id is not null));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'comments_parent_ck') then
    alter table public.comments
      add constraint comments_parent_ck
      check ((issue_id is not null) <> (objective_id is not null));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'issue_events_parent_ck') then
    alter table public.issue_events
      add constraint issue_events_parent_ck
      check ((issue_id is not null) <> (objective_id is not null));
  end if;
end $$;

-- ── notifications ────────────────────────────────────────────────────────────
-- A notification may now point at an objective instead of an issue (mention /
-- comment on an objective). issue_id is already nullable — no check needed.
alter table public.notifications
  add column if not exists objective_id uuid references public.objectives(id) on delete cascade;

-- ── Realtime ─────────────────────────────────────────────────────────────────
-- New generalized broadcaster: resolve the project via the issue OR the
-- objective. NOTE: broadcast_issue_scoped is left intact — issue_categories
-- still uses it.
create or replace function public.broadcast_activity_scoped()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  pid uuid;
begin
  if coalesce(new.issue_id, old.issue_id) is not null then
    select project_id into pid from public.issues
     where id = coalesce(new.issue_id, old.issue_id);
  elsif coalesce(new.objective_id, old.objective_id) is not null then
    select project_id into pid from public.objectives
     where id = coalesce(new.objective_id, old.objective_id);
  end if;
  if pid is not null then
    perform realtime.broadcast_changes(
      'project:' || pid, tg_op, tg_op, tg_table_name, tg_table_schema, new, old);
  end if;
  return null;
exception when others then
  return null;
end;
$$;

-- Repoint comments + issue_events onto the generalized broadcaster.
drop trigger if exists comments_broadcast on public.comments;
create trigger comments_broadcast
  after insert or update or delete on public.comments
  for each row execute function public.broadcast_activity_scoped();

drop trigger if exists issue_events_broadcast on public.issue_events;
create trigger issue_events_broadcast
  after insert or update or delete on public.issue_events
  for each row execute function public.broadcast_activity_scoped();

-- attachments carries project_id directly → the project-scoped broadcaster fits
-- both issue and objective attachments.
drop trigger if exists attachments_broadcast on public.attachments;
create trigger attachments_broadcast
  after insert or update or delete on public.attachments
  for each row execute function public.broadcast_project_scoped();
