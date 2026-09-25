-- MIN-591: project and personal board view content and old-writer refusal.
BEGIN;
ALTER TABLE public.views
  ALTER COLUMN name DROP NOT NULL,
  ALTER COLUMN filters DROP NOT NULL,
  ALTER COLUMN display DROP NOT NULL,
  ADD COLUMN encrypted_content text,
  ADD COLUMN encryption_version integer NOT NULL DEFAULT 0,
  ADD COLUMN content_revision bigint NOT NULL DEFAULT 0,
  ADD COLUMN encryption_checked_at timestamptz;
CREATE INDEX views_content_migration_queue
  ON public.views(encryption_checked_at NULLS FIRST,id);

CREATE TABLE public.view_content_encryption_scope(
  id boolean PRIMARY KEY DEFAULT true CHECK(id),
  activated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.view_content_encryption_scope ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.view_content_encryption_scope FROM PUBLIC,anon,authenticated;
GRANT ALL ON public.view_content_encryption_scope TO service_role;

CREATE FUNCTION public.guard_view_content()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE sealed boolean:=NEW.encryption_version>0 AND
  NEW.encrypted_content IS NOT NULL AND NEW.name IS NULL AND
  NEW.filters IS NULL AND NEW.display IS NULL;
BEGIN
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('view-content-activation',591));
  IF TG_OP='UPDATE' THEN
    NEW.content_revision:=OLD.content_revision+1;
    IF NEW.encryption_version<OLD.encryption_version THEN
      RAISE EXCEPTION 'view_content_key_downgrade' USING ERRCODE='23514';
    END IF;
    IF (NEW.project_id IS DISTINCT FROM OLD.project_id OR
        NEW.user_id IS DISTINCT FROM OLD.user_id) AND
        (OLD.encryption_version>0 OR sealed OR
         EXISTS(SELECT 1 FROM public.view_content_encryption_scope)) THEN
      RAISE EXCEPTION 'view_content_scope_immutable' USING ERRCODE='23514';
    END IF;
    IF OLD.encryption_version>0 AND NOT sealed THEN
      RAISE EXCEPTION 'view_content_downgrade' USING ERRCODE='23514';
    END IF;
  END IF;
  IF NEW.encryption_version<0 OR
      (NEW.encryption_version=0 AND NEW.encrypted_content IS NOT NULL) OR
      (NEW.encryption_version>0 AND NOT sealed) OR
      (sealed AND COALESCE((NEW.encrypted_content::jsonb->>'keyVersion')::integer
        <>NEW.encryption_version,true)) OR
      (NEW.project_id IS NULL AND NEW.user_id IS NULL) THEN
    RAISE EXCEPTION 'view_content_state_invalid' USING ERRCODE='23514';
  END IF;
  IF NOT sealed AND EXISTS(SELECT 1 FROM public.view_content_encryption_scope)
    THEN RAISE EXCEPTION 'view_content_requires_encryption' USING ERRCODE='23514';
  END IF;
  IF sealed AND (TG_OP='INSERT' OR
      NEW.encrypted_content IS DISTINCT FROM OLD.encrypted_content) THEN
    NEW.encryption_checked_at:=clock_timestamp();
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER view_content_guard BEFORE INSERT OR UPDATE
  ON public.views FOR EACH ROW EXECUTE FUNCTION public.guard_view_content();
REVOKE ALL ON FUNCTION public.guard_view_content()
  FROM PUBLIC,anon,authenticated;

CREATE FUNCTION public.activate_view_content()
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('view-content-activation',591));
  IF EXISTS(SELECT 1 FROM public.views WHERE
      encryption_version<1 OR encrypted_content IS NULL OR
      name IS NOT NULL OR filters IS NOT NULL OR display IS NOT NULL OR
      encryption_checked_at IS NULL) THEN
    RETURN false;
  END IF;
  INSERT INTO public.view_content_encryption_scope(id) VALUES(true)
    ON CONFLICT DO NOTHING;
  RETURN true;
END;
$$;
REVOKE ALL ON FUNCTION public.activate_view_content()
  FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.activate_view_content()
  TO service_role;
COMMIT;
