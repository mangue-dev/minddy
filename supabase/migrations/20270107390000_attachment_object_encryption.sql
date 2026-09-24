BEGIN;

CREATE TABLE public.attachment_object_encryption_scope (
  id boolean PRIMARY KEY DEFAULT true CHECK(id),
  activated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.attachment_object_encrypted (
  path text PRIMARY KEY,
  checked_at timestamptz NOT NULL DEFAULT now(),
  CHECK (path ~ '^(projects|chat)/[0-9a-f-]{36}/')
);
CREATE TABLE public.attachment_object_aliases (
  old_path_digest text PRIMARY KEY,
  new_path text NOT NULL REFERENCES public.attachment_object_encrypted(path),
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (old_path_digest ~ '^[a-f0-9]{64}$')
);
CREATE INDEX attachment_object_alias_new_path
  ON public.attachment_object_aliases(new_path);
ALTER TABLE public.attachment_object_encryption_scope ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.attachment_object_encrypted ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.attachment_object_aliases ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.attachment_object_encryption_scope,
  public.attachment_object_encrypted,public.attachment_object_aliases
  FROM PUBLIC,anon,authenticated;
GRANT ALL ON public.attachment_object_encryption_scope,
  public.attachment_object_encrypted,public.attachment_object_aliases
  TO service_role;

-- After activation, authenticated browser clients cannot bypass the server
-- byte-encryption writer with a direct Storage upload.
CREATE FUNCTION public.attachment_browser_upload_allowed()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT NOT EXISTS (SELECT 1 FROM public.attachment_object_encryption_scope);
$$;
REVOKE ALL ON FUNCTION public.attachment_browser_upload_allowed()
  FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.attachment_browser_upload_allowed()
  TO authenticated;
CREATE POLICY attachment_encryption_direct_upload_block
  ON storage.objects AS RESTRICTIVE FOR INSERT TO authenticated
  WITH CHECK (bucket_id <> 'attachments' OR
    public.attachment_browser_upload_allowed());

CREATE FUNCTION public.guard_attachment_object_reference()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.attachment_object_encryption_scope) AND
      NEW.storage_path IS NOT NULL AND
      (TG_OP='INSERT' OR NEW.storage_path IS DISTINCT FROM OLD.storage_path) AND
      NOT EXISTS (SELECT 1 FROM public.attachment_object_encrypted e
        WHERE e.path=NEW.storage_path) THEN
    RAISE EXCEPTION 'attachment_object_requires_encryption'
      USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER attachments_object_reference_guard
  BEFORE INSERT OR UPDATE ON public.attachments
  FOR EACH ROW EXECUTE FUNCTION public.guard_attachment_object_reference();
CREATE TRIGGER page_files_object_reference_guard
  BEFORE INSERT OR UPDATE ON public.page_files
  FOR EACH ROW EXECUTE FUNCTION public.guard_attachment_object_reference();
REVOKE ALL ON FUNCTION public.guard_attachment_object_reference()
  FROM PUBLIC,anon,authenticated;

CREATE FUNCTION public.list_attachment_object_migration_candidates(p_limit integer)
RETURNS TABLE(name text) LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF p_limit < 1 OR p_limit > 100 THEN
    RAISE EXCEPTION 'invalid_attachment_object_batch' USING ERRCODE='22023';
  END IF;
  RETURN QUERY SELECT o.name FROM storage.objects o
    LEFT JOIN public.attachment_object_encrypted e ON e.path=o.name
    WHERE o.bucket_id='attachments' AND e.path IS NULL
    ORDER BY o.created_at,o.name LIMIT p_limit;
END;
$$;
REVOKE ALL ON FUNCTION public.list_attachment_object_migration_candidates(integer)
  FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.list_attachment_object_migration_candidates(integer)
  TO service_role;

-- The object is uploaded and registered first. Swap all SQL references and
-- install a blind alias under one database transaction; a failed swap leaves
-- the old object available and the new object eligible for orphan cleanup.
CREATE FUNCTION public.migrate_attachment_object_references(
  p_old_path text,p_new_path text,p_old_digest text
) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE existing_path text;
BEGIN
  IF p_old_path=p_new_path OR p_old_digest !~ '^[a-f0-9]{64}$' OR
      NOT EXISTS (SELECT 1 FROM public.attachment_object_encrypted
        WHERE path=p_new_path) THEN RETURN false; END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(p_old_path,59139));
  SELECT new_path INTO existing_path FROM public.attachment_object_aliases
    WHERE old_path_digest=p_old_digest FOR UPDATE;
  IF FOUND THEN RETURN existing_path=p_new_path; END IF;
  UPDATE public.attachments SET storage_path=p_new_path
    WHERE storage_path=p_old_path;
  UPDATE public.page_files SET storage_path=p_new_path
    WHERE storage_path=p_old_path;
  INSERT INTO public.attachment_object_aliases(old_path_digest,new_path)
    VALUES(p_old_digest,p_new_path);
  RETURN true;
END;
$$;
REVOKE ALL ON FUNCTION public.migrate_attachment_object_references(text,text,text)
  FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.migrate_attachment_object_references(text,text,text)
  TO service_role;

COMMIT;
