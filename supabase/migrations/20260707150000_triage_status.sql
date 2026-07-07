-- minddy — Triage v2 : le triage devient un statut d'issue (modèle Linear).
-- A triage issue is a REAL issue isolated from the board by its status; the
-- proto-issue table from the previous iteration is superseded and dropped.
-- 'duplicate' closes an issue as a duplicate of another (duplicate_of_id).
-- Idempotent — safe to re-run.

alter table public.issues drop constraint if exists issues_status_check;
alter table public.issues add constraint issues_status_check
  check (status in ('triage','backlog','todo','in_progress','in_review','done','canceled','duplicate'));

-- The canonical issue this one duplicates. Only meaningful with status
-- 'duplicate'; kept if the canonical issue is deleted (set null).
alter table public.issues
  add column if not exists duplicate_of_id uuid references public.issues(id) on delete set null;

create index if not exists idx_issues_duplicate_of on public.issues(duplicate_of_id);

-- Supersedes the proto-issue arrival zone (20260707140000_triage.sql): items
-- now land as issues with status 'triage'. Dropping the table also removes its
-- policies, trigger and realtime publication membership.
drop table if exists public.triage_items;
