-- MIN-591: protect final assistant messages and their durable turn outcome copies.
BEGIN;
ALTER TABLE public.assistant_messages
  ADD COLUMN final_payload_version integer NOT NULL DEFAULT 0,
  ADD COLUMN final_payload_checked_at timestamptz,
  ADD CONSTRAINT assistant_final_payload_version_nonnegative
    CHECK(final_payload_version >= 0);
CREATE INDEX assistant_final_payload_queue ON public.assistant_messages
  (final_payload_checked_at NULLS FIRST,id)
  WHERE role='assistant' AND tool_calls IS NULL;
ALTER TABLE public.numo_assistant_turns
  ADD COLUMN outcome_encryption_checked_at timestamptz;
CREATE INDEX numo_turn_outcome_queue ON public.numo_assistant_turns
  (outcome_encryption_checked_at NULLS FIRST,id);

CREATE TABLE public.numo_final_content_scope (
  id boolean PRIMARY KEY DEFAULT true CHECK(id),
  activated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.numo_final_content_scope ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.numo_final_content_scope FROM PUBLIC,anon,authenticated;
GRANT ALL ON public.numo_final_content_scope TO service_role;

CREATE FUNCTION public.guard_numo_final_message()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE payload jsonb; active boolean;
BEGIN
  IF TG_OP='UPDATE' AND (NEW.id IS DISTINCT FROM OLD.id OR
      NEW.conversation_id IS DISTINCT FROM OLD.conversation_id OR
      NEW.role IS DISTINCT FROM OLD.role OR NEW.turn_id IS DISTINCT FROM OLD.turn_id) THEN
    RAISE EXCEPTION 'numo_final_message_binding_immutable' USING ERRCODE='23514';
  END IF;
  IF NEW.role <> 'assistant' OR NEW.tool_calls IS NOT NULL THEN
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
CREATE TRIGGER numo_final_message_guard BEFORE INSERT OR UPDATE
  ON public.assistant_messages FOR EACH ROW
  EXECUTE FUNCTION public.guard_numo_final_message();
REVOKE ALL ON FUNCTION public.guard_numo_final_message()
  FROM PUBLIC,anon,authenticated;

CREATE FUNCTION public.guard_numo_turn_outcome()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE active boolean; old_version integer; new_version integer;
BEGIN
  IF TG_OP='UPDATE' AND (NEW.id IS DISTINCT FROM OLD.id OR
      NEW.user_id IS DISTINCT FROM OLD.user_id OR
      NEW.conversation_id IS DISTINCT FROM OLD.conversation_id) THEN
    RAISE EXCEPTION 'numo_turn_outcome_binding_immutable' USING ERRCODE='23514';
  END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('numo-final-content-activation',591));
  active := EXISTS(SELECT 1 FROM public.numo_final_content_scope);
  IF NEW.outcome IS NOT NULL AND NEW.outcome LIKE 'mdyf3:%' THEN
    IF NEW.outcome !~ '^mdyf3:[1-9][0-9]*:[A-Za-z0-9_-]+$' THEN
      RAISE EXCEPTION 'numo_turn_outcome_ciphertext_invalid' USING ERRCODE='23514';
    END IF;
    new_version := split_part(NEW.outcome,':',2)::integer;
    IF TG_OP='UPDATE' AND OLD.outcome LIKE 'mdyf3:%' THEN
      old_version := split_part(OLD.outcome,':',2)::integer;
      IF new_version < old_version THEN
        RAISE EXCEPTION 'numo_turn_outcome_key_rollback' USING ERRCODE='23514';
      END IF;
    END IF;
    INSERT INTO public.numo_final_content_scope(id) VALUES(true) ON CONFLICT DO NOTHING;
  ELSIF NEW.outcome IS NOT NULL AND active AND (TG_OP='INSERT' OR
      NEW.outcome IS DISTINCT FROM OLD.outcome OR
      NEW.outcome_encryption_checked_at IS DISTINCT FROM
        OLD.outcome_encryption_checked_at) THEN
    RAISE EXCEPTION 'numo_turn_outcome_requires_encryption' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER numo_turn_outcome_guard BEFORE INSERT OR UPDATE
  ON public.numo_assistant_turns FOR EACH ROW
  EXECUTE FUNCTION public.guard_numo_turn_outcome();
REVOKE ALL ON FUNCTION public.guard_numo_turn_outcome()
  FROM PUBLIC,anon,authenticated;

CREATE FUNCTION public.migrate_numo_final_content(
  p_turn_id uuid,p_message_id uuid,p_old_message jsonb,p_new_message jsonb,
  p_old_outcome text,p_new_outcome text
) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE turn_row public.numo_assistant_turns; message_row public.assistant_messages;
BEGIN
  IF p_turn_id IS NULL AND p_message_id IS NULL THEN RETURN false; END IF;
  IF p_turn_id IS NOT NULL THEN
    SELECT * INTO turn_row FROM public.numo_assistant_turns
      WHERE id=p_turn_id FOR UPDATE;
    IF NOT FOUND OR turn_row.outcome IS DISTINCT FROM p_old_outcome THEN RETURN false; END IF;
  END IF;
  IF p_message_id IS NOT NULL THEN
    SELECT * INTO message_row FROM public.assistant_messages
      WHERE id=p_message_id FOR UPDATE;
    IF NOT FOUND OR message_row.role <> 'assistant' OR
        message_row.tool_calls IS NOT NULL OR
        message_row.turn_id IS DISTINCT FROM p_turn_id OR
        pg_catalog.jsonb_build_object(
          'content',message_row.content,'context',message_row.context,
          'metadata',message_row.metadata,'tool_call_id',message_row.tool_call_id,
          'tool_name',message_row.tool_name,
          'version',message_row.final_payload_version) IS DISTINCT FROM p_old_message THEN
      RETURN false;
    END IF;
    UPDATE public.assistant_messages SET content=p_new_message->>'content',
      context=NULL,metadata='{}'::jsonb,tool_call_id=NULL,tool_name=NULL,
      final_payload_version=(p_new_message->>'version')::integer,
      final_payload_checked_at=clock_timestamp()
      WHERE id=p_message_id;
  END IF;
  IF p_turn_id IS NOT NULL THEN
    UPDATE public.numo_assistant_turns SET outcome=p_new_outcome,
      outcome_encryption_checked_at=clock_timestamp() WHERE id=p_turn_id;
  END IF;
  RETURN true;
END;
$$;
REVOKE ALL ON FUNCTION public.migrate_numo_final_content(uuid,uuid,jsonb,jsonb,text,text)
  FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.migrate_numo_final_content(uuid,uuid,jsonb,jsonb,text,text)
  TO service_role;
COMMIT;
