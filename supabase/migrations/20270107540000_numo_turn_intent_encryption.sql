-- MIN-591: protect admission-time context retained by durable Numo turns.
BEGIN;
ALTER TABLE public.numo_assistant_turns
  ADD COLUMN intent_encryption_checked_at timestamptz;
CREATE INDEX numo_turn_intent_queue ON public.numo_assistant_turns
  (intent_encryption_checked_at NULLS FIRST,id);

CREATE TABLE public.numo_turn_intent_scope (
  id boolean PRIMARY KEY DEFAULT true CHECK(id),
  activated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.numo_turn_intent_scope ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.numo_turn_intent_scope FROM PUBLIC,anon,authenticated;
GRANT ALL ON public.numo_turn_intent_scope TO service_role;

CREATE FUNCTION public.guard_numo_turn_intent()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE active boolean; new_version integer; old_version integer;
BEGIN
  -- Serialize the first protected write with obsolete clear writers.
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('numo-turn-intent-activation', 591));
  IF TG_OP='UPDATE' AND (NEW.id IS DISTINCT FROM OLD.id OR
      NEW.user_id IS DISTINCT FROM OLD.user_id OR
      NEW.conversation_id IS DISTINCT FROM OLD.conversation_id OR
      NEW.request_id IS DISTINCT FROM OLD.request_id) THEN
    RAISE EXCEPTION 'numo_turn_intent_binding_immutable' USING ERRCODE='23514';
  END IF;
  active := EXISTS (SELECT 1 FROM public.numo_turn_intent_scope)
    OR NEW.intent ? 'encrypted_intent';
  IF NEW.intent ? 'encrypted_intent' THEN
    IF NEW.intent - ARRAY['encrypted_intent','encryption_version',
          'user_id','conversation_id','request_id']::text[] <> '{}'::jsonb OR
        (SELECT count(*) FROM pg_catalog.jsonb_object_keys(NEW.intent)) <> 5 OR
        NEW.intent->>'user_id' IS DISTINCT FROM NEW.user_id::text OR
        NEW.intent->>'conversation_id' IS DISTINCT FROM NEW.conversation_id::text OR
        NEW.intent->>'request_id' IS DISTINCT FROM NEW.request_id::text OR
        COALESCE((NEW.intent->>'encryption_version')::integer > 0,false) IS FALSE OR
        COALESCE(((NEW.intent->>'encrypted_intent')::jsonb
          ->>'format')::integer = 3,false) IS FALSE OR
        (NEW.intent->>'encryption_version')::integer IS DISTINCT FROM
          ((NEW.intent->>'encrypted_intent')::jsonb
          ->>'keyVersion')::integer THEN
      RAISE EXCEPTION 'numo_turn_intent_ciphertext_invalid' USING ERRCODE='23514';
    END IF;
    new_version := (NEW.intent->>'encryption_version')::integer;
    IF TG_OP='UPDATE' AND OLD.intent ? 'encrypted_intent' THEN
      old_version := (OLD.intent->>'encryption_version')::integer;
      IF new_version < old_version THEN
        RAISE EXCEPTION 'numo_turn_intent_key_rollback' USING ERRCODE='23514';
      END IF;
    END IF;
    INSERT INTO public.numo_turn_intent_scope(id)
      VALUES(true) ON CONFLICT DO NOTHING;
  ELSIF active AND (TG_OP='INSERT' OR
      NEW.intent IS DISTINCT FROM OLD.intent OR
      NEW.intent_encryption_checked_at IS DISTINCT FROM
        OLD.intent_encryption_checked_at) THEN
    RAISE EXCEPTION 'numo_turn_intent_requires_encryption' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER numo_turn_intent_guard BEFORE INSERT OR UPDATE
  ON public.numo_assistant_turns FOR EACH ROW
  EXECUTE FUNCTION public.guard_numo_turn_intent();
REVOKE ALL ON FUNCTION public.guard_numo_turn_intent()
  FROM PUBLIC,anon,authenticated;

CREATE FUNCTION public.migrate_numo_turn_intent(
  p_id uuid,p_old jsonb,p_new jsonb
) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE observed public.numo_assistant_turns;
BEGIN
  SELECT * INTO observed FROM public.numo_assistant_turns
    WHERE id=p_id FOR UPDATE;
  IF NOT FOUND OR observed.intent IS DISTINCT FROM p_old THEN
    RETURN false;
  END IF;
  UPDATE public.numo_assistant_turns SET intent=p_new,
    intent_encryption_checked_at=clock_timestamp() WHERE id=p_id;
  RETURN true;
END;
$$;
REVOKE ALL ON FUNCTION public.migrate_numo_turn_intent(uuid,jsonb,jsonb)
  FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.migrate_numo_turn_intent(uuid,jsonb,jsonb)
  TO service_role;
COMMIT;
