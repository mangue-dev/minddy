-- minddy — auto-managed objective status
-- An objective's status now follows its linked issues' progress instead of being
-- set by hand:
--   • no issue, or none started        → 'planned'
--   • at least one issue started        → 'in_progress'
--   • every issue closed (done/cancel…) → 'done'
-- "Started" mirrors the objective progress bar / statusCompletionCredit
-- (lib/cycle.ts, lib/use-objectives-query.ts): an issue counts as started the
-- moment it leaves triage/backlog/todo. So the status flips to 'in_progress' as
-- soon as the progress bar leaves zero — the behaviour the board banner shows.
--
-- 'canceled' stays a MANUAL terminal state: a canceled objective is never
-- resurrected by this rule. A manual status edit still sticks until the next
-- issue change re-derives it.
--
-- The recompute runs in the SAME transaction as the issue write, so the existing
-- objectives_broadcast trigger propagates the new status to open boards live
-- (lib/realtime-provider.tsx invalidates ["objectives", projectId]).
-- Idempotent — safe to re-run.

-- Recompute one objective's status from its current issues.
create or replace function public.reconcile_objective_status(obj_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare
  total   int;
  started int;
  closed  int;
  derived text;
begin
  if obj_id is null then
    return;
  end if;

  select
    count(*),
    count(*) filter (where status not in ('triage', 'backlog', 'todo')),
    count(*) filter (where status in ('done', 'canceled', 'duplicate'))
  into total, started, closed
  from public.issues
  where objective_id = obj_id;

  if total = 0 then
    derived := 'planned';
  elsif closed = total then
    derived := 'done';
  elsif started > 0 then
    derived := 'in_progress';
  else
    derived := 'planned';
  end if;

  -- No-op (no broadcast) when unchanged; leave a manually-canceled objective be.
  update public.objectives
     set status = derived
   where id = obj_id
     and status <> derived
     and status <> 'canceled';
end;
$$;

-- Fire on any issue write that can move an objective's progress: a status change,
-- or the issue joining/leaving an objective (both sides recomputed).
create or replace function public.issues_sync_objective_status()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    perform public.reconcile_objective_status(new.objective_id);
  elsif tg_op = 'DELETE' then
    perform public.reconcile_objective_status(old.objective_id);
  elsif new.objective_id is distinct from old.objective_id then
    perform public.reconcile_objective_status(old.objective_id);
    perform public.reconcile_objective_status(new.objective_id);
  elsif new.status is distinct from old.status then
    perform public.reconcile_objective_status(new.objective_id);
  end if;
  return null;
end;
$$;

drop trigger if exists issues_sync_objective_status on public.issues;
create trigger issues_sync_objective_status
  after insert or update or delete on public.issues
  for each row execute function public.issues_sync_objective_status();

-- Backfill: align every existing objective with its issues right now
-- (reconcile_objective_status skips canceled ones).
do $$
declare o record;
begin
  for o in select id from public.objectives loop
    perform public.reconcile_objective_status(o.id);
  end loop;
end $$;
