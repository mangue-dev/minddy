-- minddy — MIN-133 « Corbeille »
-- Soft delete des tickets, objectifs et feedbacks (les projets l'avaient déjà
-- depuis 20260704120000), plus l'auteur de la suppression pour les quatre.
-- Supprimer devient un UPDATE ; la ligne reste 30 jours, visible depuis la
-- corbeille, puis part pour de bon au balayage nocturne (lib/server/retention.ts).
-- Idempotent — safe à re-run.
--
-- LE LEVIER DE LECTURE, C'EST LA RLS. `issues` et `objectives` sont lues à ~50
-- endroits ; plutôt que d'ajouter un `.is("deleted_at", null)` partout, la policy
-- `*_select` porte le filtre : toute lecture faite avec le client authentifié
-- (auth.supabase) exclut les corbeillés sans qu'un seul appel change. Le client
-- service contourne la RLS — ces sites-là sont filtrés à la main, en TypeScript.
-- `feedback_posts` n'a aucune policy (tout y passe par le service) : rien à
-- changer ici, tout se joue dans lib/server/feedback/*.
--
-- La suppression ne cascade PAS et ne détache RIEN : un objectif corbeillé garde
-- ses tickets liés (objective_id intact), un projet corbeillé garde les siens.
-- C'est ce qui rend la restauration exacte — l'élément revient tel qu'il était,
-- commentaires, pièces jointes et liens compris.

-- ── Colonnes ─────────────────────────────────────────────────────────────────
alter table public.issues
  add column if not exists deleted_at timestamptz,
  add column if not exists deleted_by uuid references auth.users(id) on delete set null;

alter table public.objectives
  add column if not exists deleted_at timestamptz,
  add column if not exists deleted_by uuid references auth.users(id) on delete set null;

alter table public.feedback_posts
  add column if not exists deleted_at timestamptz,
  add column if not exists deleted_by uuid references auth.users(id) on delete set null;

alter table public.projects
  add column if not exists deleted_by uuid references auth.users(id) on delete set null;

-- ── Index de la corbeille ────────────────────────────────────────────────────
-- Partiels sur `deleted_at is not null` : la corbeille lit une poignée de lignes
-- dans des tables dont l'immense majorité est vivante. Les index chauds
-- existants (idx_issues_project*, …) restent pleins — les rendre partiels
-- ferait perdre leur plan aux requêtes du client service qui n'ont pas encore
-- le prédicat, pour un gain de taille négligeable.
create index if not exists idx_issues_trash
  on public.issues(project_id, deleted_at desc) where deleted_at is not null;
create index if not exists idx_objectives_trash
  on public.objectives(project_id, deleted_at desc) where deleted_at is not null;
create index if not exists idx_feedback_posts_trash
  on public.feedback_posts(project_id, deleted_at desc) where deleted_at is not null;
create index if not exists idx_projects_trash
  on public.projects(owner_id, deleted_at desc) where deleted_at is not null;

-- ── RLS : les corbeillés sortent de toutes les lectures authentifiées ────────
-- Seule la policy SELECT bouge. UPDATE reste ouverte aux membres du projet :
-- supprimer ET restaurer sont des UPDATE, et la corbeille passe de toute façon
-- par le client service (lib/server/trash.ts) qui refait le contrôle d'accès.
drop policy if exists issues_select on public.issues;
create policy issues_select on public.issues for select
  using (public.can_access_project(project_id) and deleted_at is null);

drop policy if exists objectives_select on public.objectives;
create policy objectives_select on public.objectives for select
  using (public.can_access_project(project_id) and deleted_at is null);

-- ── Statut auto des objectifs ────────────────────────────────────────────────
-- SECURITY DEFINER : la RLS ne s'applique pas, le filtre est donc explicite.
-- Un ticket corbeillé ne compte plus dans la progression de son objectif — ce
-- qu'on voit à l'écran (le board l'a fait disparaître) et ce que le statut dit
-- doivent rester la même chose.
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
  where objective_id = obj_id
    and deleted_at is null;

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

-- Le déclencheur gagne un cas : corbeiller ou restaurer un ticket change la
-- progression de son objectif exactement comme le créer ou le supprimer.
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
  elsif new.status is distinct from old.status
     or new.deleted_at is distinct from old.deleted_at then
    perform public.reconcile_objective_status(new.objective_id);
  end if;
  return null;
end;
$$;

-- Note — get_cycle_stats (20260804090000) et get_user_stats (20260714090000 /
-- 20260823090000) n'ont RIEN à changer : la première est SECURITY INVOKER, donc
-- la nouvelle policy issues_select la filtre déjà ; les secondes ne lisent que
-- le ledger stat_events, volontairement détaché des tickets pour que supprimer
-- n'efface pas l'historique de contribution.
