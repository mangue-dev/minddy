-- Keep failed Numo candidates visible while allowing later candidates to progress.
BEGIN;
ALTER TABLE public.numo_assistant_turns ADD COLUMN intent_encryption_attempted_at timestamptz;
CREATE INDEX numo_turn_intent_attempt_queue ON public.numo_assistant_turns
  (intent_encryption_attempted_at NULLS FIRST,id);

CREATE OR REPLACE FUNCTION public.migrate_numo_turn_intent(
  p_id uuid,p_old jsonb,p_new jsonb
) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE observed public.numo_assistant_turns;
BEGIN
  SELECT * INTO observed FROM public.numo_assistant_turns WHERE id=p_id FOR UPDATE;
  IF NOT FOUND OR observed.intent IS DISTINCT FROM p_old THEN RETURN false; END IF;
  UPDATE public.numo_assistant_turns SET intent=p_new,
    intent_encryption_checked_at=clock_timestamp(),
    intent_encryption_attempted_at=clock_timestamp() WHERE id=p_id;
  RETURN true;
END;
$$;

CREATE FUNCTION public.mark_numo_turn_intent_attempt(p_id uuid,p_old jsonb)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE affected integer;
BEGIN
  UPDATE public.numo_assistant_turns
    SET intent_encryption_attempted_at=clock_timestamp()
    WHERE id=p_id AND intent IS NOT DISTINCT FROM p_old;
  GET DIAGNOSTICS affected=ROW_COUNT;
  RETURN affected=1;
END;
$$;
REVOKE ALL ON FUNCTION public.mark_numo_turn_intent_attempt(uuid,jsonb)
  FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.mark_numo_turn_intent_attempt(uuid,jsonb)
  TO service_role;

ALTER TABLE public.numo_turn_events ADD COLUMN payload_user_encryption_attempted_at timestamptz;
ALTER TABLE public.numo_automation_operations ADD COLUMN content_encryption_attempted_at timestamptz;
ALTER TABLE public.conversations ADD COLUMN title_encryption_attempted_at timestamptz;
ALTER TABLE public.conversations ADD COLUMN error_encryption_attempted_at timestamptz;
ALTER TABLE public.numo_assistant_turns ADD COLUMN error_encryption_attempted_at timestamptz;
ALTER TABLE public.numo_routine_occurrences ADD COLUMN error_encryption_attempted_at timestamptz;
ALTER TABLE public.numo_assistant_turns ADD COLUMN outcome_encryption_attempted_at timestamptz;
ALTER TABLE public.assistant_messages ADD COLUMN final_payload_attempted_at timestamptz;
ALTER TABLE public.numo_surface_events ADD COLUMN destination_encryption_attempted_at timestamptz;
ALTER TABLE public.assistant_messages ADD COLUMN user_payload_attempted_at timestamptz;
ALTER TABLE public.assistant_messages ADD COLUMN tool_payload_attempted_at timestamptz;
ALTER TABLE public.numo_assistant_turns ADD COLUMN tool_checkpoint_attempted_at timestamptz;
ALTER TABLE public.numo_tool_operations ADD COLUMN encryption_attempted_at timestamptz;

CREATE OR REPLACE FUNCTION public.mark_numo_tool_content_attempt(
  p_kind text,p_id uuid,p_call_id text DEFAULT NULL
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  RAISE invalid_parameter_value USING
    MESSAGE='Obsolete Numo tool attempt marker is disabled';
END;
$$;
REVOKE ALL ON FUNCTION public.mark_numo_tool_content_attempt(text,uuid,text)
  FROM service_role;

CREATE INDEX numo_activity_attempt_queue ON public.numo_turn_events
  (payload_user_encryption_attempted_at NULLS FIRST,id)
  WHERE type NOT IN ('worker_completed','worker_failed','worker_input');
CREATE INDEX numo_automation_attempt_queue ON public.numo_automation_operations
  (content_encryption_attempted_at NULLS FIRST,id);
CREATE INDEX numo_title_attempt_queue ON public.conversations
  (title_encryption_attempted_at NULLS FIRST,id);
CREATE INDEX numo_error_turn_attempt_queue ON public.numo_assistant_turns
  (error_encryption_attempted_at NULLS FIRST,id);
CREATE INDEX numo_error_occurrence_attempt_queue ON public.numo_routine_occurrences
  (error_encryption_attempted_at NULLS FIRST,id);
CREATE INDEX numo_error_conversation_attempt_queue ON public.conversations
  (error_encryption_attempted_at NULLS FIRST,id);
CREATE INDEX numo_outcome_attempt_queue ON public.numo_assistant_turns
  (outcome_encryption_attempted_at NULLS FIRST,id);
CREATE INDEX numo_final_message_attempt_queue ON public.assistant_messages
  (final_payload_attempted_at NULLS FIRST,id);
CREATE INDEX numo_surface_attempt_queue ON public.numo_surface_events
  (destination_encryption_attempted_at NULLS FIRST,id);
CREATE INDEX numo_user_message_attempt_queue ON public.assistant_messages
  (user_payload_attempted_at NULLS FIRST,id);
CREATE INDEX numo_tool_message_attempt_queue ON public.assistant_messages
  (tool_payload_attempted_at NULLS FIRST,id);
CREATE INDEX numo_tool_checkpoint_attempt_queue ON public.numo_assistant_turns
  (tool_checkpoint_attempted_at NULLS FIRST,id);
CREATE INDEX numo_tool_operation_attempt_queue ON public.numo_tool_operations
  (encryption_attempted_at NULLS FIRST,turn_id,tool_call_id);

-- Attempt-only updates must pass existing activated guards even when a
-- historical row is still clear or malformed. All other changes retain the
-- original guard and binding checks.
CREATE OR REPLACE FUNCTION public.guard_numo_user_message()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE payload jsonb; active boolean;
BEGIN
  IF TG_OP='UPDATE' AND (to_jsonb(NEW) - 'user_payload_attempted_at') =
      (to_jsonb(OLD) - 'user_payload_attempted_at') THEN RETURN NEW; END IF;
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

CREATE OR REPLACE FUNCTION public.guard_numo_final_message()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE payload jsonb; active boolean;
BEGIN
  IF TG_OP='UPDATE' AND (to_jsonb(NEW) - 'final_payload_attempted_at') =
      (to_jsonb(OLD) - 'final_payload_attempted_at') THEN RETURN NEW; END IF;
  IF TG_OP='UPDATE' AND (NEW.id IS DISTINCT FROM OLD.id OR
      NEW.conversation_id IS DISTINCT FROM OLD.conversation_id OR
      NEW.role IS DISTINCT FROM OLD.role OR NEW.turn_id IS DISTINCT FROM OLD.turn_id) THEN
    RAISE EXCEPTION 'numo_final_message_binding_immutable' USING ERRCODE='23514';
  END IF;
  IF NEW.role <> 'assistant' OR NEW.tool_calls IS NOT NULL OR
      NEW.tool_payload_version > 0 OR
      (TG_OP='UPDATE' AND OLD.tool_payload_version > 0) THEN
    IF NEW.final_payload_version <> 0 OR
        (TG_OP='UPDATE' AND OLD.final_payload_version > 0) THEN
      RAISE EXCEPTION 'numo_final_message_state_invalid' USING ERRCODE='23514';
    END IF;
    RETURN NEW;
  END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('numo-final-content-activation',591));
  active := EXISTS(SELECT 1 FROM public.numo_final_content_scope);
  IF NEW.final_payload_version > 0 THEN
    BEGIN payload := NEW.content::jsonb;
    EXCEPTION WHEN others THEN
      RAISE EXCEPTION 'numo_final_message_ciphertext_invalid' USING ERRCODE='23514';
    END;
    IF NEW.context IS NOT NULL OR NEW.metadata <> '{}'::jsonb OR
       NEW.tool_call_id IS NOT NULL OR NEW.tool_name IS NOT NULL OR
       COALESCE((payload->>'format')::integer=3,false) IS FALSE OR
       COALESCE((payload->>'keyVersion')::integer=NEW.final_payload_version,false) IS FALSE OR
       (TG_OP='UPDATE' AND NEW.final_payload_version < OLD.final_payload_version) THEN
      RAISE EXCEPTION 'numo_final_message_ciphertext_invalid' USING ERRCODE='23514';
    END IF;
    INSERT INTO public.numo_final_content_scope(id) VALUES(true) ON CONFLICT DO NOTHING;
  ELSIF active OR (TG_OP='UPDATE' AND OLD.final_payload_version > 0) THEN
    RAISE EXCEPTION 'numo_final_message_requires_encryption' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.guard_numo_tool_message()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE active boolean; payload jsonb;
BEGIN
  IF TG_OP='UPDATE' AND NEW.tool_payload_checked_at IS NULL AND
      OLD.tool_payload_checked_at IS NOT NULL AND
      (to_jsonb(NEW) - ARRAY['tool_payload_checked_at','tool_payload_attempted_at']) =
      (to_jsonb(OLD) - ARRAY['tool_payload_checked_at','tool_payload_attempted_at'])
      THEN RETURN NEW; END IF;
  IF TG_OP='UPDATE' AND (to_jsonb(NEW) - 'tool_payload_attempted_at') =
      (to_jsonb(OLD) - 'tool_payload_attempted_at') THEN RETURN NEW; END IF;
  IF NEW.role <> 'tool' AND NOT (NEW.role='assistant' AND
      (NEW.tool_calls IS NOT NULL OR NEW.tool_payload_version>0 OR
       (TG_OP='UPDATE' AND OLD.tool_payload_version>0))) THEN
    IF NEW.tool_payload_version<>0 THEN
      RAISE EXCEPTION 'numo_tool_message_state_invalid' USING ERRCODE='23514';
    END IF;
    RETURN NEW;
  END IF;
  IF TG_OP='UPDATE' AND (NEW.id IS DISTINCT FROM OLD.id OR
      NEW.conversation_id IS DISTINCT FROM OLD.conversation_id OR
      NEW.turn_id IS DISTINCT FROM OLD.turn_id OR
      NEW.role IS DISTINCT FROM OLD.role OR
      NEW.tool_call_id IS DISTINCT FROM OLD.tool_call_id OR
      NEW.tool_name IS DISTINCT FROM OLD.tool_name) THEN
    RAISE EXCEPTION 'numo_tool_message_binding_immutable' USING ERRCODE='23514';
  END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('numo-tool-content-activation',591));
  active := EXISTS(SELECT 1 FROM public.numo_tool_content_scope);
  IF NEW.tool_payload_version>0 THEN
    BEGIN payload:=NEW.content::jsonb;
    EXCEPTION WHEN others THEN
      RAISE EXCEPTION 'numo_tool_message_ciphertext_invalid' USING ERRCODE='23514';
    END;
    IF NEW.tool_calls IS NOT NULL OR NEW.context IS NOT NULL OR
       NEW.metadata<>'{}'::jsonb OR
       COALESCE((payload->>'format')::integer=3,false) IS FALSE OR
       COALESCE((payload->>'keyVersion')::integer=NEW.tool_payload_version,false) IS FALSE OR
       (TG_OP='UPDATE' AND NEW.tool_payload_version<OLD.tool_payload_version) THEN
      RAISE EXCEPTION 'numo_tool_message_ciphertext_invalid' USING ERRCODE='23514';
    END IF;
    INSERT INTO public.numo_tool_content_scope(id) VALUES(true)
      ON CONFLICT DO NOTHING;
  ELSIF active OR (TG_OP='UPDATE' AND OLD.tool_payload_version>0) THEN
    RAISE EXCEPTION 'numo_tool_message_requires_encryption' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.guard_numo_tool_operation()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE active boolean; payload jsonb; version integer; field text;
BEGIN
  IF TG_OP='UPDATE' AND NEW.encryption_checked_at IS NULL AND
      OLD.encryption_checked_at IS NOT NULL AND
      (to_jsonb(NEW) - ARRAY['encryption_checked_at','encryption_attempted_at']) =
      (to_jsonb(OLD) - ARRAY['encryption_checked_at','encryption_attempted_at'])
      THEN RETURN NEW; END IF;
  IF TG_OP='UPDATE' AND (to_jsonb(NEW) - 'encryption_attempted_at') =
      (to_jsonb(OLD) - 'encryption_attempted_at') THEN RETURN NEW; END IF;
  IF TG_OP='UPDATE' AND (NEW.turn_id IS DISTINCT FROM OLD.turn_id OR
      NEW.tool_call_id IS DISTINCT FROM OLD.tool_call_id OR
      NEW.tool_name IS DISTINCT FROM OLD.tool_name) THEN
    RAISE EXCEPTION 'numo_tool_operation_binding_immutable' USING ERRCODE='23514';
  END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('numo-tool-content-activation',591));
  active := EXISTS(SELECT 1 FROM public.numo_tool_content_scope);
  IF NEW.arguments_version>0 THEN
    IF NEW.arguments_digest !~ '^[0-9a-f]{64}$' THEN
      RAISE EXCEPTION 'numo_tool_operation_digest_invalid' USING ERRCODE='23514';
    END IF;
    FOREACH field IN ARRAY ARRAY['arguments','result','model_result'] LOOP
      EXECUTE pg_catalog.format('SELECT ($1).%I',field) INTO payload USING NEW;
      EXECUTE pg_catalog.format('SELECT ($1).%I',field||'_version') INTO version USING NEW;
      IF field='arguments' OR NEW.status='completed' THEN
        IF payload IS NULL OR version<1 OR
           COALESCE((payload->>'format')::integer=3,false) IS FALSE OR
           COALESCE((payload->>'keyVersion')::integer=version,false) IS FALSE THEN
          RAISE EXCEPTION 'numo_tool_operation_ciphertext_invalid' USING ERRCODE='23514';
        END IF;
      ELSIF payload IS NOT NULL AND version=0 THEN
        RAISE EXCEPTION 'numo_tool_operation_state_invalid' USING ERRCODE='23514';
      END IF;
    END LOOP;
    IF TG_OP='UPDATE' AND (NEW.arguments_version<OLD.arguments_version OR
        NEW.result_version<OLD.result_version OR
        NEW.model_result_version<OLD.model_result_version) THEN
      RAISE EXCEPTION 'numo_tool_operation_key_rollback' USING ERRCODE='23514';
    END IF;
    INSERT INTO public.numo_tool_content_scope(id) VALUES(true)
      ON CONFLICT DO NOTHING;
  ELSIF active OR (TG_OP='UPDATE' AND OLD.arguments_version>0) THEN
    RAISE EXCEPTION 'numo_tool_operation_requires_encryption' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END;
$$;

-- The previous marker wrote checked_at on failed tool rows. Its timestamps
-- cannot distinguish success from failure, so reverify every tool candidate.
UPDATE public.assistant_messages SET tool_payload_checked_at=NULL
  WHERE tool_payload_checked_at IS NOT NULL;
UPDATE public.numo_assistant_turns SET tool_checkpoint_checked_at=NULL
  WHERE tool_checkpoint_checked_at IS NOT NULL;
UPDATE public.numo_tool_operations SET encryption_checked_at=NULL
  WHERE encryption_checked_at IS NOT NULL;

-- A successful migration moves the row too. Verification time retains its
-- meaning: a failed row never acquires a successful checked_at timestamp.
CREATE FUNCTION public.stamp_numo_success_attempt()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF (to_jsonb(NEW)->TG_ARGV[0]) IS DISTINCT FROM (to_jsonb(OLD)->TG_ARGV[0]) THEN
    NEW := jsonb_populate_record(NEW,jsonb_build_object(TG_ARGV[1],clock_timestamp()));
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER numo_intent_attempt_on_success BEFORE UPDATE OF intent_encryption_checked_at
  ON public.numo_assistant_turns FOR EACH ROW EXECUTE FUNCTION public.stamp_numo_success_attempt('intent_encryption_checked_at','intent_encryption_attempted_at');
CREATE TRIGGER numo_activity_attempt_on_success BEFORE UPDATE OF payload_user_encryption_checked_at
  ON public.numo_turn_events FOR EACH ROW EXECUTE FUNCTION public.stamp_numo_success_attempt('payload_user_encryption_checked_at','payload_user_encryption_attempted_at');
CREATE TRIGGER numo_automation_attempt_on_success BEFORE UPDATE OF content_encryption_checked_at
  ON public.numo_automation_operations FOR EACH ROW EXECUTE FUNCTION public.stamp_numo_success_attempt('content_encryption_checked_at','content_encryption_attempted_at');
CREATE TRIGGER numo_title_attempt_on_success BEFORE UPDATE OF title_encryption_checked_at
  ON public.conversations FOR EACH ROW EXECUTE FUNCTION public.stamp_numo_success_attempt('title_encryption_checked_at','title_encryption_attempted_at');
CREATE TRIGGER numo_error_conversation_attempt_on_success BEFORE UPDATE OF error_encryption_checked_at
  ON public.conversations FOR EACH ROW EXECUTE FUNCTION public.stamp_numo_success_attempt('error_encryption_checked_at','error_encryption_attempted_at');
CREATE TRIGGER numo_error_turn_attempt_on_success BEFORE UPDATE OF error_encryption_checked_at
  ON public.numo_assistant_turns FOR EACH ROW EXECUTE FUNCTION public.stamp_numo_success_attempt('error_encryption_checked_at','error_encryption_attempted_at');
CREATE TRIGGER numo_error_occurrence_attempt_on_success BEFORE UPDATE OF error_encryption_checked_at
  ON public.numo_routine_occurrences FOR EACH ROW EXECUTE FUNCTION public.stamp_numo_success_attempt('error_encryption_checked_at','error_encryption_attempted_at');
CREATE TRIGGER numo_outcome_attempt_on_success BEFORE UPDATE OF outcome_encryption_checked_at
  ON public.numo_assistant_turns FOR EACH ROW EXECUTE FUNCTION public.stamp_numo_success_attempt('outcome_encryption_checked_at','outcome_encryption_attempted_at');
CREATE TRIGGER numo_final_attempt_on_success BEFORE UPDATE OF final_payload_checked_at
  ON public.assistant_messages FOR EACH ROW EXECUTE FUNCTION public.stamp_numo_success_attempt('final_payload_checked_at','final_payload_attempted_at');
CREATE TRIGGER numo_surface_attempt_on_success BEFORE UPDATE OF destination_encryption_checked_at
  ON public.numo_surface_events FOR EACH ROW EXECUTE FUNCTION public.stamp_numo_success_attempt('destination_encryption_checked_at','destination_encryption_attempted_at');
CREATE TRIGGER numo_user_message_attempt_on_success BEFORE UPDATE OF user_payload_checked_at
  ON public.assistant_messages FOR EACH ROW EXECUTE FUNCTION public.stamp_numo_success_attempt('user_payload_checked_at','user_payload_attempted_at');
CREATE TRIGGER numo_tool_message_attempt_on_success BEFORE UPDATE OF tool_payload_checked_at
  ON public.assistant_messages FOR EACH ROW EXECUTE FUNCTION public.stamp_numo_success_attempt('tool_payload_checked_at','tool_payload_attempted_at');
CREATE TRIGGER numo_tool_checkpoint_attempt_on_success BEFORE UPDATE OF tool_checkpoint_checked_at
  ON public.numo_assistant_turns FOR EACH ROW EXECUTE FUNCTION public.stamp_numo_success_attempt('tool_checkpoint_checked_at','tool_checkpoint_attempted_at');
CREATE TRIGGER numo_tool_operation_attempt_on_success BEFORE UPDATE OF encryption_checked_at
  ON public.numo_tool_operations FOR EACH ROW EXECUTE FUNCTION public.stamp_numo_success_attempt('encryption_checked_at','encryption_attempted_at');

CREATE FUNCTION public.mark_numo_content_attempt(
  p_kind text,p_id uuid,p_old jsonb,p_call_id text DEFAULT NULL
) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE table_name text; attempt_column text; affected integer;
BEGIN
  SELECT mapping.table_name,mapping.attempt_column INTO table_name,attempt_column
  FROM (VALUES
    ('activity','numo_turn_events','payload_user_encryption_attempted_at'),
    ('automation','numo_automation_operations','content_encryption_attempted_at'),
    ('title','conversations','title_encryption_attempted_at'),
    ('error_conversation','conversations','error_encryption_attempted_at'),
    ('error_turn','numo_assistant_turns','error_encryption_attempted_at'),
    ('error_occurrence','numo_routine_occurrences','error_encryption_attempted_at'),
    ('outcome','numo_assistant_turns','outcome_encryption_attempted_at'),
    ('final_message','assistant_messages','final_payload_attempted_at'),
    ('surface','numo_surface_events','destination_encryption_attempted_at'),
    ('user_message','assistant_messages','user_payload_attempted_at'),
    ('tool_message','assistant_messages','tool_payload_attempted_at'),
    ('tool_checkpoint','numo_assistant_turns','tool_checkpoint_attempted_at'),
    ('tool_operation','numo_tool_operations','encryption_attempted_at')
  ) AS mapping(kind,table_name,attempt_column) WHERE mapping.kind=p_kind;
  IF table_name IS NULL OR p_old IS NULL OR jsonb_typeof(p_old)<>'object' OR
      p_old='{}'::jsonb THEN
    RAISE invalid_parameter_value USING MESSAGE='Invalid Numo attempt marker';
  END IF;
  IF p_kind='tool_operation' THEN
    IF p_call_id IS NULL THEN RAISE invalid_parameter_value; END IF;
    EXECUTE format('UPDATE public.%I AS t SET %I=clock_timestamp() WHERE turn_id=$1 AND tool_call_id=$2 AND to_jsonb(t) @> $3',table_name,attempt_column)
      USING p_id,p_call_id,p_old;
  ELSE
    IF p_call_id IS NOT NULL THEN RAISE invalid_parameter_value; END IF;
    EXECUTE format('UPDATE public.%I AS t SET %I=clock_timestamp() WHERE id=$1 AND to_jsonb(t) @> $2',table_name,attempt_column)
      USING p_id,p_old;
  END IF;
  GET DIAGNOSTICS affected=ROW_COUNT;
  RETURN affected=1;
END;
$$;
REVOKE ALL ON FUNCTION public.mark_numo_content_attempt(text,uuid,jsonb,text)
  FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.mark_numo_content_attempt(text,uuid,jsonb,text)
  TO service_role;

-- The old stream writers were already refused, but their durable copies were
-- still readable from Realtime's retained partitions. The lock makes cleanup
-- atomic with that refusal for all active partitions.
LOCK TABLE realtime.messages IN SHARE ROW EXCLUSIVE MODE;
DO $$
DECLARE removed integer;
BEGIN
  LOOP
    WITH doomed AS (
      SELECT id,inserted_at FROM realtime.messages
        WHERE topic LIKE 'numo-comment:%' OR topic LIKE 'numo-page-comment:%'
        ORDER BY inserted_at,id LIMIT 1000
    )
    DELETE FROM realtime.messages AS message USING doomed
      WHERE message.id=doomed.id AND message.inserted_at=doomed.inserted_at;
    GET DIAGNOSTICS removed=ROW_COUNT;
    EXIT WHEN removed=0;
  END LOOP;
END;
$$;
COMMIT;
