-- Seal private actor labels copied from dynamic OAuth client registration.
BEGIN;

ALTER TABLE public.api_keys
  ALTER COLUMN name DROP NOT NULL,
  ADD COLUMN encrypted_content text,
  ADD COLUMN encryption_version integer NOT NULL DEFAULT 0,
  ADD COLUMN content_revision bigint NOT NULL DEFAULT 0,
  ADD COLUMN encryption_checked_at timestamptz,
  ADD COLUMN encryption_attempted_at timestamptz,
  ADD CONSTRAINT api_key_content_shape CHECK (
    (encryption_version=0 AND encrypted_content IS NULL AND name IS NOT NULL)
    OR (encryption_version>0 AND encrypted_content IS NOT NULL AND
      name IS NULL AND agent IS NULL)
  );
CREATE INDEX api_key_encryption_queue ON public.api_keys
  (encryption_attempted_at NULLS FIRST,id);

CREATE TABLE public.api_key_content_scope (
  id boolean PRIMARY KEY DEFAULT true CHECK(id),
  activated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.api_key_content_scope ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.api_key_content_scope FROM PUBLIC,anon,authenticated;
GRANT ALL ON public.api_key_content_scope TO service_role;

CREATE FUNCTION public.guard_api_key_content()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE parsed jsonb;
BEGIN
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('api-key-content',591));
  IF TG_OP='UPDATE' THEN
    IF NEW.id IS DISTINCT FROM OLD.id OR
       NEW.user_id IS DISTINCT FROM OLD.user_id OR
       NEW.encryption_version<OLD.encryption_version THEN
      RAISE EXCEPTION 'api_key_scope_change' USING ERRCODE='23514';
    END IF;
    IF NEW.encrypted_content IS DISTINCT FROM OLD.encrypted_content OR
       NEW.name IS DISTINCT FROM OLD.name OR NEW.agent IS DISTINCT FROM OLD.agent THEN
      NEW.content_revision:=OLD.content_revision+1;
    ELSIF NEW.content_revision IS DISTINCT FROM OLD.content_revision THEN
      RAISE EXCEPTION 'api_key_revision_change' USING ERRCODE='23514';
    END IF;
  END IF;
  IF NEW.encrypted_content IS NOT NULL THEN
    BEGIN parsed:=NEW.encrypted_content::jsonb;
    EXCEPTION WHEN others THEN
      RAISE EXCEPTION 'api_key_invalid_envelope' USING ERRCODE='23514';
    END;
    IF COALESCE((parsed->>'format')::integer,0)<>3 OR
       COALESCE((parsed->>'keyVersion')::integer,0)<>NEW.encryption_version THEN
      RAISE EXCEPTION 'api_key_invalid_envelope' USING ERRCODE='23514';
    END IF;
    IF TG_OP='INSERT' OR NEW.encrypted_content IS DISTINCT FROM OLD.encrypted_content THEN
      NEW.encryption_checked_at:=pg_catalog.clock_timestamp();
    END IF;
  END IF;
  IF EXISTS(SELECT 1 FROM public.api_key_content_scope) AND
     NEW.encrypted_content IS NULL THEN
    RAISE EXCEPTION 'api_key_requires_encryption' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER api_key_content_guard BEFORE INSERT OR UPDATE ON public.api_keys
  FOR EACH ROW EXECUTE FUNCTION public.guard_api_key_content();
REVOKE ALL ON FUNCTION public.guard_api_key_content()
  FROM PUBLIC,anon,authenticated;

CREATE FUNCTION public.activate_api_key_content()
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('api-key-content',591));
  IF EXISTS(SELECT 1 FROM public.api_keys WHERE encryption_version=0 OR
      encrypted_content IS NULL OR encryption_checked_at IS NULL OR
      name IS NOT NULL OR agent IS NOT NULL) THEN RETURN false; END IF;
  INSERT INTO public.api_key_content_scope(id) VALUES(true)
    ON CONFLICT DO NOTHING;
  RETURN true;
END;
$$;
REVOKE ALL ON FUNCTION public.activate_api_key_content()
  FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.activate_api_key_content()
  TO service_role;

COMMIT;
