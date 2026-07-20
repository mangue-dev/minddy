-- minddy — Project creation options (MIN-76)
-- Idempotent — safe to re-run.

alter table public.projects
  add column if not exists auto_assign_enabled boolean not null default false;
