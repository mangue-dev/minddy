-- MIN-812: the history marked every Numo conversation unread. It compared the
-- read cursor with `conversations.updated_at`, which the
-- `conversations_set_updated_at` trigger moves on every write: the user's own
-- message, a stop, the generated title, a model change and the encryption
-- workers' attempt stamps. Unread now means an answer newer than the cursor,
-- so both history views expose the time of Numo's latest answer.
--
-- The column is appended, which CREATE OR REPLACE VIEW allows, so the previous
-- release keeps reading the same columns. The lateral lookup walks the
-- `(conversation_id, created_at, id)` index backwards.

CREATE OR REPLACE VIEW public.numo_conversation_history WITH (security_invoker = true) AS
SELECT i.id,
  'assistant'::text AS source,
  c.id AS legacy_id,
  c.user_id,
  c.project_id,
  c.title,
  c.status,
  c.error_message,
  c.archived_at,
  s.pinned_at,
  s.last_read_at,
  c.created_at,
  c.updated_at,
  CASE
    WHEN p.id IS NOT NULL AND p.deleted_at IS NULL THEN jsonb_build_object('name', p.name)
    ELSE NULL::jsonb
  END AS project,
  answer.created_at AS last_answer_at
FROM public.conversations c
  JOIN public.numo_conversation_ids i ON i.assistant_id = c.id
  LEFT JOIN public.projects p ON p.id = c.project_id
  LEFT JOIN public.numo_conversation_state s
    ON s.conversation_id = i.id AND s.user_id = auth.uid()
  LEFT JOIN LATERAL (
    SELECT m.created_at
    FROM public.assistant_messages m
    WHERE m.conversation_id = c.id AND m.role = 'assistant'::text
    ORDER BY m.created_at DESC, m.id DESC
    LIMIT 1
  ) answer ON true;

CREATE OR REPLACE VIEW public.numo_user_conversation_history WITH (security_invoker = true) AS
SELECT history.*
FROM public.numo_conversation_history history
WHERE NOT public.is_numo_routine_conversation(history.legacy_id);

REVOKE ALL ON public.numo_conversation_history, public.numo_user_conversation_history
  FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.numo_conversation_history, public.numo_user_conversation_history
  TO authenticated;
GRANT ALL ON public.numo_conversation_history, public.numo_user_conversation_history
  TO service_role;
