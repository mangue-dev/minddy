-- MIN-591: protect routine instructions, title, mentions and branch choice.
BEGIN;
ALTER TABLE public.agent_routines
  ALTER COLUMN title DROP NOT NULL,
  ALTER COLUMN prompt DROP NOT NULL,
  ALTER COLUMN prompt_mentions DROP NOT NULL,
  ADD COLUMN encrypted_content text,
  ADD COLUMN encryption_version integer NOT NULL DEFAULT 0,
  ADD COLUMN content_revision bigint NOT NULL DEFAULT 0,
  ADD COLUMN encryption_checked_at timestamptz;
ALTER TABLE public.agent_routines
  DROP CONSTRAINT agent_routines_prompt_mentions_array_check;
ALTER TABLE public.agent_routines
  ADD CONSTRAINT agent_routines_prompt_mentions_array_check
  CHECK(prompt_mentions IS NULL OR jsonb_typeof(prompt_mentions)='array');
CREATE INDEX agent_routines_content_migration_queue
  ON public.agent_routines(encryption_checked_at NULLS FIRST,id);

CREATE TABLE public.agent_routine_content_encryption_scope(
  id boolean PRIMARY KEY DEFAULT true CHECK(id),
  activated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.agent_routine_content_encryption_scope ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.agent_routine_content_encryption_scope
  FROM PUBLIC,anon,authenticated;
GRANT ALL ON public.agent_routine_content_encryption_scope TO service_role;

CREATE FUNCTION public.guard_agent_routine_content()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE sealed boolean:=NEW.encryption_version>0 AND
  NEW.encrypted_content IS NOT NULL AND NEW.title IS NULL AND
  NEW.prompt IS NULL AND NEW.prompt_mentions IS NULL AND
  NEW.base_branch IS NULL;
BEGIN
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('agent-routine-content-activation',591));
  IF TG_OP='UPDATE' THEN
    NEW.content_revision:=OLD.content_revision+1;
    IF NEW.project_id IS DISTINCT FROM OLD.project_id OR
        NEW.owner_id IS DISTINCT FROM OLD.owner_id OR
        NEW.id IS DISTINCT FROM OLD.id THEN
      RAISE EXCEPTION 'agent_routine_scope_immutable' USING ERRCODE='23514';
    END IF;
    IF NEW.encryption_version<OLD.encryption_version OR
        OLD.encryption_version>0 AND NOT sealed THEN
      RAISE EXCEPTION 'agent_routine_content_downgrade'
        USING ERRCODE='23514';
    END IF;
  END IF;
  IF NEW.encryption_version<0 OR
      (NEW.encryption_version=0 AND NEW.encrypted_content IS NOT NULL) OR
      (NEW.encryption_version>0 AND NOT sealed) OR
      (sealed AND COALESCE((NEW.encrypted_content::jsonb->>'keyVersion')::integer
        <>NEW.encryption_version,true)) THEN
    RAISE EXCEPTION 'agent_routine_content_state_invalid'
      USING ERRCODE='23514';
  END IF;
  IF (sealed OR EXISTS(SELECT 1 FROM public.agent_routine_content_encryption_scope))
      AND NEW.last_error IS NOT NULL AND NEW.last_error NOT IN (
        'quota','noRepo','alreadyRunning','noModelForProvider',
        'modelAbovePlan','managedServiceUnavailable',
        'executionBackendUnavailable','providerEndpointUnavailableFromSandbox',
        'launchFailed') THEN
    RAISE EXCEPTION 'agent_routine_error_requires_code' USING ERRCODE='23514';
  END IF;
  IF NOT sealed AND EXISTS(
    SELECT 1 FROM public.agent_routine_content_encryption_scope) THEN
    RAISE EXCEPTION 'agent_routine_requires_encryption'
      USING ERRCODE='23514';
  END IF;
  IF sealed AND (TG_OP='INSERT' OR
      NEW.encrypted_content IS DISTINCT FROM OLD.encrypted_content) THEN
    NEW.encryption_checked_at:=clock_timestamp();
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER agent_routine_content_guard BEFORE INSERT OR UPDATE
  ON public.agent_routines FOR EACH ROW
  EXECUTE FUNCTION public.guard_agent_routine_content();
REVOKE ALL ON FUNCTION public.guard_agent_routine_content()
  FROM PUBLIC,anon,authenticated;

CREATE FUNCTION public.activate_agent_routine_content()
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('agent-routine-content-activation',591));
  IF EXISTS(SELECT 1 FROM public.agent_routines WHERE
      encryption_version<1 OR encrypted_content IS NULL OR
      title IS NOT NULL OR prompt IS NOT NULL OR
      prompt_mentions IS NOT NULL OR base_branch IS NOT NULL OR
      encryption_checked_at IS NULL OR
      last_error IS NOT NULL AND last_error NOT IN (
        'quota','noRepo','alreadyRunning','noModelForProvider',
        'modelAbovePlan','managedServiceUnavailable',
        'executionBackendUnavailable','providerEndpointUnavailableFromSandbox',
        'launchFailed')) THEN
    RETURN false;
  END IF;
  INSERT INTO public.agent_routine_content_encryption_scope(id) VALUES(true)
    ON CONFLICT DO NOTHING;
  RETURN true;
END;
$$;
REVOKE ALL ON FUNCTION public.activate_agent_routine_content()
  FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.activate_agent_routine_content()
  TO service_role;
COMMIT;
