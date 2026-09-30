BEGIN;

ALTER TABLE public.numo_turn_events
  ADD COLUMN payload_user_encryption_checked_at timestamptz;
CREATE INDEX numo_activity_payload_queue ON public.numo_turn_events
  (payload_user_encryption_checked_at NULLS FIRST,id)
  WHERE type NOT IN ('worker_completed','worker_failed','worker_input');

CREATE TABLE public.numo_event_content_scope (
  id boolean PRIMARY KEY DEFAULT true CHECK(id),
  activated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.numo_event_content_scope ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.numo_event_content_scope FROM PUBLIC,anon,authenticated;
GRANT ALL ON public.numo_event_content_scope TO service_role;

CREATE FUNCTION public.guard_numo_activity_payload()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE owner_id uuid; active boolean; new_version integer; old_version integer;
BEGIN
  IF TG_OP='UPDATE' AND (NEW.id IS DISTINCT FROM OLD.id OR
      NEW.turn_id IS DISTINCT FROM OLD.turn_id OR
      NEW.type IS DISTINCT FROM OLD.type) THEN
    RAISE EXCEPTION 'numo_activity_binding_immutable' USING ERRCODE='23514';
  END IF;
  IF NEW.type IN ('worker_completed','worker_failed','worker_input') THEN
    RETURN NEW;
  END IF;
  active := EXISTS (SELECT 1 FROM public.numo_event_content_scope)
    OR NEW.payload ? 'encrypted_turn_payload';
  IF NEW.payload ? 'encrypted_turn_payload' THEN
    SELECT user_id INTO owner_id FROM public.numo_assistant_turns
      WHERE id=NEW.turn_id;
    IF owner_id IS NULL OR
        NEW.payload - ARRAY['encrypted_turn_payload','encryption_version',
          'user_id','turn_id','event_id']::text[] <> '{}'::jsonb OR
        (SELECT count(*) FROM pg_catalog.jsonb_object_keys(NEW.payload)) <> 5 OR
        NEW.payload->>'user_id' IS DISTINCT FROM owner_id::text OR
        NEW.payload->>'turn_id' IS DISTINCT FROM NEW.turn_id::text OR
        NEW.payload->>'event_id' IS DISTINCT FROM NEW.id::text OR
        COALESCE((NEW.payload->>'encryption_version')::integer > 0,false) IS FALSE OR
        COALESCE(((NEW.payload->>'encrypted_turn_payload')::jsonb
          ->>'format')::integer = 3,false) IS FALSE OR
        (NEW.payload->>'encryption_version')::integer IS DISTINCT FROM
          ((NEW.payload->>'encrypted_turn_payload')::jsonb
          ->>'keyVersion')::integer THEN
      RAISE EXCEPTION 'numo_activity_ciphertext_invalid' USING ERRCODE='23514';
    END IF;
    new_version := (NEW.payload->>'encryption_version')::integer;
    IF TG_OP='UPDATE' AND OLD.payload ? 'encrypted_turn_payload' THEN
      old_version := (OLD.payload->>'encryption_version')::integer;
      IF new_version < old_version THEN
        RAISE EXCEPTION 'numo_activity_key_rollback' USING ERRCODE='23514';
      END IF;
    END IF;
    INSERT INTO public.numo_event_content_scope(id)
      VALUES(true) ON CONFLICT DO NOTHING;
  ELSIF active AND (TG_OP='INSERT' OR
      NEW.payload IS DISTINCT FROM OLD.payload OR
      NEW.payload_user_encryption_checked_at IS DISTINCT FROM
        OLD.payload_user_encryption_checked_at) THEN
    RAISE EXCEPTION 'numo_activity_requires_encryption' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER numo_activity_payload_guard
  BEFORE INSERT OR UPDATE ON public.numo_turn_events
  FOR EACH ROW EXECUTE FUNCTION public.guard_numo_activity_payload();
REVOKE ALL ON FUNCTION public.guard_numo_activity_payload()
  FROM PUBLIC,anon,authenticated;

-- Lock the parent before its event, matching the idempotent append RPC.
CREATE FUNCTION public.migrate_numo_activity_payload(
  p_id uuid,p_old jsonb,p_new jsonb
) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE observed public.numo_turn_events; parent public.numo_assistant_turns;
BEGIN
  SELECT * INTO observed FROM public.numo_turn_events WHERE id=p_id;
  IF NOT FOUND OR observed.type IN
      ('worker_completed','worker_failed','worker_input') THEN RETURN false; END IF;
  SELECT * INTO parent FROM public.numo_assistant_turns
    WHERE id=observed.turn_id FOR UPDATE;
  SELECT * INTO observed FROM public.numo_turn_events WHERE id=p_id FOR UPDATE;
  IF NOT FOUND OR observed.payload IS DISTINCT FROM p_old THEN RETURN false; END IF;
  UPDATE public.numo_turn_events SET payload=p_new,
    payload_user_encryption_checked_at=clock_timestamp() WHERE id=p_id;
  RETURN true;
END;
$$;
REVOKE ALL ON FUNCTION public.migrate_numo_activity_payload(uuid,jsonb,jsonb)
  FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.migrate_numo_activity_payload(uuid,jsonb,jsonb)
  TO service_role;

COMMIT;
