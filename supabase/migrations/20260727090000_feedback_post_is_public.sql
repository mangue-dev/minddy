-- minddy — Feedback : visibilité publique par post (toggle « Rendre public »)
-- À la soumission, le visiteur choisit de publier son retour sur le board ou de
-- le garder privé (remonté à l'équipe seulement). is_public=false = collecté par
-- l'équipe, absent du board public (liste, détail non-auteur, suggestions).
-- Idempotent — safe to re-run.

alter table public.feedback_posts
  add column if not exists is_public boolean not null default true;

-- Index partiel de la liste publique (project_id, status) sur les seuls posts
-- listables : publics, canoniques.
create index if not exists feedback_posts_public_list
  on public.feedback_posts (project_id, status)
  where is_public and merged_into_id is null;

-- ── kNN posts : paramètre p_public_only ──────────────────────────────────────
-- Les suggestions « existe peut-être déjà » côté visiteur ne doivent jamais
-- divulguer un retour privé ; la dédup équipe/IA (défaut) les inclut toujours.
-- La signature change (arg ajouté) : on drop l'ancienne pour éviter l'overload.
drop function if exists public.match_feedback_posts(uuid, extensions.vector, uuid, integer);

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
     and (not p_public_only or p.is_public)
     and (p_exclude is null or p.id <> p_exclude)
   order by p.embedding <=> p_embedding
   limit p_limit;
$$;

revoke all on function public.match_feedback_posts(uuid, extensions.vector, uuid, integer, boolean) from public, anon, authenticated;
grant execute on function public.match_feedback_posts(uuid, extensions.vector, uuid, integer, boolean) to service_role;
