-- MIN-591: private project icon references and object activation.
BEGIN;
ALTER TABLE public.projects
  ADD COLUMN icon_storage_path text,
  ADD COLUMN icon_checked_at timestamptz;
CREATE POLICY project_icons_private_select ON storage.objects
  AS RESTRICTIVE FOR SELECT TO authenticated
  USING (bucket_id <> 'project-icons');
CREATE POLICY project_icons_private_insert ON storage.objects
  AS RESTRICTIVE FOR INSERT TO authenticated
  WITH CHECK (bucket_id <> 'project-icons');
CREATE POLICY project_icons_private_update ON storage.objects
  AS RESTRICTIVE FOR UPDATE TO authenticated
  USING (bucket_id <> 'project-icons')
  WITH CHECK (bucket_id <> 'project-icons');
CREATE INDEX projects_icon_migration_queue
  ON public.projects(icon_checked_at NULLS FIRST,id)
  WHERE icon_url IS NOT NULL;

CREATE TABLE public.project_icon_encrypted_objects(
  path text PRIMARY KEY,
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  verified_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT project_icon_opaque_path CHECK
    (path ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}\.enc$')
);
ALTER TABLE public.project_icon_encrypted_objects ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.project_icon_encrypted_objects FROM PUBLIC,anon,authenticated;
GRANT ALL ON public.project_icon_encrypted_objects TO service_role;

CREATE TABLE public.project_icon_encryption_scope(
  id boolean PRIMARY KEY DEFAULT true CHECK(id),
  activated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.project_icon_encryption_scope ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.project_icon_encryption_scope FROM PUBLIC,anon,authenticated;
GRANT ALL ON public.project_icon_encryption_scope TO service_role;

CREATE FUNCTION public.guard_private_project_icon_storage()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
  IF NEW.bucket_id <> 'project-icons' THEN RETURN NEW; END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('project-icon-activation',591));
  IF EXISTS(SELECT 1 FROM public.project_icon_encryption_scope) AND
      NEW.name !~ '^[0-9a-f-]{36}/[0-9a-f-]{36}\.enc$' THEN
    RAISE EXCEPTION 'project_icon_legacy_object_refused' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER private_project_icon_storage_guard
  BEFORE INSERT OR UPDATE OF bucket_id,name ON storage.objects
  FOR EACH ROW EXECUTE FUNCTION public.guard_private_project_icon_storage();
REVOKE ALL ON FUNCTION public.guard_private_project_icon_storage()
  FROM PUBLIC,anon,authenticated;

CREATE FUNCTION public.guard_project_icon_reference()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE protected boolean;
BEGIN
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('project-icon-activation',591));
  protected := NEW.icon_url IS NOT NULL AND
    NEW.icon_storage_path ~ ('^'||NEW.id::text||'/[0-9a-f-]{36}\.enc$') AND
    NEW.icon_url ~ ('^/api/projects/'||NEW.id::text||'/icon/content[?]v=[0-9]+$') AND
    EXISTS(SELECT 1 FROM public.project_icon_encrypted_objects o
      WHERE o.path=NEW.icon_storage_path AND o.project_id=NEW.id) AND
    EXISTS(SELECT 1 FROM storage.objects o WHERE o.bucket_id='project-icons'
      AND o.name=NEW.icon_storage_path);
  IF NEW.icon_url IS NULL AND NEW.icon_storage_path IS NOT NULL THEN
    RAISE EXCEPTION 'project_icon_orphan_reference' USING ERRCODE='23514';
  END IF;
  IF TG_OP='UPDATE' THEN
    IF NEW.id IS DISTINCT FROM OLD.id AND
        (OLD.icon_storage_path IS NOT NULL OR NEW.icon_storage_path IS NOT NULL) THEN
      RAISE EXCEPTION 'project_icon_scope_immutable' USING ERRCODE='23514';
    END IF;
    IF OLD.icon_storage_path IS NOT NULL AND NEW.icon_url IS NOT NULL AND
        NOT protected THEN
      RAISE EXCEPTION 'project_icon_downgrade' USING ERRCODE='23514';
    END IF;
  END IF;
  IF NEW.icon_url IS NOT NULL AND NOT protected AND
      EXISTS(SELECT 1 FROM public.project_icon_encryption_scope) THEN
    RAISE EXCEPTION 'project_icon_requires_encryption' USING ERRCODE='23514';
  END IF;
  IF protected AND (TG_OP='INSERT' OR
      NEW.icon_url IS DISTINCT FROM OLD.icon_url OR
      NEW.icon_storage_path IS DISTINCT FROM OLD.icon_storage_path) THEN
    NEW.icon_checked_at:=clock_timestamp();
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER project_icon_reference_guard BEFORE INSERT OR UPDATE
  ON public.projects FOR EACH ROW
  EXECUTE FUNCTION public.guard_project_icon_reference();
REVOKE ALL ON FUNCTION public.guard_project_icon_reference()
  FROM PUBLIC,anon,authenticated;

CREATE FUNCTION public.replace_project_icon(p_id uuid,p_old_url text,
  p_old_path text,p_new_url text,p_new_path text)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE changed integer;
BEGIN
  UPDATE public.projects SET icon_url=p_new_url,
    icon_storage_path=p_new_path,
    icon_checked_at=CASE WHEN p_new_path IS NULL THEN NULL
      ELSE clock_timestamp() END
  WHERE id=p_id AND icon_url IS NOT DISTINCT FROM p_old_url
    AND icon_storage_path IS NOT DISTINCT FROM p_old_path;
  GET DIAGNOSTICS changed=ROW_COUNT;
  RETURN changed=1;
END;
$$;
REVOKE ALL ON FUNCTION public.replace_project_icon(uuid,text,text,text,text)
  FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.replace_project_icon(uuid,text,text,text,text)
  TO service_role;

CREATE FUNCTION public.verify_project_icon(p_id uuid,p_url text,p_path text)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE changed integer;
BEGIN
  UPDATE public.projects SET icon_checked_at=clock_timestamp()
  WHERE id=p_id AND icon_url=p_url AND icon_storage_path=p_path;
  GET DIAGNOSTICS changed=ROW_COUNT;
  RETURN changed=1;
END;
$$;
REVOKE ALL ON FUNCTION public.verify_project_icon(uuid,text,text)
  FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.verify_project_icon(uuid,text,text)
  TO service_role;

CREATE FUNCTION public.activate_private_project_icons()
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('project-icon-activation',591));
  IF EXISTS(SELECT 1 FROM public.projects p WHERE p.icon_url IS NOT NULL AND
      (p.icon_checked_at IS NULL OR p.icon_storage_path IS NULL OR
       p.icon_url !~ ('^/api/projects/'||p.id::text||'/icon/content[?]v=[0-9]+$') OR
       NOT EXISTS(SELECT 1 FROM public.project_icon_encrypted_objects o
         WHERE o.path=p.icon_storage_path AND o.project_id=p.id) OR
       NOT EXISTS(SELECT 1 FROM storage.objects o
         WHERE o.bucket_id='project-icons' AND o.name=p.icon_storage_path))) OR
     EXISTS(SELECT 1 FROM storage.objects o WHERE o.bucket_id='project-icons'
       AND NOT EXISTS(SELECT 1 FROM public.project_icon_encrypted_objects e
         WHERE e.path=o.name)) THEN
    RETURN false;
  END IF;
  INSERT INTO public.project_icon_encryption_scope(id) VALUES(true)
    ON CONFLICT DO NOTHING;
  UPDATE storage.buckets SET public=false WHERE id='project-icons';
  RETURN true;
END;
$$;
REVOKE ALL ON FUNCTION public.activate_private_project_icons()
  FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.activate_private_project_icons()
  TO service_role;

CREATE FUNCTION public.list_orphan_project_icon_objects(p_limit integer)
RETURNS TABLE(name text) LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
  IF p_limit < 1 OR p_limit > 100 THEN
    RAISE EXCEPTION 'invalid_project_icon_batch' USING ERRCODE='22023';
  END IF;
  RETURN QUERY SELECT o.name FROM storage.objects o
  WHERE o.bucket_id='project-icons' AND
    NOT EXISTS(SELECT 1 FROM public.project_icon_encrypted_objects e
      WHERE e.path=o.name) AND
    NOT EXISTS(SELECT 1 FROM public.projects p
      WHERE p.icon_url IS NOT NULL AND p.icon_storage_path IS NULL AND
        o.name LIKE (p.id::text||'.%'))
  ORDER BY o.name LIMIT p_limit;
END;
$$;
REVOKE ALL ON FUNCTION public.list_orphan_project_icon_objects(integer)
  FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.list_orphan_project_icon_objects(integer)
  TO service_role;
COMMIT;
