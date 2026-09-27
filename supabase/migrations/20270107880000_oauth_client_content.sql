-- Seal dynamically registered OAuth client metadata under the system content key.
BEGIN;

ALTER TABLE public.oauth_clients
  ALTER COLUMN client_name DROP NOT NULL,
  ALTER COLUMN redirect_uris DROP NOT NULL,
  ADD COLUMN encrypted_content text,
  ADD COLUMN encryption_version integer NOT NULL DEFAULT 0,
  ADD COLUMN content_revision bigint NOT NULL DEFAULT 0,
  ADD COLUMN encryption_checked_at timestamptz,
  ADD COLUMN encryption_attempted_at timestamptz,
  ADD CONSTRAINT oauth_client_content_shape CHECK (
    (encryption_version=0 AND encrypted_content IS NULL AND
      client_name IS NOT NULL AND redirect_uris IS NOT NULL)
    OR (encryption_version>0 AND encrypted_content IS NOT NULL AND
      client_name IS NULL AND redirect_uris IS NULL AND
      logo_uri IS NULL AND client_uri IS NULL)
  );

CREATE INDEX oauth_client_encryption_queue ON public.oauth_clients
  (encryption_attempted_at NULLS FIRST,client_id);

CREATE TABLE public.oauth_client_content_scope (
  id boolean PRIMARY KEY DEFAULT true CHECK (id),
  activated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.oauth_client_content_scope ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.oauth_client_content_scope FROM PUBLIC,anon,authenticated;
GRANT ALL ON public.oauth_client_content_scope TO service_role;

CREATE FUNCTION public.guard_oauth_client_content()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE parsed jsonb;
BEGIN
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('oauth-client-content',591));
  IF TG_OP='UPDATE' THEN
    IF NEW.client_id IS DISTINCT FROM OLD.client_id OR
       NEW.encryption_version<OLD.encryption_version THEN
      RAISE EXCEPTION 'oauth_client_scope_change' USING ERRCODE='23514';
    END IF;
    IF NEW.encrypted_content IS DISTINCT FROM OLD.encrypted_content OR
       NEW.client_name IS DISTINCT FROM OLD.client_name OR
       NEW.redirect_uris IS DISTINCT FROM OLD.redirect_uris OR
       NEW.logo_uri IS DISTINCT FROM OLD.logo_uri OR
       NEW.client_uri IS DISTINCT FROM OLD.client_uri THEN
      NEW.content_revision:=OLD.content_revision+1;
    ELSIF NEW.content_revision IS DISTINCT FROM OLD.content_revision THEN
      RAISE EXCEPTION 'oauth_client_revision_change' USING ERRCODE='23514';
    END IF;
  END IF;
  IF NEW.encrypted_content IS NOT NULL THEN
    BEGIN parsed:=NEW.encrypted_content::jsonb;
    EXCEPTION WHEN others THEN
      RAISE EXCEPTION 'oauth_client_invalid_envelope' USING ERRCODE='23514';
    END;
    IF COALESCE((parsed->>'format')::integer,0)<>3 OR
       COALESCE((parsed->>'keyVersion')::integer,0)<>NEW.encryption_version THEN
      RAISE EXCEPTION 'oauth_client_invalid_envelope' USING ERRCODE='23514';
    END IF;
    IF TG_OP='INSERT' OR NEW.encrypted_content IS DISTINCT FROM OLD.encrypted_content THEN
      NEW.encryption_checked_at:=pg_catalog.clock_timestamp();
    END IF;
  END IF;
  IF EXISTS(SELECT 1 FROM public.oauth_client_content_scope) AND
     NEW.encrypted_content IS NULL THEN
    RAISE EXCEPTION 'oauth_client_requires_encryption' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER oauth_client_content_guard BEFORE INSERT OR UPDATE
  ON public.oauth_clients FOR EACH ROW
  EXECUTE FUNCTION public.guard_oauth_client_content();
REVOKE ALL ON FUNCTION public.guard_oauth_client_content()
  FROM PUBLIC,anon,authenticated;

CREATE FUNCTION public.activate_oauth_client_content()
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('oauth-client-content',591));
  IF EXISTS(SELECT 1 FROM public.oauth_clients WHERE
      encryption_version=0 OR encrypted_content IS NULL OR
      encryption_checked_at IS NULL OR client_name IS NOT NULL OR
      redirect_uris IS NOT NULL OR logo_uri IS NOT NULL OR
      client_uri IS NOT NULL) THEN RETURN false; END IF;
  INSERT INTO public.oauth_client_content_scope(id) VALUES(true)
    ON CONFLICT DO NOTHING;
  RETURN true;
END;
$$;
REVOKE ALL ON FUNCTION public.activate_oauth_client_content()
  FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.activate_oauth_client_content()
  TO service_role;

COMMIT;
