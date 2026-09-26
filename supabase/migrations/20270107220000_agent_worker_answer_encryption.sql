-- Protect mediated worker answers and the parent conversation copies.
BEGIN;

ALTER TABLE public.agent_run_input_requests
  ADD COLUMN answer_encryption_version integer NOT NULL DEFAULT 0,
  ADD COLUMN answer_encryption_checked_at timestamptz,
  ADD CONSTRAINT agent_input_answer_encryption_state CHECK (
    answer_encryption_version = 0 OR
    (answer_encryption_version > 0 AND answer IS NOT NULL
      AND COALESCE((answer::jsonb ->> 'format')::integer = 3, false)
      AND COALESCE((answer::jsonb ->> 'keyVersion')::integer = answer_encryption_version, false))
  ) NOT VALID;
CREATE INDEX agent_input_answer_encryption_queue
  ON public.agent_run_input_requests (answer_encryption_checked_at NULLS FIRST, id)
  WHERE status = 'answered';

ALTER TABLE public.assistant_messages
  ADD COLUMN worker_content_encryption_version integer NOT NULL DEFAULT 0,
  ADD COLUMN worker_content_encryption_checked_at timestamptz,
  ADD CONSTRAINT assistant_worker_content_encryption_state CHECK (
    worker_content_encryption_version = 0 OR
    (worker_content_encryption_version > 0 AND content IS NOT NULL
      AND context IS NULL
      AND (metadata - 'worker_input' - 'worker_steering') = '{}'::jsonb
      AND COALESCE((content::jsonb ->> 'format')::integer = 3, false)
      AND COALESCE((content::jsonb ->> 'keyVersion')::integer = worker_content_encryption_version, false))
  ) NOT VALID;
CREATE INDEX assistant_worker_content_encryption_queue
  ON public.assistant_messages (worker_content_encryption_checked_at NULLS FIRST, id)
  WHERE metadata ? 'worker_input' OR metadata ? 'worker_steering';

CREATE FUNCTION public.agent_worker_answer_part(p_payload text, p_part text)
RETURNS text LANGUAGE plpgsql IMMUTABLE SET search_path = '' AS $$
DECLARE parsed jsonb; result text;
BEGIN
  parsed := p_payload::jsonb;
  IF parsed ->> 'kind' IS DISTINCT FROM 'encrypted_worker_answer' THEN
    RETURN btrim(p_payload);
  END IF;
  IF p_part NOT IN ('queue', 'answer', 'parent') THEN
    RAISE EXCEPTION 'worker_answer_part_invalid' USING ERRCODE = '22023';
  END IF;
  result := parsed ->> p_part;
  IF public.agent_queue_content_version(result) < 1 THEN
    RAISE EXCEPTION 'worker_answer_payload_invalid' USING ERRCODE = '22023';
  END IF;
  RETURN result;
EXCEPTION WHEN invalid_text_representation THEN
  RETURN btrim(p_payload);
END;
$$;
REVOKE ALL ON FUNCTION public.agent_worker_answer_part(text,text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.agent_worker_answer_part(text,text) TO service_role;

CREATE FUNCTION public.guard_agent_input_answer()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE project uuid;
BEGIN
  SELECT r.project_id INTO project FROM public.agent_runs r
    WHERE r.id = NEW.run_id FOR SHARE;
  IF project IS NULL THEN
    RAISE EXCEPTION 'agent_input_run_missing' USING ERRCODE = '23503';
  END IF;
  IF TG_OP = 'UPDATE' AND OLD.status = 'answered' AND (
    NEW.answer IS DISTINCT FROM OLD.answer OR
    NEW.answer_encryption_version IS DISTINCT FROM OLD.answer_encryption_version OR
    NEW.answer_message_id IS DISTINCT FROM OLD.answer_message_id OR
    NEW.run_id IS DISTINCT FROM OLD.run_id
  ) AND current_setting('minddy.encryption_maintenance', true) IS DISTINCT FROM 'on' THEN
    RAISE EXCEPTION 'agent_input_answer_is_immutable' USING ERRCODE = '23514';
  END IF;
  IF TG_OP = 'UPDATE' AND
      NEW.answer_encryption_version < OLD.answer_encryption_version THEN
    RAISE EXCEPTION 'agent_input_answer_version_rollback' USING ERRCODE = '23514';
  END IF;
  IF NEW.status <> 'answered' THEN RETURN NEW; END IF;
  IF NEW.answer_encryption_version > 0 THEN
    INSERT INTO public.agent_launch_encryption_scopes(project_id)
      VALUES(project) ON CONFLICT DO NOTHING;
  ELSIF EXISTS (SELECT 1 FROM public.agent_launch_encryption_scopes
      WHERE project_id = project) AND
    (TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM 'answered' OR
      NEW.answer IS DISTINCT FROM OLD.answer) THEN
    RAISE EXCEPTION 'agent_input_answer_requires_encryption' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER agent_input_answer_guard
  BEFORE INSERT OR UPDATE ON public.agent_run_input_requests
  FOR EACH ROW EXECUTE FUNCTION public.guard_agent_input_answer();
REVOKE ALL ON FUNCTION public.guard_agent_input_answer()
  FROM PUBLIC, anon, authenticated;

CREATE FUNCTION public.guard_worker_parent_message()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE source_run_id uuid; project uuid;
BEGIN
  IF NOT COALESCE(NEW.metadata ? 'worker_input' OR
      NEW.metadata ? 'worker_steering', false)
     AND (TG_OP = 'INSERT' OR NOT COALESCE(OLD.metadata ? 'worker_input'
       OR OLD.metadata ? 'worker_steering', false)) THEN RETURN NEW; END IF;
  IF TG_OP = 'UPDATE' AND (
    NEW.content IS DISTINCT FROM OLD.content OR
    NEW.worker_content_encryption_version IS DISTINCT FROM OLD.worker_content_encryption_version OR
    NEW.conversation_id IS DISTINCT FROM OLD.conversation_id OR
    NEW.metadata IS DISTINCT FROM OLD.metadata
  ) AND current_setting('minddy.encryption_maintenance', true) IS DISTINCT FROM 'on' THEN
    RAISE EXCEPTION 'worker_parent_content_is_immutable' USING ERRCODE = '23514';
  END IF;
  IF TG_OP = 'UPDATE' AND NEW.worker_content_encryption_version <
      OLD.worker_content_encryption_version THEN
    RAISE EXCEPTION 'worker_parent_version_rollback' USING ERRCODE = '23514';
  END IF;
  source_run_id := COALESCE(
    nullif(NEW.metadata #>> '{worker_input,run_id}', '')::uuid,
    nullif(NEW.metadata #>> '{worker_steering,run_id}', '')::uuid);
  SELECT r.project_id INTO project FROM public.agent_runs r
    WHERE r.id = source_run_id AND r.parent_numo_conversation_id = NEW.conversation_id FOR SHARE;
  IF project IS NULL THEN
    RAISE EXCEPTION 'worker_parent_scope_mismatch' USING ERRCODE = '23514';
  END IF;
  IF NEW.worker_content_encryption_version > 0 THEN
    INSERT INTO public.agent_launch_encryption_scopes(project_id)
      VALUES(project) ON CONFLICT DO NOTHING;
  ELSIF EXISTS (SELECT 1 FROM public.agent_launch_encryption_scopes
      WHERE project_id = project) AND
    (TG_OP = 'INSERT' OR NEW.content IS DISTINCT FROM OLD.content) THEN
    RAISE EXCEPTION 'worker_parent_requires_encryption' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER worker_parent_message_guard
  BEFORE INSERT OR UPDATE ON public.assistant_messages
  FOR EACH ROW EXECUTE FUNCTION public.guard_worker_parent_message();
REVOKE ALL ON FUNCTION public.guard_worker_parent_message()
  FROM PUBLIC, anon, authenticated;

REVOKE EXECUTE ON FUNCTION public.migrate_agent_queue_message(
  uuid,uuid,uuid,text,jsonb,integer,text,integer) FROM service_role;

CREATE FUNCTION public.migrate_agent_queue_bundle(
  p_id uuid, p_run_id uuid, p_project_id uuid,
  p_expected jsonb, p_replacement jsonb DEFAULT NULL
) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE queue_row public.agent_run_messages;
  transcript public.agent_messages;
  answer_row public.agent_run_input_requests;
  parent public.assistant_messages;
  prior text := current_setting('minddy.encryption_maintenance', true);
  new_version integer; answer_version integer; parent_version integer;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.agent_runs
      WHERE id = p_run_id AND project_id = p_project_id FOR SHARE) THEN
    RETURN false;
  END IF;
  SELECT * INTO queue_row FROM public.agent_run_messages
    WHERE id = p_id AND run_id = p_run_id FOR UPDATE;
  IF NOT FOUND OR queue_row.content IS DISTINCT FROM p_expected ->> 'content' OR
      queue_row.mentions IS DISTINCT FROM
        NULLIF(p_expected -> 'mentions', 'null'::jsonb) OR
      queue_row.content_encryption_version IS DISTINCT FROM
        (p_expected ->> 'version')::integer THEN RETURN false; END IF;
  SELECT * INTO transcript FROM public.agent_messages
    WHERE legacy_queue_message_id = p_id FOR UPDATE;
  IF NOT FOUND OR transcript.run_id IS DISTINCT FROM p_run_id OR
      transcript.content IS DISTINCT FROM queue_row.content OR
      transcript.content_encryption_version IS DISTINCT FROM
        queue_row.content_encryption_version THEN RETURN false; END IF;
  SELECT * INTO answer_row FROM public.agent_run_input_requests
    WHERE answer_message_id = p_id AND run_id = p_run_id FOR UPDATE;
  IF (answer_row.id IS NULL) IS DISTINCT FROM (p_expected -> 'answer' IS NULL) THEN
    RETURN false;
  END IF;
  IF answer_row.id IS NOT NULL AND (
    answer_row.id::text IS DISTINCT FROM p_expected #>> '{answer,id}' OR
    answer_row.answer IS DISTINCT FROM p_expected #>> '{answer,content}' OR
    answer_row.answer_encryption_version IS DISTINCT FROM
      (p_expected #>> '{answer,version}')::integer
  ) THEN RETURN false; END IF;
  SELECT * INTO parent FROM public.assistant_messages
    WHERE id = p_id AND (metadata ? 'worker_input' OR
      metadata ? 'worker_steering') FOR UPDATE;
  IF (parent.id IS NULL) IS DISTINCT FROM (p_expected -> 'parent' IS NULL) THEN
    RETURN false;
  END IF;
  IF parent.id IS NOT NULL AND (
    parent.content IS DISTINCT FROM p_expected #>> '{parent,content}' OR
    parent.context IS DISTINCT FROM
      NULLIF(p_expected #> '{parent,context}', 'null'::jsonb) OR
    parent.metadata IS DISTINCT FROM p_expected #> '{parent,metadata}' OR
    parent.worker_content_encryption_version IS DISTINCT FROM
      (p_expected #>> '{parent,version}')::integer
  ) THEN RETURN false; END IF;
  IF p_replacement IS NULL THEN
    UPDATE public.agent_run_messages SET encryption_checked_at = clock_timestamp()
      WHERE id = p_id;
    RETURN true;
  END IF;
  new_version := (p_replacement ->> 'version')::integer;
  IF new_version < 1 OR public.agent_queue_content_version(
      p_replacement ->> 'content') IS DISTINCT FROM new_version THEN
    RAISE EXCEPTION 'agent_queue_bundle_invalid' USING ERRCODE = '22023';
  END IF;
  IF answer_row.id IS NOT NULL THEN
    answer_version := (p_replacement #>> '{answer,version}')::integer;
    IF answer_version < 1 OR public.agent_queue_content_version(
        p_replacement #>> '{answer,content}') IS DISTINCT FROM answer_version THEN
      RAISE EXCEPTION 'agent_queue_answer_invalid' USING ERRCODE = '22023';
    END IF;
  ELSIF p_replacement -> 'answer' IS NOT NULL THEN
    RAISE EXCEPTION 'agent_queue_answer_unexpected' USING ERRCODE = '22023';
  END IF;
  IF parent.id IS NOT NULL THEN
    parent_version := (p_replacement #>> '{parent,version}')::integer;
    IF parent_version < 1 OR public.agent_queue_content_version(
        p_replacement #>> '{parent,content}') IS DISTINCT FROM parent_version THEN
      RAISE EXCEPTION 'agent_queue_parent_invalid' USING ERRCODE = '22023';
    END IF;
  ELSIF p_replacement -> 'parent' IS NOT NULL THEN
    RAISE EXCEPTION 'agent_queue_parent_unexpected' USING ERRCODE = '22023';
  END IF;
  PERFORM set_config('minddy.encryption_maintenance', 'on', true);
  UPDATE public.agent_run_messages SET content = p_replacement ->> 'content',
    mentions = NULL, content_encryption_version = new_version,
    encryption_checked_at = clock_timestamp() WHERE id = p_id;
  UPDATE public.agent_messages SET content = p_replacement ->> 'content',
    content_encryption_version = new_version WHERE id = transcript.id;
  IF answer_row.id IS NOT NULL THEN
    UPDATE public.agent_run_input_requests
      SET answer = p_replacement #>> '{answer,content}',
        answer_encryption_version = answer_version,
        answer_encryption_checked_at = clock_timestamp()
      WHERE id = answer_row.id;
  END IF;
  IF parent.id IS NOT NULL THEN
    UPDATE public.assistant_messages
      SET content = p_replacement #>> '{parent,content}', context = NULL,
        metadata = jsonb_strip_nulls(jsonb_build_object(
          'worker_input', parent.metadata -> 'worker_input',
          'worker_steering', parent.metadata -> 'worker_steering')),
        worker_content_encryption_version = parent_version,
        worker_content_encryption_checked_at = clock_timestamp()
      WHERE id = parent.id;
  END IF;
  PERFORM set_config('minddy.encryption_maintenance', COALESCE(prior, ''), true);
  RETURN true;
END;
$$;
REVOKE ALL ON FUNCTION public.migrate_agent_queue_bundle(
  uuid,uuid,uuid,jsonb,jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.migrate_agent_queue_bundle(
  uuid,uuid,uuid,jsonb,jsonb) TO service_role;

CREATE OR REPLACE FUNCTION public.resume_numo_worker_input(
  p_conversation_id uuid,
  p_parent_turn_id uuid,
  p_run_id uuid,
  p_question_id text,
  p_user_id uuid,
  p_message_id uuid,
  p_answer text,
  p_persist_parent_message boolean,
  p_not_before timestamptz,
  p_usage_since timestamptz DEFAULT NULL,
  p_budget_cap numeric DEFAULT NULL,
  p_requested_budget numeric DEFAULT NULL
) RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_turn public.numo_assistant_turns%ROWTYPE;
  v_run public.agent_runs%ROWTYPE;
  v_input public.agent_run_input_requests%ROWTYPE;
  v_result text;
BEGIN
  IF p_conversation_id IS NULL OR p_parent_turn_id IS NULL OR p_run_id IS NULL
     OR nullif(btrim(p_question_id), '') IS NULL OR p_user_id IS NULL
     OR p_message_id IS NULL OR nullif(btrim(p_answer), '') IS NULL
     OR p_not_before IS NULL THEN
    RAISE EXCEPTION 'numo_worker_input_invalid' USING ERRCODE = '22023';
  END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('numo-conversation:' || p_conversation_id::text, 516)
  );

  SELECT * INTO v_turn FROM public.numo_assistant_turns
  WHERE id = p_parent_turn_id AND conversation_id = p_conversation_id
    AND user_id = p_user_id
  FOR UPDATE;
  IF v_turn.id IS NULL OR v_turn.active_run_id IS DISTINCT FROM p_run_id
     OR v_turn.status NOT IN ('running', 'waiting_input') THEN
    RETURN 'ignored';
  END IF;

  SELECT * INTO v_input FROM public.agent_run_input_requests
  WHERE run_id = p_run_id AND parent_numo_turn_id = p_parent_turn_id
    AND question_id = p_question_id
  FOR UPDATE;
  IF v_input.id IS NULL THEN RETURN 'ignored'; END IF;
  IF v_input.status = 'answered' THEN RETURN 'already'; END IF;
  IF v_input.status <> 'pending' THEN RETURN 'ignored'; END IF;

  SELECT * INTO v_run FROM public.agent_runs WHERE id = p_run_id FOR UPDATE;
  IF v_run.id IS NULL OR v_run.parent_numo_turn_id IS DISTINCT FROM p_parent_turn_id
     OR v_run.status <> 'completed' OR NOT v_run.awaiting_input THEN
    UPDATE public.agent_run_input_requests
    SET status = 'canceled'
    WHERE id = v_input.id AND status = 'pending';
    RETURN 'ignored';
  END IF;

  SELECT public.resume_latest_agent_run_with_message(
    p_run_id, p_user_id, p_user_id, p_message_id,
    public.agent_worker_answer_part(p_answer, 'queue'), null,
    p_not_before, p_usage_since, p_budget_cap, p_requested_budget
  ) INTO v_result;
  IF v_result NOT IN ('queued', 'already') THEN RETURN v_result; END IF;

  UPDATE public.agent_runs
  SET awaiting_input = false, delegation_result = null
  WHERE id = p_run_id AND status IN ('queued', 'running');
  UPDATE public.agent_run_input_requests
  SET status = 'answered',
      answer = public.agent_worker_answer_part(p_answer, 'answer'),
      answer_encryption_version = public.agent_queue_content_version(
        public.agent_worker_answer_part(p_answer, 'answer')),
      answer_message_id = p_message_id, answered_at = now()
  WHERE id = v_input.id AND status = 'pending';

  IF p_persist_parent_message THEN
    INSERT INTO public.assistant_messages (
      id, conversation_id, turn_id, role, content,
      metadata, worker_content_encryption_version
    ) VALUES (
      p_message_id, p_conversation_id, p_parent_turn_id, 'user',
      public.agent_worker_answer_part(p_answer, 'parent'),
      jsonb_build_object(
        'worker_input', jsonb_build_object(
          'run_id', p_run_id, 'question_id', p_question_id
        )
      ),
      public.agent_queue_content_version(
        public.agent_worker_answer_part(p_answer, 'parent'))
    ) ON CONFLICT (id) DO NOTHING;
    UPDATE public.numo_assistant_turns
    SET status = 'waiting_work', checkpoint = jsonb_build_object(
          'phase', 'worker_wait', 'active_run_id', p_run_id
        ),
        claim_token = NULL, claimed_at = NULL, active_run_id = p_run_id,
        error_message = NULL, updated_at = now()
    WHERE id = p_parent_turn_id AND status = 'waiting_input';
    UPDATE public.conversations
    SET status = 'generating', error_message = NULL, updated_at = now()
    WHERE id = p_conversation_id AND user_id = p_user_id;
  END IF;
  RETURN v_result;
END;
$$;

CREATE OR REPLACE FUNCTION public.steer_numo_worker(
  p_conversation_id uuid,
  p_user_id uuid,
  p_message_id uuid,
  p_content text,
  p_parent_content text DEFAULT NULL,
  p_mentions jsonb DEFAULT NULL,
  p_context jsonb DEFAULT NULL,
  p_metadata jsonb DEFAULT '{}'::jsonb
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_turn public.numo_assistant_turns%ROWTYPE;
  v_run public.agent_runs%ROWTYPE;
  v_result text;
BEGIN
  IF p_conversation_id IS NULL OR p_user_id IS NULL OR p_message_id IS NULL
     OR nullif(btrim(p_content), '') IS NULL THEN
    RAISE EXCEPTION 'numo_worker_steering_invalid' USING ERRCODE = '22023';
  END IF;
  IF (p_mentions IS NOT NULL AND jsonb_typeof(p_mentions) <> 'array')
     OR (p_context IS NOT NULL AND jsonb_typeof(p_context) <> 'object')
     OR jsonb_typeof(COALESCE(p_metadata, '{}'::jsonb)) <> 'object' THEN
    RAISE EXCEPTION 'numo_worker_steering_invalid' USING ERRCODE = '22023';
  END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('numo-conversation:' || p_conversation_id::text, 516)
  );
  SELECT * INTO v_turn FROM public.numo_assistant_turns
  WHERE conversation_id = p_conversation_id AND user_id = p_user_id
    AND status IN ('waiting_work', 'waiting_input')
  ORDER BY created_at DESC, id DESC LIMIT 1 FOR UPDATE;
  IF v_turn.id IS NULL OR v_turn.active_run_id IS NULL THEN
    RETURN jsonb_build_object('action', 'none');
  END IF;
  IF v_turn.status = 'waiting_input' THEN
    IF EXISTS (
      SELECT 1 FROM public.agent_run_input_requests
      WHERE parent_numo_turn_id = v_turn.id
        AND run_id = v_turn.active_run_id AND status = 'pending'
    ) THEN
      RETURN jsonb_build_object(
        'action', 'refused', 'result', 'worker_input_pending',
        'turn_id', v_turn.id, 'run_id', v_turn.active_run_id
      );
    END IF;
    RETURN jsonb_build_object('action', 'none');
  END IF;
  SELECT * INTO v_run FROM public.agent_runs
  WHERE id = v_turn.active_run_id AND parent_numo_turn_id = v_turn.id
    AND status IN ('queued', 'running')
  FOR UPDATE;
  IF v_run.id IS NULL THEN RETURN jsonb_build_object('action', 'none'); END IF;

  IF public.agent_queue_content_version(p_content) > 0 AND (
    public.agent_queue_content_version(p_parent_content) < 1 OR
    p_context IS NOT NULL OR COALESCE(p_metadata, '{}'::jsonb) <> '{}'::jsonb
  ) THEN
    RAISE EXCEPTION 'encrypted_worker_steering_invalid' USING ERRCODE = '22023';
  END IF;
  SELECT public.insert_latest_agent_run_message(
    v_run.id, p_message_id, p_user_id, btrim(p_content), p_mentions
  ) INTO v_result;
  IF v_result NOT IN ('inserted', 'already') THEN
    RETURN jsonb_build_object('action', 'refused', 'result', v_result);
  END IF;
  INSERT INTO public.assistant_messages (
    id, conversation_id, turn_id, role, content, context, metadata,
    worker_content_encryption_version
  ) VALUES (
    p_message_id, p_conversation_id, v_turn.id, 'user',
    btrim(COALESCE(NULLIF(p_parent_content, ''), p_content)), p_context,
    COALESCE(p_metadata, '{}'::jsonb) || jsonb_build_object(
      'worker_steering', jsonb_build_object('run_id', v_run.id)
    ),
    public.agent_queue_content_version(
      btrim(COALESCE(NULLIF(p_parent_content, ''), p_content)))
  ) ON CONFLICT (id) DO NOTHING;
  UPDATE public.agent_runs
  SET interrupt_requested = true, last_activity_at = now()
  WHERE id = v_run.id AND status = 'running';
  RETURN jsonb_build_object(
    'action', 'steered', 'turn_id', v_turn.id, 'run_id', v_run.id
  );
END;
$$;

COMMIT;
