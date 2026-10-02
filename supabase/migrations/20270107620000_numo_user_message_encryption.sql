-- MIN-591: protect user messages admitted with durable Numo turns.
BEGIN;
ALTER TABLE public.assistant_messages
  ADD COLUMN user_payload_version integer NOT NULL DEFAULT 0,
  ADD COLUMN user_payload_checked_at timestamptz,
  ADD CONSTRAINT assistant_user_payload_version_nonnegative
    CHECK(user_payload_version >= 0);
CREATE INDEX assistant_user_payload_queue ON public.assistant_messages
  (user_payload_checked_at NULLS FIRST,id) WHERE role='user'
  AND worker_content_encryption_version=0;
CREATE TABLE public.numo_user_message_scope (
  id boolean PRIMARY KEY DEFAULT true CHECK(id),
  activated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.numo_user_message_scope ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.numo_user_message_scope FROM PUBLIC,anon,authenticated;
GRANT ALL ON public.numo_user_message_scope TO service_role;

CREATE FUNCTION public.guard_numo_user_message()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE payload jsonb; active boolean;
BEGIN
  IF TG_OP='UPDATE' AND (NEW.id IS DISTINCT FROM OLD.id OR
      NEW.conversation_id IS DISTINCT FROM OLD.conversation_id OR
      NEW.role IS DISTINCT FROM OLD.role OR NEW.turn_id IS DISTINCT FROM OLD.turn_id) THEN
    RAISE EXCEPTION 'numo_user_message_binding_immutable' USING ERRCODE='23514';
  END IF;
  IF NEW.role <> 'user' OR NEW.worker_content_encryption_version > 0 THEN
    IF NEW.user_payload_version <> 0 THEN
      RAISE EXCEPTION 'numo_user_message_state_invalid' USING ERRCODE='23514';
    END IF;
    RETURN NEW;
  END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('numo-user-message-activation',591));
  active := EXISTS(SELECT 1 FROM public.numo_user_message_scope);
  IF NEW.user_payload_version > 0 THEN
    BEGIN payload := NEW.content::jsonb;
    EXCEPTION WHEN others THEN
      RAISE EXCEPTION 'numo_user_message_ciphertext_invalid' USING ERRCODE='23514';
    END;
    IF NEW.context IS NOT NULL OR NEW.metadata <> '{}'::jsonb OR
       NEW.tool_calls IS NOT NULL OR NEW.tool_call_id IS NOT NULL OR
       NEW.tool_name IS NOT NULL OR
       COALESCE((payload->>'format')::integer=3,false) IS FALSE OR
       COALESCE((payload->>'keyVersion')::integer=NEW.user_payload_version,false) IS FALSE OR
       (TG_OP='UPDATE' AND NEW.user_payload_version < OLD.user_payload_version) THEN
      RAISE EXCEPTION 'numo_user_message_ciphertext_invalid' USING ERRCODE='23514';
    END IF;
    INSERT INTO public.numo_user_message_scope(id) VALUES(true) ON CONFLICT DO NOTHING;
  ELSIF active OR (TG_OP='UPDATE' AND OLD.user_payload_version > 0) THEN
    RAISE EXCEPTION 'numo_user_message_requires_encryption' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER numo_user_message_guard BEFORE INSERT OR UPDATE
  ON public.assistant_messages FOR EACH ROW
  EXECUTE FUNCTION public.guard_numo_user_message();
REVOKE ALL ON FUNCTION public.guard_numo_user_message()
  FROM PUBLIC,anon,authenticated;

CREATE FUNCTION public.migrate_numo_user_message(
  p_id uuid,p_old_content text,p_old_context jsonb,p_old_metadata jsonb,
  p_old_tool_calls jsonb,p_old_tool_call_id text,p_old_tool_name text,
  p_old_version integer,p_new_content text,p_new_version integer
) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE observed public.assistant_messages;
BEGIN
  SELECT * INTO observed FROM public.assistant_messages WHERE id=p_id FOR UPDATE;
  IF NOT FOUND OR observed.role <> 'user' OR
      observed.worker_content_encryption_version <> 0 OR
      observed.content IS DISTINCT FROM p_old_content OR
      observed.context IS DISTINCT FROM p_old_context OR
      observed.metadata IS DISTINCT FROM p_old_metadata OR
      observed.tool_calls IS DISTINCT FROM p_old_tool_calls OR
      observed.tool_call_id IS DISTINCT FROM p_old_tool_call_id OR
      observed.tool_name IS DISTINCT FROM p_old_tool_name OR
      observed.user_payload_version IS DISTINCT FROM p_old_version THEN RETURN false; END IF;
  UPDATE public.assistant_messages SET content=p_new_content,context=NULL,
    metadata='{}'::jsonb,tool_calls=NULL,tool_call_id=NULL,tool_name=NULL,
    user_payload_version=p_new_version,
    user_payload_checked_at=clock_timestamp() WHERE id=p_id;
  RETURN true;
END;
$$;
REVOKE ALL ON FUNCTION public.migrate_numo_user_message(uuid,text,jsonb,jsonb,jsonb,text,text,integer,text,integer)
  FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.migrate_numo_user_message(uuid,text,jsonb,jsonb,jsonb,text,text,integer,text,integer)
  TO service_role;

DROP FUNCTION public.begin_numo_turn(uuid,uuid,uuid,uuid,jsonb,text,text,text,jsonb,jsonb);
DROP FUNCTION public.begin_numo_turn_with_budget(uuid,uuid,uuid,uuid,jsonb,text,text,text,jsonb,jsonb,timestamptz,numeric,numeric);
CREATE OR REPLACE FUNCTION public.begin_numo_turn(p_conversation_id uuid, p_user_id uuid, p_request_id uuid, p_run_id uuid, p_intent jsonb, p_model text, p_reasoning_level text, p_message_id uuid, p_user_payload_version integer, p_content text, p_context jsonb, p_metadata jsonb)
 RETURNS numo_assistant_turns
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_turn public.numo_assistant_turns%ROWTYPE;
BEGIN
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('numo-conversation:' || p_conversation_id::text, 516)
  );
  IF NOT EXISTS (
    SELECT 1 FROM public.conversations
    WHERE id = p_conversation_id AND user_id = p_user_id
  ) THEN RAISE EXCEPTION 'conversation_not_found' USING ERRCODE = 'P0002'; END IF;

  SELECT * INTO v_turn FROM public.numo_assistant_turns
  WHERE conversation_id = p_conversation_id AND request_id = p_request_id;
  IF v_turn.id IS NOT NULL THEN RETURN v_turn; END IF;
  IF EXISTS (
    SELECT 1 FROM public.numo_assistant_turns
    WHERE conversation_id = p_conversation_id
      AND status IN (
        'queued', 'running', 'waiting_work', 'stopping', 'retryable', 'reconciling'
      )
  ) THEN RAISE EXCEPTION 'conversation_busy' USING ERRCODE = '55000'; END IF;

  INSERT INTO public.numo_assistant_turns (
    conversation_id, user_id, request_id, run_id, intent, model, reasoning_level
  ) VALUES (
    p_conversation_id, p_user_id, p_request_id, p_run_id,
    COALESCE(p_intent, '{}'::jsonb), p_model, p_reasoning_level
  ) RETURNING * INTO v_turn;
  INSERT INTO public.assistant_messages (
    id, conversation_id, turn_id, role, content, context, metadata, user_payload_version
  ) VALUES (
    p_message_id, p_conversation_id, v_turn.id, 'user', p_content, p_context,
    COALESCE(p_metadata, '{}'::jsonb), p_user_payload_version
  );
  UPDATE public.conversations
  SET status = 'generating', error_message = NULL, updated_at = now()
  WHERE id = p_conversation_id;
  RETURN v_turn;
END;
$function$;

REVOKE ALL ON FUNCTION public.begin_numo_turn(uuid,uuid,uuid,uuid,jsonb,text,text,uuid,integer,text,jsonb,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.begin_numo_turn(uuid,uuid,uuid,uuid,jsonb,text,text,uuid,integer,text,jsonb,jsonb) TO service_role;
CREATE OR REPLACE FUNCTION public.begin_numo_turn_with_budget(p_conversation_id uuid, p_user_id uuid, p_request_id uuid, p_run_id uuid, p_intent jsonb, p_model text, p_reasoning_level text, p_message_id uuid, p_user_payload_version integer, p_content text, p_context jsonb, p_metadata jsonb, p_usage_since timestamp with time zone, p_budget_cap numeric, p_requested_budget numeric)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_turn public.numo_assistant_turns%ROWTYPE;
  v_spent numeric;
  v_reserved numeric;
  v_granted numeric;
BEGIN
  IF p_conversation_id IS NULL OR p_user_id IS NULL OR p_request_id IS NULL
     OR p_run_id IS NULL OR p_usage_since IS NULL
     OR p_budget_cap IS NULL OR p_budget_cap < 0
     OR p_requested_budget IS NULL OR p_requested_budget <= 0 THEN
    RAISE EXCEPTION 'numo_turn_budget_invalid' USING ERRCODE = '22023';
  END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('numo-conversation:' || p_conversation_id::text, 516)
  );
  IF NOT EXISTS (
    SELECT 1 FROM public.conversations
    WHERE id = p_conversation_id AND user_id = p_user_id
  ) THEN
    RAISE EXCEPTION 'conversation_not_found' USING ERRCODE = 'P0002';
  END IF;

  SELECT * INTO v_turn FROM public.numo_assistant_turns
  WHERE conversation_id = p_conversation_id AND request_id = p_request_id;
  IF v_turn.id IS NOT NULL THEN
    RETURN pg_catalog.jsonb_build_object('turn', pg_catalog.to_jsonb(v_turn));
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.numo_assistant_turns
    WHERE conversation_id = p_conversation_id
      AND status IN (
        'queued', 'running', 'waiting_work', 'stopping', 'retryable', 'reconciling'
      )
  ) THEN
    RAISE EXCEPTION 'conversation_busy' USING ERRCODE = '55000';
  END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(p_user_id::text, 460)
  );
  SELECT COALESCE(SUM(cost), 0) INTO v_spent
  FROM public.ai_usage
  WHERE user_id = p_user_id
    AND created_at >= p_usage_since
    AND key_mode = 'platform';

  SELECT
    COALESCE((
      SELECT SUM(GREATEST(
        run.managed_budget_usd - COALESCE(usage.spent, 0), 0
      ))
      FROM public.agent_runs AS run
      LEFT JOIN LATERAL (
        SELECT SUM(cost) AS spent FROM public.ai_usage
        WHERE run_id = run.run_id AND key_mode = 'platform'
      ) AS usage ON true
      WHERE run.created_by = p_user_id
        AND run.key_mode = 'platform'
        AND run.parent_numo_turn_id IS NULL
        AND run.status IN ('queued', 'running')
        AND run.managed_budget_usd IS NOT NULL
    ), 0)
    + COALESCE((
      SELECT SUM(GREATEST(
        turn.managed_budget_usd - COALESCE(usage.spent, 0), 0
      ))
      FROM public.numo_assistant_turns AS turn
      LEFT JOIN LATERAL (
        SELECT SUM(cost) AS spent FROM public.ai_usage
        WHERE numo_turn_id = turn.id AND key_mode = 'platform'
      ) AS usage ON true
      WHERE turn.user_id = p_user_id
        AND turn.status IN (
          'queued', 'running', 'waiting_work', 'stopping', 'retryable', 'reconciling'
        )
        AND turn.managed_budget_usd IS NOT NULL
    ), 0)
  INTO v_reserved;

  v_granted := LEAST(
    p_requested_budget,
    GREATEST(p_budget_cap - v_spent - v_reserved, 0)
  );
  IF v_granted <= 0 THEN
    RETURN pg_catalog.jsonb_build_object(
      'turn', NULL,
      'granted_budget_usd', 0,
      'spent_usd', v_spent,
      'reserved_usd', v_reserved
    );
  END IF;

  INSERT INTO public.numo_assistant_turns (
    conversation_id, user_id, request_id, run_id, intent, model,
    reasoning_level, managed_budget_usd
  ) VALUES (
    p_conversation_id, p_user_id, p_request_id, p_run_id,
    COALESCE(p_intent, '{}'::jsonb), p_model, p_reasoning_level, v_granted
  ) RETURNING * INTO v_turn;
  INSERT INTO public.assistant_messages (
    id, conversation_id, turn_id, role, content, context, metadata, user_payload_version
  ) VALUES (
    p_message_id, p_conversation_id, v_turn.id, 'user', p_content, p_context,
    COALESCE(p_metadata, '{}'::jsonb), p_user_payload_version
  );
  UPDATE public.conversations
  SET status = 'generating', error_message = NULL, updated_at = now()
  WHERE id = p_conversation_id;

  RETURN pg_catalog.jsonb_build_object(
    'turn', pg_catalog.to_jsonb(v_turn),
    'granted_budget_usd', v_granted,
    'spent_usd', v_spent,
    'reserved_usd', v_reserved
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.begin_numo_turn_with_budget(uuid,uuid,uuid,uuid,jsonb,text,text,uuid,integer,text,jsonb,jsonb,timestamptz,numeric,numeric) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.begin_numo_turn_with_budget(uuid,uuid,uuid,uuid,jsonb,text,text,uuid,integer,text,jsonb,jsonb,timestamptz,numeric,numeric) TO service_role;
COMMIT;
