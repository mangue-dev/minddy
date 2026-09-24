BEGIN;

ALTER TABLE public.agent_runs
  ADD COLUMN delegation_result_ciphertext text,
  ADD COLUMN delegation_result_encryption_version integer NOT NULL DEFAULT 0,
  ADD COLUMN delegation_result_encryption_checked_at timestamptz,
  ADD CONSTRAINT agent_run_delegation_result_encryption_state CHECK (
    (delegation_result_encryption_version = 0 AND delegation_result_ciphertext IS NULL)
    OR (delegation_result_encryption_version > 0 AND delegation_result IS NULL
      AND delegation_result_ciphertext IS NOT NULL
      AND COALESCE((delegation_result_ciphertext::jsonb ->> 'format')::integer = 3, false)
      AND COALESCE((delegation_result_ciphertext::jsonb ->> 'keyVersion')::integer =
        delegation_result_encryption_version, false))
  ) NOT VALID;
CREATE INDEX agent_run_delegation_result_encryption_queue
  ON public.agent_runs (delegation_result_encryption_checked_at NULLS FIRST, id)
  WHERE delegation_result IS NOT NULL OR delegation_result_ciphertext IS NOT NULL;

CREATE TABLE public.agent_result_encryption_scopes (
  project_id uuid PRIMARY KEY REFERENCES public.projects(id) ON DELETE CASCADE,
  activated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.agent_result_encryption_scopes ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.agent_result_encryption_scopes FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.agent_result_encryption_scopes TO service_role;

ALTER TABLE public.numo_turn_events
  ADD COLUMN payload_encryption_checked_at timestamptz;
CREATE INDEX numo_turn_events_payload_encryption_queue
  ON public.numo_turn_events (payload_encryption_checked_at NULLS FIRST, id)
  WHERE type IN ('worker_completed','worker_failed','worker_input');
ALTER TABLE public.numo_assistant_turns
  ADD COLUMN worker_checkpoint_encryption_checked_at timestamptz;
CREATE INDEX numo_worker_checkpoint_encryption_queue
  ON public.numo_assistant_turns (worker_checkpoint_encryption_checked_at NULLS FIRST, id)
  WHERE checkpoint ? 'worker_event';

CREATE FUNCTION public.guard_agent_delegation_result()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(NEW.project_id::text, 59130));
  IF TG_OP = 'UPDATE' AND OLD.awaiting_input AND NOT NEW.awaiting_input AND
      NEW.status IN ('queued','running') AND NEW.delegation_result IS NULL THEN
    NEW.delegation_result_ciphertext := NULL;
    NEW.delegation_result_encryption_version := 0;
  END IF;
  IF TG_OP = 'UPDATE' AND (NEW.project_id, NEW.id) IS DISTINCT FROM
      (OLD.project_id, OLD.id) AND
      (OLD.delegation_result_encryption_version > 0 OR
       NEW.delegation_result_encryption_version > 0 OR EXISTS (
         SELECT 1 FROM public.agent_result_encryption_scopes s
         WHERE s.project_id IN (OLD.project_id, NEW.project_id))) THEN
    RAISE EXCEPTION 'agent_result_scope_is_immutable' USING ERRCODE = '23514';
  END IF;
  IF TG_OP = 'UPDATE' AND OLD.delegation_result_encryption_version >
      NEW.delegation_result_encryption_version AND NOT (
        OLD.awaiting_input AND NOT NEW.awaiting_input AND
        NEW.status IN ('queued','running') AND NEW.delegation_result IS NULL) THEN
    RAISE EXCEPTION 'agent_result_encryption_downgrade' USING ERRCODE = '23514';
  END IF;
  IF NEW.delegation_result_encryption_version > 0 THEN
    INSERT INTO public.agent_result_encryption_scopes(project_id)
      VALUES(NEW.project_id) ON CONFLICT DO NOTHING;
  ELSIF NEW.delegation_result IS NOT NULL AND
      (EXISTS (SELECT 1 FROM public.agent_result_encryption_scopes s
        WHERE s.project_id = NEW.project_id) OR
       EXISTS (SELECT 1 FROM public.agent_work_branch_encryption_scopes s
        WHERE s.project_id = NEW.project_id)) AND
      (TG_OP = 'INSERT' OR NEW.delegation_result IS DISTINCT FROM OLD.delegation_result) THEN
    RAISE EXCEPTION 'agent_result_requires_encryption' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER agent_delegation_result_guard
  BEFORE INSERT OR UPDATE ON public.agent_runs
  FOR EACH ROW EXECUTE FUNCTION public.guard_agent_delegation_result();
REVOKE ALL ON FUNCTION public.guard_agent_delegation_result() FROM PUBLIC, anon, authenticated;

CREATE FUNCTION public.migrate_agent_delegation_result(
  p_id uuid, p_project_id uuid, p_old_result jsonb,
  p_old_cipher text, p_old_version integer,
  p_cipher text DEFAULT NULL, p_version integer DEFAULT NULL
) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE run_row public.agent_runs;
BEGIN
  SELECT * INTO run_row FROM public.agent_runs
  WHERE id = p_id AND project_id = p_project_id FOR UPDATE;
  IF NOT FOUND OR run_row.delegation_result IS DISTINCT FROM p_old_result OR
      run_row.delegation_result_ciphertext IS DISTINCT FROM p_old_cipher OR
      run_row.delegation_result_encryption_version IS DISTINCT FROM p_old_version THEN
    RETURN false;
  END IF;
  IF p_cipher IS NULL AND p_version IS NULL THEN
    UPDATE public.agent_runs SET delegation_result_encryption_checked_at = clock_timestamp()
      WHERE id = p_id;
    RETURN true;
  END IF;
  IF p_cipher IS NULL OR p_version IS NULL OR p_version < 1 THEN
    RAISE EXCEPTION 'agent_result_migration_invalid' USING ERRCODE = '22023';
  END IF;
  UPDATE public.agent_runs SET delegation_result = NULL,
    delegation_result_ciphertext = p_cipher,
    delegation_result_encryption_version = p_version,
    delegation_result_encryption_checked_at = clock_timestamp() WHERE id = p_id;
  RETURN true;
END;
$$;
REVOKE ALL ON FUNCTION public.migrate_agent_delegation_result(
  uuid,uuid,jsonb,text,integer,text,integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.migrate_agent_delegation_result(
  uuid,uuid,jsonb,text,integer,text,integer) TO service_role;

-- Both the durable event and its turn checkpoint carry the same encrypted
-- worker payload. Routing IDs remain clear for authorization and idempotence.
CREATE FUNCTION public.guard_numo_worker_event_payload()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE project uuid; v_run_id uuid; v_conversation_id uuid;
BEGIN
  IF NEW.type NOT IN ('worker_completed','worker_failed','worker_input') THEN RETURN NEW; END IF;
  SELECT t.active_run_id,t.conversation_id INTO v_run_id,v_conversation_id
    FROM public.numo_assistant_turns t
    WHERE t.id = NEW.turn_id FOR SHARE;
  IF NEW.payload->>'run_id' IS NULL OR
      (v_run_id IS NOT NULL AND NEW.payload->>'run_id' IS DISTINCT FROM v_run_id::text) THEN
    RAISE EXCEPTION 'numo_worker_event_run_mismatch' USING ERRCODE = '23514';
  END IF;
  SELECT r.project_id INTO project FROM public.agent_runs r
    WHERE r.id = (NEW.payload->>'run_id')::uuid;
  IF project IS NULL THEN
    SELECT c.project_id INTO project FROM public.conversations c
      WHERE c.id = v_conversation_id;
  END IF;
  IF project IS NULL THEN
    RAISE EXCEPTION 'numo_worker_event_run_missing' USING ERRCODE = '23503';
  END IF;
  IF (EXISTS (SELECT 1 FROM public.agent_result_encryption_scopes s
        WHERE s.project_id = project) OR
      EXISTS (SELECT 1 FROM public.agent_work_branch_encryption_scopes s
        WHERE s.project_id = project)) AND
      (NEW.payload->>'encrypted_worker_payload' IS NULL OR
       NEW.payload->>'event_id' IS DISTINCT FROM NEW.id::text OR
       NEW.payload->>'project_id' IS DISTINCT FROM project::text OR
       NEW.payload - ARRAY['encrypted_worker_payload','encryption_version',
         'project_id','event_id','run_id']::text[] <> '{}'::jsonb OR
       COALESCE((NEW.payload->>'encryption_version')::integer > 0,false) IS FALSE OR
       COALESCE(((NEW.payload->>'encrypted_worker_payload')::jsonb->>'format')::integer = 3,false) IS FALSE OR
       (NEW.payload->>'encryption_version')::integer IS DISTINCT FROM
         ((NEW.payload->>'encrypted_worker_payload')::jsonb->>'keyVersion')::integer) THEN
    RAISE EXCEPTION 'numo_worker_payload_requires_encryption' USING ERRCODE = '23514';
  END IF;
  IF TG_OP = 'UPDATE' AND OLD.payload ? 'encrypted_worker_payload' AND
      NEW.payload IS DISTINCT FROM OLD.payload AND
      current_setting('minddy.encryption_maintenance', true) IS DISTINCT FROM 'on' THEN
    RAISE EXCEPTION 'numo_worker_payload_is_immutable' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER numo_worker_event_payload_guard
  BEFORE INSERT OR UPDATE ON public.numo_turn_events
  FOR EACH ROW EXECUTE FUNCTION public.guard_numo_worker_event_payload();
REVOKE ALL ON FUNCTION public.guard_numo_worker_event_payload()
  FROM PUBLIC, anon, authenticated;

CREATE FUNCTION public.guard_numo_worker_checkpoint()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE project uuid; payload jsonb;
BEGIN
  IF NOT (NEW.checkpoint ? 'worker_event') THEN RETURN NEW; END IF;
  SELECT r.project_id INTO project FROM public.agent_runs r
    WHERE r.id = NEW.active_run_id;
  IF project IS NULL THEN
    SELECT c.project_id INTO project FROM public.conversations c
      WHERE c.id = NEW.conversation_id;
  END IF;
  IF project IS NULL THEN
    RAISE EXCEPTION 'numo_worker_checkpoint_run_missing' USING ERRCODE = '23503';
  END IF;
  payload := NEW.checkpoint #> '{worker_event,payload}';
  IF payload IS NOT NULL AND payload <> '{}'::jsonb AND
      (EXISTS (SELECT 1 FROM public.agent_result_encryption_scopes s
        WHERE s.project_id = project) OR
      EXISTS (SELECT 1 FROM public.agent_work_branch_encryption_scopes s
        WHERE s.project_id = project)) AND
      (payload->>'encrypted_worker_payload' IS NULL OR
       payload - ARRAY['encrypted_worker_payload','encryption_version',
         'project_id','event_id','run_id']::text[] <> '{}'::jsonb OR
       COALESCE((payload->>'encryption_version')::integer > 0,false) IS FALSE OR
       COALESCE(((payload->>'encrypted_worker_payload')::jsonb->>'format')::integer = 3,false) IS FALSE OR
       (payload->>'encryption_version')::integer IS DISTINCT FROM
         ((payload->>'encrypted_worker_payload')::jsonb->>'keyVersion')::integer) THEN
    RAISE EXCEPTION 'numo_worker_checkpoint_requires_encryption' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER numo_worker_checkpoint_guard
  BEFORE INSERT OR UPDATE OF checkpoint ON public.numo_assistant_turns
  FOR EACH ROW EXECUTE FUNCTION public.guard_numo_worker_checkpoint();
REVOKE ALL ON FUNCTION public.guard_numo_worker_checkpoint()
  FROM PUBLIC, anon, authenticated;

-- A turn lock precedes its event lock, matching the live event append order.
CREATE FUNCTION public.migrate_numo_worker_event(
  p_id uuid, p_old_payload jsonb, p_new_payload jsonb DEFAULT NULL
) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE event_row public.numo_turn_events; turn_row public.numo_assistant_turns;
BEGIN
  SELECT * INTO event_row FROM public.numo_turn_events WHERE id = p_id;
  IF NOT FOUND OR event_row.type NOT IN
      ('worker_completed','worker_failed','worker_input') THEN RETURN false; END IF;
  SELECT * INTO turn_row FROM public.numo_assistant_turns
    WHERE id = event_row.turn_id FOR UPDATE;
  SELECT * INTO event_row FROM public.numo_turn_events WHERE id = p_id FOR UPDATE;
  IF NOT FOUND OR event_row.payload IS DISTINCT FROM p_old_payload THEN RETURN false; END IF;
  IF p_new_payload IS NOT NULL THEN
    IF p_new_payload->>'event_id' IS DISTINCT FROM p_id::text OR
        p_new_payload->>'run_id' IS DISTINCT FROM
          COALESCE(p_old_payload->>'run_id',turn_row.active_run_id::text) THEN
      RAISE EXCEPTION 'numo_worker_event_migration_binding' USING ERRCODE = '22023';
    END IF;
    PERFORM set_config('minddy.encryption_maintenance','on',true);
    UPDATE public.numo_turn_events SET payload = p_new_payload,
      payload_encryption_checked_at = clock_timestamp() WHERE id = p_id;
    IF turn_row.checkpoint #> '{worker_event,payload}' = p_old_payload AND
        turn_row.checkpoint #>> '{worker_event,type}' = event_row.type THEN
      UPDATE public.numo_assistant_turns SET checkpoint = jsonb_set(
        checkpoint, '{worker_event,payload}', p_new_payload),
        worker_checkpoint_encryption_checked_at = clock_timestamp()
        WHERE id = turn_row.id;
    END IF;
  ELSE
    UPDATE public.numo_turn_events SET payload_encryption_checked_at = clock_timestamp()
      WHERE id = p_id;
  END IF;
  RETURN true;
END;
$$;
REVOKE ALL ON FUNCTION public.migrate_numo_worker_event(uuid,jsonb,jsonb)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.migrate_numo_worker_event(uuid,jsonb,jsonb)
  TO service_role;

CREATE FUNCTION public.migrate_numo_worker_checkpoint(
  p_id uuid, p_old_checkpoint jsonb, p_new_checkpoint jsonb DEFAULT NULL
) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE turn_row public.numo_assistant_turns;
BEGIN
  SELECT * INTO turn_row FROM public.numo_assistant_turns WHERE id = p_id FOR UPDATE;
  IF NOT FOUND OR turn_row.checkpoint IS DISTINCT FROM p_old_checkpoint THEN
    RETURN false;
  END IF;
  IF p_new_checkpoint IS NOT NULL THEN
    IF p_new_checkpoint #>> '{worker_event,payload,run_id}' IS DISTINCT FROM
        COALESCE(turn_row.active_run_id::text,
          p_old_checkpoint #>> '{worker_event,payload,run_id}') THEN
      RAISE EXCEPTION 'numo_worker_checkpoint_migration_binding' USING ERRCODE = '22023';
    END IF;
    UPDATE public.numo_assistant_turns SET checkpoint = p_new_checkpoint,
      worker_checkpoint_encryption_checked_at = clock_timestamp()
      WHERE id = p_id;
  ELSE
    UPDATE public.numo_assistant_turns
      SET worker_checkpoint_encryption_checked_at = clock_timestamp() WHERE id = p_id;
  END IF;
  RETURN true;
END;
$$;
REVOKE ALL ON FUNCTION public.migrate_numo_worker_checkpoint(uuid,jsonb,jsonb)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.migrate_numo_worker_checkpoint(uuid,jsonb,jsonb)
  TO service_role;

COMMIT;
