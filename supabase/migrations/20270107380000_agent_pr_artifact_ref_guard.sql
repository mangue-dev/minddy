BEGIN;

-- Pull-request artifact refs are numeric forge identifiers, not prose. Keep
-- the equality key used by the runtime trigger and reject arbitrary strings.
CREATE FUNCTION public.guard_agent_pr_artifact_ref()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF NEW.kind <> 'pull_request' THEN RETURN NEW; END IF;
  IF NEW.ref !~ '^[1-9][0-9]{0,9}$' OR
      NEW.ref::bigint > 2147483647 THEN
    RAISE EXCEPTION 'agent_pr_artifact_ref_must_be_number'
      USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER agent_pr_artifact_ref_guard
  BEFORE INSERT OR UPDATE ON public.agent_artifacts
  FOR EACH ROW EXECUTE FUNCTION public.guard_agent_pr_artifact_ref();
REVOKE ALL ON FUNCTION public.guard_agent_pr_artifact_ref()
  FROM PUBLIC,anon,authenticated;

COMMIT;
