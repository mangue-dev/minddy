-- minddy — MIN-201 : les ROUTINES entrent dans la corbeille.
--
-- Supprimer une routine était un `delete` sec, et il emportait TOUT : ses
-- passages (`agent_runs.routine_id` cascade), donc les conversations, les diffs
-- et les pull requests qui s'y lisent. Un clic de trop et l'historique n'existe
-- plus nulle part. Cinquième type de la corbeille de MIN-133, même mécanique
-- exactement : la ligne est marquée, elle sort de l'app, elle revient telle
-- quelle pendant 30 jours, puis le balayage nocturne fait la vraie suppression
-- — celle qui cascade, une fois seulement.
--
-- Rien ne bouge du côté d'`agent_runs` : une routine corbeillée GARDE ses
-- passages, sa cadence, son instruction, son modèle et son échéance. C'est ce
-- qui rend la restauration exacte — il n'y a rien à reconstruire, seulement deux
-- colonnes à remettre à null.
--
-- Idempotent — safe à re-run.

-- ── Colonnes ─────────────────────────────────────────────────────────────────
alter table public.agent_routines
  add column if not exists deleted_at timestamptz,
  add column if not exists deleted_by uuid references auth.users(id) on delete set null;

-- ── Index de la corbeille ────────────────────────────────────────────────────
-- Partiel, comme les quatre autres (20260919090000) : la corbeille lit une
-- poignée de lignes dans une table dont l'immense majorité est vivante.
create index if not exists idx_agent_routines_trash
  on public.agent_routines(project_id, deleted_at desc) where deleted_at is not null;

-- ── Le balayage du cron ne voit plus les corbeillées ─────────────────────────
-- `create index if not exists` ne CHANGERAIT pas le prédicat d'un index déjà
-- là : il faut le refaire. Une routine à la corbeille ne doit plus partir toute
-- seule le lundi matin en dépensant le budget de quelqu'un qui la croit
-- supprimée — le filtre est dans `dueRoutines` (lib/server/routines.ts), et
-- l'index le suit pour que la requête garde son plan.
drop index if exists public.idx_agent_routines_due;
create index if not exists idx_agent_routines_due
  on public.agent_routines(next_run_at) where enabled and deleted_at is null;

-- ── RLS : les corbeillées sortent des lectures authentifiées ─────────────────
-- Toutes les lectures de routines passent aujourd'hui par le client service
-- (lib/server/routines.ts), filtré à la main ; la policy porte quand même le
-- filtre, comme `issues_select` et `objectives_select`, pour que la prochaine
-- lecture faite au client de session n'ait pas à y penser.
drop policy if exists agent_routines_select on public.agent_routines;
create policy agent_routines_select on public.agent_routines
  for select to authenticated
  using (public.can_access_project(project_id) and deleted_at is null);
