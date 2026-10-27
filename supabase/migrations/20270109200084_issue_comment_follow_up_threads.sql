-- MIN-818 — comment follow-ups follow the agent's reply threads.
--
-- 20270109200081 counted the comments written after the MCP agent's last
-- comment on the ticket, so a reply in the thread of an OLDER agent comment
-- was lost as soon as the agent posted anywhere else. The rule now works per
-- thread (a root comment and its replies, depth ≤ 1):
--
-- - a reply in a thread the agent took part in (its root or one of its
--   replies) waits until the agent writes in THAT thread after it;
-- - any other comment keeps the ticket-wide rule: it waits when it came after
--   the agent's last comment on the ticket.
--
-- Numo's replies and mirrored comments deleted on the forge still do not
-- count. The new `threads` column lists the root ids of the agent's threads
-- holding unanswered replies, for the copied prompt. lib/comment-follow-up.ts
-- applies the same rule to an open ticket's thread; keep the two in step.
--
-- Adding a result column changes the return type, so the function is dropped
-- and recreated in the same transaction. The previous release reads only
-- issue_id, pending and since, which keep their names and types.
--
-- SECURITY INVOKER: the caller's issues and comments policies decide which
-- tickets are visible. Only metadata columns are read, never a comment body.
DROP FUNCTION IF EXISTS public.issue_comment_follow_ups(uuid[]);

CREATE FUNCTION public.issue_comment_follow_ups(p_project_ids uuid[])
RETURNS TABLE (issue_id uuid, pending integer, since timestamptz, threads uuid[])
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
  ),
  thread_agent AS (
    SELECT coalesce(comment.parent_id, comment.id) AS thread_id, max(comment.created_at) AS at
    FROM public.comments AS comment
    JOIN last_agent ON last_agent.issue_id = comment.issue_id
    WHERE comment.via_mcp
    GROUP BY coalesce(comment.parent_id, comment.id)
  ),
  waiting AS (
    SELECT comment.issue_id, thread_agent.thread_id
    FROM last_agent
    JOIN public.comments AS comment ON comment.issue_id = last_agent.issue_id
    LEFT JOIN thread_agent ON thread_agent.thread_id = comment.parent_id
    LEFT JOIN public.github_issue_comment_syncs AS mirror
      ON mirror.comment_id = comment.id
    WHERE NOT comment.via_mcp
      AND NOT comment.via_assistant
      AND mirror.deleted_at_remote IS NULL
      AND comment.created_at > coalesce(thread_agent.at, last_agent.at)
  )
  SELECT
    waiting.issue_id,
    count(*)::integer,
    last_agent.at,
    coalesce(array_agg(DISTINCT waiting.thread_id) FILTER (WHERE waiting.thread_id IS NOT NULL), '{}')
  FROM waiting
  JOIN last_agent ON last_agent.issue_id = waiting.issue_id
  GROUP BY waiting.issue_id, last_agent.at;
$$;

REVOKE ALL ON FUNCTION public.issue_comment_follow_ups(uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.issue_comment_follow_ups(uuid[]) TO authenticated, service_role;
