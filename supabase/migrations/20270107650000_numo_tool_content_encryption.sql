-- MIN-591: protect durable Numo tool rounds, replay checkpoints and tool ledgers.
BEGIN;

ALTER TABLE public.assistant_messages
  ADD COLUMN tool_payload_version integer NOT NULL DEFAULT 0,
  ADD COLUMN tool_payload_checked_at timestamptz,
  ADD CONSTRAINT assistant_tool_payload_version_nonnegative
    CHECK (tool_payload_version >= 0);
CREATE INDEX assistant_tool_payload_queue ON public.assistant_messages
  (tool_payload_checked_at NULLS FIRST,id)
  WHERE role='tool' OR tool_calls IS NOT NULL OR tool_payload_version>0;
DROP INDEX public.assistant_messages_turn_final_unique;
CREATE UNIQUE INDEX assistant_messages_turn_final_unique
  ON public.assistant_messages(turn_id)
  WHERE role='assistant' AND turn_id IS NOT NULL AND tool_calls IS NULL
    AND tool_payload_version=0;

ALTER TABLE public.numo_assistant_turns
  ADD COLUMN tool_checkpoint_checked_at timestamptz;
CREATE INDEX numo_tool_checkpoint_queue ON public.numo_assistant_turns
  (tool_checkpoint_checked_at NULLS FIRST,id);

ALTER TABLE public.numo_tool_operations
  ADD COLUMN arguments_digest text,
  ADD COLUMN arguments_version integer NOT NULL DEFAULT 0,
  ADD COLUMN result_version integer NOT NULL DEFAULT 0,
  ADD COLUMN model_result_version integer NOT NULL DEFAULT 0,
  ADD COLUMN result_run_id uuid,
  ADD COLUMN encryption_checked_at timestamptz,
  ADD CONSTRAINT numo_tool_operation_versions_nonnegative CHECK (
    arguments_version>=0 AND result_version>=0 AND model_result_version>=0);
CREATE INDEX numo_tool_operation_queue ON public.numo_tool_operations
  (encryption_checked_at NULLS FIRST,turn_id,tool_call_id);

CREATE TABLE public.numo_tool_content_scope (
  id boolean PRIMARY KEY DEFAULT true CHECK(id),
  activated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.numo_tool_content_scope ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.numo_tool_content_scope FROM PUBLIC,anon,authenticated;
GRANT ALL ON public.numo_tool_content_scope TO service_role;

CREATE FUNCTION public.guard_numo_tool_message()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE active boolean; payload jsonb;
BEGIN
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
CREATE TRIGGER numo_tool_message_guard BEFORE INSERT OR UPDATE
  ON public.assistant_messages FOR EACH ROW
  EXECUTE FUNCTION public.guard_numo_tool_message();
REVOKE ALL ON FUNCTION public.guard_numo_tool_message()
  FROM PUBLIC,anon,authenticated;

-- A protected assistant tool round has null tool_calls in the base row. It is
-- excluded from the final-answer guard and the final-answer uniqueness index.
CREATE OR REPLACE FUNCTION public.guard_numo_final_message()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE payload jsonb; active boolean;
BEGIN
  IF TG_OP='UPDATE' AND (NEW.id IS DISTINCT FROM OLD.id OR
      NEW.conversation_id IS DISTINCT FROM OLD.conversation_id OR
      NEW.role IS DISTINCT FROM OLD.role OR NEW.turn_id IS DISTINCT FROM OLD.turn_id) THEN
    RAISE EXCEPTION 'numo_final_message_binding_immutable' USING ERRCODE='23514';
  END IF;
  IF NEW.role <> 'assistant' OR NEW.tool_calls IS NOT NULL OR
      NEW.tool_payload_version>0 THEN
    IF NEW.final_payload_version<>0 OR
        (TG_OP='UPDATE' AND OLD.final_payload_version>0) THEN
      RAISE EXCEPTION 'numo_final_message_state_invalid' USING ERRCODE='23514';
    END IF;
    RETURN NEW;
  END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('numo-final-content-activation',591));
  active := EXISTS(SELECT 1 FROM public.numo_final_content_scope);
  IF NEW.final_payload_version>0 THEN
    BEGIN payload:=NEW.content::jsonb;
    EXCEPTION WHEN others THEN
      RAISE EXCEPTION 'numo_final_message_ciphertext_invalid' USING ERRCODE='23514';
    END;
    IF NEW.context IS NOT NULL OR NEW.metadata<>'{}'::jsonb OR
       NEW.tool_call_id IS NOT NULL OR NEW.tool_name IS NOT NULL OR
       COALESCE((payload->>'format')::integer=3,false) IS FALSE OR
       COALESCE((payload->>'keyVersion')::integer=NEW.final_payload_version,false) IS FALSE OR
       (TG_OP='UPDATE' AND NEW.final_payload_version<OLD.final_payload_version) THEN
      RAISE EXCEPTION 'numo_final_message_ciphertext_invalid' USING ERRCODE='23514';
    END IF;
    INSERT INTO public.numo_final_content_scope(id) VALUES(true)
      ON CONFLICT DO NOTHING;
  ELSIF active OR (TG_OP='UPDATE' AND OLD.final_payload_version>0) THEN
    RAISE EXCEPTION 'numo_final_message_requires_encryption' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END;
$$;

CREATE FUNCTION public.guard_numo_tool_checkpoint()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE active boolean; payload jsonb; version integer; old_version integer;
BEGIN
  IF TG_OP='UPDATE' AND (NEW.id IS DISTINCT FROM OLD.id OR
      NEW.user_id IS DISTINCT FROM OLD.user_id OR
      NEW.conversation_id IS DISTINCT FROM OLD.conversation_id) THEN
    RAISE EXCEPTION 'numo_tool_checkpoint_binding_immutable' USING ERRCODE='23514';
  END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('numo-tool-content-activation',591));
  active := EXISTS(SELECT 1 FROM public.numo_tool_content_scope);
  IF COALESCE(NEW.checkpoint->>'phase','') NOT IN ('model','tools') THEN
    IF NEW.checkpoint ? 'encrypted_payload' OR
       (active AND NOT (
         NEW.checkpoint='{}'::jsonb OR
         NEW.checkpoint->>'phase'='worker_result' AND
           NEW.checkpoint - ARRAY['phase','worker_event']::text[]='{}'::jsonb OR
         NEW.checkpoint->>'phase'='worker_input_wait' AND
           NEW.checkpoint - ARRAY['phase','worker_event','input_request']::text[]='{}'::jsonb OR
         NEW.checkpoint->>'phase'='worker_wait' AND
           NEW.checkpoint - ARRAY['phase','active_run_id']::text[]='{}'::jsonb OR
         NEW.checkpoint->>'phase' IN ('user_wait','done') AND
           NEW.checkpoint - 'phase'='{}'::jsonb)) THEN
      RAISE EXCEPTION 'numo_tool_checkpoint_state_invalid' USING ERRCODE='23514';
    END IF;
    RETURN NEW;
  END IF;
  IF NEW.checkpoint ? 'encrypted_payload' THEN
    BEGIN
      payload:=(NEW.checkpoint->>'encrypted_payload')::jsonb;
      version:=(NEW.checkpoint->>'encryption_version')::integer;
    EXCEPTION WHEN others THEN
      RAISE EXCEPTION 'numo_tool_checkpoint_ciphertext_invalid' USING ERRCODE='23514';
    END;
    IF jsonb_typeof(NEW.checkpoint)<>'object' OR
       (NEW.checkpoint - ARRAY['phase','encrypted_payload','encryption_version']::text[])<>'{}'::jsonb OR
       COALESCE(version>0,false) IS FALSE OR
       COALESCE((payload->>'format')::integer=3,false) IS FALSE OR
       COALESCE((payload->>'keyVersion')::integer=version,false) IS FALSE THEN
      RAISE EXCEPTION 'numo_tool_checkpoint_ciphertext_invalid' USING ERRCODE='23514';
    END IF;
    IF TG_OP='UPDATE' AND OLD.checkpoint ? 'encrypted_payload' THEN
      old_version:=(OLD.checkpoint->>'encryption_version')::integer;
      IF version<old_version THEN
        RAISE EXCEPTION 'numo_tool_checkpoint_key_rollback' USING ERRCODE='23514';
      END IF;
    END IF;
    INSERT INTO public.numo_tool_content_scope(id) VALUES(true)
      ON CONFLICT DO NOTHING;
  ELSIF active OR (TG_OP='UPDATE' AND OLD.checkpoint ? 'encrypted_payload') THEN
    RAISE EXCEPTION 'numo_tool_checkpoint_requires_encryption' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER numo_tool_checkpoint_guard BEFORE INSERT OR UPDATE OF checkpoint
  ON public.numo_assistant_turns FOR EACH ROW
  EXECUTE FUNCTION public.guard_numo_tool_checkpoint();
REVOKE ALL ON FUNCTION public.guard_numo_tool_checkpoint()
  FROM PUBLIC,anon,authenticated;

CREATE FUNCTION public.guard_numo_tool_operation()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE active boolean; payload jsonb; version integer; field text;
BEGIN
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
CREATE TRIGGER numo_tool_operation_guard BEFORE INSERT OR UPDATE
  ON public.numo_tool_operations FOR EACH ROW
  EXECUTE FUNCTION public.guard_numo_tool_operation();
REVOKE ALL ON FUNCTION public.guard_numo_tool_operation()
  FROM PUBLIC,anon,authenticated;

CREATE FUNCTION public.checkpoint_numo_tool_round_protected(
  p_turn_id uuid,p_claim_token uuid,p_message_id uuid,p_content text,
  p_payload_version integer,p_checkpoint jsonb,p_round_count integer
) RETURNS SETOF public.numo_assistant_turns
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_turn public.numo_assistant_turns%ROWTYPE;
BEGIN
  IF p_message_id IS NULL OR p_content IS NULL OR p_payload_version<1 OR
      p_checkpoint->>'phase'<>'tools' OR
      p_round_count IS NULL OR p_round_count<1 THEN
    RAISE EXCEPTION 'invalid_protected_tool_round' USING ERRCODE='22023';
  END IF;
  SELECT * INTO v_turn FROM public.numo_assistant_turns
  WHERE id=p_turn_id AND claim_token=p_claim_token AND status='running'
  FOR UPDATE;
  IF v_turn.id IS NULL THEN RETURN; END IF;
  INSERT INTO public.assistant_messages (
    id,conversation_id,turn_id,role,content,tool_calls,context,metadata,
    tool_payload_version
  ) VALUES (p_message_id,v_turn.conversation_id,v_turn.id,'assistant',
    p_content,NULL,NULL,'{}'::jsonb,p_payload_version);
  UPDATE public.numo_assistant_turns SET checkpoint=p_checkpoint,
    claimed_at=now(),updated_at=now()
  WHERE id=v_turn.id AND claim_token=p_claim_token AND status='running'
  RETURNING * INTO v_turn;
  IF v_turn.id IS NOT NULL THEN RETURN NEXT v_turn; END IF;
END;
$$;
REVOKE ALL ON FUNCTION public.checkpoint_numo_tool_round_protected(uuid,uuid,uuid,text,integer,jsonb,integer)
  FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.checkpoint_numo_tool_round_protected(uuid,uuid,uuid,text,integer,jsonb,integer)
  TO service_role;

-- The digest compares arguments while encryption uses a fresh nonce each time.
CREATE FUNCTION public.claim_numo_tool_operation_protected(
  p_turn_id uuid,p_claim_token uuid,p_tool_call_id text,p_tool_name text,
  p_arguments jsonb,p_arguments_version integer,p_arguments_digest text,
  p_replay_policy text
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE operation public.numo_tool_operations%ROWTYPE; inserted integer;
  conversation_id uuid;
BEGIN
  IF p_replay_policy NOT IN ('retry','reconcile') THEN
    RAISE EXCEPTION 'invalid_replay_policy' USING ERRCODE='22023';
  END IF;
  SELECT t.conversation_id INTO conversation_id FROM public.numo_assistant_turns t
    WHERE t.id=p_turn_id AND t.claim_token=p_claim_token AND t.status='running'
    FOR UPDATE;
  IF conversation_id IS NULL THEN RETURN jsonb_build_object('action','lost_claim'); END IF;
  INSERT INTO public.numo_tool_operations(turn_id,tool_call_id,tool_name,
    arguments,arguments_version,arguments_digest,replay_policy,claim_token)
  VALUES(p_turn_id,p_tool_call_id,p_tool_name,p_arguments,p_arguments_version,
    p_arguments_digest,p_replay_policy,p_claim_token)
  ON CONFLICT(turn_id,tool_call_id) DO NOTHING;
  GET DIAGNOSTICS inserted=ROW_COUNT;
  IF inserted=1 THEN RETURN jsonb_build_object('action','execute'); END IF;
  SELECT * INTO operation FROM public.numo_tool_operations
    WHERE turn_id=p_turn_id AND tool_call_id=p_tool_call_id FOR UPDATE;
  IF operation.tool_name<>p_tool_name OR
      operation.arguments_digest IS DISTINCT FROM p_arguments_digest OR
      operation.replay_policy<>p_replay_policy THEN
    RAISE EXCEPTION 'tool_call_conflict' USING ERRCODE='23505';
  END IF;
  IF operation.status='completed' THEN
    RETURN jsonb_build_object('action','reuse','success',operation.success,
      'result',operation.result,'result_version',operation.result_version,
      'model_result',operation.model_result,
      'model_result_version',operation.model_result_version,
      'pause',operation.pause);
  END IF;
  IF operation.replay_policy='retry' THEN
    UPDATE public.numo_tool_operations SET status='started',
      claim_token=p_claim_token,started_at=now()
      WHERE turn_id=p_turn_id AND tool_call_id=p_tool_call_id;
    RETURN jsonb_build_object('action','execute');
  END IF;
  UPDATE public.numo_tool_operations SET status='ambiguous'
    WHERE turn_id=p_turn_id AND tool_call_id=p_tool_call_id;
  UPDATE public.numo_assistant_turns SET status='reconciling',
    claim_token=NULL,claimed_at=NULL,error_message=NULL,updated_at=now()
    WHERE id=p_turn_id AND claim_token=p_claim_token;
  UPDATE public.conversations SET status='error',error_message=NULL,
    updated_at=now() WHERE id=conversation_id;
  RETURN jsonb_build_object('action','reconcile');
END;
$$;
REVOKE ALL ON FUNCTION public.claim_numo_tool_operation_protected(uuid,uuid,text,text,jsonb,integer,text,text)
  FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.claim_numo_tool_operation_protected(uuid,uuid,text,text,jsonb,integer,text,text)
  TO service_role;

CREATE FUNCTION public.complete_numo_tool_operation_protected(
  p_turn_id uuid,p_claim_token uuid,p_tool_call_id text,p_success boolean,
  p_result jsonb,p_result_version integer,p_model_result jsonb,
  p_model_result_version integer,p_result_run_id uuid,p_pause boolean DEFAULT false
) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE updated integer;
BEGIN
  UPDATE public.numo_tool_operations SET status='completed',success=p_success,
    pause=COALESCE(p_pause,false),result=p_result,result_version=p_result_version,
    model_result=p_model_result,model_result_version=p_model_result_version,
    result_run_id=p_result_run_id,completed_at=now()
    WHERE turn_id=p_turn_id AND tool_call_id=p_tool_call_id
      AND status='started' AND claim_token=p_claim_token
      AND EXISTS(SELECT 1 FROM public.numo_assistant_turns WHERE id=p_turn_id
        AND claim_token=p_claim_token AND status IN ('running','stopping'));
  GET DIAGNOSTICS updated=ROW_COUNT;
  IF updated=1 AND p_success THEN
    UPDATE public.numo_assistant_turns t SET active_run_id=r.id,
      updated_at=now()
      FROM public.numo_tool_operations o,public.agent_runs r
      WHERE t.id=p_turn_id AND t.claim_token=p_claim_token
        AND t.status IN ('running','stopping') AND o.turn_id=p_turn_id
        AND o.tool_call_id=p_tool_call_id
        AND o.tool_name='launch_code_agent' AND r.id=o.result_run_id;
  END IF;
  RETURN updated=1;
END;
$$;
REVOKE ALL ON FUNCTION public.complete_numo_tool_operation_protected(uuid,uuid,text,boolean,jsonb,integer,jsonb,integer,uuid,boolean)
  FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.complete_numo_tool_operation_protected(uuid,uuid,text,boolean,jsonb,integer,jsonb,integer,uuid,boolean)
  TO service_role;

CREATE FUNCTION public.migrate_numo_tool_message(
  p_id uuid,p_old_content text,p_old_tool_calls jsonb,p_old_context jsonb,
  p_old_metadata jsonb,p_old_version integer,p_new_content text,
  p_new_version integer,p_old_checkpoint jsonb DEFAULT NULL,
  p_new_checkpoint jsonb DEFAULT NULL
) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE message public.assistant_messages%ROWTYPE;
  turn_row public.numo_assistant_turns%ROWTYPE;
BEGIN
  SELECT * INTO message FROM public.assistant_messages WHERE id=p_id;
  IF NOT FOUND THEN RETURN false; END IF;
  IF message.turn_id IS NOT NULL THEN
    SELECT * INTO turn_row FROM public.numo_assistant_turns
      WHERE id=message.turn_id FOR UPDATE;
  END IF;
  SELECT * INTO message FROM public.assistant_messages WHERE id=p_id FOR UPDATE;
  IF NOT FOUND OR message.role NOT IN ('assistant','tool') OR
      (message.role='assistant' AND message.tool_calls IS NULL AND
       message.tool_payload_version=0) OR
      message.content IS DISTINCT FROM p_old_content OR
      message.tool_calls IS DISTINCT FROM p_old_tool_calls OR
      message.context IS DISTINCT FROM p_old_context OR
      message.metadata IS DISTINCT FROM p_old_metadata OR
      message.tool_payload_version IS DISTINCT FROM p_old_version THEN
    RETURN false;
  END IF;
  IF p_old_checkpoint IS NOT NULL AND (turn_row.id IS NULL OR
      turn_row.checkpoint IS DISTINCT FROM p_old_checkpoint OR
      p_new_checkpoint IS NULL) THEN RETURN false; END IF;
  UPDATE public.assistant_messages SET content=p_new_content,tool_calls=NULL,
    context=NULL,metadata='{}'::jsonb,tool_payload_version=p_new_version,
    tool_payload_checked_at=clock_timestamp() WHERE id=p_id;
  IF p_old_checkpoint IS NOT NULL THEN
    UPDATE public.numo_assistant_turns SET checkpoint=p_new_checkpoint,
      tool_checkpoint_checked_at=clock_timestamp() WHERE id=turn_row.id;
  END IF;
  RETURN true;
END;
$$;
REVOKE ALL ON FUNCTION public.migrate_numo_tool_message(uuid,text,jsonb,jsonb,jsonb,integer,text,integer,jsonb,jsonb)
  FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.migrate_numo_tool_message(uuid,text,jsonb,jsonb,jsonb,integer,text,integer,jsonb,jsonb)
  TO service_role;

CREATE FUNCTION public.migrate_numo_tool_checkpoint(
  p_id uuid,p_old jsonb,p_new jsonb
) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE observed public.numo_assistant_turns%ROWTYPE;
BEGIN
  SELECT * INTO observed FROM public.numo_assistant_turns WHERE id=p_id FOR UPDATE;
  IF NOT FOUND OR observed.checkpoint IS DISTINCT FROM p_old THEN RETURN false; END IF;
  UPDATE public.numo_assistant_turns SET checkpoint=p_new,
    tool_checkpoint_checked_at=clock_timestamp() WHERE id=p_id;
  RETURN true;
END;
$$;
REVOKE ALL ON FUNCTION public.migrate_numo_tool_checkpoint(uuid,jsonb,jsonb)
  FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.migrate_numo_tool_checkpoint(uuid,jsonb,jsonb)
  TO service_role;

CREATE FUNCTION public.migrate_numo_tool_operation(
  p_turn_id uuid,p_tool_call_id text,p_old_arguments jsonb,
  p_old_result jsonb,p_old_model_result jsonb,
  p_old_arguments_version integer,p_old_result_version integer,
  p_old_model_result_version integer,p_old_digest text,
  p_new_arguments jsonb,p_new_result jsonb,p_new_model_result jsonb,
  p_new_arguments_version integer,p_new_result_version integer,
  p_new_model_result_version integer,p_new_digest text,p_result_run_id uuid
) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE observed public.numo_tool_operations%ROWTYPE;
BEGIN
  PERFORM 1 FROM public.numo_assistant_turns WHERE id=p_turn_id FOR UPDATE;
  SELECT * INTO observed FROM public.numo_tool_operations
    WHERE turn_id=p_turn_id AND tool_call_id=p_tool_call_id FOR UPDATE;
  IF NOT FOUND OR observed.arguments IS DISTINCT FROM p_old_arguments OR
      observed.result IS DISTINCT FROM p_old_result OR
      observed.model_result IS DISTINCT FROM p_old_model_result OR
      observed.arguments_version IS DISTINCT FROM p_old_arguments_version OR
      observed.result_version IS DISTINCT FROM p_old_result_version OR
      observed.model_result_version IS DISTINCT FROM p_old_model_result_version OR
      observed.arguments_digest IS DISTINCT FROM p_old_digest THEN RETURN false; END IF;
  UPDATE public.numo_tool_operations SET arguments=p_new_arguments,
    result=p_new_result,model_result=p_new_model_result,
    arguments_version=p_new_arguments_version,result_version=p_new_result_version,
    model_result_version=p_new_model_result_version,
    arguments_digest=p_new_digest,result_run_id=p_result_run_id,
    encryption_checked_at=clock_timestamp()
    WHERE turn_id=p_turn_id AND tool_call_id=p_tool_call_id;
  RETURN true;
END;
$$;
REVOKE ALL ON FUNCTION public.migrate_numo_tool_operation(uuid,text,jsonb,jsonb,jsonb,integer,integer,integer,text,jsonb,jsonb,jsonb,integer,integer,integer,text,uuid)
  FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.migrate_numo_tool_operation(uuid,text,jsonb,jsonb,jsonb,integer,integer,integer,text,jsonb,jsonb,jsonb,integer,integer,integer,text,uuid)
  TO service_role;

-- Keep only the new worker event; never carry stale model/tool ciphertext or
-- legacy model input into a worker-result checkpoint.
CREATE OR REPLACE FUNCTION public.resume_numo_turn_from_worker(
  p_run_id uuid,p_event_id uuid,p_type text,p_payload jsonb DEFAULT '{}'::jsonb
) RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_turn public.numo_assistant_turns%ROWTYPE;
BEGIN
  IF p_type NOT IN ('worker_completed','worker_failed','worker_input') THEN
    RAISE EXCEPTION 'invalid_worker_event' USING ERRCODE='22023';
  END IF;
  SELECT * INTO v_turn FROM public.numo_assistant_turns
    WHERE active_run_id=p_run_id AND status='waiting_work'
    ORDER BY created_at DESC,id DESC LIMIT 1 FOR UPDATE;
  IF v_turn.id IS NULL THEN
    IF EXISTS(SELECT 1 FROM public.numo_turn_events WHERE id=p_event_id) THEN
      RETURN 'duplicate'; END IF;
    RETURN 'ignored';
  END IF;
  PERFORM public.append_numo_turn_event(v_turn.id,p_event_id,p_type,p_payload);
  UPDATE public.numo_assistant_turns SET status='queued',claim_token=NULL,
    claimed_at=NULL,not_before=now(),
    checkpoint=jsonb_build_object('phase','worker_result','worker_event',
      jsonb_build_object('type',p_type,'payload',COALESCE(p_payload,'{}'::jsonb))),
    updated_at=now() WHERE id=v_turn.id AND status='waiting_work';
  RETURN 'queued';
END;
$$;
COMMIT;
