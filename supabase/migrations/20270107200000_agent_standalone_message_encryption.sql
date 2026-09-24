-- Protect imported system and steering messages that have no run or queue source.
BEGIN;

ALTER TABLE public.agent_messages
  ADD COLUMN standalone_encryption_checked_at timestamptz;
CREATE INDEX agent_messages_standalone_encryption_queue
  ON public.agent_messages (standalone_encryption_checked_at NULLS FIRST, id)
  WHERE legacy_event_id IS NULL AND legacy_queue_message_id IS NULL
    AND (run_id IS NULL OR source = 'system');

CREATE FUNCTION public.guard_agent_standalone_message()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE project uuid; protected_old boolean := false; protected_new boolean;
BEGIN
  IF NEW.source = 'system' AND
    (NEW.legacy_event_id IS NOT NULL OR NEW.legacy_queue_message_id IS NOT NULL) THEN
    RAISE EXCEPTION 'agent_system_message_source_is_invalid' USING ERRCODE = '23514';
  END IF;
  protected_new := NEW.legacy_event_id IS NULL AND
    NEW.legacy_queue_message_id IS NULL AND
    (NEW.run_id IS NULL OR NEW.source = 'system');
  IF TG_OP = 'UPDATE' THEN
    protected_old := OLD.legacy_event_id IS NULL AND
      OLD.legacy_queue_message_id IS NULL AND
      (OLD.run_id IS NULL OR OLD.source = 'system');
  END IF;
  IF NOT protected_new AND NOT protected_old THEN RETURN NEW; END IF;
  SELECT c.project_id INTO project FROM public.agent_conversations c
    WHERE c.id = NEW.conversation_id;
  IF project IS NULL THEN
    RAISE EXCEPTION 'agent_message_conversation_missing' USING ERRCODE = '23503';
  END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(project::text, 59116));
  IF TG_OP = 'UPDATE' AND protected_old AND
    (NOT protected_new OR NEW.conversation_id IS DISTINCT FROM OLD.conversation_id
      OR NEW.id IS DISTINCT FROM OLD.id OR NEW.source IS DISTINCT FROM OLD.source)
    AND current_setting('minddy.encryption_maintenance', true) IS DISTINCT FROM 'on' THEN
    RAISE EXCEPTION 'agent_message_scope_is_immutable' USING ERRCODE = '23514';
  END IF;
  IF NOT protected_new THEN RETURN NEW; END IF;
  IF NEW.content_encryption_version > 0 THEN
    IF TG_OP = 'UPDATE' AND protected_old AND
      (NEW.content IS DISTINCT FROM OLD.content OR
        NEW.content_encryption_version IS DISTINCT FROM OLD.content_encryption_version)
      AND current_setting('minddy.encryption_maintenance', true) IS DISTINCT FROM 'on' THEN
      RAISE EXCEPTION 'agent_message_content_is_immutable' USING ERRCODE = '23514';
    END IF;
    INSERT INTO public.agent_launch_encryption_scopes(project_id)
      VALUES (project) ON CONFLICT DO NOTHING;
  ELSIF EXISTS (SELECT 1 FROM public.agent_launch_encryption_scopes
      WHERE project_id = project) AND
    (TG_OP = 'INSERT' OR NOT protected_old OR
      NEW.content IS DISTINCT FROM OLD.content OR
      NEW.content_encryption_version IS DISTINCT FROM OLD.content_encryption_version) THEN
    RAISE EXCEPTION 'agent_message_requires_encryption' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER agent_standalone_message_guard
  BEFORE INSERT OR UPDATE ON public.agent_messages
  FOR EACH ROW EXECUTE FUNCTION public.guard_agent_standalone_message();
REVOKE ALL ON FUNCTION public.guard_agent_standalone_message()
  FROM PUBLIC, anon, authenticated;

CREATE FUNCTION public.guard_agent_message_conversation_scope()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF NEW.project_id IS DISTINCT FROM OLD.project_id AND EXISTS (
    SELECT 1 FROM public.agent_messages m WHERE m.conversation_id = OLD.id
      AND m.legacy_event_id IS NULL AND m.legacy_queue_message_id IS NULL
      AND (m.run_id IS NULL OR m.source = 'system')
      AND m.content_encryption_version > 0
  ) THEN
    RAISE EXCEPTION 'agent_message_project_is_immutable' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER agent_message_conversation_scope_guard
  BEFORE UPDATE OF project_id ON public.agent_conversations
  FOR EACH ROW EXECUTE FUNCTION public.guard_agent_message_conversation_scope();
REVOKE ALL ON FUNCTION public.guard_agent_message_conversation_scope()
  FROM PUBLIC, anon, authenticated;

CREATE FUNCTION public.migrate_agent_standalone_message(
  p_id uuid, p_conversation_id uuid, p_project_id uuid,
  p_old_content text, p_old_version integer,
  p_content text DEFAULT NULL, p_version integer DEFAULT NULL
) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE current_row public.agent_messages;
  prior text := current_setting('minddy.encryption_maintenance', true);
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.agent_conversations c
      WHERE c.id = p_conversation_id AND c.project_id = p_project_id) THEN
    RETURN false;
  END IF;
  SELECT * INTO current_row FROM public.agent_messages m
    WHERE m.id = p_id AND m.conversation_id = p_conversation_id
      AND m.legacy_event_id IS NULL AND m.legacy_queue_message_id IS NULL
      AND (m.run_id IS NULL OR m.source = 'system') FOR UPDATE;
  IF NOT FOUND OR current_row.content IS DISTINCT FROM p_old_content OR
    current_row.content_encryption_version IS DISTINCT FROM p_old_version THEN
    RETURN false;
  END IF;
  IF p_content IS NULL AND p_version IS NULL THEN
    UPDATE public.agent_messages SET standalone_encryption_checked_at = clock_timestamp()
      WHERE id = p_id;
    RETURN true;
  END IF;
  IF p_content IS NULL OR p_version IS NULL OR p_version < 1 OR
    COALESCE((p_content::jsonb ->> 'format')::integer = 3, false) IS NOT TRUE OR
    COALESCE((p_content::jsonb ->> 'keyVersion')::integer = p_version, false) IS NOT TRUE THEN
    RAISE EXCEPTION 'agent_message_migration_invalid' USING ERRCODE = '22023';
  END IF;
  PERFORM set_config('minddy.encryption_maintenance', 'on', true);
  UPDATE public.agent_messages SET content = p_content,
    content_encryption_version = p_version,
    standalone_encryption_checked_at = clock_timestamp() WHERE id = p_id;
  PERFORM set_config('minddy.encryption_maintenance', COALESCE(prior, ''), true);
  RETURN true;
END;
$$;
REVOKE ALL ON FUNCTION public.migrate_agent_standalone_message(
  uuid,uuid,uuid,text,integer,text,integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.migrate_agent_standalone_message(
  uuid,uuid,uuid,text,integer,text,integer) TO service_role;

COMMIT;
