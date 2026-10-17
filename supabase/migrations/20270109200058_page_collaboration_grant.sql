-- Collaboration token decisions (MIN-688 scaling follow-up).
--
-- A collaboration token binds an access decision to the project's membership
-- generation, and `append_page_collaboration` refuses a batch once that
-- generation moved. The generation and the membership must therefore come
-- from ONE snapshot: read separately, a pre-revocation membership could be
-- paired with a post-revocation generation and yield a token the commit
-- would accept. `project_realtime_generations` has no foreign key that
-- PostgREST could embed, hence this function. It decides nothing itself: the
-- server applies the same owner/member/role rules as `hasProjectAccess`.

BEGIN;

CREATE FUNCTION public.page_collaboration_grant(p_user_id uuid, p_project_id uuid)
 RETURNS jsonb
 LANGUAGE sql
 STABLE
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
  SELECT jsonb_build_object(
    'owner_id', project.owner_id,
    'member', member.user_id IS NOT NULL,
    'role', member.role,
    'can_comment', member.can_comment,
    'generation', generation.generation)
  FROM public.projects AS project
  JOIN public.project_realtime_generations AS generation
    ON generation.project_id = project.id
  LEFT JOIN public.project_members AS member
    ON member.project_id = project.id AND member.user_id = p_user_id
  WHERE project.id = p_project_id
    AND project.deleted_at IS NULL;
$function$;

REVOKE ALL ON FUNCTION public.page_collaboration_grant(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.page_collaboration_grant(uuid, uuid) TO service_role;

COMMIT;
