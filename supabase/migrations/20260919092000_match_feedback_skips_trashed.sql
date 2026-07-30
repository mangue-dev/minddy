-- minddy — MIN-133, suite : la recherche kNN de feedback ignore les corbeillés.
--
-- 20260919091000 a mis `deleted_at is null` dans les deux CLAIMS de la passe de
-- revue, pour qu'un post corbeillé ne soit plus modéré ni dédoublonné. Il
-- restait la moitié symétrique : `match_feedback_posts`, SECURITY DEFINER donc
-- hors RLS, continuait à REMONTER les corbeillés comme CANDIDATS. Deux effets,
-- tous deux visibles :
--
--   • `lib/server/feedback/review.ts` propose (ou fusionne automatiquement) un
--     post vivant DANS un post en corbeille — exactement ce que la migration
--     précédente disait vouloir empêcher ;
--   • `app/f/[token]/actions.ts` suggère au visiteur qui rédige « ça existe
--     peut-être déjà » un retour que l'équipe vient de supprimer.
--
-- Le corps est celui de 20260727090000, augmenté d'une ligne. Idempotent.

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
     and (not p_public_only or p.is_public)
     and (p_exclude is null or p.id <> p_exclude)
   order by p.embedding <=> p_embedding
   limit p_limit;
$$;

revoke all on function public.match_feedback_posts(uuid, extensions.vector, uuid, integer, boolean) from public, anon, authenticated;
grant execute on function public.match_feedback_posts(uuid, extensions.vector, uuid, integer, boolean) to service_role;
