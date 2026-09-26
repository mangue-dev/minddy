-- Keep event payloads and their SQL-created summary/input copies in one protected scope.
BEGIN;

ALTER TABLE public.agent_run_events
  ADD COLUMN encrypted_content text,
  ADD COLUMN encryption_version integer NOT NULL DEFAULT 0,
  ADD COLUMN encryption_checked_at timestamptz,
  ADD COLUMN has_summary_text boolean NOT NULL DEFAULT false,
  ADD COLUMN question_id text,
  ADD COLUMN call_id text,
  ADD COLUMN has_questions boolean NOT NULL DEFAULT false,
  ADD CONSTRAINT agent_run_events_encryption_state CHECK (
    (encryption_version = 0 AND encrypted_content IS NULL)
    OR (encryption_version > 0 AND payload IS NULL AND encrypted_content IS NOT NULL
      AND COALESCE((encrypted_content::jsonb ->> 'format')::integer = 3, false)
      AND COALESCE((encrypted_content::jsonb ->> 'keyVersion')::integer = encryption_version, false))
  ) NOT VALID;
CREATE INDEX agent_run_events_encryption_queue
  ON public.agent_run_events (encryption_checked_at NULLS FIRST, id);

ALTER TABLE public.agent_messages
  ADD COLUMN content_encryption_version integer NOT NULL DEFAULT 0,
  ADD CONSTRAINT agent_messages_event_ciphertext CHECK (
    content_encryption_version = 0 OR
    (source = 'assistant_summary' AND legacy_event_id IS NOT NULL
      AND COALESCE((content::jsonb ->> 'format')::integer = 3, false)
      AND COALESCE((content::jsonb ->> 'keyVersion')::integer = content_encryption_version, false))
  ) NOT VALID;

ALTER TABLE public.agent_run_input_requests
  ALTER COLUMN questions DROP NOT NULL,
  ADD COLUMN source_event_id uuid REFERENCES public.agent_run_events(id) ON DELETE CASCADE,
  ADD COLUMN encrypted_questions text,
  ADD COLUMN questions_encryption_version integer NOT NULL DEFAULT 0;
ALTER TABLE public.agent_run_input_requests
  DROP CONSTRAINT agent_run_input_requests_questions_check,
  ADD CONSTRAINT agent_run_input_requests_questions_check CHECK (
    (questions_encryption_version = 0 AND encrypted_questions IS NULL
      AND jsonb_typeof(questions) = 'array' AND jsonb_array_length(questions) > 0)
    OR (questions_encryption_version > 0 AND questions IS NULL
      AND source_event_id IS NOT NULL AND encrypted_questions IS NOT NULL
      AND COALESCE((encrypted_questions::jsonb ->> 'format')::integer = 3, false)
      AND COALESCE((encrypted_questions::jsonb ->> 'keyVersion')::integer = questions_encryption_version, false))
  ) NOT VALID;

CREATE TABLE public.agent_event_encryption_scopes (
  project_id uuid PRIMARY KEY REFERENCES public.projects(id) ON DELETE CASCADE,
  activated_at timestamptz NOT NULL DEFAULT now()
);
REVOKE ALL ON public.agent_event_encryption_scopes FROM PUBLIC, anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.agent_run_events, public.agent_messages,
  public.agent_run_input_requests FROM anon, authenticated;

CREATE FUNCTION public.guard_agent_event_encryption()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE project uuid;
BEGIN
  SELECT r.project_id INTO project FROM public.agent_runs r WHERE r.id = NEW.run_id;
  IF project IS NULL THEN RAISE EXCEPTION 'agent_event_run_missing' USING ERRCODE = '23503'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(project::text, 59115));
  IF TG_OP = 'UPDATE' THEN
    IF current_setting('minddy.encryption_maintenance', true) IS DISTINCT FROM 'on'
      OR NEW.id IS DISTINCT FROM OLD.id OR NEW.run_id IS DISTINCT FROM OLD.run_id
      OR NEW.seq IS DISTINCT FROM OLD.seq OR NEW.type IS DISTINCT FROM OLD.type
      OR NEW.created_at IS DISTINCT FROM OLD.created_at
      OR NEW.encryption_version < OLD.encryption_version THEN
      RAISE EXCEPTION 'agent_event_is_immutable' USING ERRCODE = '23514';
    END IF;
  END IF;
  IF NEW.encryption_version > 0 THEN
    INSERT INTO public.agent_event_encryption_scopes(project_id)
      VALUES (project) ON CONFLICT DO NOTHING;
  ELSIF TG_OP = 'INSERT' AND EXISTS (
    SELECT 1 FROM public.agent_event_encryption_scopes WHERE project_id = project
  ) THEN
    RAISE EXCEPTION 'agent_event_requires_encryption' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER agent_event_encryption_guard
  BEFORE INSERT OR UPDATE ON public.agent_run_events
  FOR EACH ROW EXECUTE FUNCTION public.guard_agent_event_encryption();
REVOKE ALL ON FUNCTION public.guard_agent_event_encryption() FROM PUBLIC, anon, authenticated;

CREATE FUNCTION public.guard_agent_event_parent_scope()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF NEW.project_id IS DISTINCT FROM OLD.project_id AND EXISTS (
    SELECT 1 FROM public.agent_run_events
    WHERE run_id = OLD.id AND encryption_version > 0
  ) THEN
    RAISE EXCEPTION 'agent_event_parent_scope_is_immutable' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER agent_runs_event_scope_guard
  BEFORE UPDATE OF project_id ON public.agent_runs
  FOR EACH ROW EXECUTE FUNCTION public.guard_agent_event_parent_scope();
REVOKE ALL ON FUNCTION public.guard_agent_event_parent_scope() FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.capture_agent_assistant_message()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE r public.agent_runs; turn_id uuid; content text;
BEGIN
  IF NEW.type <> 'summary' THEN RETURN NULL; END IF;
  IF NEW.encryption_version > 0 THEN
    IF NOT NEW.has_summary_text THEN RETURN NULL; END IF;
    content := NEW.encrypted_content;
  ELSE
    content := nullif(btrim(NEW.payload->>'text'), '');
  END IF;
  IF content IS NULL THEN RETURN NULL; END IF;
  SELECT * INTO r FROM public.agent_runs WHERE id = NEW.run_id;
  SELECT t.id INTO turn_id FROM public.agent_turns t WHERE t.run_id = NEW.run_id
    ORDER BY t.created_at DESC, t.id DESC LIMIT 1;
  INSERT INTO public.agent_messages (
    conversation_id, turn_id, run_id, role, content, source,
    legacy_event_id, created_at, content_encryption_version
  ) VALUES (
    r.conversation_id, turn_id, NEW.run_id, 'assistant', content,
    'assistant_summary', NEW.id, NEW.created_at, NEW.encryption_version
  ) ON CONFLICT (legacy_event_id) WHERE legacy_event_id IS NOT NULL DO NOTHING;
  UPDATE public.agent_conversations
    SET updated_at = greatest(updated_at, NEW.created_at) WHERE id = r.conversation_id;
  RETURN NULL;
END;
$$;

CREATE OR REPLACE FUNCTION public.capture_agent_run_input_request()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_parent_turn_id uuid; v_question_id text; v_call_id text;
BEGIN
  IF NEW.type NOT IN ('needs_input', 'question') THEN RETURN NEW; END IF;
  IF NEW.encryption_version > 0 THEN
    v_question_id := NEW.question_id;
    v_call_id := COALESCE(NEW.call_id, NEW.question_id);
    IF v_question_id IS NULL OR NOT NEW.has_questions THEN RETURN NEW; END IF;
  ELSE
    v_question_id := nullif(NEW.payload ->> 'question_id', '');
    v_call_id := COALESCE(nullif(NEW.payload ->> 'call_id', ''), v_question_id);
    IF v_question_id IS NULL OR jsonb_typeof(NEW.payload -> 'questions') IS DISTINCT FROM 'array'
      OR jsonb_array_length(NEW.payload -> 'questions') = 0 THEN RETURN NEW; END IF;
  END IF;
  SELECT parent_numo_turn_id INTO v_parent_turn_id FROM public.agent_runs WHERE id = NEW.run_id;
  INSERT INTO public.agent_run_input_requests (
    run_id, parent_numo_turn_id, question_id, call_id, questions,
    source_event_id, encrypted_questions, questions_encryption_version
  ) VALUES (
    NEW.run_id, v_parent_turn_id, v_question_id, v_call_id,
    CASE WHEN NEW.encryption_version > 0 THEN NULL ELSE NEW.payload -> 'questions' END,
    NEW.id, NEW.encrypted_content, NEW.encryption_version
  ) ON CONFLICT (run_id, question_id) DO NOTHING;
  RETURN NEW;
END;
$$;

CREATE FUNCTION public.guard_agent_event_copies()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE project uuid;
BEGIN
  IF TG_TABLE_NAME = 'agent_messages' THEN
    IF TG_OP = 'INSERT' THEN
      IF NEW.source <> 'assistant_summary' THEN RETURN NEW; END IF;
    ELSIF NEW.source <> 'assistant_summary' AND OLD.source <> 'assistant_summary' THEN
      RETURN NEW;
    END IF;
    SELECT c.project_id INTO project FROM public.agent_conversations c
      WHERE c.id = NEW.conversation_id;
    IF TG_OP = 'UPDATE' AND (
      NEW.content IS DISTINCT FROM OLD.content OR
      NEW.content_encryption_version IS DISTINCT FROM OLD.content_encryption_version OR
      NEW.legacy_event_id IS DISTINCT FROM OLD.legacy_event_id OR
      NEW.conversation_id IS DISTINCT FROM OLD.conversation_id OR
      NEW.run_id IS DISTINCT FROM OLD.run_id OR
      NEW.source IS DISTINCT FROM OLD.source
    ) AND current_setting('minddy.encryption_maintenance', true) IS DISTINCT FROM 'on' THEN
      RAISE EXCEPTION 'agent_summary_copy_is_immutable' USING ERRCODE = '23514';
    END IF;
    IF TG_OP = 'INSERT' AND NEW.content_encryption_version = 0 AND EXISTS (
      SELECT 1 FROM public.agent_event_encryption_scopes WHERE project_id = project
    ) THEN
      RAISE EXCEPTION 'agent_summary_copy_requires_encryption' USING ERRCODE = '23514';
    END IF;
  ELSE
    SELECT r.project_id INTO project FROM public.agent_runs r WHERE r.id = NEW.run_id;
    IF TG_OP = 'UPDATE' AND (
      NEW.questions IS DISTINCT FROM OLD.questions OR
      NEW.encrypted_questions IS DISTINCT FROM OLD.encrypted_questions OR
      NEW.questions_encryption_version IS DISTINCT FROM OLD.questions_encryption_version OR
      NEW.source_event_id IS DISTINCT FROM OLD.source_event_id OR
      NEW.run_id IS DISTINCT FROM OLD.run_id
    ) AND current_setting('minddy.encryption_maintenance', true) IS DISTINCT FROM 'on' THEN
      RAISE EXCEPTION 'agent_input_copy_is_immutable' USING ERRCODE = '23514';
    END IF;
    IF TG_OP = 'INSERT' AND NEW.questions_encryption_version = 0 AND EXISTS (
      SELECT 1 FROM public.agent_event_encryption_scopes WHERE project_id = project
    ) THEN
      RAISE EXCEPTION 'agent_input_copy_requires_encryption' USING ERRCODE = '23514';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER agent_message_event_copy_guard
  BEFORE INSERT OR UPDATE ON public.agent_messages
  FOR EACH ROW EXECUTE FUNCTION public.guard_agent_event_copies();
CREATE TRIGGER agent_input_event_copy_guard
  BEFORE INSERT OR UPDATE ON public.agent_run_input_requests
  FOR EACH ROW EXECUTE FUNCTION public.guard_agent_event_copies();
REVOKE ALL ON FUNCTION public.guard_agent_event_copies() FROM PUBLIC, anon, authenticated;

CREATE FUNCTION public.migrate_agent_event_ciphertext(
  p_id uuid, p_run_id uuid, p_previous_version integer,
  p_content text DEFAULT NULL, p_version integer DEFAULT NULL
) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE original public.agent_run_events; affected integer;
  prior text := current_setting('minddy.encryption_maintenance', true);
  v_question_id text;
BEGIN
  PERFORM set_config('minddy.encryption_maintenance', 'on', true);
  SELECT * INTO original FROM public.agent_run_events
    WHERE id = p_id AND run_id = p_run_id AND encryption_version = p_previous_version FOR UPDATE;
  IF NOT FOUND THEN
    PERFORM set_config('minddy.encryption_maintenance', COALESCE(prior, ''), true);
    RETURN false;
  END IF;
  IF p_content IS NULL AND p_version IS NULL THEN
    UPDATE public.agent_run_events SET encryption_checked_at = clock_timestamp() WHERE id = p_id;
  ELSE
    v_question_id := COALESCE(NULLIF(original.payload ->> 'question_id', ''),
      NULLIF(original.payload ->> 'id', ''), original.question_id);
    UPDATE public.agent_run_events SET payload = NULL, encrypted_content = p_content,
      encryption_version = p_version, encryption_checked_at = clock_timestamp(),
      has_summary_text = CASE WHEN original.payload IS NULL THEN original.has_summary_text
        ELSE NULLIF(btrim(original.payload ->> 'text'), '') IS NOT NULL END,
      question_id = v_question_id,
      call_id = COALESCE(NULLIF(original.payload ->> 'call_id', ''),
        NULLIF(original.payload ->> 'id', ''), original.call_id, v_question_id),
      has_questions = CASE WHEN original.payload IS NULL THEN original.has_questions
        ELSE COALESCE(jsonb_typeof(original.payload -> 'questions') = 'array'
          AND jsonb_array_length(original.payload -> 'questions') > 0, false) END
    WHERE id = p_id;
    UPDATE public.agent_messages SET content = p_content,
      content_encryption_version = p_version WHERE legacy_event_id = p_id;
    UPDATE public.agent_run_input_requests SET questions = NULL,
      source_event_id = p_id, encrypted_questions = p_content,
      questions_encryption_version = p_version
    WHERE run_id = p_run_id AND question_id = v_question_id;
  END IF;
  GET DIAGNOSTICS affected = ROW_COUNT;
  PERFORM set_config('minddy.encryption_maintenance', COALESCE(prior, ''), true);
  RETURN true;
END;
$$;
REVOKE ALL ON FUNCTION public.migrate_agent_event_ciphertext(uuid,uuid,integer,text,integer)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.migrate_agent_event_ciphertext(uuid,uuid,integer,text,integer)
  TO service_role;

COMMIT;
