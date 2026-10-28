-- MIN-826: a Numo conversation also remembers its provider. Same function as
-- 20270109200049, with `provider` accepted in the patch; older clients that do
-- not send it keep working unchanged.

CREATE OR REPLACE FUNCTION public.update_numo_conversation(p_id uuid, p_actor uuid, p_patch jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  identity public.numo_conversation_ids;
  actor uuid := p_actor;
  chat public.conversations;
BEGIN
  IF actor IS NULL THEN RAISE EXCEPTION 'Not found' USING ERRCODE = 'P0002'; END IF;
  IF p_patch IS NULL OR jsonb_typeof(p_patch) <> 'object' OR p_patch = '{}'::jsonb
    OR EXISTS (SELECT 1 FROM jsonb_object_keys(p_patch) k WHERE k NOT IN ('title', 'archived', 'pinned', 'read', 'provider', 'model', 'reasoningLevel', 'title_ciphertext', 'title_encryption_version'))
    OR (p_patch ? 'title' AND jsonb_typeof(p_patch->'title') NOT IN ('string', 'null'))
    OR (length(p_patch->>'title') > 200
      AND p_patch->>'title' NOT LIKE 'mdyn3:%')
    OR ((p_patch ? 'title_ciphertext') <> (p_patch ? 'title_encryption_version'))
    OR (p_patch ? 'title_ciphertext' AND (NOT p_patch ? 'title'
      OR p_patch->>'title' IS NOT NULL
      OR jsonb_typeof(p_patch->'title_ciphertext') <> 'string'
      OR jsonb_typeof(p_patch->'title_encryption_version') <> 'number'))
    OR (p_patch ? 'provider' AND jsonb_typeof(p_patch->'provider') NOT IN ('string', 'null'))
    OR (p_patch ? 'provider' AND p_patch->>'provider' IS NOT NULL
      AND p_patch->>'provider' !~ '^[a-z0-9_-]{1,64}$')
    OR (p_patch ? 'model' AND jsonb_typeof(p_patch->'model') NOT IN ('string', 'null'))
    OR length(p_patch->>'model') > 300
    OR (p_patch ? 'reasoningLevel' AND jsonb_typeof(p_patch->'reasoningLevel') NOT IN ('string', 'null'))
    OR (p_patch ? 'reasoningLevel' AND p_patch->>'reasoningLevel' IS NOT NULL
      AND p_patch->>'reasoningLevel' NOT IN ('off', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max'))
    OR EXISTS (SELECT 1 FROM jsonb_each(p_patch) e WHERE e.key IN ('archived', 'pinned', 'read') AND jsonb_typeof(e.value) <> 'boolean')
  THEN RAISE EXCEPTION 'Invalid patch' USING ERRCODE = '22023'; END IF;
  SELECT * INTO identity FROM public.numo_conversation_ids WHERE id = p_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Not found' USING ERRCODE = 'P0002'; END IF;
  SELECT * INTO chat FROM public.conversations WHERE id = identity.assistant_id FOR UPDATE;
  IF NOT FOUND OR chat.user_id <> actor THEN RAISE EXCEPTION 'Not found' USING ERRCODE = 'P0002'; END IF;
  IF p_patch ? 'title_ciphertext' OR p_patch ? 'title_encryption_version' THEN
    RAISE EXCEPTION 'Invalid assistant title patch' USING ERRCODE='22023';
  END IF;
  UPDATE public.conversations SET
    title = CASE WHEN p_patch ? 'title' THEN nullif(btrim(p_patch->>'title'), '') ELSE title END,
    archived_at = CASE WHEN p_patch ? 'archived' THEN CASE WHEN (p_patch->>'archived')::boolean THEN COALESCE(archived_at, now()) END ELSE archived_at END,
    provider = CASE WHEN p_patch ? 'provider' THEN NULLIF(p_patch->>'provider', '') ELSE provider END,
    model = CASE WHEN p_patch ? 'model' THEN NULLIF(btrim(p_patch->>'model'), '') ELSE model END,
    reasoning_level = CASE WHEN p_patch ? 'reasoningLevel' THEN NULLIF(p_patch->>'reasoningLevel', '') ELSE reasoning_level END
  WHERE id = chat.id AND (p_patch ? 'title' OR p_patch ? 'archived' OR p_patch ? 'provider' OR p_patch ? 'model' OR p_patch ? 'reasoningLevel');
  INSERT INTO public.numo_conversation_state (user_id, conversation_id, pinned_at, last_read_at)
    VALUES (actor, p_id, CASE WHEN p_patch->>'pinned' = 'true' THEN now() END, CASE WHEN p_patch->>'read' = 'true' THEN now() END)
  ON CONFLICT (user_id, conversation_id) DO UPDATE SET
    pinned_at = CASE WHEN p_patch ? 'pinned' THEN CASE WHEN p_patch->>'pinned' = 'true' THEN COALESCE(numo_conversation_state.pinned_at, now()) END ELSE numo_conversation_state.pinned_at END,
    last_read_at = greatest(numo_conversation_state.last_read_at, EXCLUDED.last_read_at);
END;
$function$;
