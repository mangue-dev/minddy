-- Protect assistant conversation titles and their invoker-view projections.
BEGIN;
ALTER TABLE public.conversations
  ADD COLUMN title_encryption_checked_at timestamptz;
CREATE INDEX numo_conversation_title_queue ON public.conversations
  (title_encryption_checked_at NULLS FIRST,id);

CREATE TABLE public.numo_conversation_title_scope (
  id boolean PRIMARY KEY DEFAULT true CHECK(id),
  activated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.numo_conversation_title_scope ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.numo_conversation_title_scope
  FROM PUBLIC,anon,authenticated;
GRANT ALL ON public.numo_conversation_title_scope TO service_role;

CREATE FUNCTION public.guard_numo_conversation_title()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE active boolean; new_version integer; old_version integer;
BEGIN
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('numo-conversation-title-activation',591));
  IF TG_OP='UPDATE' AND (NEW.id IS DISTINCT FROM OLD.id OR
      NEW.user_id IS DISTINCT FROM OLD.user_id) THEN
    RAISE EXCEPTION 'numo_conversation_title_binding_immutable'
      USING ERRCODE='23514';
  END IF;
  active := EXISTS (SELECT 1 FROM public.numo_conversation_title_scope)
    OR NEW.title LIKE 'mdyn3:%';
  IF NEW.title LIKE 'mdyn3:%' THEN
    IF NEW.title !~ '^mdyn3:[1-9][0-9]*:[A-Za-z0-9_-]+$' THEN
      RAISE EXCEPTION 'numo_conversation_title_ciphertext_invalid'
        USING ERRCODE='23514';
    END IF;
    new_version := pg_catalog.split_part(NEW.title,':',2)::integer;
    IF TG_OP='UPDATE' AND OLD.title LIKE 'mdyn3:%' THEN
      old_version := pg_catalog.split_part(OLD.title,':',2)::integer;
      IF new_version < old_version THEN
        RAISE EXCEPTION 'numo_conversation_title_key_rollback'
          USING ERRCODE='23514';
      END IF;
    END IF;
    INSERT INTO public.numo_conversation_title_scope(id)
      VALUES(true) ON CONFLICT DO NOTHING;
  ELSIF active AND NEW.title IS NOT NULL AND
      (TG_OP='INSERT' OR NEW.title IS DISTINCT FROM OLD.title OR
        NEW.title_encryption_checked_at IS DISTINCT FROM
          OLD.title_encryption_checked_at) THEN
    RAISE EXCEPTION 'numo_conversation_title_requires_encryption'
      USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER numo_conversation_title_guard BEFORE INSERT OR UPDATE
  ON public.conversations FOR EACH ROW
  EXECUTE FUNCTION public.guard_numo_conversation_title();
REVOKE ALL ON FUNCTION public.guard_numo_conversation_title()
  FROM PUBLIC,anon,authenticated;

CREATE FUNCTION public.migrate_numo_conversation_title(
  p_id uuid,p_old text,p_new text
) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE observed public.conversations;
BEGIN
  SELECT * INTO observed FROM public.conversations WHERE id=p_id FOR UPDATE;
  IF NOT FOUND OR observed.title IS DISTINCT FROM p_old THEN RETURN false; END IF;
  UPDATE public.conversations SET title=p_new,
    title_encryption_checked_at=clock_timestamp() WHERE id=p_id;
  RETURN true;
END;
$$;
REVOKE ALL ON FUNCTION public.migrate_numo_conversation_title(uuid,text,text)
  FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.migrate_numo_conversation_title(uuid,text,text)
  TO service_role;

-- Preserve the existing locked edit path while accepting sealed assistant titles.
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
    OR EXISTS (SELECT 1 FROM jsonb_object_keys(p_patch) k WHERE k NOT IN ('title', 'archived', 'pinned', 'read', 'model', 'reasoningLevel', 'title_ciphertext', 'title_encryption_version'))
    OR (p_patch ? 'title' AND jsonb_typeof(p_patch->'title') NOT IN ('string', 'null'))
    OR (length(p_patch->>'title') > 200
      AND p_patch->>'title' NOT LIKE 'mdyn3:%')
    OR ((p_patch ? 'title_ciphertext') <> (p_patch ? 'title_encryption_version'))
    OR (p_patch ? 'title_ciphertext' AND (NOT p_patch ? 'title'
      OR p_patch->>'title' IS NOT NULL
      OR jsonb_typeof(p_patch->'title_ciphertext') <> 'string'
      OR jsonb_typeof(p_patch->'title_encryption_version') <> 'number'))
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
      title = CASE WHEN p_patch ? 'title_ciphertext' THEN NULL
        WHEN p_patch ? 'title' THEN nullif(btrim(p_patch->>'title'), '') ELSE title END,
      title_ciphertext = CASE WHEN p_patch ? 'title_ciphertext'
        THEN p_patch->>'title_ciphertext' ELSE title_ciphertext END,
      title_encryption_version = CASE WHEN p_patch ? 'title_encryption_version'
        THEN (p_patch->>'title_encryption_version')::integer
        ELSE title_encryption_version END,
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
    IF p_patch ? 'title_ciphertext' OR p_patch ? 'title_encryption_version' THEN
      RAISE EXCEPTION 'Invalid assistant title patch' USING ERRCODE='22023';
    END IF;
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
REVOKE ALL ON FUNCTION public.update_numo_conversation(uuid,uuid,jsonb)
  FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.update_numo_conversation(uuid,uuid,jsonb)
  TO service_role;

-- Deterministic reservation IDs let the application bind titles before SQL inserts.
CREATE OR REPLACE FUNCTION public.ensure_numo_routine_occurrence(p_routine_id uuid, p_user_id uuid, p_origin text, p_scheduled_for timestamp with time zone, p_request_id uuid, p_title text)
 RETURNS numo_routine_occurrences
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_routine public.agent_routines%ROWTYPE;
  v_occurrence public.numo_routine_occurrences%ROWTYPE;
  v_conversation_id uuid;
BEGIN
  IF p_routine_id IS NULL OR p_user_id IS NULL OR p_request_id IS NULL
     OR p_origin NOT IN ('scheduled', 'manual')
     OR (p_origin = 'scheduled' AND p_scheduled_for IS NULL)
     OR (p_origin = 'manual' AND p_scheduled_for IS NOT NULL)
     OR nullif(pg_catalog.btrim(p_title), '') IS NULL THEN
    RAISE EXCEPTION 'routine_occurrence_invalid' USING ERRCODE = '22023';
  END IF;

  SELECT routine.* INTO v_routine
  FROM public.agent_routines AS routine
  JOIN public.projects AS project ON project.id = routine.project_id
  WHERE routine.id = p_routine_id
    AND routine.deleted_at IS NULL
    AND project.deleted_at IS NULL
  FOR UPDATE OF routine;
  IF v_routine.id IS NULL THEN
    RAISE EXCEPTION 'routine_not_found' USING ERRCODE = 'P0002';
  END IF;
  IF v_routine.owner_id IS DISTINCT FROM p_user_id THEN
    RAISE EXCEPTION 'routine_owner_mismatch' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_occurrence
  FROM public.numo_routine_occurrences
  WHERE request_id = p_request_id
     OR (
       p_origin = 'scheduled'
       AND routine_id = p_routine_id
       AND origin = 'scheduled'
       AND scheduled_for = p_scheduled_for
     )
  ORDER BY created_at ASC
  LIMIT 1;
  IF v_occurrence.id IS NOT NULL THEN
    IF v_occurrence.routine_id IS DISTINCT FROM p_routine_id
       OR v_occurrence.origin IS DISTINCT FROM p_origin
       OR v_occurrence.scheduled_for IS DISTINCT FROM p_scheduled_for THEN
      RAISE EXCEPTION 'routine_occurrence_conflict' USING ERRCODE = '23505';
    END IF;
    RETURN v_occurrence;
  END IF;

  INSERT INTO public.conversations (
    id, project_id, user_id, title, model, reasoning_level
  ) VALUES (
    p_request_id, NULL, p_user_id, CASE WHEN p_title LIKE 'mdyn3:%'
      THEN p_title ELSE pg_catalog.left(pg_catalog.btrim(p_title), 200) END, NULL, NULL
  ) RETURNING id INTO v_conversation_id;

  INSERT INTO public.numo_routine_occurrences (
    routine_id, origin, scheduled_for, conversation_id, request_id
  ) VALUES (
    p_routine_id, p_origin, p_scheduled_for, v_conversation_id, p_request_id
  ) RETURNING * INTO v_occurrence;
  RETURN v_occurrence;
END;
$function$;
REVOKE ALL ON FUNCTION public.ensure_numo_routine_occurrence(
  uuid,uuid,text,timestamptz,uuid,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.ensure_numo_routine_occurrence(
  uuid,uuid,text,timestamptz,uuid,text) TO service_role;

CREATE OR REPLACE FUNCTION public.ensure_numo_automation_operation(p_chain_id uuid, p_step integer, p_rule_id text, p_mode text, p_user_id uuid, p_title text, p_request_id uuid, p_prompt text, p_locale text, p_context jsonb)
 RETURNS numo_automation_operations
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_chain public.agent_chains%ROWTYPE;
  v_operation public.numo_automation_operations%ROWTYPE;
  v_conversation_id uuid;
  v_identifier text;
BEGIN
  SELECT * INTO v_chain FROM public.agent_chains
    WHERE id=p_chain_id FOR UPDATE;
  IF v_chain.id IS NULL THEN
    RAISE EXCEPTION 'chain_not_found' USING ERRCODE='P0002';
  END IF;
  IF v_chain.owner_id <> p_user_id THEN
    RAISE EXCEPTION 'chain_owner_mismatch' USING ERRCODE='42501';
  END IF;
  IF v_chain.status <> 'running' OR v_chain.step <> p_step OR
      jsonb_array_length(v_chain.played_rule_ids) = 0 OR
      v_chain.played_rule_ids ->>
        (jsonb_array_length(v_chain.played_rule_ids)-1) <> p_rule_id THEN
    RAISE EXCEPTION 'chain_step_mismatch' USING ERRCODE='40001';
  END IF;
  SELECT * INTO v_operation FROM public.numo_automation_operations
    WHERE chain_id=p_chain_id AND step=p_step;
  IF v_operation.id IS NOT NULL THEN RETURN v_operation; END IF;

  SELECT conversation_id INTO v_conversation_id
    FROM public.numo_automation_operations
    WHERE chain_id=p_chain_id ORDER BY step ASC LIMIT 1;
  IF v_conversation_id IS NULL THEN
    SELECT project.key || '-' || issue.number::text INTO v_identifier
      FROM public.issues AS issue
      JOIN public.projects AS project ON project.id=issue.project_id
      WHERE issue.id=v_chain.issue_id AND project.id=v_chain.project_id;
    IF v_identifier IS NULL THEN
      RAISE EXCEPTION 'chain_issue_identifier_missing' USING ERRCODE='23503';
    END IF;
    INSERT INTO public.conversations(id,project_id,user_id,title)
      VALUES(p_request_id,NULL,p_user_id,
        CASE WHEN p_title LIKE 'mdyn3:%' THEN p_title ELSE v_identifier END)
      RETURNING id INTO v_conversation_id;
  END IF;
  INSERT INTO public.numo_automation_operations(chain_id,step,rule_id,
    mode,conversation_id,request_id,prompt,locale,context)
    VALUES(p_chain_id,p_step,p_rule_id,p_mode,v_conversation_id,
      p_request_id,p_prompt,p_locale,COALESCE(p_context,'{}'::jsonb))
    RETURNING * INTO v_operation;
  RETURN v_operation;
END;
$function$;
REVOKE ALL ON FUNCTION public.ensure_numo_automation_operation(
  uuid,integer,text,text,uuid,text,uuid,text,text,jsonb)
  FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.ensure_numo_automation_operation(
  uuid,integer,text,text,uuid,text,uuid,text,text,jsonb) TO service_role;
COMMIT;
