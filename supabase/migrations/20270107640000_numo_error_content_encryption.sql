-- Encrypt Numo error copies under their own row identities.
BEGIN;
ALTER TABLE public.conversations ADD COLUMN error_encryption_checked_at timestamptz;
ALTER TABLE public.numo_assistant_turns ADD COLUMN error_encryption_checked_at timestamptz;
ALTER TABLE public.numo_routine_occurrences ADD COLUMN error_encryption_checked_at timestamptz;
CREATE INDEX conversations_error_encryption_queue ON public.conversations
  (error_encryption_checked_at NULLS FIRST,id);
CREATE INDEX numo_turn_error_encryption_queue ON public.numo_assistant_turns
  (error_encryption_checked_at NULLS FIRST,id);
CREATE INDEX numo_occurrence_error_encryption_queue ON public.numo_routine_occurrences
  (error_encryption_checked_at NULLS FIRST,id);

CREATE TABLE public.numo_error_encryption_scope (
  id boolean PRIMARY KEY DEFAULT true CHECK(id),
  activated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.numo_error_encryption_scope ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.numo_error_encryption_scope FROM PUBLIC,anon,authenticated;
GRANT ALL ON public.numo_error_encryption_scope TO service_role;

-- These two SQL recovery paths emit fixed operational text. Their statuses
-- still identify the condition, while the dynamic error copy is protected.
DO $$
DECLARE name text; definition text; original text;
BEGIN
  FOR name IN SELECT unnest(ARRAY['claim_numo_tool_operation',
      'recover_stale_numo_turns']) LOOP
    SELECT pg_catalog.pg_get_functiondef(p.oid) INTO definition
      FROM pg_catalog.pg_proc p JOIN pg_catalog.pg_namespace n
        ON n.oid=p.pronamespace
      WHERE n.nspname='public' AND p.proname=name AND p.prokind='f';
    IF definition IS NULL THEN RAISE EXCEPTION 'missing_numo_recovery_function'; END IF;
    original := definition;
    definition := replace(definition,
      'error_message = ''A tool may have completed before its result was recorded. Review the external state before retrying.''',
      'error_message = NULL');
    definition := replace(definition,
      'THEN ''The Numo process stopped before the turn reached its next durable boundary. Retry after reconnecting.''',
      'THEN NULL');
    IF definition=original THEN RAISE EXCEPTION 'unrecognized_numo_recovery_function: %',name; END IF;
    EXECUTE definition;
  END LOOP;
END $$;

CREATE FUNCTION public.guard_numo_error_message()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE active boolean; old_version integer; new_version integer;
BEGIN
  IF TG_OP='UPDATE' AND NEW.id IS DISTINCT FROM OLD.id THEN
    RAISE EXCEPTION 'numo_error_binding_immutable' USING ERRCODE='23514';
  END IF;
  IF TG_OP='UPDATE' THEN
    IF TG_TABLE_NAME='conversations' THEN
      IF NEW.user_id IS DISTINCT FROM OLD.user_id THEN
        RAISE EXCEPTION 'numo_error_binding_immutable' USING ERRCODE='23514';
      END IF;
    ELSIF TG_TABLE_NAME='numo_assistant_turns' THEN
      IF NEW.user_id IS DISTINCT FROM OLD.user_id OR
          NEW.conversation_id IS DISTINCT FROM OLD.conversation_id THEN
        RAISE EXCEPTION 'numo_error_binding_immutable' USING ERRCODE='23514';
      END IF;
    ELSIF TG_TABLE_NAME='numo_routine_occurrences' THEN
      IF NEW.routine_id IS DISTINCT FROM OLD.routine_id OR
          NEW.conversation_id IS DISTINCT FROM OLD.conversation_id THEN
        RAISE EXCEPTION 'numo_error_binding_immutable' USING ERRCODE='23514';
      END IF;
    END IF;
  END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('numo-error-encryption-activation',591));
  active := EXISTS(SELECT 1 FROM public.numo_error_encryption_scope);
  IF TG_TABLE_NAME='numo_routine_occurrences' THEN
    IF NEW.error_code IS NOT NULL AND
        NEW.error_code NOT IN ('numo_unavailable','usage_budget_exceeded') AND
        (active OR NEW.error_message LIKE 'mdye3:%') AND
        (TG_OP='INSERT' OR NEW.error_code IS DISTINCT FROM OLD.error_code OR
         NEW.error_encryption_checked_at IS DISTINCT FROM OLD.error_encryption_checked_at) THEN
      RAISE EXCEPTION 'numo_error_code_invalid' USING ERRCODE='23514';
    END IF;
  END IF;
  IF NEW.error_message IS NOT NULL AND NEW.error_message LIKE 'mdye3:%' THEN
    IF NEW.error_message !~ '^mdye3:[1-9][0-9]*:[A-Za-z0-9_-]+$' THEN
      RAISE EXCEPTION 'numo_error_ciphertext_invalid' USING ERRCODE='23514';
    END IF;
    new_version := split_part(NEW.error_message,':',2)::integer;
    IF TG_OP='UPDATE' AND OLD.error_message LIKE 'mdye3:%' THEN
      old_version := split_part(OLD.error_message,':',2)::integer;
      IF new_version < old_version THEN
        RAISE EXCEPTION 'numo_error_key_rollback' USING ERRCODE='23514';
      END IF;
    END IF;
    INSERT INTO public.numo_error_encryption_scope(id) VALUES(true)
      ON CONFLICT DO NOTHING;
  ELSIF NEW.error_message IS NOT NULL AND active AND
      (TG_OP='INSERT' OR NEW.error_message IS DISTINCT FROM OLD.error_message OR
       NEW.error_encryption_checked_at IS DISTINCT FROM OLD.error_encryption_checked_at) THEN
    RAISE EXCEPTION 'numo_error_requires_encryption' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER conversations_error_guard BEFORE INSERT OR UPDATE
  ON public.conversations FOR EACH ROW EXECUTE FUNCTION public.guard_numo_error_message();
CREATE TRIGGER numo_turn_error_guard BEFORE INSERT OR UPDATE
  ON public.numo_assistant_turns FOR EACH ROW EXECUTE FUNCTION public.guard_numo_error_message();
CREATE TRIGGER numo_occurrence_error_guard BEFORE INSERT OR UPDATE
  ON public.numo_routine_occurrences FOR EACH ROW EXECUTE FUNCTION public.guard_numo_error_message();
REVOKE ALL ON FUNCTION public.guard_numo_error_message() FROM PUBLIC,anon,authenticated;

DROP FUNCTION public.checkpoint_numo_turn(uuid,uuid,text,jsonb,uuid,text,text,numeric);
CREATE FUNCTION public.checkpoint_numo_turn(
  p_turn_id uuid,p_claim_token uuid,p_status text,
  p_checkpoint jsonb DEFAULT '{}'::jsonb,p_active_run_id uuid DEFAULT NULL,
  p_error_message text DEFAULT NULL,p_outcome text DEFAULT NULL,
  p_cost_usd numeric DEFAULT NULL,p_conversation_error_message text DEFAULT NULL
) RETURNS SETOF public.numo_assistant_turns
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_turn public.numo_assistant_turns%ROWTYPE;
BEGIN
  IF p_status NOT IN ('running','waiting_work','waiting_input','stopped',
      'retryable','reconciling','completed','failed') THEN
    RAISE EXCEPTION 'invalid_turn_status' USING ERRCODE='22023';
  END IF;
  IF p_status IN ('failed','retryable','reconciling') AND
      (p_error_message IS NULL) IS DISTINCT FROM
        (p_conversation_error_message IS NULL) THEN
    RAISE EXCEPTION 'numo_error_copy_mismatch' USING ERRCODE='22023';
  END IF;
  UPDATE public.numo_assistant_turns SET status=p_status,
    checkpoint=COALESCE(p_checkpoint,'{}'::jsonb),active_run_id=p_active_run_id,
    error_message=p_error_message,outcome=COALESCE(p_outcome,outcome),
    cost_usd=COALESCE(p_cost_usd,cost_usd),
    claim_token=CASE WHEN p_status='running' THEN claim_token END,
    claimed_at=CASE WHEN p_status='running' THEN now() END,
    completed_at=CASE WHEN p_status IN ('completed','failed','stopped') THEN now() ELSE NULL END,
    updated_at=now()
    WHERE id=p_turn_id AND claim_token=p_claim_token AND
      (status='running' OR (status='stopping' AND p_status='stopped'))
    RETURNING * INTO v_turn;
  IF v_turn.id IS NULL THEN RETURN; END IF;
  UPDATE public.conversations SET status=CASE
      WHEN p_status IN ('failed','retryable','reconciling') THEN 'error'
      WHEN p_status IN ('completed','waiting_input','stopped') THEN 'idle'
      ELSE 'generating' END,
    error_message=CASE WHEN p_status IN ('failed','retryable','reconciling')
      THEN p_conversation_error_message ELSE NULL END,updated_at=now()
    WHERE id=v_turn.conversation_id;
  RETURN NEXT v_turn;
END;
$$;
REVOKE ALL ON FUNCTION public.checkpoint_numo_turn(uuid,uuid,text,jsonb,uuid,text,text,numeric,text)
  FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.checkpoint_numo_turn(uuid,uuid,text,jsonb,uuid,text,text,numeric,text)
  TO service_role;

CREATE FUNCTION public.fail_numo_routine_occurrence(
  p_id uuid,p_old_turn_id uuid,p_code text,p_occurrence_error text,
  p_conversation_error text
) RETURNS public.numo_routine_occurrences
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE row public.numo_routine_occurrences%ROWTYPE;
BEGIN
  IF p_code IS NULL OR p_occurrence_error IS NULL OR
      p_conversation_error IS NULL OR
      p_code NOT IN ('numo_unavailable','usage_budget_exceeded') THEN
    RAISE EXCEPTION 'invalid_numo_occurrence_failure' USING ERRCODE='22023';
  END IF;
  SELECT * INTO row FROM public.numo_routine_occurrences
    WHERE id=p_id AND turn_id IS NOT DISTINCT FROM p_old_turn_id FOR UPDATE;
  IF row.id IS NULL OR row.turn_id IS NOT NULL THEN RETURN NULL; END IF;
  IF NOT EXISTS(SELECT 1 FROM public.agent_routines routine
      JOIN public.conversations conversation
        ON conversation.id=row.conversation_id
      WHERE routine.id=row.routine_id AND
        routine.owner_id=conversation.user_id) THEN
    RAISE EXCEPTION 'numo_occurrence_owner_mismatch' USING ERRCODE='42501';
  END IF;
  UPDATE public.conversations SET status='error',
    error_message=p_conversation_error,updated_at=now()
    WHERE id=row.conversation_id;
  UPDATE public.numo_routine_occurrences SET error_code=p_code,
    error_message=p_occurrence_error,updated_at=now()
    WHERE id=p_id RETURNING * INTO row;
  RETURN row;
END;
$$;
REVOKE ALL ON FUNCTION public.fail_numo_routine_occurrence(uuid,uuid,text,text,text)
  FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.fail_numo_routine_occurrence(uuid,uuid,text,text,text)
  TO service_role;

CREATE FUNCTION public.migrate_numo_error_bundle(
  p_conversation_id uuid,p_turn_id uuid,p_occurrence_id uuid,
  p_old_conversation text,p_new_conversation text,
  p_old_turn text,p_new_turn text,p_old_occurrence text,p_new_occurrence text,
  p_old_occurrence_code text
) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE c public.conversations%ROWTYPE; t public.numo_assistant_turns%ROWTYPE;
  o public.numo_routine_occurrences%ROWTYPE;
BEGIN
  IF p_conversation_id IS NULL THEN RETURN false; END IF;
  SELECT * INTO c FROM public.conversations WHERE id=p_conversation_id FOR UPDATE;
  IF c.id IS NULL OR c.error_message IS DISTINCT FROM p_old_conversation THEN
    RETURN false;
  END IF;
  IF p_turn_id IS NOT NULL THEN
    SELECT * INTO t FROM public.numo_assistant_turns WHERE id=p_turn_id FOR UPDATE;
    IF t.id IS NULL OR t.conversation_id<>p_conversation_id OR
        t.error_message IS DISTINCT FROM p_old_turn OR t.user_id<>c.user_id THEN
      RETURN false;
    END IF;
  END IF;
  IF p_occurrence_id IS NOT NULL THEN
    SELECT * INTO o FROM public.numo_routine_occurrences
      WHERE id=p_occurrence_id FOR UPDATE;
    IF o.id IS NULL OR o.conversation_id<>p_conversation_id OR
        o.error_message IS DISTINCT FROM p_old_occurrence OR
        o.error_code IS DISTINCT FROM p_old_occurrence_code OR
        NOT EXISTS(SELECT 1 FROM public.agent_routines routine
          WHERE routine.id=o.routine_id AND routine.owner_id=c.user_id)
      THEN RETURN false; END IF;
  END IF;
  UPDATE public.conversations SET error_message=p_new_conversation,
    error_encryption_checked_at=clock_timestamp() WHERE id=p_conversation_id;
  IF p_turn_id IS NOT NULL THEN
    UPDATE public.numo_assistant_turns SET error_message=p_new_turn,
      error_encryption_checked_at=clock_timestamp() WHERE id=p_turn_id;
  END IF;
  IF p_occurrence_id IS NOT NULL THEN
    UPDATE public.numo_routine_occurrences SET error_message=p_new_occurrence,
      error_code=CASE WHEN error_code='usage_budget_exceeded'
        THEN error_code WHEN error_code IS NOT NULL THEN 'numo_unavailable' END,
      error_encryption_checked_at=clock_timestamp() WHERE id=p_occurrence_id;
  END IF;
  RETURN true;
END;
$$;
REVOKE ALL ON FUNCTION public.migrate_numo_error_bundle(uuid,uuid,uuid,text,text,text,text,text,text,text)
  FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.migrate_numo_error_bundle(uuid,uuid,uuid,text,text,text,text,text,text,text)
  TO service_role;
COMMIT;
