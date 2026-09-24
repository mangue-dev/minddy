BEGIN;

ALTER TABLE public.agent_conversation_contexts
  ADD COLUMN snapshot_ciphertext text,
  ADD COLUMN snapshot_encryption_version integer NOT NULL DEFAULT 0,
  ADD COLUMN snapshot_encryption_checked_at timestamptz,
  ADD CONSTRAINT agent_context_snapshot_encryption_state CHECK (
    (snapshot_encryption_version = 0 AND snapshot_ciphertext IS NULL)
    OR (snapshot_encryption_version > 0 AND snapshot = '{}'::jsonb
      AND snapshot_ciphertext IS NOT NULL
      AND COALESCE((snapshot_ciphertext::jsonb ->> 'format')::integer = 3, false)
      AND COALESCE((snapshot_ciphertext::jsonb ->> 'keyVersion')::integer = snapshot_encryption_version, false))
  ) NOT VALID;
CREATE INDEX agent_context_snapshot_encryption_queue
  ON public.agent_conversation_contexts (snapshot_encryption_checked_at NULLS FIRST, id);
REVOKE INSERT, UPDATE, DELETE ON public.agent_conversation_contexts FROM anon, authenticated;

CREATE TABLE public.agent_context_encryption_scopes (
  project_id uuid PRIMARY KEY REFERENCES public.projects(id) ON DELETE CASCADE,
  activated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.agent_context_encryption_scopes ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.agent_context_encryption_scopes FROM PUBLIC, anon, authenticated;

CREATE FUNCTION public.guard_agent_context_snapshot()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE project uuid;
BEGIN
  SELECT c.project_id INTO project FROM public.agent_conversations c
    WHERE c.id = NEW.conversation_id FOR SHARE;
  IF project IS NULL THEN
    RAISE EXCEPTION 'agent_context_conversation_missing' USING ERRCODE = '23503';
  END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(project::text, 59123));
  IF TG_OP = 'UPDATE' AND (NEW.conversation_id, NEW.kind, NEW.resource_id)
      IS DISTINCT FROM (OLD.conversation_id, OLD.kind, OLD.resource_id) THEN
    RAISE EXCEPTION 'agent_context_identity_is_immutable' USING ERRCODE = '23514';
  END IF;
  IF TG_OP = 'UPDATE' AND OLD.snapshot_encryption_version > 0 AND
      NEW.snapshot_encryption_version = 0 THEN
    RAISE EXCEPTION 'agent_context_encryption_downgrade' USING ERRCODE = '23514';
  END IF;
  IF NEW.snapshot_encryption_version > 0 THEN
    INSERT INTO public.agent_context_encryption_scopes(project_id)
      VALUES(project) ON CONFLICT DO NOTHING;
  ELSIF EXISTS (SELECT 1 FROM public.agent_context_encryption_scopes
      WHERE project_id = project) AND
      (TG_OP = 'INSERT' AND
         (NEW.snapshot <> '{}'::jsonb OR pg_catalog.pg_trigger_depth() < 2) OR
       TG_OP = 'UPDATE' AND
         (NEW.snapshot IS DISTINCT FROM OLD.snapshot OR
          NEW.snapshot_ciphertext IS DISTINCT FROM OLD.snapshot_ciphertext OR
          NEW.snapshot_encryption_version IS DISTINCT FROM OLD.snapshot_encryption_version)) THEN
    RAISE EXCEPTION 'agent_context_requires_encryption' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER agent_context_snapshot_guard
  BEFORE INSERT OR UPDATE ON public.agent_conversation_contexts
  FOR EACH ROW EXECUTE FUNCTION public.guard_agent_context_snapshot();
REVOKE ALL ON FUNCTION public.guard_agent_context_snapshot() FROM PUBLIC, anon, authenticated;

CREATE FUNCTION public.guard_agent_context_parent_scope()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF NEW.project_id IS DISTINCT FROM OLD.project_id AND EXISTS (
    SELECT 1 FROM public.agent_conversation_contexts x
    WHERE x.conversation_id = OLD.id AND
      (x.snapshot_encryption_version > 0 OR
       EXISTS (SELECT 1 FROM public.agent_context_encryption_scopes s
         WHERE s.project_id IN (OLD.project_id, NEW.project_id)))
  ) THEN
    RAISE EXCEPTION 'agent_context_parent_scope_is_immutable' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER agent_context_parent_scope_guard
  BEFORE UPDATE OF project_id ON public.agent_conversations
  FOR EACH ROW EXECUTE FUNCTION public.guard_agent_context_parent_scope();
REVOKE ALL ON FUNCTION public.guard_agent_context_parent_scope() FROM PUBLIC, anon, authenticated;

CREATE FUNCTION public.migrate_agent_context_snapshot(
  p_id uuid, p_conversation_id uuid, p_project_id uuid,
  p_old_snapshot jsonb, p_old_cipher text, p_old_version integer,
  p_cipher text DEFAULT NULL, p_version integer DEFAULT NULL
) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE context_row public.agent_conversation_contexts;
BEGIN
  SELECT x.* INTO context_row FROM public.agent_conversation_contexts x
  JOIN public.agent_conversations c ON c.id = x.conversation_id
  WHERE x.id = p_id AND x.conversation_id = p_conversation_id
    AND c.project_id = p_project_id FOR UPDATE OF x;
  IF NOT FOUND OR context_row.snapshot IS DISTINCT FROM p_old_snapshot OR
      context_row.snapshot_ciphertext IS DISTINCT FROM p_old_cipher OR
      context_row.snapshot_encryption_version IS DISTINCT FROM p_old_version THEN
    RETURN false;
  END IF;
  IF p_cipher IS NULL AND p_version IS NULL THEN
    UPDATE public.agent_conversation_contexts
      SET snapshot_encryption_checked_at = clock_timestamp() WHERE id = p_id;
    RETURN true;
  END IF;
  IF p_cipher IS NULL OR p_version IS NULL OR p_version < 1 THEN
    RAISE EXCEPTION 'agent_context_migration_invalid' USING ERRCODE = '22023';
  END IF;
  UPDATE public.agent_conversation_contexts SET snapshot = '{}'::jsonb,
    snapshot_ciphertext = p_cipher, snapshot_encryption_version = p_version,
    snapshot_encryption_checked_at = clock_timestamp() WHERE id = p_id;
  RETURN true;
END;
$$;
REVOKE ALL ON FUNCTION public.migrate_agent_context_snapshot(
  uuid,uuid,uuid,jsonb,text,integer,text,integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.migrate_agent_context_snapshot(
  uuid,uuid,uuid,jsonb,text,integer,text,integer) TO service_role;

COMMIT;
