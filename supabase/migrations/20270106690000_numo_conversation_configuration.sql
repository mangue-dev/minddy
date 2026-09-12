-- MIN-517: persist the model and reasoning choices of each Numo conversation.
-- NULL deliberately means "follow the current assistant default" so existing
-- conversations retain the behavior they had before these choices existed.
BEGIN;

ALTER TABLE public.conversations
  ADD COLUMN IF NOT EXISTS model text,
  ADD COLUMN IF NOT EXISTS reasoning_level text;

COMMENT ON COLUMN public.conversations.model IS
  'Numo conversation model override. NULL follows the active assistant provider default.';
COMMENT ON COLUMN public.conversations.reasoning_level IS
  'Numo conversation reasoning override. NULL follows assistant_reasoning_level for legacy compatibility.';

ALTER TABLE public.conversations
  DROP CONSTRAINT IF EXISTS conversations_reasoning_level_check;
ALTER TABLE public.conversations
  ADD CONSTRAINT conversations_reasoning_level_check CHECK (
    reasoning_level IS NULL OR reasoning_level IN (
      'off', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max'
    )
  );

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
    OR EXISTS (SELECT 1 FROM jsonb_object_keys(p_patch) k WHERE k NOT IN ('title', 'archived', 'pinned', 'read', 'model', 'reasoningLevel'))
    OR (p_patch ? 'title' AND jsonb_typeof(p_patch->'title') NOT IN ('string', 'null'))
    OR length(p_patch->>'title') > 200
    OR (p_patch ? 'model' AND jsonb_typeof(p_patch->'model') NOT IN ('string', 'null'))
    OR length(p_patch->>'model') > 300
    OR (p_patch ? 'reasoningLevel' AND jsonb_typeof(p_patch->'reasoningLevel') NOT IN ('string', 'null'))
    OR (p_patch ? 'reasoningLevel' AND p_patch->>'reasoningLevel' IS NOT NULL
      AND p_patch->>'reasoningLevel' NOT IN ('off', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max'))
    OR EXISTS (SELECT 1 FROM jsonb_each(p_patch) e WHERE e.key IN ('archived', 'pinned', 'read') AND jsonb_typeof(e.value) <> 'boolean')
  THEN RAISE EXCEPTION 'Invalid patch' USING ERRCODE = '22023'; END IF;
  SELECT * INTO identity FROM public.numo_conversation_ids WHERE id = p_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Not found' USING ERRCODE = 'P0002'; END IF;
  IF identity.agent_id IS NOT NULL THEN
    IF p_patch ? 'model' OR p_patch ? 'reasoningLevel' THEN
      RAISE EXCEPTION 'Conversation configuration is only available for assistant conversations' USING ERRCODE = '22023';
    END IF;
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
      archived_at = CASE WHEN p_patch ? 'archived' THEN CASE WHEN (p_patch->>'archived')::boolean THEN COALESCE(archived_at, now()) END ELSE archived_at END,
      model = CASE WHEN p_patch ? 'model' THEN NULLIF(btrim(p_patch->>'model'), '') ELSE model END,
      reasoning_level = CASE WHEN p_patch ? 'reasoningLevel' THEN NULLIF(p_patch->>'reasoningLevel', '') ELSE reasoning_level END
    WHERE id = chat.id AND (p_patch ? 'title' OR p_patch ? 'archived' OR p_patch ? 'model' OR p_patch ? 'reasoningLevel');
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
