-- Resolve the latest delegated work once for the entire history. A correlated
-- numo_work lookup repeats its RLS checks for every legacy conversation and
-- exceeds the authenticated statement timeout for established accounts.
BEGIN;

CREATE OR REPLACE VIEW public.numo_conversation_history WITH (security_invoker = true) AS
SELECT i.id, 'assistant'::text AS source, c.id AS legacy_id,
  c.user_id, c.project_id, NULL::uuid AS access_project_id,
  'private'::text AS visibility, c.title, c.status, c.error_message,
  c.archived_at, s.pinned_at, s.last_read_at, c.created_at,
  greatest(c.updated_at, w.updated_at) AS updated_at,
  CASE WHEN p.id IS NOT NULL AND p.deleted_at IS NULL THEN jsonb_build_object('name', p.name) END AS project,
  NULL::text AS detail_href, w.id AS latest_work_id
FROM public.conversations c
JOIN public.numo_conversation_ids i ON i.assistant_id = c.id
LEFT JOIN public.projects p ON p.id = c.project_id
LEFT JOIN public.numo_conversation_state s ON s.conversation_id = i.id AND s.user_id = auth.uid()
LEFT JOIN (
  SELECT DISTINCT ON (conversation_id) conversation_id, id, updated_at
  FROM public.numo_work
  ORDER BY conversation_id, updated_at DESC, id
) w ON w.conversation_id = i.id
UNION ALL
SELECT i.id, 'agent', c.id, c.owner_id, c.project_id, c.project_id,
  c.visibility, COALESCE(c.title, r.title, issue.title, pr.title),
  CASE WHEN r.status IN ('queued', 'running') THEN 'generating'
    WHEN r.status = 'failed' THEN 'error' ELSE 'idle' END,
  r.error_message, c.archived_at, pin.created_at, rd.last_read_at, c.created_at,
  greatest(c.updated_at, r.updated_at), jsonb_build_object('name', p.name),
  '/agents?run=' || c.id::text, r.id
FROM public.agent_conversations c
JOIN public.numo_conversation_ids i ON i.agent_id = c.id
JOIN public.projects p ON p.id = c.project_id AND p.deleted_at IS NULL
LEFT JOIN public.agent_conversation_pins pin ON pin.conversation_id = c.id AND pin.user_id = auth.uid()
LEFT JOIN public.agent_conversation_reads rd ON rd.conversation_id = c.id AND rd.user_id = auth.uid()
LEFT JOIN LATERAL (
  SELECT * FROM public.agent_runs WHERE conversation_id = c.id
  ORDER BY created_at DESC, id DESC LIMIT 1
) r ON true
LEFT JOIN public.issues issue ON issue.id = r.issue_id
LEFT JOIN public.pull_requests pr ON pr.id = r.pull_request_id
WHERE NOT EXISTS (SELECT 1 FROM public.numo_work_origins o WHERE o.agent_id = c.id)
  AND (r.id IS NULL OR r.routine_id IS NULL)
  AND (r.issue_id IS NULL OR issue.id IS NOT NULL)
  AND (r.pull_request_id IS NULL OR pr.id IS NOT NULL);

COMMIT;
