-- minddy — commentaires internes sur les feedback (MIN-51)
-- Donne aux posts de feedback un fil de commentaires à parité avec les
-- tickets/objectifs : on ajoute un TROISIÈME parent `feedback_post_id` aux
-- tables polymorphes `comments` et `attachments` (le pendant de ce que
-- 20260730090000 a fait pour `issue_events`), et une cible feedback aux
-- notifications (@mentions).
--
-- Convention feedback : RLS deny-all + service client gardé par team-guard.
-- Les commentaires feedback sont donc écrits/lus via le service client
-- (routes app/api/projects/[id]/feedback/[postId]/comments), JAMAIS via la
-- RLS des commentaires. On ne touche pas aux policies `comments` : un
-- commentaire feedback (issue_id/objective_id nuls) n'est visible par aucune
-- policy select — c'est voulu, il ne fuite ni dans le board public ni dans
-- les fils issue/objectif. Idempotent — safe to re-run.

-- ── comments ─────────────────────────────────────────────────────────────────
alter table public.comments
  add column if not exists feedback_post_id uuid
    references public.feedback_posts(id) on delete cascade;
create index if not exists idx_comments_feedback
  on public.comments(feedback_post_id, created_at)
  where feedback_post_id is not null;

-- ── attachments (pièces jointes des commentaires feedback) ───────────────────
alter table public.attachments
  add column if not exists feedback_post_id uuid
    references public.feedback_posts(id) on delete cascade;
create index if not exists idx_attachments_feedback
  on public.attachments(feedback_post_id)
  where feedback_post_id is not null;

-- ── Exactly-one-parent : élargir les contraintes à trois parents ─────────────
-- (issue_events_parent_ck a déjà été passé à num_nonnulls(...)=1 en 20260730.)
do $$
begin
  alter table public.comments drop constraint if exists comments_parent_ck;
  alter table public.comments
    add constraint comments_parent_ck
    check (num_nonnulls(issue_id, objective_id, feedback_post_id) = 1);

  alter table public.attachments drop constraint if exists attachments_parent_ck;
  alter table public.attachments
    add constraint attachments_parent_ck
    check (num_nonnulls(issue_id, objective_id, feedback_post_id) = 1);
end $$;

-- ── notifications ────────────────────────────────────────────────────────────
-- Une notification peut désormais pointer un post de feedback (mention /
-- commentaire sur un feedback). issue_id est déjà nullable — pas de contrainte.
alter table public.notifications
  add column if not exists feedback_post_id uuid
    references public.feedback_posts(id) on delete cascade;

-- ── Realtime ─────────────────────────────────────────────────────────────────
-- Le streaming @Numo (placeholder + corps qui se remplit en direct) a besoin
-- d'un push : on enseigne au broadcaster d'activité à résoudre le projet via le
-- post de feedback, en plus de l'issue et de l'objectif. Les attachments
-- passent déjà par broadcast_project_scoped (project_id direct) — rien à faire.
create or replace function public.broadcast_activity_scoped()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  pid uuid;
begin
  if coalesce(new.issue_id, old.issue_id) is not null then
    select project_id into pid from public.issues
     where id = coalesce(new.issue_id, old.issue_id);
  elsif coalesce(new.objective_id, old.objective_id) is not null then
    select project_id into pid from public.objectives
     where id = coalesce(new.objective_id, old.objective_id);
  elsif coalesce(new.feedback_post_id, old.feedback_post_id) is not null then
    select project_id into pid from public.feedback_posts
     where id = coalesce(new.feedback_post_id, old.feedback_post_id);
  end if;
  if pid is not null then
    perform realtime.broadcast_changes(
      'project:' || pid, tg_op, tg_op, tg_table_name, tg_table_schema, new, old);
  end if;
  return null;
exception when others then
  return null;
end;
$$;
