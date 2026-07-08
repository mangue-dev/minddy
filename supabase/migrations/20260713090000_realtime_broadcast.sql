-- minddy — realtime « broadcast from database »
-- Replaces postgres_changes (whose per-hook subscriptions joined before auth and
-- were silently RLS-filtered) with DB triggers emitting on two private topics:
--   project:{project_id} — project content (issues, objectives, categories, …)
--   user:{user_id}       — personal scope (notifications, my projects, invites)
-- The client subscribes to exactly one channel per topic (lib/realtime-provider.tsx).
-- Idempotent — safe to re-run.

-- ── trigger functions ────────────────────────────────────────────────────────
-- All broadcasts are wrapped so a realtime failure can NEVER fail the business
-- write. security definer: triggers fire from service-role and user sessions
-- alike, and realtime.send inserts into realtime.messages.

-- Tables carrying project_id directly: issues, objectives, categories, views.
create or replace function public.broadcast_project_scoped()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  pid uuid := coalesce(new.project_id, old.project_id);
begin
  perform realtime.broadcast_changes(
    'project:' || pid, tg_op, tg_op, tg_table_name, tg_table_schema, new, old);
  return null;
exception when others then
  return null;
end;
$$;

-- Tables keyed by issue_id: comments, issue_events, issue_categories. The
-- project is looked up from the issue; on FK-cascade deletes the issue row is
-- already gone → pid is null → skip (the issues DELETE broadcast covers the UI).
create or replace function public.broadcast_issue_scoped()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  pid uuid;
begin
  select project_id into pid from public.issues
   where id = coalesce(new.issue_id, old.issue_id);
  if pid is not null then
    perform realtime.broadcast_changes(
      'project:' || pid, tg_op, tg_op, tg_table_name, tg_table_schema, new, old);
  end if;
  return null;
exception when others then
  return null;
end;
$$;

-- project_members: the project topic feeds the members view; the user topic
-- feeds that user's sidebar/project list (join & leave).
create or replace function public.broadcast_members_row()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  perform realtime.broadcast_changes(
    'project:' || coalesce(new.project_id, old.project_id),
    tg_op, tg_op, tg_table_name, tg_table_schema, new, old);
  perform realtime.broadcast_changes(
    'user:' || coalesce(new.user_id, old.user_id),
    tg_op, tg_op, tg_table_name, tg_table_schema, new, old);
  return null;
exception when others then
  return null;
end;
$$;

-- project_invitations: project topic (pending list on the members page) and,
-- when the invitee is a known user, their user topic (my-invitations).
create or replace function public.broadcast_invitations_row()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  invitee uuid := coalesce(new.invited_user_id, old.invited_user_id);
begin
  perform realtime.broadcast_changes(
    'project:' || coalesce(new.project_id, old.project_id),
    tg_op, tg_op, tg_table_name, tg_table_schema, new, old);
  if invitee is not null then
    perform realtime.broadcast_changes(
      'user:' || invitee, tg_op, tg_op, tg_table_name, tg_table_schema, new, old);
  end if;
  return null;
exception when others then
  return null;
end;
$$;

-- projects: fan out to the owner and every member (their sidebars list it).
-- On project DELETE the members are already cascade-deleted when this AFTER
-- trigger runs — each cascade fires broadcast_members_row toward its user, so
-- members still learn about the removal.
create or replace function public.broadcast_projects_row()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  uid uuid;
begin
  for uid in
    select coalesce(new.owner_id, old.owner_id)
    union
    select user_id from public.project_members
     where project_id = coalesce(new.id, old.id)
  loop
    perform realtime.broadcast_changes(
      'user:' || uid, tg_op, tg_op, tg_table_name, tg_table_schema, new, old);
  end loop;
  return null;
exception when others then
  return null;
end;
$$;

-- notifications: personal topic only.
create or replace function public.broadcast_notifications_row()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  perform realtime.broadcast_changes(
    'user:' || coalesce(new.user_id, old.user_id),
    tg_op, tg_op, tg_table_name, tg_table_schema, new, old);
  return null;
exception when others then
  return null;
end;
$$;

-- ── triggers ─────────────────────────────────────────────────────────────────
drop trigger if exists issues_broadcast on public.issues;
create trigger issues_broadcast
  after insert or update or delete on public.issues
  for each row execute function public.broadcast_project_scoped();

drop trigger if exists objectives_broadcast on public.objectives;
create trigger objectives_broadcast
  after insert or update or delete on public.objectives
  for each row execute function public.broadcast_project_scoped();

drop trigger if exists categories_broadcast on public.categories;
create trigger categories_broadcast
  after insert or update or delete on public.categories
  for each row execute function public.broadcast_project_scoped();

drop trigger if exists views_broadcast on public.views;
create trigger views_broadcast
  after insert or update or delete on public.views
  for each row execute function public.broadcast_project_scoped();

drop trigger if exists comments_broadcast on public.comments;
create trigger comments_broadcast
  after insert or update or delete on public.comments
  for each row execute function public.broadcast_issue_scoped();

drop trigger if exists issue_events_broadcast on public.issue_events;
create trigger issue_events_broadcast
  after insert or update or delete on public.issue_events
  for each row execute function public.broadcast_issue_scoped();

drop trigger if exists issue_categories_broadcast on public.issue_categories;
create trigger issue_categories_broadcast
  after insert or update or delete on public.issue_categories
  for each row execute function public.broadcast_issue_scoped();

drop trigger if exists project_members_broadcast on public.project_members;
create trigger project_members_broadcast
  after insert or update or delete on public.project_members
  for each row execute function public.broadcast_members_row();

drop trigger if exists project_invitations_broadcast on public.project_invitations;
create trigger project_invitations_broadcast
  after insert or update or delete on public.project_invitations
  for each row execute function public.broadcast_invitations_row();

drop trigger if exists projects_broadcast on public.projects;
create trigger projects_broadcast
  after insert or update or delete on public.projects
  for each row execute function public.broadcast_projects_row();

drop trigger if exists notifications_broadcast on public.notifications;
create trigger notifications_broadcast
  after insert or update or delete on public.notifications
  for each row execute function public.broadcast_notifications_row();

-- ── receive authorization (private channels) ─────────────────────────────────
-- Without a select policy on realtime.messages, private-channel joins are
-- refused for everyone. Project topics reuse can_access_project(); user topics
-- are strictly personal.
drop policy if exists members_receive_broadcasts on realtime.messages;
create policy members_receive_broadcasts on realtime.messages
for select to authenticated
using (
  extension = 'broadcast' and (
    (
      realtime.topic() like 'project:%'
      and public.can_access_project(split_part(realtime.topic(), ':', 2)::uuid)
    )
    or (
      realtime.topic() like 'user:%'
      and split_part(realtime.topic(), ':', 2) = (select auth.uid()::text)
    )
  )
);

-- ── retire postgres_changes ──────────────────────────────────────────────────
-- Broadcast replaces WAL-based delivery; dropping the tables from the
-- publication stops the (now useless) WALRUS work per write.
do $$
declare
  t text;
begin
  foreach t in array array[
    'projects','project_members','project_invitations','issues','objectives',
    'comments','issue_events','notifications','categories','views'
  ] loop
    if exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t
    ) then
      execute format('alter publication supabase_realtime drop table public.%I', t);
    end if;
  end loop;
end $$;
