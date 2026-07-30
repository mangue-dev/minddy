-- minddy — MIN-133, suite : la passe de revue du feedback ignore les corbeillés.
--
-- Un post supprimé n'a plus à être modéré, catégorisé ni dédoublonné — le faire
-- coûterait un appel LLM pour rien, et pire : un post corbeillé pourrait encore
-- absorber un post vivant par fusion. Les deux claims de MIN-87
-- (20260828090000) gagnent donc `deleted_at is null`, et l'index de scan avec.
--
-- Au passage : `feedback_posts_to_analyze` était l'index de l'ANCIENNE passe,
-- déjà supprimé par 20260828090000. Une première version de la migration
-- 20260919090000 l'a recréé par erreur ; on l'enlève ici pour de bon.
-- Idempotent — safe à re-run.

drop index if exists public.feedback_posts_to_analyze;

create or replace function public.claim_feedback_posts_for_review(p_limit integer)
returns setof public.feedback_posts
language sql security definer set search_path = public, extensions as $$
  update public.feedback_posts p
     set analysis_claimed_at = now()
   where p.id in (
     select id from public.feedback_posts
      where (analyzed_at is null or classified_at is null)
        and merged_into_id is null
        and deleted_at is null
        and analysis_failures < 3
        and (analysis_claimed_at is null or analysis_claimed_at < now() - interval '15 minutes')
      order by created_at
      limit p_limit
      for update skip locked
   )
  returning p.*;
$$;

revoke all on function public.claim_feedback_posts_for_review(integer) from public, anon, authenticated;
grant execute on function public.claim_feedback_posts_for_review(integer) to service_role;

create or replace function public.claim_feedback_post_for_review(p_post uuid)
returns setof public.feedback_posts
language sql security definer set search_path = public, extensions as $$
  update public.feedback_posts p
     set analysis_claimed_at = now()
   where p.id = (
     select id from public.feedback_posts
      where id = p_post
        and (analyzed_at is null or classified_at is null)
        and merged_into_id is null
        and deleted_at is null
        and analysis_failures < 3
        and (analysis_claimed_at is null or analysis_claimed_at < now() - interval '15 minutes')
      for update skip locked
   )
  returning p.*;
$$;

revoke all on function public.claim_feedback_post_for_review(uuid) from public, anon, authenticated;
grant execute on function public.claim_feedback_post_for_review(uuid) to service_role;

drop index if exists public.feedback_posts_to_review;
create index if not exists feedback_posts_to_review
  on public.feedback_posts (created_at)
  where (analyzed_at is null or classified_at is null)
    and merged_into_id is null
    and deleted_at is null;
