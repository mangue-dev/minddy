CREATE OR REPLACE FUNCTION public.match_feedback_posts(
  p_project_id uuid,
  p_embedding extensions.vector,
  p_exclude uuid DEFAULT NULL,
  p_limit integer DEFAULT 8,
  p_public_only boolean DEFAULT false
)
RETURNS TABLE(
  id uuid,
  title text,
  body text,
  status text,
  vote_count integer,
  issue_id uuid,
  similarity real
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
BEGIN
  IF (SELECT auth.role()) IS DISTINCT FROM 'service_role'
     AND (
       (SELECT auth.uid()) IS NULL
       OR NOT public.can_access_project(p_project_id)
     ) THEN
    RAISE EXCEPTION 'feedback_embedding_forbidden' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT
    post.id,
    post.title,
    post.body,
    post.status,
    post.vote_count,
    post.issue_id,
    (1 - (post.embedding OPERATOR(extensions.<=>) p_embedding))::real AS similarity
  FROM public.feedback_posts AS post
  WHERE post.project_id = p_project_id
    AND post.embedding IS NOT NULL
    AND post.merged_into_id IS NULL
    AND post.deleted_at IS NULL
    AND (
      NOT p_public_only
      OR (
        post.is_public
        AND post.review_state = 'published'
        AND post.status <> 'spam'
      )
    )
    AND (p_exclude IS NULL OR post.id <> p_exclude)
  ORDER BY post.embedding OPERATOR(extensions.<=>) p_embedding
  LIMIT p_limit;
END;
$function$;

REVOKE ALL ON FUNCTION public.match_feedback_posts(uuid, extensions.vector, uuid, integer, boolean)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.match_feedback_posts(uuid, extensions.vector, uuid, integer, boolean)
  TO service_role;
