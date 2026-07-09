-- minddy — vues v2 : onglet unique + vue système « Mes tickets » + vues globales
-- The my/all onglet dichotomy disappears: one tab, one flat list of views.
--   kind 'custom' — regular saved views (shared when user_id NULL, else personal)
--   kind 'my'     — per-user system view: seeded by the server (service role),
--                   never deletable, name and filters.assignee locked to ["@me"]
-- "@me" inside filters.assignee is a dynamic value resolved at filter time to
-- the viewing user (on public shares: to the view owner).
-- project_id NULL = global (cross-project) view — always personal.
-- Idempotent — safe to re-run.

-- ── 1. kind + nullable project_id + integrity ────────────────────────────────
alter table public.views add column if not exists kind text not null default 'custom';

do $$ begin
  alter table public.views add constraint views_kind_check check (kind in ('custom', 'my'));
exception when duplicate_object then null;
end $$;

alter table public.views alter column project_id drop not null;

-- Global views have no shared/member scope: they must belong to someone.
do $$ begin
  alter table public.views add constraint views_global_personal
    check (project_id is not null or user_id is not null);
exception when duplicate_object then null;
end $$;

-- The system view is per-user by definition.
do $$ begin
  alter table public.views add constraint views_system_personal
    check (kind <> 'my' or user_id is not null);
exception when duplicate_object then null;
end $$;

-- ── 2. data migration (only while the onglet column still exists) ────────────
do $$ begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'views' and column_name = 'onglet'
  ) then
    -- Empty-config 'my' views (the seeded defaults) are superseded by the
    -- system view; keeping them would duplicate it.
    delete from public.views
     where onglet = 'my'
       and filters = '{}'::jsonb
       and sort = 'manual'
       and coalesce((display->>'hideDone')::boolean, false) = false;
    -- Real 'my' views: materialize the implicit assignee=me filter.
    update public.views
       set filters = jsonb_set(filters, '{assignee}', '["@me"]'::jsonb)
     where onglet = 'my';
    alter table public.views drop column onglet;
  end if;
end $$;

-- ── 3. one system view per (user, project) and per (user, global) ────────────
create unique index if not exists uniq_views_system_project
  on public.views(user_id, project_id) where kind = 'my' and project_id is not null;
create unique index if not exists uniq_views_system_global
  on public.views(user_id) where kind = 'my' and project_id is null;

-- ── 4. RLS ────────────────────────────────────────────────────────────────────
-- Access: global views are strictly personal; project views as before (shared
-- or own personal, on accessible projects). System views are seeded via the
-- service role (insert) and edited only through the server updateView path,
-- which locks name/assignee — so RLS blocks direct update/delete on them.
-- No trigger-based delete guard: it would break ON DELETE CASCADE from
-- projects/auth.users (cascades bypass RLS but not triggers).

drop policy if exists views_select on public.views;
create policy views_select on public.views for select
  using (
    (project_id is null and user_id = auth.uid())
    or (project_id is not null and public.can_access_project(project_id)
        and (user_id is null or user_id = auth.uid()))
  );

drop policy if exists views_insert on public.views;
create policy views_insert on public.views for insert
  with check (
    kind = 'custom' and (
      (project_id is null and user_id = auth.uid())
      or (project_id is not null and public.can_access_project(project_id)
          and (user_id is null or user_id = auth.uid()))
    )
  );

drop policy if exists views_update on public.views;
create policy views_update on public.views for update
  using (
    kind <> 'my' and (
      (project_id is null and user_id = auth.uid())
      or (project_id is not null and public.can_access_project(project_id)
          and (user_id is null or user_id = auth.uid()))
    )
  )
  with check (
    kind <> 'my' and (
      (project_id is null and user_id = auth.uid())
      or (project_id is not null and public.can_access_project(project_id)
          and (user_id is null or user_id = auth.uid()))
    )
  );

drop policy if exists views_delete on public.views;
create policy views_delete on public.views for delete
  using (
    kind <> 'my' and (
      (project_id is null and user_id = auth.uid())
      or (project_id is not null and public.can_access_project(project_id)
          and (user_id is null or user_id = auth.uid()))
    )
  );

-- ── 5. realtime broadcast ─────────────────────────────────────────────────────
-- broadcast_project_scoped() builds 'project:' || NULL for global views → NULL
-- topic → swallowed exception → no event. Route those to the user topic.
create or replace function public.broadcast_views_row()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  pid uuid := coalesce(new.project_id, old.project_id);
  uid uuid := coalesce(new.user_id, old.user_id);
begin
  if pid is not null then
    perform realtime.broadcast_changes(
      'project:' || pid, tg_op, tg_op, tg_table_name, tg_table_schema, new, old);
  elsif uid is not null then
    perform realtime.broadcast_changes(
      'user:' || uid, tg_op, tg_op, tg_table_name, tg_table_schema, new, old);
  end if;
  return null;
exception when others then
  return null;
end;
$$;

drop trigger if exists views_broadcast on public.views;
create trigger views_broadcast
  after insert or update or delete on public.views
  for each row execute function public.broadcast_views_row();
