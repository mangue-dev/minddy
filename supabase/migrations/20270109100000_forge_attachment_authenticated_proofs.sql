-- Separate queue attempts from byte proofs and fence legacy cleanup references.
BEGIN;

ALTER TABLE public.forge_attachment_objects
  ADD COLUMN rotation_attempted_at timestamptz,
  ADD COLUMN verified_object_digest text CHECK (
    verified_object_digest IS NULL OR verified_object_digest ~ '^[a-f0-9]{64}$');
UPDATE public.forge_attachment_objects SET rotation_attempted_at = rotation_checked_at,
  rotation_checked_at = NULL;
DROP INDEX public.forge_attachment_objects_rotation;
CREATE INDEX forge_attachment_objects_rotation ON public.forge_attachment_objects
  (rotation_attempted_at NULLS FIRST, id);

CREATE FUNCTION public.guard_forge_attachment_object_proof()
RETURNS trigger LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    -- A restored historical proof does not authenticate separately restored bytes.
    NEW.rotation_checked_at := NULL;
    NEW.verified_object_digest := NULL;
  ELSIF (NEW.rotation_checked_at IS DISTINCT FROM OLD.rotation_checked_at OR
        NEW.verified_object_digest IS DISTINCT FROM OLD.verified_object_digest) AND
        (NEW.rotation_checked_at IS NOT NULL OR NEW.verified_object_digest IS NOT NULL) AND
        current_setting('minddy.forge_attachment_proof',true) IS DISTINCT FROM NEW.id::text THEN
    RAISE EXCEPTION 'forge_attachment_authenticated_proof_required' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER forge_attachment_authenticated_proof_required
  BEFORE INSERT OR UPDATE ON public.forge_attachment_objects
  FOR EACH ROW EXECUTE FUNCTION public.guard_forge_attachment_object_proof();
REVOKE ALL ON FUNCTION public.guard_forge_attachment_object_proof()
  FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.list_forge_attachment_rotation_candidates(p_limit integer)
RETURNS TABLE(id uuid, project_id uuid, storage_path text,
  content_key_version integer, format_version integer)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF p_limit < 1 OR p_limit > 100 THEN
    RAISE EXCEPTION 'invalid_forge_rotation_batch' USING ERRCODE = '22023';
  END IF;
  RETURN QUERY SELECT f.id, f.project_id, f.storage_path,
    f.content_key_version, f.format_version FROM public.forge_attachment_objects f
    ORDER BY f.rotation_attempted_at NULLS FIRST, f.id LIMIT p_limit;
END;
$$;

-- Compatibility calls from an older worker are attempts, never successful proof.
CREATE OR REPLACE FUNCTION public.mark_forge_attachment_rotation_checked(
  p_id uuid, p_expected_path text, p_expected_version integer)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  UPDATE public.forge_attachment_objects SET rotation_attempted_at = clock_timestamp(),
      rotation_checked_at = NULL, verified_object_digest = NULL
    WHERE id = p_id;
  RETURN FOUND;
END;
$$;

CREATE FUNCTION public.verify_forge_attachment_object(
  p_id uuid, p_expected_path text, p_expected_version integer, p_object_digest text)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF p_object_digest IS NULL OR p_object_digest !~ '^[a-f0-9]{64}$' THEN RETURN false; END IF;
  PERFORM set_config('minddy.forge_attachment_proof',p_id::text,true);
  UPDATE public.forge_attachment_objects f
    SET rotation_checked_at = clock_timestamp(), verified_object_digest = p_object_digest
    WHERE f.id = p_id AND f.storage_path = p_expected_path
      AND f.content_key_version = p_expected_version AND f.format_version >= 4
      AND EXISTS (SELECT 1 FROM storage.objects o WHERE o.bucket_id = 'forge-attachments'
        AND o.name = p_expected_path AND o.user_metadata->>'minddy_encrypted' = 'true');
  IF FOUND THEN
    PERFORM set_config('minddy.forge_attachment_proof','',true);
    RETURN true;
  END IF;
  PERFORM set_config('minddy.forge_attachment_proof','',true);
  RETURN false;
END;
$$;
REVOKE ALL ON FUNCTION public.verify_forge_attachment_object(uuid,text,integer,text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.verify_forge_attachment_object(uuid,text,integer,text)
  TO service_role;

CREATE FUNCTION public.verify_forge_attachment_legacy_cleanup(
  p_digest text, p_expected_path text, p_pr_id uuid, p_project_id uuid,
  p_version integer, p_object_digest text)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE object_id uuid;
BEGIN
  SELECT f.id INTO object_id FROM public.forge_attachment_objects f
    WHERE f.legacy_path_digest = p_digest AND f.storage_path = p_expected_path
      AND f.pr_id = p_pr_id AND f.project_id = p_project_id
      AND f.content_key_version = p_version
      AND EXISTS (SELECT 1 FROM storage.objects o WHERE o.bucket_id = 'forge-attachments'
        AND encode(extensions.digest(o.name,'sha256'),'hex') = p_digest)
    FOR UPDATE;
  IF object_id IS NULL THEN RETURN false; END IF;
  RETURN public.verify_forge_attachment_object(object_id,p_expected_path,p_version,p_object_digest);
END;
$$;
REVOKE ALL ON FUNCTION public.verify_forge_attachment_legacy_cleanup(text,text,uuid,uuid,integer,text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.verify_forge_attachment_legacy_cleanup(text,text,uuid,uuid,integer,text)
  TO service_role;

REVOKE DELETE ON public.forge_attachment_objects FROM service_role;
CREATE OR REPLACE FUNCTION public.delete_abandoned_forge_attachment(p_id uuid, p_expected_path text)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  DELETE FROM public.forge_attachment_objects f
    WHERE f.id = p_id AND f.storage_path = p_expected_path
      AND f.published_at IS NULL AND f.pending_publication_claims = 0
      AND f.created_at < now() - interval '30 days'
      AND NOT EXISTS (SELECT 1 FROM storage.objects legacy WHERE legacy.bucket_id = 'forge-attachments'
        AND encode(extensions.digest(legacy.name,'sha256'),'hex') = f.legacy_path_digest);
  RETURN FOUND;
END;
$$;

CREATE OR REPLACE FUNCTION public.rotate_forge_attachment_reference(
  p_id uuid, p_expected_path text, p_new_path text,
  p_expected_version integer, p_new_version integer)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF p_new_version <= p_expected_version OR p_new_path = p_expected_path OR
      NOT EXISTS (SELECT 1 FROM storage.objects WHERE bucket_id = 'forge-attachments'
        AND name = p_new_path AND user_metadata->>'minddy_encrypted' = 'true') THEN RETURN false; END IF;
  -- The remaining legacy object is a durable cleanup reservation. A crash/retry
  -- keeps its replacement fixed until Storage has acknowledged source removal.
  PERFORM 1 FROM public.forge_attachment_objects f WHERE f.id = p_id FOR UPDATE;
  IF EXISTS (SELECT 1 FROM public.forge_attachment_objects f
      JOIN storage.objects o ON o.bucket_id = 'forge-attachments'
        AND encode(extensions.digest(o.name,'sha256'),'hex') = f.legacy_path_digest
      WHERE f.id = p_id) THEN RETURN false; END IF;
  UPDATE public.forge_attachment_objects
    SET storage_path = p_new_path, content_key_version = p_new_version,
      rotation_checked_at = NULL, verified_object_digest = NULL
    WHERE id = p_id AND storage_path = p_expected_path
      AND content_key_version = p_expected_version;
  RETURN FOUND;
END;
$$;

CREATE FUNCTION public.invalidate_forge_attachment_object_proof()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF OLD.bucket_id = 'forge-attachments' THEN
    UPDATE public.forge_attachment_objects SET rotation_checked_at = NULL,
      verified_object_digest = NULL WHERE storage_path = OLD.name;
  END IF;
  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END;
$$;
CREATE TRIGGER forge_attachment_object_proof_invalidated
  AFTER UPDATE OR DELETE ON storage.objects FOR EACH ROW
  EXECUTE FUNCTION public.invalidate_forge_attachment_object_proof();
REVOKE ALL ON FUNCTION public.invalidate_forge_attachment_object_proof()
  FROM PUBLIC, anon, authenticated, service_role;

CREATE FUNCTION public.guard_forge_attachment_cleanup_replacement()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF OLD.bucket_id = 'forge-attachments' AND EXISTS (
      SELECT 1 FROM public.forge_attachment_objects f JOIN storage.objects legacy
        ON legacy.bucket_id = 'forge-attachments'
          AND encode(extensions.digest(legacy.name,'sha256'),'hex') = f.legacy_path_digest
      WHERE f.storage_path = OLD.name) THEN
    RAISE EXCEPTION 'forge_attachment_cleanup_replacement_reserved' USING ERRCODE = '23514';
  END IF;
  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END;
$$;
CREATE TRIGGER forge_attachment_cleanup_replacement_reserved
  BEFORE UPDATE OR DELETE ON storage.objects FOR EACH ROW
  EXECUTE FUNCTION public.guard_forge_attachment_cleanup_replacement();
REVOKE ALL ON FUNCTION public.guard_forge_attachment_cleanup_replacement()
  FROM PUBLIC, anon, authenticated, service_role;

-- SQL validates metadata and an application proof. The read-only application
-- readiness scan must also authenticate current bytes under quiescent writers.
CREATE OR REPLACE FUNCTION public.forge_attachment_migration_complete()
RETURNS boolean LANGUAGE sql SECURITY DEFINER SET search_path = '' AS $$
  SELECT EXISTS (SELECT 1 FROM public.forge_attachment_encryption_scope)
    AND EXISTS (SELECT 1 FROM storage.buckets b WHERE b.id = 'forge-attachments' AND b.public = false)
    AND NOT EXISTS (SELECT 1 FROM storage.objects o WHERE o.bucket_id = 'forge-attachments'
      AND (o.name !~ '^projects/[0-9a-f-]{36}/forge/[0-9a-f-]{36}/[0-9a-f-]{36}$'
        OR o.user_metadata->>'minddy_encrypted' IS DISTINCT FROM 'true'
        OR NOT EXISTS (SELECT 1 FROM public.forge_attachment_objects f WHERE f.storage_path = o.name)))
    AND NOT EXISTS (SELECT 1 FROM public.forge_attachment_objects f
      WHERE f.rotation_checked_at IS NULL OR f.verified_object_digest IS NULL
        OR NOT EXISTS (SELECT 1 FROM storage.objects o
          WHERE o.bucket_id = 'forge-attachments' AND o.name = f.storage_path));
$$;
COMMIT;
