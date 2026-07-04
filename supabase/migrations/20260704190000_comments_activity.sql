-- minddy — chantier 9a « Commentaires & Journal d'activité »
-- Per-issue comment thread + activity log. Both are grand-children of issues
-- (access via the issue's project). Interleaved into one timeline client-side.
-- Idempotent — safe to re-run.

-- ── comments ─────────────────────────────────────────────────────────────────
create table if not exists public.comments (
  id         uuid primary key default gen_random_uuid(),
  issue_id   uuid not null references public.issues(id) on delete cascade,
  author_id  uuid references auth.users(id) on delete set null,
  body       text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_comments_issue on public.comments(issue_id, created_at);

alter table public.comments enable row level security;

drop policy if exists comments_select on public.comments;
create policy comments_select on public.comments for select
  using (
    exists (
      select 1 from public.issues i
      where i.id = comments.issue_id and public.can_access_project(i.project_id)
    )
  );

-- Any member can comment (as themselves).
drop policy if exists comments_insert on public.comments;
create policy comments_insert on public.comments for insert
  with check (
    author_id = auth.uid()
    and exists (
      select 1 from public.issues i
      where i.id = comments.issue_id and public.can_access_project(i.project_id)
    )
  );

-- Author edits/deletes their own comment.
drop policy if exists comments_update on public.comments;
create policy comments_update on public.comments for update
  using (author_id = auth.uid()) with check (author_id = auth.uid());

drop policy if exists comments_delete on public.comments;
create policy comments_delete on public.comments for delete
  using (author_id = auth.uid());

drop trigger if exists comments_set_updated_at on public.comments;
create trigger comments_set_updated_at
  before update on public.comments
  for each row execute function public.set_updated_at();

-- ── issue_events (activity log) ──────────────────────────────────────────────
-- Written server-side (service client) from mutation routes: type + optional
-- field/from_value/to_value. Description changes store no diff (v1, plan §7).
create table if not exists public.issue_events (
  id         uuid primary key default gen_random_uuid(),
  issue_id   uuid not null references public.issues(id) on delete cascade,
  actor_id   uuid references auth.users(id) on delete set null,
  type       text not null,
  field      text,
  from_value text,
  to_value   text,
  created_at timestamptz not null default now()
);

create index if not exists idx_issue_events_issue on public.issue_events(issue_id, created_at);

alter table public.issue_events enable row level security;

-- Read-only for members; inserts happen via the service client (RLS bypassed).
drop policy if exists issue_events_select on public.issue_events;
create policy issue_events_select on public.issue_events for select
  using (
    exists (
      select 1 from public.issues i
      where i.id = issue_events.issue_id and public.can_access_project(i.project_id)
    )
  );

-- ── Realtime ─────────────────────────────────────────────────────────────────
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'comments'
  ) then
    alter publication supabase_realtime add table public.comments;
  end if;
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'issue_events'
  ) then
    alter publication supabase_realtime add table public.issue_events;
  end if;
end $$;
