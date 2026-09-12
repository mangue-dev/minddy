-- MIN-514: preserve source authority and RLS while adding one conversation API.
BEGIN;

CREATE TABLE IF NOT EXISTS public.numo_conversation_ids (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  assistant_id uuid UNIQUE REFERENCES public.conversations(id) ON DELETE CASCADE,
  agent_id uuid UNIQUE REFERENCES public.agent_conversations(id) ON DELETE CASCADE,
  CHECK (num_nonnulls(assistant_id, agent_id) = 1)
);
ALTER TABLE public.numo_conversation_ids ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS numo_identity_select ON public.numo_conversation_ids;
CREATE POLICY numo_identity_select ON public.numo_conversation_ids
  FOR SELECT TO authenticated USING (
    EXISTS (SELECT 1 FROM public.conversations c WHERE c.id = assistant_id)
    OR EXISTS (SELECT 1 FROM public.agent_conversations c WHERE c.id = agent_id)
  );
REVOKE ALL ON public.numo_conversation_ids FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.numo_conversation_ids TO authenticated;
GRANT ALL ON public.numo_conversation_ids TO service_role;

CREATE OR REPLACE FUNCTION public.register_numo_conversation() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF TG_TABLE_NAME = 'conversations' THEN
    INSERT INTO public.numo_conversation_ids (id, assistant_id) VALUES (NEW.id, NEW.id)
      ON CONFLICT (assistant_id) DO NOTHING;
  ELSE
    INSERT INTO public.numo_conversation_ids (agent_id) VALUES (NEW.id)
      ON CONFLICT (agent_id) DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.register_numo_conversation() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS register_numo_identity ON public.conversations;
CREATE TRIGGER register_numo_identity AFTER INSERT ON public.conversations
  FOR EACH ROW EXECUTE FUNCTION public.register_numo_conversation();
DROP TRIGGER IF EXISTS register_numo_identity ON public.agent_conversations;
CREATE TRIGGER register_numo_identity AFTER INSERT ON public.agent_conversations
  FOR EACH ROW EXECUTE FUNCTION public.register_numo_conversation();
CREATE OR REPLACE FUNCTION public.backfill_numo_conversations() RETURNS void
LANGUAGE sql SECURITY DEFINER SET search_path = '' AS $$
  INSERT INTO public.numo_conversation_ids (id, assistant_id)
    SELECT id, id FROM public.conversations ON CONFLICT (assistant_id) DO NOTHING;
  INSERT INTO public.numo_conversation_ids (agent_id)
    SELECT id FROM public.agent_conversations ON CONFLICT (agent_id) DO NOTHING;
$$;
REVOKE ALL ON FUNCTION public.backfill_numo_conversations() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.backfill_numo_conversations() TO service_role;
SELECT public.backfill_numo_conversations();

ALTER TABLE public.conversations ADD COLUMN IF NOT EXISTS archived_at timestamptz;
CREATE TABLE IF NOT EXISTS public.numo_conversation_state (
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  conversation_id uuid NOT NULL REFERENCES public.numo_conversation_ids(id) ON DELETE CASCADE,
  pinned_at timestamptz,
  last_read_at timestamptz,
  PRIMARY KEY (user_id, conversation_id)
);
ALTER TABLE public.numo_conversation_state ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS numo_state_owner ON public.numo_conversation_state;
CREATE POLICY numo_state_owner ON public.numo_conversation_state TO authenticated
  USING (user_id = (SELECT auth.uid()))
  WITH CHECK (user_id = (SELECT auth.uid()) AND EXISTS (
    SELECT 1 FROM public.numo_conversation_ids i WHERE i.id = conversation_id
  ));
REVOKE ALL ON public.numo_conversation_state FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.numo_conversation_state TO authenticated;
GRANT ALL ON public.numo_conversation_state TO service_role;

-- Invalid historical tool output must not make the entire history unreadable.
CREATE OR REPLACE FUNCTION public.numo_tool_result(value text) RETURNS jsonb
LANGUAGE plpgsql IMMUTABLE SET search_path = '' AS $$
BEGIN
  RETURN value::jsonb;
EXCEPTION WHEN invalid_text_representation THEN RETURN NULL;
END;
$$;
REVOKE ALL ON FUNCTION public.numo_tool_result(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.numo_tool_result(text) TO authenticated, service_role;
CREATE INDEX IF NOT EXISTS assistant_messages_numo_launch_idx
  ON public.assistant_messages (conversation_id, created_at, id)
  WHERE role = 'tool' AND tool_name = 'launch_code_agent';

-- Source RLS is applied to BOTH the private chat and the linked work.
CREATE OR REPLACE VIEW public.numo_work_origins WITH (security_invoker = true) AS
SELECT DISTINCT ON (r.conversation_id)
  r.conversation_id AS agent_id, i.id AS conversation_id, m.id AS action_id
FROM public.assistant_messages m
JOIN public.conversations c ON c.id = m.conversation_id
JOIN public.numo_conversation_ids i ON i.assistant_id = c.id
JOIN public.agent_runs r ON r.id::text = public.numo_tool_result(m.content)->>'run_id'
JOIN public.projects origin_project ON origin_project.id = r.project_id AND origin_project.deleted_at IS NULL
WHERE m.role = 'tool' AND m.tool_name = 'launch_code_agent'
  AND m.metadata->>'success' = 'true'
  AND public.numo_tool_result(m.content)->>'launched' = 'true'
  AND r.created_by = c.user_id
ORDER BY r.conversation_id, m.created_at, m.id;

CREATE OR REPLACE VIEW public.numo_work WITH (security_invoker = true) AS
SELECT r.id, COALESCE(o.conversation_id, i.id) AS conversation_id,
  i.id AS work_conversation_id, r.conversation_id AS legacy_conversation_id,
  r.project_id, r.issue_id, r.pull_request_id, r.status, r.title,
  r.branch_name, r.pr_number, r.pr_url, r.pr_state, r.routine_id,
  r.created_at, r.updated_at, r.completed_at, c.archived_at, c.visibility,
  pin.created_at AS pinned_at, rd.last_read_at,
  '/agents?run=' || r.id::text AS detail_href
FROM public.agent_runs r
JOIN public.agent_conversations c ON c.id = r.conversation_id
JOIN public.projects p ON p.id = c.project_id AND p.deleted_at IS NULL
LEFT JOIN public.agent_conversation_pins pin ON pin.conversation_id = c.id AND pin.user_id = auth.uid()
LEFT JOIN public.agent_conversation_reads rd ON rd.conversation_id = c.id AND rd.user_id = auth.uid()
JOIN public.numo_conversation_ids i ON i.agent_id = r.conversation_id
LEFT JOIN public.numo_work_origins o ON o.agent_id = r.conversation_id;

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
LEFT JOIN LATERAL (
  SELECT id, updated_at FROM public.numo_work WHERE conversation_id = i.id
  ORDER BY updated_at DESC, id LIMIT 1
) w ON true
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

CREATE OR REPLACE VIEW public.numo_messages WITH (security_invoker = true) AS
SELECT m.id, i.id AS conversation_id, 'assistant'::text AS source,
  CASE WHEN m.role = 'tool' THEN 'action' ELSE 'message' END AS kind,
  m.role, m.content, m.tool_calls, m.tool_call_id, m.tool_name,
  m.metadata, m.context, NULL::uuid AS turn_id, NULL::uuid AS run_id,
  NULL::text AS worker_source, NULL::uuid AS legacy_queue_message_id,
  NULL::uuid AS legacy_event_id, m.created_at
FROM public.assistant_messages m
JOIN public.numo_conversation_ids i ON i.assistant_id = m.conversation_id
UNION ALL
SELECT m.id, COALESCE(o.conversation_id, i.id), 'agent', 'worker_message',
  m.role, m.content, NULL::jsonb, NULL::text, NULL::text,
  '{}'::jsonb, NULL::jsonb, m.turn_id, m.run_id, m.source,
  m.legacy_queue_message_id, m.legacy_event_id, m.created_at
FROM public.agent_messages m
JOIN public.agent_conversations source_conversation ON source_conversation.id = m.conversation_id
JOIN public.projects source_project ON source_project.id = source_conversation.project_id AND source_project.deleted_at IS NULL
JOIN public.numo_conversation_ids i ON i.agent_id = m.conversation_id
LEFT JOIN public.numo_work_origins o ON o.agent_id = m.conversation_id;

CREATE OR REPLACE VIEW public.numo_actions WITH (security_invoker = true) AS
SELECT * FROM public.numo_messages WHERE kind = 'action';
CREATE OR REPLACE VIEW public.numo_contexts WITH (security_invoker = true) AS
SELECT c.id, COALESCE(o.conversation_id, i.id) AS conversation_id,
  c.kind, c.resource_id, c.role, c.snapshot, c.created_at
FROM public.agent_conversation_contexts c
JOIN public.agent_conversations source_conversation ON source_conversation.id = c.conversation_id
JOIN public.projects source_project ON source_project.id = source_conversation.project_id AND source_project.deleted_at IS NULL
JOIN public.numo_conversation_ids i ON i.agent_id = c.conversation_id
LEFT JOIN public.numo_work_origins o ON o.agent_id = c.conversation_id;
CREATE OR REPLACE VIEW public.numo_artifacts WITH (security_invoker = true) AS
SELECT a.id, COALESCE(o.conversation_id, i.id) AS conversation_id,
  a.run_id, a.kind, a.ref, a.url, a.state, a.created_at, a.updated_at
FROM public.agent_artifacts a
JOIN public.agent_conversations source_conversation ON source_conversation.id = a.conversation_id
JOIN public.projects source_project ON source_project.id = source_conversation.project_id AND source_project.deleted_at IS NULL
JOIN public.numo_conversation_ids i ON i.agent_id = a.conversation_id
LEFT JOIN public.numo_work_origins o ON o.agent_id = a.conversation_id;
CREATE OR REPLACE VIEW public.numo_turns WITH (security_invoker = true) AS
SELECT t.id, COALESCE(o.conversation_id, i.id) AS conversation_id,
  t.run_id, t.status, t.model, t.reasoning_level, t.initiated_by, t.cost_usd,
  t.outcome, t.error_message, t.started_at, t.completed_at, t.created_at, t.updated_at
FROM public.agent_turns t
JOIN public.agent_conversations source_conversation ON source_conversation.id = t.conversation_id
JOIN public.projects source_project ON source_project.id = source_conversation.project_id AND source_project.deleted_at IS NULL
JOIN public.numo_conversation_ids i ON i.agent_id = t.conversation_id
LEFT JOIN public.numo_work_origins o ON o.agent_id = t.conversation_id;
REVOKE ALL ON public.numo_work_origins, public.numo_work,
  public.numo_conversation_history, public.numo_messages, public.numo_actions,
  public.numo_contexts, public.numo_artifacts, public.numo_turns FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.numo_work_origins, public.numo_work,
  public.numo_conversation_history, public.numo_messages, public.numo_actions,
  public.numo_contexts, public.numo_artifacts, public.numo_turns TO authenticated, service_role;

ALTER TABLE public.assistant_active_conversation
  DROP CONSTRAINT IF EXISTS assistant_active_conversation_conversation_id_fkey;
ALTER TABLE public.assistant_active_conversation
  ADD CONSTRAINT assistant_active_conversation_conversation_id_fkey
  FOREIGN KEY (conversation_id) REFERENCES public.numo_conversation_ids(id) ON DELETE CASCADE;
DROP POLICY IF EXISTS assistant_active_conversation_insert ON public.assistant_active_conversation;
CREATE POLICY assistant_active_conversation_insert ON public.assistant_active_conversation
  FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid() AND EXISTS (
    SELECT 1 FROM public.numo_conversation_history c WHERE c.id = conversation_id
  ));
DROP POLICY IF EXISTS assistant_active_conversation_update ON public.assistant_active_conversation;
CREATE POLICY assistant_active_conversation_update ON public.assistant_active_conversation
  FOR UPDATE TO authenticated USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid() AND EXISTS (
    SELECT 1 FROM public.numo_conversation_history c WHERE c.id = conversation_id
  ));

-- Agent source writes are server-only. Lock the source and recheck access in the
-- same transaction; never accept a project, owner, or visibility from the caller.
CREATE OR REPLACE FUNCTION public.update_numo_conversation(p_id uuid, p_actor uuid, p_patch jsonb)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  identity public.numo_conversation_ids;
  actor uuid := p_actor;
  agent public.agent_conversations;
  chat public.conversations;
BEGIN
  IF actor IS NULL THEN RAISE EXCEPTION 'Not found' USING ERRCODE = 'P0002'; END IF;
  IF p_patch IS NULL OR jsonb_typeof(p_patch) <> 'object' OR p_patch = '{}'::jsonb
    OR EXISTS (SELECT 1 FROM jsonb_object_keys(p_patch) k WHERE k NOT IN ('title', 'archived', 'pinned', 'read'))
    OR (p_patch ? 'title' AND jsonb_typeof(p_patch->'title') NOT IN ('string', 'null'))
    OR length(p_patch->>'title') > 200
    OR EXISTS (SELECT 1 FROM jsonb_each(p_patch) e WHERE e.key IN ('archived', 'pinned', 'read') AND jsonb_typeof(e.value) <> 'boolean')
  THEN RAISE EXCEPTION 'Invalid patch' USING ERRCODE = '22023'; END IF;
  SELECT * INTO identity FROM public.numo_conversation_ids WHERE id = p_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Not found' USING ERRCODE = 'P0002'; END IF;
  IF identity.agent_id IS NOT NULL THEN
    SELECT * INTO agent FROM public.agent_conversations WHERE id = identity.agent_id;
    IF NOT FOUND OR NOT public.lock_live_project_actor_access(agent.project_id, actor)
    THEN RAISE EXCEPTION 'Not found' USING ERRCODE = 'P0002'; END IF;
    SELECT * INTO agent FROM public.agent_conversations WHERE id = identity.agent_id FOR UPDATE;
    IF NOT FOUND OR (agent.visibility = 'private' AND agent.owner_id IS DISTINCT FROM actor)
    THEN RAISE EXCEPTION 'Not found' USING ERRCODE = 'P0002'; END IF;
    UPDATE public.agent_conversations SET
      title = CASE WHEN p_patch ? 'title' THEN nullif(btrim(p_patch->>'title'), '') ELSE title END,
      archived_at = CASE WHEN p_patch ? 'archived' THEN CASE WHEN (p_patch->>'archived')::boolean THEN COALESCE(archived_at, now()) END ELSE archived_at END
    WHERE id = agent.id AND (p_patch ? 'title' OR p_patch ? 'archived');
    IF p_patch ? 'pinned' THEN
      IF (p_patch->>'pinned')::boolean THEN
        INSERT INTO public.agent_conversation_pins (user_id, conversation_id) VALUES (actor, agent.id) ON CONFLICT DO NOTHING;
      ELSE
        DELETE FROM public.agent_conversation_pins WHERE user_id = actor AND conversation_id = agent.id;
      END IF;
    END IF;
    IF p_patch->>'read' = 'true' THEN
      INSERT INTO public.agent_conversation_reads (user_id, conversation_id, last_read_at) VALUES (actor, agent.id, now())
      ON CONFLICT (user_id, conversation_id) DO UPDATE SET last_read_at = greatest(agent_conversation_reads.last_read_at, EXCLUDED.last_read_at);
    END IF;
  ELSE
    SELECT * INTO chat FROM public.conversations WHERE id = identity.assistant_id FOR UPDATE;
    IF NOT FOUND OR chat.user_id <> actor THEN RAISE EXCEPTION 'Not found' USING ERRCODE = 'P0002'; END IF;
    UPDATE public.conversations SET
      title = CASE WHEN p_patch ? 'title' THEN nullif(btrim(p_patch->>'title'), '') ELSE title END,
      archived_at = CASE WHEN p_patch ? 'archived' THEN CASE WHEN (p_patch->>'archived')::boolean THEN COALESCE(archived_at, now()) END ELSE archived_at END
    WHERE id = chat.id AND (p_patch ? 'title' OR p_patch ? 'archived');
    INSERT INTO public.numo_conversation_state (user_id, conversation_id, pinned_at, last_read_at)
      VALUES (actor, p_id, CASE WHEN p_patch->>'pinned' = 'true' THEN now() END, CASE WHEN p_patch->>'read' = 'true' THEN now() END)
    ON CONFLICT (user_id, conversation_id) DO UPDATE SET
      pinned_at = CASE WHEN p_patch ? 'pinned' THEN CASE WHEN p_patch->>'pinned' = 'true' THEN COALESCE(numo_conversation_state.pinned_at, now()) END ELSE numo_conversation_state.pinned_at END,
      last_read_at = greatest(numo_conversation_state.last_read_at, EXCLUDED.last_read_at);
  END IF;
END;
$$;
REVOKE ALL ON FUNCTION public.update_numo_conversation(uuid, uuid, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.update_numo_conversation(uuid, uuid, jsonb) TO service_role;
COMMIT;
