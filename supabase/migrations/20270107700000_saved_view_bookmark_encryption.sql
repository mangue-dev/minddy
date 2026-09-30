-- MIN-591: private command-palette bookmarks and stable name equality.
BEGIN;
ALTER TABLE public.saved_views
  ALTER COLUMN name DROP NOT NULL,
  ALTER COLUMN href DROP NOT NULL,
  ADD COLUMN name_index text,
  ADD COLUMN encrypted_content text,
  ADD COLUMN encryption_version integer NOT NULL DEFAULT 0,
  ADD COLUMN content_revision bigint NOT NULL DEFAULT 0,
  ADD COLUMN encryption_checked_at timestamptz;
ALTER TABLE public.saved_views DROP CONSTRAINT saved_views_href_check;
ALTER TABLE public.saved_views ADD CONSTRAINT saved_views_href_check
  CHECK(href IS NULL OR (href LIKE '/%' AND href NOT LIKE '//%'));
CREATE UNIQUE INDEX saved_views_user_name_index
  ON public.saved_views(user_id,name_index);
CREATE INDEX saved_views_content_migration_queue
  ON public.saved_views(encryption_checked_at NULLS FIRST,id);

CREATE TABLE public.saved_view_bookmark_encryption_scope(
  id boolean PRIMARY KEY DEFAULT true CHECK(id),
  activated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.saved_view_bookmark_encryption_scope ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.saved_view_bookmark_encryption_scope FROM PUBLIC,anon,authenticated;
GRANT ALL ON public.saved_view_bookmark_encryption_scope TO service_role;

CREATE FUNCTION public.guard_saved_view_bookmark()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE sealed boolean:=NEW.encryption_version>0 AND
  NEW.encrypted_content IS NOT NULL AND NEW.name IS NULL AND
  NEW.href IS NULL AND NEW.name_index ~ '^[a-f0-9]{64}$';
BEGIN
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('saved-view-bookmark-activation',591));
  IF TG_OP='UPDATE' THEN
    NEW.content_revision:=OLD.content_revision+1;
    IF NEW.user_id IS DISTINCT FROM OLD.user_id OR
        NEW.id IS DISTINCT FROM OLD.id THEN
      RAISE EXCEPTION 'saved_view_bookmark_owner_immutable'
        USING ERRCODE='23514';
    END IF;
    IF NEW.encryption_version<OLD.encryption_version OR
        OLD.encryption_version>0 AND NOT sealed THEN
      RAISE EXCEPTION 'saved_view_bookmark_downgrade'
        USING ERRCODE='23514';
    END IF;
  END IF;
  IF NEW.encryption_version<0 OR
      (NEW.encryption_version=0 AND
       (NEW.encrypted_content IS NOT NULL OR NEW.name_index IS NOT NULL)) OR
      (NEW.encryption_version>0 AND NOT sealed) OR
      (sealed AND COALESCE((NEW.encrypted_content::jsonb->>'keyVersion')::integer
        <>NEW.encryption_version,true)) THEN
    RAISE EXCEPTION 'saved_view_bookmark_state_invalid' USING ERRCODE='23514';
  END IF;
  IF NOT sealed AND EXISTS(
    SELECT 1 FROM public.saved_view_bookmark_encryption_scope) THEN
    RAISE EXCEPTION 'saved_view_bookmark_requires_encryption'
      USING ERRCODE='23514';
  END IF;
  IF sealed AND (TG_OP='INSERT' OR
      NEW.encrypted_content IS DISTINCT FROM OLD.encrypted_content) THEN
    NEW.encryption_checked_at:=clock_timestamp();
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER saved_view_bookmark_guard BEFORE INSERT OR UPDATE
  ON public.saved_views FOR EACH ROW
  EXECUTE FUNCTION public.guard_saved_view_bookmark();
REVOKE ALL ON FUNCTION public.guard_saved_view_bookmark()
  FROM PUBLIC,anon,authenticated;

CREATE FUNCTION public.activate_saved_view_bookmarks()
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('saved-view-bookmark-activation',591));
  IF EXISTS(SELECT 1 FROM public.saved_views WHERE
      encryption_version<1 OR encrypted_content IS NULL OR
      name IS NOT NULL OR href IS NOT NULL OR name_index IS NULL OR
      encryption_checked_at IS NULL) THEN
    RETURN false;
  END IF;
  INSERT INTO public.saved_view_bookmark_encryption_scope(id) VALUES(true)
    ON CONFLICT DO NOTHING;
  RETURN true;
END;
$$;
REVOKE ALL ON FUNCTION public.activate_saved_view_bookmarks()
  FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.activate_saved_view_bookmarks()
  TO service_role;
COMMIT;
