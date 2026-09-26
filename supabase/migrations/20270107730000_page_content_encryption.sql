-- MIN-591: page documents, database cells and private page identity.
BEGIN;
ALTER TABLE public.pages
  ALTER COLUMN title DROP NOT NULL,
  ALTER COLUMN content DROP NOT NULL,
  ALTER COLUMN property_values DROP NOT NULL,
  ALTER COLUMN search_text DROP NOT NULL,
  ADD COLUMN encrypted_content text,
  ADD COLUMN encryption_version integer NOT NULL DEFAULT 0,
  ADD COLUMN content_revision bigint NOT NULL DEFAULT 0,
  ADD COLUMN encryption_checked_at timestamptz,
  ADD COLUMN page_is_database boolean NOT NULL DEFAULT false,
  ADD COLUMN page_has_values boolean NOT NULL DEFAULT false,
  ADD COLUMN page_is_blank boolean NOT NULL DEFAULT false;

UPDATE public.pages SET page_is_database = database_schema IS NOT NULL,
  page_has_values = property_values <> '{}'::jsonb,
  page_is_blank = database_schema IS NULL AND property_values = '{}'::jsonb
    AND btrim(title) = '' AND icon IS NULL AND
    (content->'content' IS NULL OR
      jsonb_typeof(content->'content') = 'array' AND
      (jsonb_array_length(content->'content') = 0 OR
        jsonb_array_length(content->'content') = 1 AND
        content->'content'->0->>'type' = 'paragraph' AND
        (content->'content'->0->'content' IS NULL OR
          content->'content'->0->'content' = '[]'::jsonb)));
CREATE INDEX pages_content_migration_queue
  ON public.pages(encryption_checked_at NULLS FIRST,id);

CREATE TABLE public.page_content_encryption_scope(
  id boolean PRIMARY KEY DEFAULT true CHECK(id),
  activated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.page_content_encryption_scope ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.page_content_encryption_scope
  FROM PUBLIC,anon,authenticated;
GRANT ALL ON public.page_content_encryption_scope TO service_role;

CREATE FUNCTION public.guard_page_content()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE parent_kind boolean;
  parent_project uuid;
  sealed boolean := NEW.encryption_version > 0 AND
  NEW.encrypted_content IS NOT NULL AND NEW.title IS NULL AND
  NEW.icon IS NULL AND NEW.content IS NULL AND
  NEW.database_schema IS NULL AND NEW.database_title_name IS NULL AND
  NEW.property_values IS NULL AND NEW.search_text IS NULL;
BEGIN
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('page-content-activation',591));
  IF TG_OP='UPDATE' THEN
    NEW.content_revision := OLD.content_revision+1;
    IF NEW.id IS DISTINCT FROM OLD.id OR
        NEW.project_id IS DISTINCT FROM OLD.project_id THEN
      RAISE EXCEPTION 'page_content_scope_immutable' USING ERRCODE='23514';
    END IF;
    IF NEW.encryption_version < OLD.encryption_version OR
        OLD.encryption_version>0 AND NOT sealed THEN
      RAISE EXCEPTION 'page_content_downgrade' USING ERRCODE='23514';
    END IF;
    IF OLD.encryption_version>0 AND
        (NEW.database_revision < OLD.database_revision OR
         NEW.database_revision > OLD.database_revision+1) THEN
      RAISE EXCEPTION 'page_database_revision_invalid' USING ERRCODE='23514';
    END IF;
  END IF;
  IF NEW.encryption_version<0 OR
      NEW.encryption_version=0 AND NEW.encrypted_content IS NOT NULL OR
      NEW.encryption_version>0 AND NOT sealed OR
      sealed AND COALESCE((NEW.encrypted_content::jsonb->>'keyVersion')::integer
        <>NEW.encryption_version,true) THEN
    RAISE EXCEPTION 'page_content_state_invalid' USING ERRCODE='23514';
  END IF;
  IF NOT sealed THEN
    NEW.page_is_database := NEW.database_schema IS NOT NULL;
    NEW.page_has_values := NEW.property_values <> '{}'::jsonb;
    NEW.page_is_blank := NEW.database_schema IS NULL AND
      NEW.property_values = '{}'::jsonb AND btrim(NEW.title) = '' AND
      NEW.icon IS NULL AND (NEW.content->'content' IS NULL OR
        jsonb_typeof(NEW.content->'content') = 'array' AND
        (jsonb_array_length(NEW.content->'content') = 0 OR
          jsonb_array_length(NEW.content->'content') = 1 AND
          NEW.content->'content'->0->>'type' = 'paragraph' AND
          (NEW.content->'content'->0->'content' IS NULL OR
           NEW.content->'content'->0->'content' = '[]'::jsonb)));
  END IF;
  IF NOT sealed AND EXISTS(
    SELECT 1 FROM public.page_content_encryption_scope) THEN
    RAISE EXCEPTION 'page_content_requires_encryption' USING ERRCODE='23514';
  END IF;
  IF EXISTS(SELECT 1 FROM public.page_content_encryption_scope) AND
      coalesce(auth.role(),'') <> 'service_role' AND
      session_user NOT IN ('postgres','supabase_admin') THEN
    RAISE EXCEPTION 'page_content_service_writer_required' USING ERRCODE='42501';
  END IF;
  IF sealed AND NEW.parent_id IS NOT NULL THEN
    IF TG_OP='INSERT' THEN
      SELECT p.page_is_database,p.project_id INTO parent_kind,parent_project
        FROM public.pages p
        WHERE p.id=NEW.parent_id FOR SHARE;
    ELSE
      SELECT p.page_is_database,p.project_id INTO parent_kind,parent_project
        FROM public.pages p
        WHERE p.id=NEW.parent_id;
    END IF;
    IF parent_project IS DISTINCT FROM NEW.project_id THEN
      RAISE EXCEPTION 'page_parent_scope_invalid' USING ERRCODE='23514';
    END IF;
    IF NEW.page_is_database AND parent_kind THEN
      RAISE EXCEPTION 'nested_page_database' USING ERRCODE='23514';
    END IF;
  END IF;
  IF sealed AND (TG_OP='INSERT' OR
      NEW.encrypted_content IS DISTINCT FROM OLD.encrypted_content) THEN
    NEW.encryption_checked_at:=clock_timestamp();
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER pages_a_content_guard BEFORE INSERT OR UPDATE
  ON public.pages FOR EACH ROW EXECUTE FUNCTION public.guard_page_content();
REVOKE ALL ON FUNCTION public.guard_page_content()
  FROM PUBLIC,anon,authenticated;

CREATE FUNCTION public.activate_page_content()
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('page-content-activation',591));
  IF EXISTS(SELECT 1 FROM public.pages WHERE encryption_version<1 OR
      encrypted_content IS NULL OR title IS NOT NULL OR icon IS NOT NULL OR
      content IS NOT NULL OR database_schema IS NOT NULL OR
      database_title_name IS NOT NULL OR property_values IS NOT NULL OR
      search_text IS NOT NULL OR encryption_checked_at IS NULL) THEN
    RETURN false;
  END IF;
  INSERT INTO public.page_content_encryption_scope(id) VALUES(true)
    ON CONFLICT DO NOTHING;
  RETURN true;
END;
$$;
REVOKE ALL ON FUNCTION public.activate_page_content()
  FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.activate_page_content()
  TO service_role;
COMMIT;
