-- minddy — chantier « Pièces jointes » (MIN-24)
-- Files on issues, comments and comment replies. Rows are inserted server-side
-- (service client, access checked in lib/server/attachments.ts); the files live
-- in the PRIVATE `attachments` bucket and are read through short-lived signed
-- URLs (GET /api/attachments/file). Assistant-shell uploads have NO row here —
-- they are referenced from assistant_messages.metadata. Idempotent.

create table if not exists public.attachments (
  id           uuid primary key default gen_random_uuid(),
  project_id   uuid not null references public.projects(id) on delete cascade,
  issue_id     uuid not null references public.issues(id) on delete cascade,
  -- NULL = attached to the issue itself; set = attached to that comment/reply.
  comment_id   uuid references public.comments(id) on delete cascade,
  storage_path text not null,
  file_name    text not null,
  mime_type    text not null default 'application/octet-stream',
  size_bytes   bigint not null default 0,
  created_by   uuid references auth.users(id) on delete set null,
  created_at   timestamptz not null default now()
);

create index if not exists idx_attachments_issue on public.attachments(issue_id);
create index if not exists idx_attachments_comment on public.attachments(comment_id)
  where comment_id is not null;

-- ── RLS ──────────────────────────────────────────────────────────────────────
-- Read = any project member; delete = the uploader (pill "X"). No insert or
-- update policies: rows are written by the service client only.
alter table public.attachments enable row level security;

drop policy if exists attachments_select on public.attachments;
create policy attachments_select on public.attachments for select
  using (public.can_access_project(project_id));

drop policy if exists attachments_delete on public.attachments;
create policy attachments_delete on public.attachments for delete
  using (created_by = (select auth.uid()));

-- ── Realtime ─────────────────────────────────────────────────────────────────
-- issue_id is NOT NULL, so the generic issue-scoped broadcaster fits.
drop trigger if exists attachments_broadcast on public.attachments;
create trigger attachments_broadcast
  after insert or update or delete on public.attachments
  for each row execute function public.broadcast_issue_scoped();

-- ── PRIVATE storage bucket ───────────────────────────────────────────────────
-- Two path families:
--   projects/{project_id}/{uuid}/{filename} — issue & comment attachments
--   chat/{user_id}/{uuid}/{filename}        — assistant-shell uploads
insert into storage.buckets (id, name, public)
values ('attachments', 'attachments', false)
on conflict (id) do nothing;

-- Upload only, gated by the path prefix. Nested CASE (not AND) because
-- Postgres does not guarantee AND short-circuit inside policies: the uuid
-- regex guard must be evaluated before the ::uuid cast or a malformed folder
-- name raises 22P02 instead of being rejected.
drop policy if exists "attachments insert" on storage.objects;
create policy "attachments insert" on storage.objects for insert to authenticated
  with check (
    bucket_id = 'attachments'
    and case (storage.foldername(name))[1]
      when 'projects' then
        case when (storage.foldername(name))[2]
               ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
             then public.can_access_project(((storage.foldername(name))[2])::uuid)
             else false
        end
      when 'chat' then (storage.foldername(name))[2] = (select auth.uid()::text)
      else false
    end
  );

-- No storage select/update/delete policies: reads go through signed URLs
-- minted by the service role (which bypasses RLS), deletes are server-side.
