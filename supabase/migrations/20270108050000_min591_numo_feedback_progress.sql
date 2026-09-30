BEGIN;

-- Failed candidates move behind later rows without claiming verification.
ALTER TABLE public.numo_turn_events
  ADD COLUMN payload_encryption_attempted_at timestamptz,
  ADD COLUMN payload_revision uuid NOT NULL DEFAULT gen_random_uuid();
ALTER TABLE public.numo_assistant_turns
  ADD COLUMN worker_checkpoint_encryption_attempted_at timestamptz,
  ADD COLUMN worker_checkpoint_revision uuid NOT NULL DEFAULT gen_random_uuid();
CREATE INDEX numo_worker_event_attempt_queue ON public.numo_turn_events
  (payload_encryption_attempted_at NULLS FIRST,id)
  WHERE type IN ('worker_completed','worker_failed','worker_input');
CREATE INDEX numo_worker_checkpoint_attempt_queue ON public.numo_assistant_turns
  (worker_checkpoint_encryption_attempted_at NULLS FIRST,id)
  WHERE checkpoint ? 'worker_event';

-- Pre-parent worker rows need a separately reviewed, payload-bound identity.
CREATE TABLE public.numo_worker_legacy_bindings (
  kind text NOT NULL CHECK (kind IN ('event','checkpoint')),
  target_id uuid NOT NULL,
  run_id uuid NOT NULL REFERENCES public.agent_runs(id) ON DELETE CASCADE,
  turn_id uuid NOT NULL REFERENCES public.numo_assistant_turns(id) ON DELETE CASCADE,
  conversation_id uuid NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  source_revision uuid NOT NULL,
  checkpoint_revision uuid,
  review_reference text NOT NULL CHECK (
    review_reference ~ '^[A-Za-z0-9._:/#-]{1,100}$'),
  reviewed_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (kind,target_id,source_revision)
);
CREATE UNIQUE INDEX numo_worker_legacy_event_binding_unique
  ON public.numo_worker_legacy_bindings(target_id) WHERE kind='event';
REVOKE ALL ON public.numo_worker_legacy_bindings FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION public.guard_numo_worker_legacy_binding()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  RAISE EXCEPTION 'numo_worker_legacy_binding_immutable' USING ERRCODE = '23514';
END;
$$;
CREATE TRIGGER numo_worker_legacy_binding_immutable
  BEFORE UPDATE ON public.numo_worker_legacy_bindings
  FOR EACH ROW EXECUTE FUNCTION public.guard_numo_worker_legacy_binding();
REVOKE ALL ON FUNCTION public.guard_numo_worker_legacy_binding()
  FROM PUBLIC,anon,authenticated;

CREATE FUNCTION public.cleanup_numo_worker_legacy_event_binding()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  DELETE FROM public.numo_worker_legacy_bindings
    WHERE kind='event' AND target_id=OLD.id;
  RETURN OLD;
END;
$$;
CREATE TRIGGER numo_worker_legacy_event_binding_cleanup
  AFTER DELETE ON public.numo_turn_events
  FOR EACH ROW EXECUTE FUNCTION public.cleanup_numo_worker_legacy_event_binding();
REVOKE ALL ON FUNCTION public.cleanup_numo_worker_legacy_event_binding()
  FROM PUBLIC,anon,authenticated;

CREATE FUNCTION public.guard_numo_worker_bound_run_identity()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF (NEW.project_id,NEW.parent_numo_turn_id,NEW.parent_numo_conversation_id)
      IS DISTINCT FROM
      (OLD.project_id,OLD.parent_numo_turn_id,OLD.parent_numo_conversation_id) THEN
    IF current_setting('transaction_isolation') <> 'read committed' THEN
      RAISE EXCEPTION 'numo_worker_bound_run_requires_read_committed'
        USING ERRCODE = '23514';
    END IF;
    IF EXISTS (SELECT 1 FROM public.numo_worker_legacy_bindings
        WHERE run_id=OLD.id) THEN
      RAISE EXCEPTION 'numo_worker_bound_run_immutable' USING ERRCODE = '23514';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER numo_worker_bound_run_identity_guard
  BEFORE UPDATE OF project_id,parent_numo_turn_id,parent_numo_conversation_id
  ON public.agent_runs FOR EACH ROW
  EXECUTE FUNCTION public.guard_numo_worker_bound_run_identity();
REVOKE ALL ON FUNCTION public.guard_numo_worker_bound_run_identity()
  FROM PUBLIC,anon,authenticated;

-- An operator must independently review the event/run identity before calling this RPC.
CREATE FUNCTION public.register_numo_worker_legacy_binding(
  p_kind text,p_id uuid,p_run_id uuid,p_review_reference text
) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_event public.numo_turn_events; v_turn public.numo_assistant_turns;
  v_run public.agent_runs; v_payload jsonb; v_project uuid; v_revision uuid;
BEGIN
  IF p_kind NOT IN ('event','checkpoint') OR
      p_review_reference !~ '^[A-Za-z0-9._:/#-]{1,100}$' THEN
    RAISE EXCEPTION 'Invalid reviewed Numo binding' USING ERRCODE = '22023';
  END IF;
  IF p_kind = 'event' THEN
    -- Match migration and live append lock order: turn before event.
    SELECT * INTO v_event FROM public.numo_turn_events WHERE id=p_id;
    IF NOT FOUND OR v_event.type NOT IN
        ('worker_completed','worker_failed','worker_input') THEN RETURN false; END IF;
    SELECT * INTO v_turn FROM public.numo_assistant_turns
      WHERE id=v_event.turn_id FOR UPDATE;
    SELECT * INTO v_event FROM public.numo_turn_events WHERE id=p_id FOR UPDATE;
    IF NOT FOUND OR v_event.turn_id IS DISTINCT FROM v_turn.id OR
        v_event.type NOT IN ('worker_completed','worker_failed','worker_input') THEN
      RETURN false;
    END IF;
    v_payload:=v_event.payload;
    v_revision:=v_event.payload_revision;
  ELSE
    SELECT * INTO v_turn FROM public.numo_assistant_turns WHERE id=p_id FOR UPDATE;
    IF NOT FOUND THEN RETURN false; END IF;
    v_payload:=v_turn.checkpoint #> '{worker_event,payload}';
    v_revision:=v_turn.worker_checkpoint_revision;
  END IF;
  SELECT * INTO v_run FROM public.agent_runs WHERE id=p_run_id FOR SHARE;
  SELECT project_id INTO v_project FROM public.conversations
    WHERE id=v_turn.conversation_id;
  IF v_run.id IS NULL OR v_project IS NULL OR
      v_run.project_id IS DISTINCT FROM v_project OR
      (v_run.parent_numo_turn_id IS NOT NULL AND
       v_run.parent_numo_turn_id IS DISTINCT FROM v_turn.id) OR
      (v_run.parent_numo_conversation_id IS NOT NULL AND
       v_run.parent_numo_conversation_id IS DISTINCT FROM v_turn.conversation_id) OR
      jsonb_typeof(v_payload) IS DISTINCT FROM 'object' OR
      v_payload = '{}'::jsonb OR v_payload ? 'encrypted_worker_payload' OR
      (v_payload ? 'run_id' AND v_payload->>'run_id' IS DISTINCT FROM p_run_id::text) THEN
    RAISE EXCEPTION 'numo_worker_legacy_binding_scope_mismatch' USING ERRCODE = '23514';
  END IF;
  INSERT INTO public.numo_worker_legacy_bindings
    (kind,target_id,run_id,turn_id,conversation_id,project_id,
     source_revision,checkpoint_revision,review_reference)
    VALUES(p_kind,p_id,p_run_id,v_turn.id,v_turn.conversation_id,v_project,
      v_revision,CASE WHEN p_kind='event' AND
        v_turn.checkpoint #> '{worker_event,payload}'=v_payload
        THEN v_turn.worker_checkpoint_revision ELSE NULL END,p_review_reference)
    ON CONFLICT DO NOTHING;
  RETURN FOUND;
END;
$$;
REVOKE ALL ON FUNCTION public.register_numo_worker_legacy_binding(text,uuid,uuid,text)
  FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.register_numo_worker_legacy_binding(text,uuid,uuid,text)
  TO service_role;

CREATE FUNCTION public.lookup_numo_worker_legacy_binding(p_kind text,p_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_payload jsonb; v_binding public.numo_worker_legacy_bindings;
  v_revision uuid;
BEGIN
  IF p_kind='event' THEN
    SELECT payload,payload_revision INTO v_payload,v_revision
      FROM public.numo_turn_events WHERE id=p_id;
  ELSIF p_kind='checkpoint' THEN
    SELECT checkpoint #> '{worker_event,payload}',worker_checkpoint_revision
      INTO v_payload,v_revision
      FROM public.numo_assistant_turns WHERE id=p_id;
  ELSE RETURN NULL; END IF;
  IF jsonb_typeof(v_payload) IS DISTINCT FROM 'object' THEN RETURN NULL; END IF;
  SELECT * INTO v_binding FROM public.numo_worker_legacy_bindings
    WHERE kind=p_kind AND target_id=p_id AND source_revision=v_revision AND
      (v_payload->>'run_id' IS NULL OR v_payload->>'run_id'=run_id::text)
    ORDER BY reviewed_at DESC LIMIT 1;
  IF NOT FOUND THEN RETURN NULL; END IF;
  RETURN jsonb_build_object('run_id',v_binding.run_id,'turn_id',v_binding.turn_id,
    'conversation_id',v_binding.conversation_id,'project_id',v_binding.project_id);
END;
$$;
REVOKE ALL ON FUNCTION public.lookup_numo_worker_legacy_binding(text,uuid)
  FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.lookup_numo_worker_legacy_binding(text,uuid)
  TO service_role;

CREATE OR REPLACE FUNCTION public.guard_numo_worker_event_payload()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_run public.agent_runs; v_turn public.numo_assistant_turns;
  v_project uuid; v_run_id uuid; v_maintenance boolean;
  v_binding public.numo_worker_legacy_bindings;
BEGIN
  IF NEW.type NOT IN ('worker_completed','worker_failed','worker_input') THEN RETURN NEW; END IF;
  IF TG_OP = 'UPDATE' AND
      (NEW.id,NEW.turn_id,NEW.type,NEW.seq,NEW.created_at,NEW.payload_revision)
        IS DISTINCT FROM
      (OLD.id,OLD.turn_id,OLD.type,OLD.seq,OLD.created_at,OLD.payload_revision) THEN
    RAISE EXCEPTION 'numo_worker_event_binding_immutable' USING ERRCODE = '23514';
  END IF;
  IF TG_OP = 'UPDATE' AND NEW.payload IS DISTINCT FROM OLD.payload AND
      current_setting('minddy.encryption_maintenance', true) IS DISTINCT FROM 'on' AND
      EXISTS (SELECT 1 FROM public.numo_worker_legacy_bindings
        WHERE kind='event' AND target_id=NEW.id) THEN
    RAISE EXCEPTION 'numo_worker_reviewed_event_immutable' USING ERRCODE = '23514';
  END IF;
  IF TG_OP = 'UPDATE' AND NEW.payload IS NOT DISTINCT FROM OLD.payload AND
      to_jsonb(NEW) - ARRAY['payload_encryption_attempted_at',
        'payload_encryption_checked_at']::text[] IS NOT DISTINCT FROM
      to_jsonb(OLD) - ARRAY['payload_encryption_attempted_at',
        'payload_encryption_checked_at']::text[] THEN
    RETURN NEW;
  END IF;
  SELECT * INTO v_turn FROM public.numo_assistant_turns
    WHERE id = NEW.turn_id FOR SHARE;
  IF NOT FOUND OR NEW.payload->>'run_id' IS NULL OR
      NEW.payload->>'run_id' !~* '^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$' THEN
    RAISE EXCEPTION 'numo_worker_event_run_missing' USING ERRCODE = '23503';
  END IF;
  v_run_id := (NEW.payload->>'run_id')::uuid;
  SELECT * INTO v_run FROM public.agent_runs WHERE id = v_run_id FOR SHARE;
  SELECT c.project_id INTO v_project FROM public.conversations c
    WHERE c.id = v_turn.conversation_id;
  IF v_run.id IS NULL OR v_project IS NULL OR
      v_run.project_id IS DISTINCT FROM v_project THEN
    RAISE EXCEPTION 'numo_worker_event_run_scope_mismatch' USING ERRCODE = '23514';
  END IF;
  v_maintenance := TG_OP = 'UPDATE' AND
    current_setting('minddy.encryption_maintenance', true) = 'on';
  IF v_maintenance AND OLD.payload->>'run_id' IS NULL THEN
    SELECT * INTO v_binding FROM public.numo_worker_legacy_bindings
      WHERE kind='event' AND target_id=NEW.id AND
        source_revision=OLD.payload_revision;
    IF NOT FOUND OR v_binding.run_id IS DISTINCT FROM v_run_id OR
        v_binding.turn_id IS DISTINCT FROM v_turn.id OR
        v_binding.conversation_id IS DISTINCT FROM v_turn.conversation_id OR
        v_binding.project_id IS DISTINCT FROM v_project THEN
      RAISE EXCEPTION 'numo_worker_event_legacy_binding_missing'
        USING ERRCODE = '23514';
    END IF;
  END IF;
  IF v_run.parent_numo_turn_id IS DISTINCT FROM v_turn.id OR
      v_run.parent_numo_conversation_id IS DISTINCT FROM v_turn.conversation_id THEN
    IF TG_OP = 'INSERT' OR NOT v_maintenance OR
        v_run.parent_numo_turn_id IS NOT NULL OR
        v_run.parent_numo_conversation_id IS NOT NULL THEN
      RAISE EXCEPTION 'numo_worker_event_run_scope_mismatch' USING ERRCODE = '23514';
    END IF;
    SELECT * INTO v_binding FROM public.numo_worker_legacy_bindings
      WHERE kind='event' AND target_id=NEW.id AND
        source_revision=OLD.payload_revision;
    IF NOT FOUND OR v_binding.run_id IS DISTINCT FROM v_run_id OR
        v_binding.turn_id IS DISTINCT FROM v_turn.id OR
        v_binding.conversation_id IS DISTINCT FROM v_turn.conversation_id OR
        v_binding.project_id IS DISTINCT FROM v_project THEN
      RAISE EXCEPTION 'numo_worker_event_legacy_binding_missing'
        USING ERRCODE = '23514';
    END IF;
  END IF;
  IF TG_OP = 'INSERT' OR (NEW.payload IS DISTINCT FROM OLD.payload AND NOT v_maintenance) THEN
    IF v_turn.active_run_id IS DISTINCT FROM v_run_id THEN
      RAISE EXCEPTION 'numo_worker_event_run_mismatch' USING ERRCODE = '23514';
    END IF;
  ELSIF TG_OP = 'UPDATE' AND
      NEW.payload->>'run_id' IS DISTINCT FROM OLD.payload->>'run_id' AND
      NOT (v_maintenance AND OLD.payload->>'run_id' IS NULL AND
        v_binding.run_id = v_run_id) THEN
    RAISE EXCEPTION 'numo_worker_event_run_mismatch' USING ERRCODE = '23514';
  END IF;
  IF (TG_OP = 'INSERT' OR NEW.payload IS DISTINCT FROM OLD.payload) AND
      (EXISTS (SELECT 1 FROM public.agent_result_encryption_scopes s
        WHERE s.project_id = v_project) OR
      EXISTS (SELECT 1 FROM public.agent_work_branch_encryption_scopes s
        WHERE s.project_id = v_project)) AND
      (NEW.payload->>'encrypted_worker_payload' IS NULL OR
       NEW.payload->>'event_id' IS DISTINCT FROM NEW.id::text OR
       NEW.payload->>'project_id' IS DISTINCT FROM v_project::text OR
       NEW.payload - ARRAY['encrypted_worker_payload','encryption_version',
         'project_id','event_id','run_id']::text[] <> '{}'::jsonb OR
       COALESCE((NEW.payload->>'encryption_version')::integer > 0,false) IS FALSE OR
       COALESCE(((NEW.payload->>'encrypted_worker_payload')::jsonb->>'format')::integer = 3,false) IS FALSE OR
       (NEW.payload->>'encryption_version')::integer IS DISTINCT FROM
         ((NEW.payload->>'encrypted_worker_payload')::jsonb->>'keyVersion')::integer) THEN
    RAISE EXCEPTION 'numo_worker_payload_requires_encryption' USING ERRCODE = '23514';
  END IF;
  IF TG_OP = 'UPDATE' AND OLD.payload ? 'encrypted_worker_payload' AND
      NEW.payload IS DISTINCT FROM OLD.payload AND NOT v_maintenance THEN
    RAISE EXCEPTION 'numo_worker_payload_is_immutable' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.guard_numo_worker_checkpoint()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE project uuid; payload jsonb; v_run_id uuid; run_row public.agent_runs;
  v_binding public.numo_worker_legacy_bindings; v_event public.numo_turn_events;
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF NEW.worker_checkpoint_revision IS DISTINCT FROM
        OLD.worker_checkpoint_revision THEN
      RAISE EXCEPTION 'numo_worker_checkpoint_revision_immutable'
        USING ERRCODE = '23514';
    END IF;
    IF NEW.checkpoint->'worker_event' IS DISTINCT FROM
        OLD.checkpoint->'worker_event' AND
        current_setting('minddy.encryption_maintenance', true) IS DISTINCT FROM 'on' THEN
      NEW.worker_checkpoint_revision:=gen_random_uuid();
    END IF;
  END IF;
  IF NOT (NEW.checkpoint ? 'worker_event') THEN RETURN NEW; END IF;
  SELECT c.project_id INTO project FROM public.conversations c
    WHERE c.id = NEW.conversation_id;
  IF project IS NULL THEN
    RAISE EXCEPTION 'numo_worker_checkpoint_run_missing' USING ERRCODE = '23503';
  END IF;
  payload := NEW.checkpoint #> '{worker_event,payload}';
  IF payload IS NULL OR payload = '{}'::jsonb THEN RETURN NEW; END IF;
  IF payload ? 'encrypted_worker_payload' THEN
    IF payload->>'run_id' IS NULL OR
        payload->>'run_id' !~* '^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$' OR
        payload->>'project_id' IS DISTINCT FROM project::text OR
        (TG_OP = 'UPDATE' AND
         OLD.checkpoint #>> '{worker_event,payload,run_id}' IS NOT NULL AND
         payload->>'run_id' IS DISTINCT FROM
           OLD.checkpoint #>> '{worker_event,payload,run_id}') THEN
      RAISE EXCEPTION 'numo_worker_checkpoint_binding_mismatch' USING ERRCODE = '23514';
    END IF;
    v_run_id := (payload->>'run_id')::uuid;
    SELECT * INTO run_row FROM public.agent_runs r WHERE r.id = v_run_id FOR SHARE;
    IF run_row.id IS NULL OR run_row.project_id IS DISTINCT FROM project THEN
      RAISE EXCEPTION 'numo_worker_checkpoint_run_scope_mismatch'
        USING ERRCODE = '23514';
    END IF;
    IF TG_OP = 'UPDATE' AND
        OLD.checkpoint #> '{worker_event,payload}' IS NOT NULL AND
        OLD.checkpoint #>> '{worker_event,payload,run_id}' IS NULL THEN
      SELECT * INTO v_binding FROM public.numo_worker_legacy_bindings
        WHERE kind='checkpoint' AND target_id=NEW.id AND run_id=v_run_id AND
          source_revision=OLD.worker_checkpoint_revision
        ORDER BY reviewed_at DESC LIMIT 1;
      IF NOT FOUND AND payload->>'event_id' ~*
          '^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$' THEN
        SELECT * INTO v_event FROM public.numo_turn_events
          WHERE id=(NEW.checkpoint #>> '{worker_event,payload,event_id}')::uuid;
        IF v_event.turn_id=NEW.id AND
            v_event.type=NEW.checkpoint #>> '{worker_event,type}' THEN
          SELECT * INTO v_binding FROM public.numo_worker_legacy_bindings
            WHERE kind='event' AND target_id=v_event.id AND
              source_revision=v_event.payload_revision AND
              checkpoint_revision=OLD.worker_checkpoint_revision;
        END IF;
      END IF;
      IF v_binding.run_id IS DISTINCT FROM v_run_id OR
          v_binding.turn_id IS DISTINCT FROM NEW.id OR
          v_binding.conversation_id IS DISTINCT FROM NEW.conversation_id OR
          v_binding.project_id IS DISTINCT FROM project THEN
        RAISE EXCEPTION 'numo_worker_checkpoint_legacy_binding_missing'
          USING ERRCODE = '23514';
      END IF;
    ELSIF (TG_OP = 'INSERT' OR
        OLD.checkpoint #> '{worker_event,payload}' IS NULL) AND
        NEW.active_run_id IS DISTINCT FROM v_run_id THEN
      RAISE EXCEPTION 'numo_worker_checkpoint_run_mismatch'
        USING ERRCODE = '23514';
    END IF;
    IF run_row.parent_numo_turn_id IS DISTINCT FROM NEW.id OR
        run_row.parent_numo_conversation_id IS DISTINCT FROM NEW.conversation_id THEN
      IF TG_OP <> 'UPDATE' OR
          current_setting('minddy.encryption_maintenance', true) IS DISTINCT FROM 'on' OR
          run_row.parent_numo_turn_id IS NOT NULL OR
          run_row.parent_numo_conversation_id IS NOT NULL THEN
        RAISE EXCEPTION 'numo_worker_checkpoint_run_scope_mismatch'
          USING ERRCODE = '23514';
      END IF;
      SELECT * INTO v_binding FROM public.numo_worker_legacy_bindings
        WHERE kind='checkpoint' AND target_id=NEW.id AND run_id=v_run_id AND
          source_revision=OLD.worker_checkpoint_revision
        ORDER BY reviewed_at DESC LIMIT 1;
      IF NOT FOUND AND payload->>'event_id' ~*
          '^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$' THEN
        SELECT * INTO v_event FROM public.numo_turn_events
          WHERE id=(NEW.checkpoint #>> '{worker_event,payload,event_id}')::uuid;
        IF v_event.turn_id=NEW.id AND
            v_event.type=NEW.checkpoint #>> '{worker_event,type}' THEN
          SELECT * INTO v_binding FROM public.numo_worker_legacy_bindings
            WHERE kind='event' AND target_id=v_event.id AND
              source_revision=v_event.payload_revision AND
              checkpoint_revision=OLD.worker_checkpoint_revision;
        END IF;
      END IF;
      IF v_binding.run_id IS DISTINCT FROM v_run_id OR
          v_binding.turn_id IS DISTINCT FROM NEW.id OR
          v_binding.conversation_id IS DISTINCT FROM NEW.conversation_id OR
          v_binding.project_id IS DISTINCT FROM project THEN
        RAISE EXCEPTION 'numo_worker_checkpoint_legacy_binding_missing'
          USING ERRCODE = '23514';
      END IF;
    END IF;
  END IF;
  IF (payload ? 'encrypted_worker_payload' OR
      EXISTS (SELECT 1 FROM public.agent_result_encryption_scopes s
        WHERE s.project_id = project) OR
      EXISTS (SELECT 1 FROM public.agent_work_branch_encryption_scopes s
        WHERE s.project_id = project)) AND
      (payload->>'encrypted_worker_payload' IS NULL OR
       payload->>'project_id' IS DISTINCT FROM project::text OR
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
DROP TRIGGER numo_worker_checkpoint_guard ON public.numo_assistant_turns;
CREATE TRIGGER numo_worker_checkpoint_guard
  BEFORE INSERT OR UPDATE OF checkpoint,worker_checkpoint_revision
  ON public.numo_assistant_turns FOR EACH ROW
  EXECUTE FUNCTION public.guard_numo_worker_checkpoint();

CREATE OR REPLACE FUNCTION public.numo_worker_payload_verified(
  p_payload jsonb,p_kind text,p_id uuid
) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_event public.numo_turn_events; v_turn public.numo_assistant_turns;
  v_run public.agent_runs; v_binding public.numo_worker_legacy_bindings;
  v_project uuid; v_run_id uuid; v_cipher jsonb; v_version integer;
BEGIN
  IF jsonb_typeof(p_payload) IS DISTINCT FROM 'object' OR
      NOT (p_payload ?& ARRAY['encrypted_worker_payload','encryption_version',
        'project_id','event_id','run_id']) OR
      p_payload - ARRAY['encrypted_worker_payload','encryption_version',
        'project_id','event_id','run_id']::text[] <> '{}'::jsonb OR
      jsonb_typeof(p_payload->'encrypted_worker_payload') IS DISTINCT FROM 'string' OR
      p_payload->>'run_id' IS NULL OR p_payload->>'run_id' !~*
        '^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$' OR
      p_payload->>'event_id' IS NULL OR p_payload->>'event_id' !~*
        '^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$' THEN
    RETURN false;
  END IF;
  v_cipher:=(p_payload->>'encrypted_worker_payload')::jsonb;
  v_version:=(p_payload->>'encryption_version')::integer;
  IF jsonb_typeof(v_cipher) IS DISTINCT FROM 'object' OR
      v_version IS NULL OR v_version < 1 OR
      (v_cipher->>'format')::integer IS DISTINCT FROM 3 OR
      (v_cipher->>'keyVersion')::integer IS DISTINCT FROM v_version THEN
    RETURN false;
  END IF;
  IF p_kind='event' THEN
    SELECT * INTO v_event FROM public.numo_turn_events WHERE id=p_id;
    IF NOT FOUND OR p_payload->>'event_id' IS DISTINCT FROM p_id::text THEN
      RETURN false;
    END IF;
    SELECT * INTO v_turn FROM public.numo_assistant_turns WHERE id=v_event.turn_id;
  ELSIF p_kind='checkpoint' THEN
    SELECT * INTO v_turn FROM public.numo_assistant_turns WHERE id=p_id;
    SELECT * INTO v_event FROM public.numo_turn_events
      WHERE id=(p_payload->>'event_id')::uuid;
    IF FOUND AND v_event.turn_id IS DISTINCT FROM p_id THEN RETURN false; END IF;
  ELSE RETURN false;
  END IF;
  IF v_turn.id IS NULL THEN RETURN false; END IF;
  SELECT project_id INTO v_project FROM public.conversations
    WHERE id=v_turn.conversation_id;
  v_run_id:=(p_payload->>'run_id')::uuid;
  SELECT * INTO v_run FROM public.agent_runs WHERE id=v_run_id;
  IF v_project IS NULL OR v_run.id IS NULL OR
      v_run.project_id IS DISTINCT FROM v_project OR
      p_payload->>'project_id' IS DISTINCT FROM v_project::text THEN
    RETURN false;
  END IF;
  IF v_run.parent_numo_turn_id IS DISTINCT FROM v_turn.id OR
      v_run.parent_numo_conversation_id IS DISTINCT FROM v_turn.conversation_id THEN
    IF v_run.parent_numo_turn_id IS NOT NULL OR
        v_run.parent_numo_conversation_id IS NOT NULL THEN RETURN false; END IF;
    SELECT * INTO v_binding FROM public.numo_worker_legacy_bindings
      WHERE kind=p_kind AND target_id=p_id AND run_id=v_run_id AND
        source_revision=CASE WHEN p_kind='event' THEN v_event.payload_revision
          ELSE v_turn.worker_checkpoint_revision END
      ORDER BY reviewed_at DESC LIMIT 1;
    IF NOT FOUND AND p_kind='checkpoint' AND v_event.id IS NOT NULL THEN
      SELECT * INTO v_binding FROM public.numo_worker_legacy_bindings
        WHERE kind='event' AND target_id=v_event.id AND run_id=v_run_id AND
          source_revision=v_event.payload_revision AND
          checkpoint_revision=v_turn.worker_checkpoint_revision;
    END IF;
    IF v_binding.run_id IS DISTINCT FROM v_run_id OR
        v_binding.turn_id IS DISTINCT FROM v_turn.id OR
        v_binding.conversation_id IS DISTINCT FROM v_turn.conversation_id OR
        v_binding.project_id IS DISTINCT FROM v_project THEN RETURN false; END IF;
  END IF;
  RETURN true;
EXCEPTION WHEN OTHERS THEN RETURN false;
END;
$$;
REVOKE ALL ON FUNCTION public.numo_worker_payload_verified(jsonb,text,uuid)
  FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION public.migrate_numo_worker_event(
  p_id uuid, p_old_payload jsonb, p_new_payload jsonb DEFAULT NULL
) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE event_row public.numo_turn_events; turn_row public.numo_assistant_turns;
  prior text := current_setting('minddy.encryption_maintenance', true);
BEGIN
  SELECT * INTO event_row FROM public.numo_turn_events WHERE id = p_id;
  IF NOT FOUND OR event_row.type NOT IN
      ('worker_completed','worker_failed','worker_input') THEN RETURN false; END IF;
  SELECT * INTO turn_row FROM public.numo_assistant_turns
    WHERE id = event_row.turn_id FOR UPDATE;
  SELECT * INTO event_row FROM public.numo_turn_events WHERE id = p_id FOR UPDATE;
  IF NOT FOUND OR event_row.payload IS DISTINCT FROM p_old_payload THEN RETURN false; END IF;
  IF p_new_payload IS NULL AND event_row.payload_encryption_checked_at IS NULL THEN
    RAISE EXCEPTION 'numo_worker_event_requires_verified_conversion'
      USING ERRCODE = '23514';
  END IF;
  IF NOT public.numo_worker_payload_verified(
      COALESCE(p_new_payload,p_old_payload),'event',p_id) THEN
    RAISE EXCEPTION 'numo_worker_event_unverified_payload' USING ERRCODE = '23514';
  END IF;
  PERFORM set_config('minddy.encryption_maintenance','on',true);
  IF p_new_payload IS NOT NULL THEN
    IF p_new_payload->>'event_id' IS DISTINCT FROM p_id::text OR
        (p_old_payload->>'run_id' IS NOT NULL AND
         p_new_payload->>'run_id' IS DISTINCT FROM p_old_payload->>'run_id') THEN
      RAISE EXCEPTION 'numo_worker_event_migration_binding' USING ERRCODE = '22023';
    END IF;
    UPDATE public.numo_turn_events SET payload = p_new_payload,
      payload_encryption_checked_at = clock_timestamp(),
      payload_encryption_attempted_at = clock_timestamp() WHERE id = p_id;
    IF turn_row.checkpoint #> '{worker_event,payload}' = p_old_payload AND
        turn_row.checkpoint #>> '{worker_event,type}' = event_row.type THEN
      UPDATE public.numo_assistant_turns SET checkpoint = jsonb_set(
        checkpoint, '{worker_event,payload}', p_new_payload),
        worker_checkpoint_encryption_checked_at = clock_timestamp(),
        worker_checkpoint_encryption_attempted_at = clock_timestamp()
        WHERE id = turn_row.id;
    END IF;
  ELSE
    UPDATE public.numo_turn_events SET payload_encryption_checked_at = clock_timestamp(),
      payload_encryption_attempted_at = clock_timestamp() WHERE id = p_id;
  END IF;
  PERFORM set_config('minddy.encryption_maintenance',COALESCE(prior,''),true);
  RETURN true;
END;
$$;

CREATE OR REPLACE FUNCTION public.migrate_numo_worker_checkpoint(
  p_id uuid, p_old_checkpoint jsonb, p_new_checkpoint jsonb DEFAULT NULL
) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE turn_row public.numo_assistant_turns;
  prior text := current_setting('minddy.encryption_maintenance', true);
BEGIN
  SELECT * INTO turn_row FROM public.numo_assistant_turns WHERE id = p_id FOR UPDATE;
  IF NOT FOUND OR turn_row.checkpoint IS DISTINCT FROM p_old_checkpoint THEN
    RETURN false;
  END IF;
  IF p_new_checkpoint IS NULL AND
      turn_row.worker_checkpoint_encryption_checked_at IS NULL THEN
    RAISE EXCEPTION 'numo_worker_checkpoint_requires_verified_conversion'
      USING ERRCODE = '23514';
  END IF;
  IF NOT public.numo_worker_payload_verified(
      COALESCE(p_new_checkpoint,p_old_checkpoint) #> '{worker_event,payload}',
      'checkpoint',p_id) THEN
    RAISE EXCEPTION 'numo_worker_checkpoint_unverified_payload'
      USING ERRCODE = '23514';
  END IF;
  PERFORM set_config('minddy.encryption_maintenance','on',true);
  IF p_new_checkpoint IS NOT NULL THEN
    IF (p_new_checkpoint #- '{worker_event,payload}') IS DISTINCT FROM
        (p_old_checkpoint #- '{worker_event,payload}') OR
        (p_old_checkpoint #>> '{worker_event,payload,run_id}' IS NOT NULL AND
         p_new_checkpoint #>> '{worker_event,payload,run_id}' IS DISTINCT FROM
           p_old_checkpoint #>> '{worker_event,payload,run_id}') THEN
      RAISE EXCEPTION 'numo_worker_checkpoint_migration_binding' USING ERRCODE = '22023';
    END IF;
    UPDATE public.numo_assistant_turns SET checkpoint = p_new_checkpoint,
      worker_checkpoint_encryption_checked_at = clock_timestamp(),
      worker_checkpoint_encryption_attempted_at = clock_timestamp()
      WHERE id = p_id;
  ELSE
    UPDATE public.numo_assistant_turns SET
      worker_checkpoint_encryption_checked_at = clock_timestamp(),
      worker_checkpoint_encryption_attempted_at = clock_timestamp() WHERE id = p_id;
  END IF;
  PERFORM set_config('minddy.encryption_maintenance',COALESCE(prior,''),true);
  RETURN true;
END;
$$;

CREATE FUNCTION public.mark_numo_worker_payload_attempt(
  p_kind text, p_id uuid, p_old jsonb, p_allow_stale boolean DEFAULT false
) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE affected integer; prior text := current_setting('minddy.encryption_maintenance', true);
BEGIN
  IF p_kind = 'event' THEN
    PERFORM set_config('minddy.encryption_maintenance','on',true);
    UPDATE public.numo_turn_events SET payload_encryption_attempted_at = clock_timestamp()
      WHERE id = p_id AND (p_allow_stale OR payload = p_old);
    GET DIAGNOSTICS affected = ROW_COUNT;
    PERFORM set_config('minddy.encryption_maintenance',COALESCE(prior,''),true);
  ELSIF p_kind = 'checkpoint' THEN
    UPDATE public.numo_assistant_turns SET
      worker_checkpoint_encryption_attempted_at = clock_timestamp()
      WHERE id = p_id AND (p_allow_stale OR checkpoint = p_old);
    GET DIAGNOSTICS affected = ROW_COUNT;
  ELSE
    RAISE invalid_parameter_value USING MESSAGE = 'Invalid Numo worker attempt kind';
  END IF;
  RETURN affected = 1;
END;
$$;
REVOKE ALL ON FUNCTION public.mark_numo_worker_payload_attempt(text,uuid,jsonb,boolean)
  FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.mark_numo_worker_payload_attempt(text,uuid,jsonb,boolean)
  TO service_role;

ALTER TABLE public.feedback_users ADD COLUMN content_encryption_attempted_at timestamptz;
ALTER TABLE public.feedback_otp_codes ADD COLUMN content_encryption_attempted_at timestamptz;
ALTER TABLE public.feedback_boards ADD COLUMN sso_encryption_attempted_at timestamptz;
CREATE INDEX feedback_user_attempt_queue ON public.feedback_users
  (content_encryption_attempted_at NULLS FIRST,id);
CREATE INDEX feedback_otp_attempt_queue ON public.feedback_otp_codes
  (content_encryption_attempted_at NULLS FIRST,id);
CREATE INDEX feedback_sso_attempt_queue ON public.feedback_boards
  (sso_encryption_attempted_at NULLS FIRST,id) WHERE sso_secret IS NOT NULL;

CREATE OR REPLACE FUNCTION public.migrate_feedback_user_identity(
  p_id uuid,p_old_email text,p_old_name text,p_old_external text,
  p_new_email text,p_new_name text,p_new_external text,
  p_email_lookup text,p_external_lookup text
) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE row public.feedback_users;
BEGIN
  SELECT * INTO row FROM public.feedback_users WHERE id=p_id FOR UPDATE;
  IF NOT FOUND OR row.email IS DISTINCT FROM p_old_email OR
      row.name IS DISTINCT FROM p_old_name OR
      row.external_id IS DISTINCT FROM p_old_external THEN RETURN false; END IF;
  UPDATE public.feedback_users SET
    email=COALESCE(p_new_email,row.email),
    name=COALESCE(p_new_name,row.name),
    external_id=COALESCE(p_new_external,row.external_id),
    email_lookup=COALESCE(p_email_lookup,row.email_lookup),
    external_id_lookup=COALESCE(p_external_lookup,row.external_id_lookup),
    content_encryption_checked_at=clock_timestamp(),
    content_encryption_attempted_at=clock_timestamp() WHERE id=p_id;
  RETURN true;
END;
$$;

CREATE OR REPLACE FUNCTION public.migrate_feedback_otp_email(
  p_id uuid,p_old_email text,p_new_email text,p_email_lookup text
) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE row public.feedback_otp_codes;
BEGIN
  SELECT * INTO row FROM public.feedback_otp_codes WHERE id=p_id FOR UPDATE;
  IF NOT FOUND OR row.email IS DISTINCT FROM p_old_email THEN RETURN false; END IF;
  UPDATE public.feedback_otp_codes SET email=p_new_email,
    email_lookup=p_email_lookup,
    content_encryption_checked_at=clock_timestamp(),
    content_encryption_attempted_at=clock_timestamp() WHERE id=p_id;
  RETURN true;
END;
$$;

CREATE OR REPLACE FUNCTION public.migrate_feedback_sso_secret(
  p_id uuid,p_old text,p_new text
) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE row public.feedback_boards;
BEGIN
  SELECT * INTO row FROM public.feedback_boards WHERE id=p_id FOR UPDATE;
  IF NOT FOUND OR row.sso_secret IS DISTINCT FROM p_old THEN RETURN false; END IF;
  UPDATE public.feedback_boards SET sso_secret=p_new,
    sso_encryption_checked_at=clock_timestamp(),
    sso_encryption_attempted_at=clock_timestamp() WHERE id=p_id;
  RETURN true;
END;
$$;

CREATE FUNCTION public.mark_feedback_identity_attempt(
  p_kind text,p_id uuid,p_old_email text,p_old_name text DEFAULT NULL,
  p_old_external text DEFAULT NULL,p_allow_stale boolean DEFAULT false
) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE affected integer;
BEGIN
  IF p_kind='user' THEN
    UPDATE public.feedback_users SET content_encryption_attempted_at=clock_timestamp()
      WHERE id=p_id AND (p_allow_stale OR
        (email IS NOT DISTINCT FROM p_old_email AND
         name IS NOT DISTINCT FROM p_old_name AND
         external_id IS NOT DISTINCT FROM p_old_external));
  ELSIF p_kind='otp' THEN
    UPDATE public.feedback_otp_codes SET content_encryption_attempted_at=clock_timestamp()
      WHERE id=p_id AND (p_allow_stale OR email IS NOT DISTINCT FROM p_old_email);
  ELSE
    RAISE invalid_parameter_value USING MESSAGE='Invalid feedback identity attempt kind';
  END IF;
  GET DIAGNOSTICS affected=ROW_COUNT;
  RETURN affected=1;
END;
$$;
REVOKE ALL ON FUNCTION public.mark_feedback_identity_attempt(text,uuid,text,text,text,boolean)
  FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.mark_feedback_identity_attempt(text,uuid,text,text,text,boolean)
  TO service_role;

CREATE FUNCTION public.mark_feedback_sso_attempt(
  p_id uuid,p_old text,p_allow_stale boolean DEFAULT false
) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE affected integer;
BEGIN
  UPDATE public.feedback_boards SET sso_encryption_attempted_at=clock_timestamp()
    WHERE id=p_id AND (p_allow_stale OR sso_secret IS NOT DISTINCT FROM p_old);
  GET DIAGNOSTICS affected=ROW_COUNT;
  RETURN affected=1;
END;
$$;
REVOKE ALL ON FUNCTION public.mark_feedback_sso_attempt(uuid,text,boolean)
  FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.mark_feedback_sso_attempt(uuid,text,boolean)
  TO service_role;

ALTER TABLE public.feedback_merge_events ADD COLUMN payload_attempted_at timestamptz;
CREATE INDEX feedback_merge_attempt_queue ON public.feedback_merge_events
  (payload_attempted_at NULLS FIRST,id) WHERE payload <> '{}'::jsonb;

CREATE OR REPLACE FUNCTION public.migrate_feedback_merge_payload(
  p_event uuid,p_old jsonb
) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE current_row public.feedback_merge_events%ROWTYPE;
BEGIN
  SELECT * INTO current_row FROM public.feedback_merge_events
    WHERE id=p_event FOR UPDATE;
  IF NOT FOUND OR current_row.payload IS DISTINCT FROM p_old THEN
    RETURN false;
  END IF;
  IF p_old='{}'::jsonb THEN
    UPDATE public.feedback_merge_events SET payload_checked_at=clock_timestamp(),
      payload_attempted_at=clock_timestamp() WHERE id=p_event;
    RETURN true;
  END IF;
  IF jsonb_typeof(coalesce(p_old->'moved_vote_user_ids','[]'::jsonb))<>'array'
    OR jsonb_typeof(coalesce(p_old->'dropped_vote_user_ids','[]'::jsonb))<>'array'
    OR jsonb_typeof(coalesce(p_old->'repointed_chain_ids','[]'::jsonb))<>'array' THEN
    RAISE EXCEPTION 'feedback_merge_legacy_payload_invalid'
      USING ERRCODE='22023';
  END IF;
  INSERT INTO public.feedback_merge_event_links(event_id,link_kind,target_id)
    SELECT p_event,'moved_vote',value::uuid FROM
      jsonb_array_elements_text(coalesce(p_old->'moved_vote_user_ids','[]'::jsonb)) AS value
    ON CONFLICT DO NOTHING;
  INSERT INTO public.feedback_merge_event_links(event_id,link_kind,target_id)
    SELECT p_event,'dropped_vote',value::uuid FROM
      jsonb_array_elements_text(coalesce(p_old->'dropped_vote_user_ids','[]'::jsonb)) AS value
    ON CONFLICT DO NOTHING;
  INSERT INTO public.feedback_merge_event_links(event_id,link_kind,target_id)
    SELECT p_event,'repointed_chain',value::uuid FROM
      jsonb_array_elements_text(coalesce(p_old->'repointed_chain_ids','[]'::jsonb)) AS value
    ON CONFLICT DO NOTHING;
  UPDATE public.feedback_merge_events SET payload='{}'::jsonb,
    payload_checked_at=clock_timestamp(),payload_attempted_at=clock_timestamp()
    WHERE id=p_event;
  RETURN true;
END;
$$;

DROP FUNCTION public.mark_feedback_merge_payload_attempt(uuid,jsonb);
CREATE FUNCTION public.mark_feedback_merge_payload_attempt(
  p_event uuid,p_old jsonb,p_allow_stale boolean DEFAULT false
) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE affected integer;
BEGIN
  UPDATE public.feedback_merge_events SET payload_attempted_at=clock_timestamp()
    WHERE id=p_event AND (p_allow_stale OR payload IS NOT DISTINCT FROM p_old);
  GET DIAGNOSTICS affected=ROW_COUNT;
  RETURN affected=1;
END;
$$;
REVOKE ALL ON FUNCTION public.mark_feedback_merge_payload_attempt(uuid,jsonb,boolean)
  FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.mark_feedback_merge_payload_attempt(uuid,jsonb,boolean)
  TO service_role;

COMMIT;
