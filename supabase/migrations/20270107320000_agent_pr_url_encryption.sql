BEGIN;

ALTER TABLE public.agent_runs ADD COLUMN pr_url_encryption_checked_at timestamptz;
ALTER TABLE public.agent_artifacts
  ADD COLUMN url_bound_run_id uuid,
  ADD COLUMN url_encryption_checked_at timestamptz;
CREATE INDEX agent_run_pr_url_encryption_queue ON public.agent_runs
  (pr_url_encryption_checked_at NULLS FIRST,id) WHERE pr_url IS NOT NULL;
CREATE INDEX agent_artifact_url_encryption_queue ON public.agent_artifacts
  (url_encryption_checked_at NULLS FIRST,id) WHERE url IS NOT NULL;

CREATE TABLE public.agent_pr_url_encryption_scopes (
  project_id uuid PRIMARY KEY REFERENCES public.projects(id) ON DELETE CASCADE,
  activated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.agent_pr_url_encryption_scopes ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.agent_pr_url_encryption_scopes FROM PUBLIC,anon,authenticated;
GRANT ALL ON public.agent_pr_url_encryption_scopes TO service_role;

CREATE FUNCTION public.guard_agent_run_pr_url()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE old_version integer; new_version integer;
BEGIN
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(NEW.project_id::text,59132));
  IF TG_OP='UPDATE' AND NEW.project_id IS DISTINCT FROM OLD.project_id AND
      (OLD.pr_url LIKE 'mdyp3:%' OR NEW.pr_url LIKE 'mdyp3:%') THEN
    RAISE EXCEPTION 'agent_pr_url_scope_is_immutable' USING ERRCODE='23514';
  END IF;
  IF NEW.pr_url LIKE 'mdyp3:%' THEN
    IF NEW.pr_url !~ '^mdyp3:[1-9][0-9]*:[A-Za-z0-9_-]+$' THEN
      RAISE EXCEPTION 'agent_pr_url_ciphertext_invalid' USING ERRCODE='23514';
    END IF;
    new_version := split_part(NEW.pr_url,':',2)::integer;
    IF TG_OP='UPDATE' AND OLD.pr_url LIKE 'mdyp3:%' THEN
      old_version := split_part(OLD.pr_url,':',2)::integer;
      IF new_version < old_version THEN
        RAISE EXCEPTION 'agent_pr_url_key_version_rollback' USING ERRCODE='23514';
      END IF;
    END IF;
    IF EXISTS (SELECT 1 FROM public.agent_artifacts a
      WHERE a.run_id=NEW.id AND a.kind='pull_request' AND a.url IS NOT NULL
        AND a.url NOT LIKE 'mdyp3:%') AND
        current_setting('minddy.encryption_maintenance',true) IS DISTINCT FROM 'on' THEN
      RAISE EXCEPTION 'agent_pr_url_clear_artifact_remains' USING ERRCODE='23514';
    END IF;
    INSERT INTO public.agent_pr_url_encryption_scopes(project_id)
      VALUES(NEW.project_id) ON CONFLICT DO NOTHING;
  ELSIF NEW.pr_url IS NOT NULL AND EXISTS (
      SELECT 1 FROM public.agent_pr_url_encryption_scopes s
      WHERE s.project_id=NEW.project_id) AND
      (TG_OP='INSERT' OR NEW.pr_url IS DISTINCT FROM OLD.pr_url) THEN
    RAISE EXCEPTION 'agent_pr_url_requires_encryption' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER agent_run_pr_url_guard BEFORE INSERT OR UPDATE ON public.agent_runs
  FOR EACH ROW EXECUTE FUNCTION public.guard_agent_run_pr_url();
REVOKE ALL ON FUNCTION public.guard_agent_run_pr_url() FROM PUBLIC,anon,authenticated;

CREATE FUNCTION public.guard_agent_artifact_url()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE project uuid; source_url text; source_project uuid;
BEGIN
  SELECT c.project_id INTO project FROM public.agent_conversations c
    WHERE c.id=NEW.conversation_id;
  IF project IS NULL THEN
    RAISE EXCEPTION 'agent_artifact_url_project_missing' USING ERRCODE='23503';
  END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(project::text,59132));
  IF NEW.url LIKE 'mdyp3:%' THEN
    IF NEW.url !~ '^mdyp3:[1-9][0-9]*:[A-Za-z0-9_-]+$' THEN
      RAISE EXCEPTION 'agent_artifact_url_ciphertext_invalid' USING ERRCODE='23514';
    END IF;
    IF NEW.run_id IS NOT NULL THEN
      SELECT r.pr_url,r.project_id INTO source_url,source_project
        FROM public.agent_runs r WHERE r.id=NEW.run_id;
      IF source_url=NEW.url AND source_project=project THEN
        NEW.url_bound_run_id := NEW.run_id;
      END IF;
    END IF;
    IF NEW.url_bound_run_id IS NOT NULL AND NEW.url_bound_run_id IS DISTINCT FROM
        NEW.run_id AND TG_OP='INSERT' THEN
      RAISE EXCEPTION 'agent_artifact_url_binding_invalid' USING ERRCODE='23514';
    END IF;
    IF NEW.url_bound_run_id IS NOT NULL AND NEW.run_id IS NOT NULL AND
        (source_url IS DISTINCT FROM NEW.url OR source_project IS DISTINCT FROM project) AND
        current_setting('minddy.encryption_maintenance',true) IS DISTINCT FROM 'on' THEN
      RAISE EXCEPTION 'agent_artifact_url_copy_mismatch' USING ERRCODE='23514';
    END IF;
    INSERT INTO public.agent_pr_url_encryption_scopes(project_id)
      VALUES(project) ON CONFLICT DO NOTHING;
  ELSIF NEW.url IS NOT NULL AND EXISTS (
      SELECT 1 FROM public.agent_pr_url_encryption_scopes s
      WHERE s.project_id=project) AND
      (TG_OP='INSERT' OR NEW.url IS DISTINCT FROM OLD.url) THEN
    RAISE EXCEPTION 'agent_artifact_url_requires_encryption' USING ERRCODE='23514';
  END IF;
  IF TG_OP='UPDATE' THEN
    IF OLD.url LIKE 'mdyp3:%' AND NEW.url IS NOT NULL AND NEW.url NOT LIKE 'mdyp3:%' THEN
      RAISE EXCEPTION 'agent_artifact_url_encryption_downgrade' USING ERRCODE='23514';
    END IF;
    IF OLD.url LIKE 'mdyp3:%' AND NEW.url LIKE 'mdyp3:%' AND
        split_part(NEW.url,':',2)::integer < split_part(OLD.url,':',2)::integer THEN
      RAISE EXCEPTION 'agent_artifact_url_key_version_rollback' USING ERRCODE='23514';
    END IF;
    IF OLD.url LIKE 'mdyp3:%' AND NEW.conversation_id IS DISTINCT FROM OLD.conversation_id THEN
      RAISE EXCEPTION 'agent_artifact_url_scope_is_immutable' USING ERRCODE='23514';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER agent_artifact_url_guard
  BEFORE INSERT OR UPDATE ON public.agent_artifacts
  FOR EACH ROW EXECUTE FUNCTION public.guard_agent_artifact_url();
REVOKE ALL ON FUNCTION public.guard_agent_artifact_url() FROM PUBLIC,anon,authenticated;

CREATE FUNCTION public.guard_agent_pr_url_parent_scope()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF NEW.project_id IS DISTINCT FROM OLD.project_id AND
      (EXISTS (SELECT 1 FROM public.agent_pr_url_encryption_scopes s
        WHERE s.project_id IN (OLD.project_id,NEW.project_id)) OR
       EXISTS (SELECT 1 FROM public.agent_artifacts a
        WHERE a.conversation_id=OLD.id AND a.url LIKE 'mdyp3:%')) THEN
    RAISE EXCEPTION 'agent_pr_url_parent_scope_is_immutable' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER agent_pr_url_parent_scope_guard
  BEFORE UPDATE OF project_id ON public.agent_conversations
  FOR EACH ROW EXECUTE FUNCTION public.guard_agent_pr_url_parent_scope();
REVOKE ALL ON FUNCTION public.guard_agent_pr_url_parent_scope()
  FROM PUBLIC,anon,authenticated;

CREATE FUNCTION public.migrate_agent_run_pr_url(
  p_id uuid,p_project_id uuid,p_old_url text,p_new_url text DEFAULT NULL
) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE row public.agent_runs;
BEGIN
  SELECT * INTO row FROM public.agent_runs WHERE id=p_id AND project_id=p_project_id
    FOR UPDATE;
  IF NOT FOUND OR row.pr_url IS DISTINCT FROM p_old_url THEN RETURN false; END IF;
  IF p_new_url IS NULL THEN
    UPDATE public.agent_runs SET pr_url_encryption_checked_at=clock_timestamp()
      WHERE id=p_id;
  ELSE
    UPDATE public.agent_runs SET pr_url=p_new_url,
      pr_url_encryption_checked_at=clock_timestamp() WHERE id=p_id;
  END IF;
  RETURN true;
END;
$$;
REVOKE ALL ON FUNCTION public.migrate_agent_run_pr_url(uuid,uuid,text,text)
  FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.migrate_agent_run_pr_url(uuid,uuid,text,text)
  TO service_role;

CREATE FUNCTION public.migrate_agent_artifact_url(
  p_id uuid,p_project_id uuid,p_old_url text,p_old_bound_run_id uuid,
  p_new_url text DEFAULT NULL
) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE row public.agent_artifacts;
  prior text := current_setting('minddy.encryption_maintenance',true);
BEGIN
  SELECT a.* INTO row FROM public.agent_artifacts a
  JOIN public.agent_conversations c ON c.id=a.conversation_id
  WHERE a.id=p_id AND c.project_id=p_project_id FOR UPDATE OF a;
  IF NOT FOUND OR row.url IS DISTINCT FROM p_old_url OR
      row.url_bound_run_id IS DISTINCT FROM p_old_bound_run_id THEN RETURN false; END IF;
  IF p_new_url IS NULL THEN
    UPDATE public.agent_artifacts SET url_encryption_checked_at=clock_timestamp()
      WHERE id=p_id;
  ELSE
    PERFORM set_config('minddy.encryption_maintenance','on',true);
    UPDATE public.agent_artifacts SET url=p_new_url,url_bound_run_id=NULL,
      url_encryption_checked_at=clock_timestamp() WHERE id=p_id;
    PERFORM set_config('minddy.encryption_maintenance',COALESCE(prior,''),true);
  END IF;
  RETURN true;
END;
$$;
REVOKE ALL ON FUNCTION public.migrate_agent_artifact_url(uuid,uuid,text,uuid,text)
  FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.migrate_agent_artifact_url(uuid,uuid,text,uuid,text)
  TO service_role;

COMMIT;
