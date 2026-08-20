-- Restore read cursors lost when the agent conversation schema was squashed.
-- Existing conversations are read as of this migration; future completions can
-- still become unread normally.

WITH conversation_readers AS (
  SELECT
    c.owner_id AS user_id,
    c.id AS conversation_id
  FROM public.agent_conversations c
  WHERE c.visibility = 'private'
    AND c.owner_id IS NOT NULL

  UNION

  SELECT
    p.owner_id AS user_id,
    c.id AS conversation_id
  FROM public.agent_conversations c
  JOIN public.projects p ON p.id = c.project_id
  WHERE c.visibility = 'project'

  UNION

  SELECT
    pm.user_id,
    c.id AS conversation_id
  FROM public.agent_conversations c
  JOIN public.project_members pm ON pm.project_id = c.project_id
  WHERE c.visibility = 'project'
)
INSERT INTO public.agent_conversation_reads (user_id, conversation_id, last_read_at)
SELECT user_id, conversation_id, now()
FROM conversation_readers
WHERE user_id IS NOT NULL
ON CONFLICT (user_id, conversation_id) DO UPDATE
SET last_read_at = EXCLUDED.last_read_at;
