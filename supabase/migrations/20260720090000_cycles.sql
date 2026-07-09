-- minddy — chantier « Cycles » (MIN-32)
-- A cycle is the user's PERSONAL, CROSS-PROJECT week/fortnight ("what am I
-- working on this week"), identified by its dates — not a team sprint, not a
-- per-project iteration. Rows are created lazily by the server cores (no cron):
--   start_date inclusive, end_date EXCLUSIVE (= next cycle's start),
--   intensity/target_points snapshotted per cycle (past cycles stay frozen,
--   current/future get re-aligned to the user's prefs at read time),
--   completed_points snapshotted when the cycle closes (velocity calibration),
--   filled_at claims the one-shot deterministic auto-fill.
-- unique(user_id, start_date) is the concurrency guard: two simultaneous board
-- loads can never double-create a window. Idempotent — safe to re-run.

create table if not exists public.cycles (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null references auth.users(id) on delete cascade,
  start_date       date not null,
  end_date         date not null,
  intensity        text not null check (intensity in ('light','medium','heavy')),
  target_points    integer not null check (target_points > 0),
  completed_points integer,
  filled_at        timestamptz,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  check (end_date > start_date),
  unique (user_id, start_date)
);

create index if not exists idx_cycles_user on public.cycles(user_id, start_date desc);

drop trigger if exists cycles_set_updated_at on public.cycles;
create trigger cycles_set_updated_at
  before update on public.cycles
  for each row execute function public.set_updated_at();

-- Issues point at the cycle they belong to; deleting a cycle frees its issues.
alter table public.issues
  add column if not exists cycle_id uuid references public.cycles(id) on delete set null;
create index if not exists idx_issues_cycle on public.issues(cycle_id);

-- THE cycle/assignment invariant, enforced on every write path (UI, Numo, MCP,
-- bulk edits): a cycled issue is always assigned to the cycle's owner. When an
-- issue is reassigned to someone else (or unassigned), it silently leaves the
-- cycle — "réassigner ailleurs sort l'issue du cycle".
create or replace function public.enforce_issue_cycle()
returns trigger language plpgsql set search_path = public as $$
declare
  owner uuid;
begin
  if new.cycle_id is not null then
    select user_id into owner from public.cycles where id = new.cycle_id;
    if owner is null or new.assignee_id is distinct from owner then
      new.cycle_id := null;
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists issues_enforce_cycle on public.issues;
create trigger issues_enforce_cycle
  before insert or update on public.issues
  for each row execute function public.enforce_issue_cycle();

-- ── RLS ──────────────────────────────────────────────────────────────────────
-- Cycles are strictly personal: read your own only. All writes go through the
-- service client in the server cores (lib/server/cycles.ts), which own the
-- lifecycle (lazy creation, rollover, fill) — no client-side write path.
alter table public.cycles enable row level security;

drop policy if exists cycles_select on public.cycles;
create policy cycles_select on public.cycles for select
  using (user_id = (select auth.uid()));

-- ── Realtime ─────────────────────────────────────────────────────────────────
-- No project_id on the row — route changes to the owner's personal topic, same
-- shape as notifications (broadcast_notifications_row only reads user_id).
drop trigger if exists cycles_broadcast on public.cycles;
create trigger cycles_broadcast
  after insert or update or delete on public.cycles
  for each row execute function public.broadcast_notifications_row();
