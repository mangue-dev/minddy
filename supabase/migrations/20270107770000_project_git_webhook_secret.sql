-- MIN-591: move shared GitLab repository webhook secrets to the system DEK.
BEGIN;
ALTER TABLE public.project_git_links
  ADD COLUMN webhook_secret_checked_at timestamptz,
  ADD COLUMN webhook_secret_attempted_at timestamptz;
CREATE INDEX project_git_links_webhook_secret_queue
  ON public.project_git_links(webhook_secret_attempted_at NULLS FIRST,id)
  WHERE webhook_secret_encrypted IS NOT NULL;

CREATE TABLE public.project_git_webhook_secret_scope(
  id boolean PRIMARY KEY DEFAULT true CHECK(id),
  activated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.project_git_webhook_secret_scope ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.project_git_webhook_secret_scope
  FROM PUBLIC,anon,authenticated;
GRANT ALL ON public.project_git_webhook_secret_scope TO service_role;

CREATE FUNCTION public.guard_project_git_webhook_secret()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE new_format integer:=0; new_version integer:=0;
  old_format integer:=0; old_version integer:=0;
BEGIN
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('project-git-webhook-secret',591));
  IF NEW.webhook_secret_encrypted IS NOT NULL THEN
    BEGIN
      new_format:=COALESCE((NEW.webhook_secret_encrypted::jsonb->>'format')::integer,0);
      new_version:=COALESCE((NEW.webhook_secret_encrypted::jsonb->>'keyVersion')::integer,0);
    EXCEPTION WHEN others THEN new_format:=0; new_version:=0;
    END;
  END IF;
  IF TG_OP='UPDATE' AND OLD.webhook_secret_encrypted IS NOT NULL THEN
    BEGIN
      old_format:=COALESCE((OLD.webhook_secret_encrypted::jsonb->>'format')::integer,0);
      old_version:=COALESCE((OLD.webhook_secret_encrypted::jsonb->>'keyVersion')::integer,0);
    EXCEPTION WHEN others THEN old_format:=0; old_version:=0;
    END;
  END IF;
  IF TG_OP='UPDATE' AND old_format=3 THEN
    IF NEW.provider IS DISTINCT FROM OLD.provider OR
        NEW.external_repo_id IS DISTINCT FROM OLD.external_repo_id OR
        NEW.webhook_secret_encrypted IS NULL OR new_format<>3 OR
        new_version<old_version THEN
      RAISE EXCEPTION 'project_webhook_secret_downgrade'
        USING ERRCODE='23514';
    END IF;
  END IF;
  IF NEW.webhook_secret_encrypted IS NOT NULL AND
      (new_format=3 AND new_version<1 OR
       new_format<>3 AND EXISTS(
         SELECT 1 FROM public.project_git_webhook_secret_scope)) THEN
    RAISE EXCEPTION 'project_webhook_secret_requires_encryption'
      USING ERRCODE='23514';
  END IF;
  IF new_format=3 AND (TG_OP='INSERT' OR
      NEW.webhook_secret_encrypted IS DISTINCT FROM OLD.webhook_secret_encrypted) THEN
    NEW.webhook_secret_checked_at:=clock_timestamp();
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER project_git_links_a_webhook_secret_guard
  BEFORE INSERT OR UPDATE ON public.project_git_links FOR EACH ROW
  EXECUTE FUNCTION public.guard_project_git_webhook_secret();
REVOKE ALL ON FUNCTION public.guard_project_git_webhook_secret()
  FROM PUBLIC,anon,authenticated;

CREATE FUNCTION public.project_git_webhook_secret_version(p_value text)
RETURNS integer LANGUAGE plpgsql IMMUTABLE STRICT SET search_path='' AS $$
DECLARE format_number integer; key_version integer;
BEGIN
  format_number:=COALESCE((p_value::jsonb->>'format')::integer,0);
  key_version:=COALESCE((p_value::jsonb->>'keyVersion')::integer,0);
  IF format_number=3 AND key_version>0 THEN RETURN key_version; END IF;
  RETURN 0;
EXCEPTION WHEN others THEN RETURN 0;
END;
$$;
REVOKE ALL ON FUNCTION public.project_git_webhook_secret_version(text)
  FROM PUBLIC,anon,authenticated;

CREATE FUNCTION public.activate_project_git_webhook_secrets()
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('project-git-webhook-secret',591));
  IF EXISTS(SELECT 1 FROM public.project_git_links WHERE
      webhook_secret_encrypted IS NOT NULL AND
      (webhook_secret_checked_at IS NULL OR
       public.project_git_webhook_secret_version(webhook_secret_encrypted)=0))
  THEN RETURN false;
  END IF;
  INSERT INTO public.project_git_webhook_secret_scope(id) VALUES(true)
    ON CONFLICT DO NOTHING;
  RETURN true;
END;
$$;
REVOKE ALL ON FUNCTION public.activate_project_git_webhook_secrets()
  FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.activate_project_git_webhook_secrets()
  TO service_role;
COMMIT;
