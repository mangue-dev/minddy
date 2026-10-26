-- MIN-801 — tickets whose MCP agent has new comments to answer.
--
-- A ticket awaits its agent when an MCP agent commented on it and someone
-- commented after that agent's LAST comment: a person, or a forge comment
-- mirrored from a linked pull request (MIN-802), which carries its forge date
-- in comments.created_at. Numo's replies do not count, nor a mirrored comment
-- deleted on the forge. lib/comment-follow-up.ts applies the same rule to an
-- open ticket's thread; keep the two in step.
--
-- SECURITY INVOKER: the caller's issues and comments policies decide which
-- tickets are visible. Only metadata columns are read, never a comment body.
CREATE OR REPLACE FUNCTION public.issue_comment_follow_ups(p_project_ids uuid[])
RETURNS TABLE (issue_id uuid, pending integer, since timestamptz)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = ''
AS $$
  WITH last_agent AS (
    SELECT comment.issue_id, max(comment.created_at) AS at
    FROM public.comments AS comment
    JOIN public.issues AS issue ON issue.id = comment.issue_id
    WHERE comment.via_mcp
      AND issue.project_id = ANY (p_project_ids)
    GROUP BY comment.issue_id
  )
  SELECT last_agent.issue_id, count(*)::integer, last_agent.at
  FROM last_agent
  JOIN public.comments AS comment
    ON comment.issue_id = last_agent.issue_id
   AND comment.created_at > last_agent.at
  LEFT JOIN public.github_issue_comment_syncs AS mirror
    ON mirror.comment_id = comment.id
  WHERE NOT comment.via_mcp
    AND NOT comment.via_assistant
    AND mirror.deleted_at_remote IS NULL
  GROUP BY last_agent.issue_id, last_agent.at;
$$;

REVOKE ALL ON FUNCTION public.issue_comment_follow_ups(uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.issue_comment_follow_ups(uuid[]) TO authenticated, service_role;
