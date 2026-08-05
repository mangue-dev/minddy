-- minddy — « Écarté » devient un STATUT, pas un axe à part.
--
-- Un retour portait jusqu'ici deux notions d'exclusion : son `status` (open,
-- planned, in_progress, shipped, declined) et son `review_state` (pending,
-- published, rejected). Le second servait à deux choses très différentes —
-- « la revue n'est pas passée » (pending) et « c'est du spam » (rejected) —
-- et l'équipe devait chercher la seconde ailleurs que là où elle lit toutes
-- les autres décisions sur le retour.
--
-- On replie donc `rejected` dans le statut, sous le nom qu'il porte déjà dans
-- le fil d'activité : `spam`. `review_state` ne garde que sa vraie fonction,
-- la file d'attente de publication (pending → published).
--
--   board visible ⇔ is_public and review_state = 'published'
--                     and status <> 'spam' and merged_into_id is null
--
-- Idempotent — safe to re-run.

-- Les deux CHECK à remplacer ont été posés en ligne, à la déclaration de leur
-- colonne : leur nom est celui que Postgres a bien voulu leur donner. On les
-- retrouve donc par la COLONNE qu'ils contraignent, et non par un nom deviné —
-- se tromper de nom laisserait l'ancienne contrainte en place, et c'est le
-- backfill juste en dessous qui tomberait, à moitié appliqué.
-- ── 1. Le statut accueille `spam` (avant le backfill, qui l'écrit) ───────────
do $$
declare c record;
begin
  for c in
    select con.conname
      from pg_constraint con
      join pg_attribute att
        on att.attrelid = con.conrelid and att.attnum = any (con.conkey)
     where con.conrelid = 'public.feedback_posts'::regclass
       and con.contype = 'c'
       and array_length(con.conkey, 1) = 1
       and att.attname = 'status'
  loop
    execute format('alter table public.feedback_posts drop constraint %I', c.conname);
  end loop;
end $$;

alter table public.feedback_posts
  add constraint feedback_posts_status_check
  check (status in ('open', 'planned', 'in_progress', 'shipped', 'declined', 'spam'));

-- ── 2. Backfill : tout ce que la modération avait rejeté devient du spam ─────
-- `review_state` repasse à 'published' : ces posts ont bel et bien été revus,
-- et c'est maintenant leur statut qui les tient hors du board.
update public.feedback_posts
   set status = 'spam',
       review_state = 'published'
 where review_state = 'rejected';

-- ── 3. `review_state` n'est plus que la file de publication ──────────────────
do $$
declare c record;
begin
  for c in
    select con.conname
      from pg_constraint con
      join pg_attribute att
        on att.attrelid = con.conrelid and att.attnum = any (con.conkey)
     where con.conrelid = 'public.feedback_posts'::regclass
       and con.contype = 'c'
       and array_length(con.conkey, 1) = 1
       and att.attname = 'review_state'
  loop
    execute format('alter table public.feedback_posts drop constraint %I', c.conname);
  end loop;
end $$;

alter table public.feedback_posts
  add constraint feedback_posts_review_state_check
  check (review_state in ('pending', 'published'));

-- ── 4. Index de liste publique : le spam n'y entre pas ───────────────────────
drop index if exists public.feedback_posts_public_list;
create index if not exists feedback_posts_public_list
  on public.feedback_posts (project_id, status)
  where is_public
    and review_state = 'published'
    and status <> 'spam'
    and merged_into_id is null;

-- ── 5. Suggestions « existe peut-être déjà » côté visiteur ───────────────────
-- Même règle : un post en spam n'existe pas publiquement, il n'a donc rien à
-- suggérer à qui écrit un retour. Signature inchangée → create or replace.
create or replace function public.match_feedback_posts(
  p_project_id  uuid,
  p_embedding   extensions.vector(1536),
  p_exclude     uuid default null,
  p_limit       integer default 8,
  p_public_only boolean default false
)
returns table (id uuid, title text, body text, status text, vote_count integer, issue_id uuid, similarity real)
language sql stable security definer set search_path = public, extensions as $$
  select p.id, p.title, p.body, p.status, p.vote_count, p.issue_id,
         (1 - (p.embedding <=> p_embedding))::real as similarity
    from public.feedback_posts p
   where p.project_id = p_project_id
     and p.embedding is not null
     and p.merged_into_id is null
     and p.deleted_at is null
     and (not p_public_only or (p.is_public and p.review_state = 'published' and p.status <> 'spam'))
     and (p_exclude is null or p.id <> p_exclude)
   order by p.embedding <=> p_embedding
   limit p_limit;
$$;

revoke all on function public.match_feedback_posts(uuid, extensions.vector, uuid, integer, boolean) from public, anon, authenticated;
grant execute on function public.match_feedback_posts(uuid, extensions.vector, uuid, integer, boolean) to service_role;
