BEGIN;

-- Encrypted objects are larger than their user-visible logical file size.
-- Trust the logical size metadata only for server-registered ciphertext.
CREATE OR REPLACE FUNCTION public.enforce_storage_insert_quota()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE owner_id uuid; additional_bytes bigint; stored_bytes bigint;
BEGIN
  SELECT attribution.owner_id INTO owner_id
  FROM public.projects AS project
  JOIN public.project_storage_owners AS attribution
    ON attribution.project_id=project.id
   AND attribution.owner_id=project.owner_id
   AND NOT attribution.project_deleted
  WHERE project.id=NEW.project_id FOR UPDATE OF attribution;
  IF owner_id IS NULL THEN
    RAISE EXCEPTION 'storage_quota_project_missing' USING ERRCODE='23503';
  END IF;
  IF TG_TABLE_NAME='page_files' AND NOT EXISTS (
    SELECT 1 FROM public.pages AS page
      WHERE page.id=NEW.page_id AND page.project_id=NEW.project_id
  ) THEN
    RAISE EXCEPTION 'storage_object_scope_mismatch' USING ERRCODE='22023';
  END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('storage-quota:'||owner_id::text,467));
  IF TG_TABLE_NAME='attachments' AND NEW.storage_path IS NULL THEN
    RETURN NEW;
  END IF;
  IF NEW.storage_path IS NULL OR
      NEW.storage_path NOT LIKE 'projects/'||NEW.project_id::text||'/%' OR
      (TG_TABLE_NAME='page_files' AND NEW.storage_path NOT LIKE
        'projects/'||NEW.project_id::text||'/pages/%') THEN
    RAISE EXCEPTION 'storage_object_scope_mismatch' USING ERRCODE='22023';
  END IF;
  SELECT CASE WHEN EXISTS (
      SELECT 1 FROM public.attachment_object_encrypted e WHERE e.path=o.name
    ) THEN CASE WHEN o.user_metadata->>'minddy_logical_size' ~ '^[0-9]{1,10}$'
      THEN (o.user_metadata->>'minddy_logical_size')::bigint ELSE NULL END
    ELSE public.storage_object_size_bytes(o.metadata) END
  INTO stored_bytes FROM storage.objects o
    WHERE o.bucket_id='attachments' AND o.name=NEW.storage_path;
  IF stored_bytes IS NULL OR stored_bytes<>NEW.size_bytes THEN
    RAISE EXCEPTION 'storage_object_size_mismatch' USING ERRCODE='22023';
  END IF;
  additional_bytes := 0;
  IF NOT public.project_storage_quota_allows(NEW.project_id,additional_bytes) THEN
    RAISE EXCEPTION 'storage_quota_exceeded' USING ERRCODE='P0001';
  END IF;
  RETURN NEW;
END;
$$;

COMMIT;
