-- minddy — chantier 9b « Inbox / notifications »
-- In-app notifications. v1 triggers (plan §9): assigned to me, @mentioned in a
-- comment, new comment on an issue I own/am assigned. Written server-side
-- (service client); each user manages only their own. Idempotent.

create table if not exists public.notifications (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users(id) on delete cascade, -- recipient
  project_id uuid references public.projects(id) on delete cascade,
  type       text not null check (type in ('assigned', 'mention', 'comment')),
  issue_id   uuid references public.issues(id) on delete cascade,
  comment_id uuid references public.comments(id) on delete cascade,
  actor_id   uuid references auth.users(id) on delete set null,
  read_at    timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists idx_notifications_user
  on public.notifications(user_id, created_at desc);
create index if not exists idx_notifications_unread
  on public.notifications(user_id) where read_at is null;

alter table public.notifications enable row level security;

-- Each user only ever sees / updates / deletes their own. Inserts are done by
-- the service client (RLS bypassed), so there is no insert policy.
drop policy if exists notifications_select on public.notifications;
create policy notifications_select on public.notifications for select
  using (user_id = auth.uid());

drop policy if exists notifications_update on public.notifications;
create policy notifications_update on public.notifications for update
  using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists notifications_delete on public.notifications;
create policy notifications_delete on public.notifications for delete
  using (user_id = auth.uid());

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'notifications'
  ) then
    alter publication supabase_realtime add table public.notifications;
  end if;
end $$;
