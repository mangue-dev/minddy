-- Seal project integration labels and webhook destinations with row-bound keys.
BEGIN;

CREATE FUNCTION public.integration_content_version(p_value text)
RETURNS integer LANGUAGE plpgsql IMMUTABLE STRICT SET search_path='' AS $$
DECLARE parsed jsonb;
BEGIN
  IF left(p_value,6)<>'mdye3:' THEN RETURN 0; END IF;
  parsed:=substring(p_value FROM 7)::jsonb;
  IF COALESCE((parsed->>'format')::integer,0)=3 AND
      COALESCE((parsed->>'keyVersion')::integer,0)>0 THEN
    RETURN (parsed->>'keyVersion')::integer;
  END IF;
  RETURN 0;
EXCEPTION WHEN others THEN RETURN 0;
END;
$$;
REVOKE ALL ON FUNCTION public.integration_content_version(text)
  FROM PUBLIC,anon,authenticated;

ALTER TABLE public.integrations
  ADD COLUMN content_revision bigint NOT NULL DEFAULT 0,
  ADD COLUMN name_encryption_checked_at timestamptz,
  ADD COLUMN webhook_encryption_checked_at timestamptz,
  ADD COLUMN encryption_attempted_at timestamptz;
CREATE INDEX integration_encryption_queue ON public.integrations
  (encryption_attempted_at NULLS FIRST,id);

CREATE TABLE public.integration_content_scope (
  id boolean PRIMARY KEY DEFAULT true CHECK(id),
  activated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.integration_content_scope ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.integration_content_scope FROM PUBLIC,anon,authenticated;
GRANT ALL ON public.integration_content_scope TO service_role;

CREATE FUNCTION public.guard_integration_content()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE name_version integer; webhook_version integer; old_name_version integer:=0;
  old_webhook_version integer:=0;
BEGIN
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('integration-content',591));
  name_version:=public.integration_content_version(NEW.name);
  webhook_version:=public.integration_content_version(NEW.webhook_url);
  IF (left(NEW.name,6)='mdye3:' AND name_version=0) OR
      (left(NEW.webhook_url,6)='mdye3:' AND webhook_version=0) THEN
    RAISE EXCEPTION 'integration_invalid_envelope' USING ERRCODE='23514';
  END IF;
  IF TG_OP='UPDATE' THEN
    old_name_version:=public.integration_content_version(OLD.name);
    old_webhook_version:=public.integration_content_version(OLD.webhook_url);
    IF NEW.id IS DISTINCT FROM OLD.id OR
       NEW.project_id IS DISTINCT FROM OLD.project_id OR
       name_version<old_name_version OR
       (NEW.webhook_url IS NOT NULL AND
         webhook_version<old_webhook_version) THEN
      RAISE EXCEPTION 'integration_scope_change' USING ERRCODE='23514';
    END IF;
    IF NEW.name IS DISTINCT FROM OLD.name OR
       NEW.webhook_url IS DISTINCT FROM OLD.webhook_url THEN
      NEW.content_revision:=OLD.content_revision+1;
    ELSIF NEW.content_revision IS DISTINCT FROM OLD.content_revision THEN
      RAISE EXCEPTION 'integration_revision_change' USING ERRCODE='23514';
    END IF;
  END IF;
  IF EXISTS(SELECT 1 FROM public.integration_content_scope) AND
      (name_version=0 OR (NEW.webhook_url IS NOT NULL AND
        webhook_version=0)) THEN
    RAISE EXCEPTION 'integration_requires_encryption' USING ERRCODE='23514';
  END IF;
  IF TG_OP='INSERT' OR NEW.name IS DISTINCT FROM OLD.name THEN
    NEW.name_encryption_checked_at:=CASE WHEN name_version>0 THEN
      pg_catalog.clock_timestamp() ELSE NULL END;
  END IF;
  IF TG_OP='INSERT' OR NEW.webhook_url IS DISTINCT FROM OLD.webhook_url THEN
    NEW.webhook_encryption_checked_at:=CASE WHEN webhook_version>0 THEN
      pg_catalog.clock_timestamp() ELSE NULL END;
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER integration_content_guard BEFORE INSERT OR UPDATE
  ON public.integrations FOR EACH ROW
  EXECUTE FUNCTION public.guard_integration_content();
REVOKE ALL ON FUNCTION public.guard_integration_content()
  FROM PUBLIC,anon,authenticated;

CREATE FUNCTION public.activate_integration_content()
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('integration-content',591));
  IF EXISTS(SELECT 1 FROM public.integrations WHERE
      public.integration_content_version(name)=0 OR
      name_encryption_checked_at IS NULL OR
      (webhook_url IS NOT NULL AND
        (public.integration_content_version(webhook_url)=0 OR
          webhook_encryption_checked_at IS NULL))) THEN RETURN false; END IF;
  INSERT INTO public.integration_content_scope(id) VALUES(true)
    ON CONFLICT DO NOTHING;
  RETURN true;
END;
$$;
REVOKE ALL ON FUNCTION public.activate_integration_content()
  FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.activate_integration_content()
  TO service_role;

COMMIT;
