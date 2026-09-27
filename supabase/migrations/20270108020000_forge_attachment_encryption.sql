BEGIN;

INSERT INTO storage.buckets(id,name,public,file_size_limit)
  VALUES('forge-attachments','forge-attachments',false,33554432)
  ON CONFLICT (id) DO UPDATE SET public=false,file_size_limit=33554432;

CREATE TABLE public.forge_attachment_encryption_scope (
  id boolean PRIMARY KEY DEFAULT true CHECK (id),
  activated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.forge_attachment_encryption_scope ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.forge_attachment_encryption_scope FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.forge_attachment_encryption_scope TO service_role;

CREATE FUNCTION public.guard_forge_attachment_object_path()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF NEW.bucket_id = 'forge-attachments' AND
      EXISTS (SELECT 1 FROM public.forge_attachment_encryption_scope) AND
      (NEW.name !~ '^projects/[0-9a-f-]{36}/forge/[0-9a-f-]{36}/[0-9a-f-]{36}$' OR
       NEW.user_metadata->>'minddy_encrypted' IS DISTINCT FROM 'true') THEN
    RAISE EXCEPTION 'forge_attachment_legacy_writer_refused' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER forge_attachment_object_path_guard
  BEFORE INSERT OR UPDATE ON storage.objects
  FOR EACH ROW EXECUTE FUNCTION public.guard_forge_attachment_object_path();
REVOKE ALL ON FUNCTION public.guard_forge_attachment_object_path()
  FROM PUBLIC, anon, authenticated;

CREATE TABLE public.forge_attachment_objects (
  id uuid PRIMARY KEY,
  pr_id uuid NOT NULL REFERENCES public.pull_requests(id) ON DELETE CASCADE,
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  storage_path text NOT NULL UNIQUE,
  legacy_path_digest text UNIQUE,
  content_key_version integer NOT NULL CHECK (content_key_version > 0),
  format_version integer NOT NULL CHECK (format_version >= 4),
  created_at timestamptz NOT NULL DEFAULT now(),
  published_at timestamptz,
  pending_publication_claims integer NOT NULL DEFAULT 0
    CHECK (pending_publication_claims >= 0),
  rotation_checked_at timestamptz,
  CHECK (storage_path ~ ('^projects/' || project_id::text ||
    '/forge/' || id::text || '/[0-9a-f-]{36}$')),
  CHECK (legacy_path_digest IS NULL OR legacy_path_digest ~ '^[a-f0-9]{64}$')
);
CREATE INDEX forge_attachment_objects_pr_id ON public.forge_attachment_objects(pr_id);
CREATE INDEX forge_attachment_objects_abandoned
  ON public.forge_attachment_objects(created_at) WHERE published_at IS NULL;
CREATE INDEX forge_attachment_objects_rotation
  ON public.forge_attachment_objects(rotation_checked_at NULLS FIRST, id);
CREATE TABLE public.forge_attachment_migration_attempts (
  old_path_digest text PRIMARY KEY CHECK (old_path_digest ~ '^[a-f0-9]{64}$'),
  attempted_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.forge_attachment_legacy_owners (
  old_path_digest text PRIMARY KEY CHECK (old_path_digest ~ '^[a-f0-9]{64}$'),
  pr_id uuid NOT NULL REFERENCES public.pull_requests(id) ON DELETE CASCADE,
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.forge_attachment_objects ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.forge_attachment_migration_attempts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.forge_attachment_legacy_owners ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.forge_attachment_objects FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.forge_attachment_migration_attempts FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.forge_attachment_legacy_owners FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, DELETE ON public.forge_attachment_objects TO service_role;
GRANT ALL ON public.forge_attachment_migration_attempts TO service_role;
GRANT SELECT, INSERT, DELETE ON public.forge_attachment_legacy_owners TO service_role;

CREATE FUNCTION public.guard_forge_attachment_legacy_owner()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.pull_requests p JOIN public.project_git_links l
      ON l.provider = p.provider AND l.repo_full_name = p.repo_full_name
    WHERE p.id = NEW.pr_id AND l.project_id = NEW.project_id
  ) THEN
    RAISE EXCEPTION 'forge_attachment_project_binding_invalid' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER forge_attachment_legacy_owner_guard
  BEFORE INSERT ON public.forge_attachment_legacy_owners
  FOR EACH ROW EXECUTE FUNCTION public.guard_forge_attachment_legacy_owner();
REVOKE ALL ON FUNCTION public.guard_forge_attachment_legacy_owner()
  FROM PUBLIC, anon, authenticated;

CREATE FUNCTION public.guard_forge_attachment_registration()
RETURNS trigger LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND (NEW.id IS DISTINCT FROM OLD.id OR
      NEW.pr_id IS DISTINCT FROM OLD.pr_id OR
      NEW.project_id IS DISTINCT FROM OLD.project_id OR
      NEW.legacy_path_digest IS DISTINCT FROM OLD.legacy_path_digest OR
      NEW.format_version < OLD.format_version OR
      NEW.content_key_version < OLD.content_key_version OR
      (NEW.storage_path IS DISTINCT FROM OLD.storage_path AND
        NEW.content_key_version <= OLD.content_key_version)) THEN
    RAISE EXCEPTION 'forge_attachment_registration_immutable' USING ERRCODE = '23514';
  END IF;
  IF TG_OP = 'INSERT' AND NOT EXISTS (
    SELECT 1 FROM public.pull_requests p JOIN public.project_git_links l
      ON l.provider = p.provider AND l.repo_full_name = p.repo_full_name
    WHERE p.id = NEW.pr_id AND l.project_id = NEW.project_id
  ) THEN
    RAISE EXCEPTION 'forge_attachment_project_binding_invalid' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER forge_attachment_registration_guard
  BEFORE INSERT OR UPDATE ON public.forge_attachment_objects
  FOR EACH ROW EXECUTE FUNCTION public.guard_forge_attachment_registration();
REVOKE ALL ON FUNCTION public.guard_forge_attachment_registration()
  FROM PUBLIC, anon, authenticated;

CREATE FUNCTION public.list_forge_attachment_migration_candidates(p_limit integer)
RETURNS TABLE(name text, pr_id uuid, project_id uuid, migrated_path text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF p_limit < 1 OR p_limit > 100 THEN
    RAISE EXCEPTION 'invalid_forge_attachment_batch' USING ERRCODE='22023';
  END IF;
  RETURN QUERY SELECT o.name, p.id, l.project_id, f.storage_path FROM storage.objects o
    JOIN public.pull_requests p ON p.id::text = split_part(o.name, '/', 1)
    LEFT JOIN public.forge_attachment_legacy_owners binding
      ON binding.old_path_digest = encode(extensions.digest(o.name, 'sha256'), 'hex')
      AND binding.pr_id = p.id
    JOIN LATERAL (
      SELECT (array_agg(DISTINCT g.project_id))[1] AS project_id
        FROM public.project_git_links g
      WHERE g.provider = p.provider AND g.repo_full_name = p.repo_full_name
        AND (binding.project_id IS NULL OR g.project_id = binding.project_id)
      HAVING count(DISTINCT g.project_id) = 1
    ) l ON true
    LEFT JOIN public.forge_attachment_objects f
      ON f.legacy_path_digest = encode(extensions.digest(o.name, 'sha256'), 'hex')
    LEFT JOIN public.forge_attachment_migration_attempts a
      ON a.old_path_digest = encode(extensions.digest(o.name, 'sha256'), 'hex')
    WHERE o.bucket_id = 'forge-attachments'
      AND o.name ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}/[^/]+$'
    ORDER BY a.attempted_at NULLS FIRST, o.created_at, o.name LIMIT p_limit;
END;
$$;
REVOKE ALL ON FUNCTION public.list_forge_attachment_migration_candidates(integer)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.list_forge_attachment_migration_candidates(integer)
  TO service_role;

CREATE FUNCTION public.reserve_forge_attachment_publications(p_pr_id uuid, p_ids uuid[])
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE found_count integer;
BEGIN
  UPDATE public.forge_attachment_objects
    SET pending_publication_claims = pending_publication_claims + 1
    WHERE pr_id = p_pr_id AND id = ANY(p_ids);
  GET DIAGNOSTICS found_count = ROW_COUNT;
  IF found_count <> cardinality(p_ids) THEN
    RAISE EXCEPTION 'forge_attachment_capability_missing' USING ERRCODE='23514';
  END IF;
  RETURN found_count;
END;
$$;
REVOKE ALL ON FUNCTION public.reserve_forge_attachment_publications(uuid, uuid[])
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reserve_forge_attachment_publications(uuid, uuid[])
  TO service_role;

CREATE FUNCTION public.finish_forge_attachment_publications(
  p_pr_id uuid,p_ids uuid[],p_published boolean)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE changed integer;
BEGIN
  UPDATE public.forge_attachment_objects
    SET pending_publication_claims = pending_publication_claims - 1,
      published_at = CASE WHEN p_published THEN coalesce(published_at,now())
        ELSE published_at END
    WHERE pr_id = p_pr_id AND id = ANY(p_ids)
      AND pending_publication_claims > 0;
  GET DIAGNOSTICS changed = ROW_COUNT;
  RETURN changed;
END;
$$;
REVOKE ALL ON FUNCTION public.finish_forge_attachment_publications(uuid,uuid[],boolean)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.finish_forge_attachment_publications(uuid,uuid[],boolean)
  TO service_role;

CREATE FUNCTION public.delete_abandoned_forge_attachment(p_id uuid, p_expected_path text)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  DELETE FROM public.forge_attachment_objects
    WHERE id = p_id AND storage_path = p_expected_path
      AND published_at IS NULL AND pending_publication_claims = 0
      AND created_at < now() - interval '30 days';
  RETURN FOUND;
END;
$$;
REVOKE ALL ON FUNCTION public.delete_abandoned_forge_attachment(uuid,text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.delete_abandoned_forge_attachment(uuid,text)
  TO service_role;

CREATE FUNCTION public.list_forge_attachment_rotation_candidates(p_limit integer)
RETURNS TABLE(id uuid, project_id uuid, storage_path text,
  content_key_version integer, format_version integer)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF p_limit < 1 OR p_limit > 100 THEN
    RAISE EXCEPTION 'invalid_forge_rotation_batch' USING ERRCODE = '22023';
  END IF;
  RETURN QUERY SELECT f.id, f.project_id, f.storage_path,
    f.content_key_version, f.format_version
    FROM public.forge_attachment_objects f
    ORDER BY f.rotation_checked_at NULLS FIRST, f.id LIMIT p_limit;
END;
$$;
REVOKE ALL ON FUNCTION public.list_forge_attachment_rotation_candidates(integer)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.list_forge_attachment_rotation_candidates(integer)
  TO service_role;

CREATE FUNCTION public.mark_forge_attachment_rotation_checked(
  p_id uuid, p_expected_path text, p_expected_version integer)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  UPDATE public.forge_attachment_objects SET rotation_checked_at = now()
    WHERE id = p_id AND storage_path = p_expected_path
      AND content_key_version = p_expected_version;
  RETURN FOUND;
END;
$$;
REVOKE ALL ON FUNCTION public.mark_forge_attachment_rotation_checked(uuid,text,integer)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.mark_forge_attachment_rotation_checked(uuid,text,integer)
  TO service_role;

CREATE FUNCTION public.rotate_forge_attachment_reference(
  p_id uuid, p_expected_path text, p_new_path text,
  p_expected_version integer, p_new_version integer)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF p_new_version <= p_expected_version OR p_new_path = p_expected_path OR
      NOT EXISTS (SELECT 1 FROM storage.objects WHERE
        bucket_id = 'forge-attachments' AND name = p_new_path) THEN
    RETURN false;
  END IF;
  UPDATE public.forge_attachment_objects
    SET storage_path = p_new_path, content_key_version = p_new_version,
      rotation_checked_at = now()
    WHERE id = p_id AND storage_path = p_expected_path
      AND content_key_version = p_expected_version;
  RETURN FOUND;
END;
$$;
REVOKE ALL ON FUNCTION public.rotate_forge_attachment_reference(uuid,text,text,integer,integer)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.rotate_forge_attachment_reference(uuid,text,text,integer,integer)
  TO service_role;

CREATE FUNCTION public.list_forge_attachment_orphans(p_limit integer)
RETURNS TABLE(name text) LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF p_limit < 1 OR p_limit > 100 THEN
    RAISE EXCEPTION 'invalid_forge_orphan_batch' USING ERRCODE = '22023';
  END IF;
  RETURN QUERY SELECT o.name FROM storage.objects o
    LEFT JOIN public.forge_attachment_objects f ON f.storage_path = o.name
    WHERE o.bucket_id = 'forge-attachments'
      AND o.name ~ '^projects/[0-9a-f-]{36}/forge/[0-9a-f-]{36}/[0-9a-f-]{36}$'
      AND o.created_at < now() - interval '1 hour' AND f.id IS NULL
    ORDER BY o.created_at, o.name LIMIT p_limit;
END;
$$;
REVOKE ALL ON FUNCTION public.list_forge_attachment_orphans(integer)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.list_forge_attachment_orphans(integer)
  TO service_role;

-- Verify the private bucket has no historical clear object before activation.
CREATE FUNCTION public.forge_attachment_migration_complete()
RETURNS boolean LANGUAGE sql SECURITY DEFINER SET search_path = '' AS $$
  SELECT EXISTS (SELECT 1 FROM storage.buckets b
      WHERE b.id = 'forge-attachments' AND b.public = false)
    AND NOT EXISTS (
      SELECT 1 FROM storage.objects o WHERE o.bucket_id = 'forge-attachments'
        AND (o.name !~ '^projects/[0-9a-f-]{36}/forge/[0-9a-f-]{36}/[0-9a-f-]{36}$'
          OR NOT EXISTS (SELECT 1 FROM public.forge_attachment_objects f
            WHERE f.storage_path = o.name))
    )
    AND NOT EXISTS (
      SELECT 1 FROM public.forge_attachment_objects f
      WHERE NOT EXISTS (SELECT 1 FROM storage.objects o
        WHERE o.bucket_id = 'forge-attachments' AND o.name = f.storage_path)
    );
$$;
REVOKE ALL ON FUNCTION public.forge_attachment_migration_complete()
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.forge_attachment_migration_complete()
  TO service_role;

COMMIT;
