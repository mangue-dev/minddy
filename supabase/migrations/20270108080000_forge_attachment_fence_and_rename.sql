-- Keep the attachment writer fence and PR bindings durable across maintenance.
BEGIN;

CREATE OR REPLACE FUNCTION public.guard_forge_attachment_object_path()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF NEW.bucket_id = 'forge-attachments' OR
      (TG_OP = 'UPDATE' AND OLD.bucket_id = 'forge-attachments') THEN
    IF current_setting('transaction_isolation') <> 'read committed' THEN
      RAISE EXCEPTION 'forge_attachment_writer_requires_read_committed'
        USING ERRCODE = '25001';
    END IF;
    PERFORM pg_catalog.pg_advisory_xact_lock(
      pg_catalog.hashtextextended('forge-attachment-writer-fence', 591));
    IF TG_OP = 'UPDATE' AND OLD.bucket_id = 'forge-attachments' AND
        NEW.bucket_id IS DISTINCT FROM OLD.bucket_id THEN
      RAISE EXCEPTION 'forge_attachment_bucket_immutable' USING ERRCODE = '23514';
    END IF;
    IF EXISTS (SELECT 1 FROM public.forge_attachment_encryption_scope) AND
        (NEW.name !~ '^projects/[0-9a-f-]{36}/forge/[0-9a-f-]{36}/[0-9a-f-]{36}$' OR
         NEW.user_metadata->>'minddy_encrypted' IS DISTINCT FROM 'true') THEN
      RAISE EXCEPTION 'forge_attachment_legacy_writer_refused' USING ERRCODE = '23514';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON public.forge_attachment_encryption_scope FROM service_role;
GRANT SELECT ON public.forge_attachment_encryption_scope TO service_role;
REVOKE UPDATE ON public.forge_attachment_objects FROM service_role;
REVOKE UPDATE ON public.forge_attachment_legacy_owners FROM service_role;

CREATE FUNCTION public.activate_forge_attachment_encryption()
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('forge-attachment-writer-fence', 591));
  INSERT INTO public.forge_attachment_encryption_scope(id)
    VALUES (true) ON CONFLICT (id) DO NOTHING;
  RETURN true;
END;
$$;
REVOKE ALL ON FUNCTION public.activate_forge_attachment_encryption()
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.activate_forge_attachment_encryption()
  TO service_role;

CREATE OR REPLACE FUNCTION public.forge_attachment_migration_complete()
RETURNS boolean LANGUAGE sql SECURITY DEFINER SET search_path = '' AS $$
  SELECT EXISTS (SELECT 1 FROM public.forge_attachment_encryption_scope)
    AND EXISTS (SELECT 1 FROM storage.buckets b
      WHERE b.id = 'forge-attachments' AND b.public = false)
    AND NOT EXISTS (
      SELECT 1 FROM storage.objects o WHERE o.bucket_id = 'forge-attachments'
        AND (o.name !~ '^projects/[0-9a-f-]{36}/forge/[0-9a-f-]{36}/[0-9a-f-]{36}$'
          OR o.user_metadata->>'minddy_encrypted' IS DISTINCT FROM 'true'
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

-- Old paths embed the original PR id. Preserve that lookup after twin collapse.
CREATE TABLE public.forge_attachment_legacy_pr_aliases (
  old_pr_id uuid PRIMARY KEY,
  current_pr_id uuid NOT NULL REFERENCES public.pull_requests(id) ON DELETE CASCADE
);
ALTER TABLE public.forge_attachment_legacy_pr_aliases ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.forge_attachment_legacy_pr_aliases
  FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT ON public.forge_attachment_legacy_pr_aliases TO service_role;

CREATE OR REPLACE FUNCTION public.guard_forge_attachment_registration()
RETURNS trigger LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND (NEW.id IS DISTINCT FROM OLD.id OR
      (NEW.pr_id IS DISTINCT FROM OLD.pr_id AND
       current_setting('minddy.forge_attachment_merge', true) IS DISTINCT FROM
         OLD.pr_id::text || ':' || NEW.pr_id::text) OR
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

CREATE FUNCTION public.merge_forge_pull_request(
  p_old uuid, p_new uuid, p_external_repo_id text)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE old_pr public.pull_requests; new_pr public.pull_requests;
  prior_context text;
BEGIN
  IF p_old = p_new OR p_external_repo_id IS NULL THEN
    RAISE EXCEPTION 'forge_pr_merge_invalid' USING ERRCODE = '22023';
  END IF;
  SELECT * INTO old_pr FROM public.pull_requests WHERE id = p_old FOR UPDATE;
  SELECT * INTO new_pr FROM public.pull_requests WHERE id = p_new FOR UPDATE;
  IF old_pr.id IS NULL OR new_pr.id IS NULL OR
      old_pr.provider IS DISTINCT FROM new_pr.provider OR
      old_pr.number IS DISTINCT FROM new_pr.number OR
      old_pr.repo_full_name IS NOT DISTINCT FROM new_pr.repo_full_name OR
      NOT EXISTS (SELECT 1 FROM public.project_git_links l WHERE
        l.provider = old_pr.provider AND l.repo_full_name = old_pr.repo_full_name
        AND l.external_repo_id = p_external_repo_id) OR
      EXISTS (SELECT 1 FROM public.project_git_links l WHERE
        l.provider = new_pr.provider AND l.repo_full_name = new_pr.repo_full_name
        AND l.external_repo_id IS DISTINCT FROM p_external_repo_id) OR
      EXISTS (SELECT 1 FROM public.forge_attachment_objects f WHERE
        f.pr_id = p_old AND NOT EXISTS (
          SELECT 1 FROM public.project_git_links l WHERE
            l.provider = old_pr.provider AND l.repo_full_name = old_pr.repo_full_name
            AND l.external_repo_id = p_external_repo_id
            AND l.project_id = f.project_id)) OR
      EXISTS (SELECT 1 FROM public.forge_attachment_legacy_owners owner WHERE
        owner.pr_id = p_old AND NOT EXISTS (
          SELECT 1 FROM public.project_git_links l WHERE
            l.provider = old_pr.provider AND l.repo_full_name = old_pr.repo_full_name
            AND l.external_repo_id = p_external_repo_id
            AND l.project_id = owner.project_id)) THEN
    RAISE EXCEPTION 'forge_pr_merge_binding_invalid' USING ERRCODE = '23514';
  END IF;
  IF new_pr.issue_id IS NULL AND old_pr.issue_id IS NOT NULL THEN
    UPDATE public.pull_requests SET issue_id = old_pr.issue_id WHERE id = p_new;
  END IF;
  prior_context := current_setting('minddy.forge_attachment_merge', true);
  PERFORM set_config('minddy.forge_attachment_merge',
    p_old::text || ':' || p_new::text, true);
  UPDATE public.forge_attachment_objects SET pr_id = p_new WHERE pr_id = p_old;
  PERFORM set_config('minddy.forge_attachment_merge', coalesce(prior_context, ''), true);
  UPDATE public.forge_attachment_legacy_owners SET pr_id = p_new WHERE pr_id = p_old;
  UPDATE public.forge_attachment_legacy_pr_aliases SET current_pr_id = p_new
    WHERE current_pr_id = p_old;
  INSERT INTO public.forge_attachment_legacy_pr_aliases(old_pr_id, current_pr_id)
    VALUES (p_old, p_new) ON CONFLICT (old_pr_id) DO UPDATE
      SET current_pr_id = EXCLUDED.current_pr_id;
  DELETE FROM public.pull_requests WHERE id = p_old;
  RETURN true;
END;
$$;
REVOKE ALL ON FUNCTION public.merge_forge_pull_request(uuid,uuid,text)
  FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.list_forge_attachment_migration_candidates(p_limit integer)
RETURNS TABLE(name text, pr_id uuid, project_id uuid, migrated_path text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF p_limit < 1 OR p_limit > 100 THEN
    RAISE EXCEPTION 'invalid_forge_attachment_batch' USING ERRCODE='22023';
  END IF;
  RETURN QUERY SELECT o.name, p.id, l.project_id, f.storage_path FROM storage.objects o
    LEFT JOIN public.forge_attachment_legacy_pr_aliases alias
      ON alias.old_pr_id::text = split_part(o.name, '/', 1)
    JOIN public.pull_requests p
      ON p.id::text = coalesce(alias.current_pr_id::text, split_part(o.name, '/', 1))
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

CREATE OR REPLACE FUNCTION public.reconcile_forge_repository_name(
  p_provider text, p_external_repo_id text, p_new text, p_links jsonb
) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE link_item jsonb; old_name text; alias_name text;
  old_pr record; twin_id uuid; changed integer;
BEGIN
  IF p_provider NOT IN ('github','gitlab') OR p_external_repo_id IS NULL OR
     p_links IS NULL OR jsonb_typeof(p_links)<>'array' OR
     jsonb_array_length(p_links)=0 OR NOT EXISTS (
       SELECT 1 FROM public.forge_repository_names WHERE provider=p_provider
         AND token=p_new) THEN
    RAISE EXCEPTION 'forge_repository_rename_invalid' USING ERRCODE='22023';
  END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(p_provider||':'||p_external_repo_id,591));
  FOR link_item IN SELECT value FROM jsonb_array_elements(p_links) LOOP
    old_name:=link_item->>'old';
    IF old_name IS NULL OR old_name=p_new THEN
      RAISE EXCEPTION 'forge_repository_rename_stale' USING ERRCODE='40001';
    END IF;
    FOR alias_name IN SELECT jsonb_array_elements_text(link_item->'aliases') LOOP
      IF NOT EXISTS(SELECT 1 FROM public.forge_repository_names WHERE
          provider=p_provider AND token=alias_name) THEN
        RAISE EXCEPTION 'forge_repository_alias_missing' USING ERRCODE='23503';
      END IF;
    END LOOP;
    PERFORM 1 FROM public.project_git_links WHERE id=(link_item->>'id')::uuid
      AND provider=p_provider AND external_repo_id=p_external_repo_id
      AND repo_full_name=old_name FOR UPDATE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'forge_repository_rename_stale' USING ERRCODE='40001';
    END IF;
  END LOOP;
  FOR old_name IN SELECT DISTINCT value->>'old' FROM jsonb_array_elements(p_links) LOOP
    FOR old_pr IN SELECT id,number FROM public.pull_requests WHERE
        provider=p_provider AND repo_full_name=old_name FOR UPDATE LOOP
      SELECT id INTO twin_id FROM public.pull_requests
        WHERE provider=p_provider AND repo_full_name=p_new
          AND number=old_pr.number FOR UPDATE;
      IF twin_id IS NULL THEN
        UPDATE public.pull_requests SET repo_full_name=p_new WHERE id=old_pr.id;
      ELSE
        PERFORM public.merge_forge_pull_request(
          old_pr.id, twin_id, p_external_repo_id);
      END IF;
      twin_id:=NULL;
    END LOOP;
    UPDATE public.pr_comment_edits SET repo_full_name=p_new WHERE
      provider=p_provider AND repo_full_name=old_name;
    DELETE FROM public.pull_request_syncs WHERE provider=p_provider AND
      repo_full_name=old_name;
  END LOOP;
  FOR link_item IN SELECT value FROM jsonb_array_elements(p_links) LOOP
    UPDATE public.project_git_links SET repo_full_name=p_new,
      repo_previous_names=ARRAY(SELECT jsonb_array_elements_text(
        link_item->'aliases')),repo_owner=NULL,repo_name=NULL,
      updated_at=clock_timestamp()
    WHERE id=(link_item->>'id')::uuid AND provider=p_provider
      AND external_repo_id=p_external_repo_id
      AND repo_full_name=(link_item->>'old');
    GET DIAGNOSTICS changed=ROW_COUNT;
    IF changed<>1 THEN
      RAISE EXCEPTION 'forge_repository_rename_stale' USING ERRCODE='40001';
    END IF;
  END LOOP;
  RETURN true;
END;
$$;

-- The unprotected-name fallback uses the same atomic PR transfer path.
CREATE FUNCTION public.reconcile_forge_repository_plain(
  p_provider text, p_external_repo_id text, p_new text,
  p_owner text, p_name text, p_links jsonb
) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE link_item jsonb; old_name text; old_pr record; twin_id uuid;
  changed integer;
BEGIN
  IF current_setting('transaction_isolation') <> 'read committed' THEN
    RAISE EXCEPTION 'forge_repository_plain_writer_requires_read_committed'
      USING ERRCODE = '25001';
  END IF;
  IF p_provider NOT IN ('github','gitlab') OR p_external_repo_id IS NULL OR
      p_new IS NULL OR p_name IS NULL OR
      coalesce(p_owner || '/', '') || p_name IS DISTINCT FROM p_new OR
      p_new LIKE 'mdyr1:%' OR
      p_links IS NULL OR jsonb_typeof(p_links) <> 'array' OR
      jsonb_array_length(p_links) = 0 OR
      EXISTS (SELECT 1 FROM public.forge_repository_name_scope) THEN
    RAISE EXCEPTION 'forge_repository_rename_invalid' USING ERRCODE='22023';
  END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(p_provider||':'||p_external_repo_id,591));
  FOR link_item IN SELECT value FROM jsonb_array_elements(p_links) LOOP
    old_name := link_item->>'old';
    IF old_name IS NULL OR old_name = p_new OR old_name LIKE 'mdyr1:%' OR
        jsonb_typeof(link_item->'aliases') <> 'array' THEN
      RAISE EXCEPTION 'forge_repository_rename_stale' USING ERRCODE='40001';
    END IF;
    PERFORM 1 FROM public.project_git_links WHERE id=(link_item->>'id')::uuid
      AND provider=p_provider AND external_repo_id=p_external_repo_id
      AND repo_full_name=old_name FOR UPDATE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'forge_repository_rename_stale' USING ERRCODE='40001';
    END IF;
  END LOOP;
  FOR old_name IN SELECT DISTINCT value->>'old' FROM jsonb_array_elements(p_links) LOOP
    FOR old_pr IN SELECT id,number FROM public.pull_requests WHERE
        provider=p_provider AND repo_full_name=old_name FOR UPDATE LOOP
      SELECT id INTO twin_id FROM public.pull_requests
        WHERE provider=p_provider AND repo_full_name=p_new
          AND number=old_pr.number FOR UPDATE;
      IF twin_id IS NULL THEN
        UPDATE public.pull_requests SET repo_full_name=p_new WHERE id=old_pr.id;
      ELSE
        PERFORM public.merge_forge_pull_request(
          old_pr.id, twin_id, p_external_repo_id);
      END IF;
      twin_id := NULL;
    END LOOP;
    UPDATE public.pr_comment_edits SET repo_full_name=p_new WHERE
      provider=p_provider AND repo_full_name=old_name;
    DELETE FROM public.pull_request_syncs WHERE provider=p_provider AND
      repo_full_name=old_name;
  END LOOP;
  FOR link_item IN SELECT value FROM jsonb_array_elements(p_links) LOOP
    UPDATE public.project_git_links SET repo_full_name=p_new,
      repo_previous_names=ARRAY(SELECT jsonb_array_elements_text(
        link_item->'aliases')), repo_owner=p_owner, repo_name=p_name,
      updated_at=clock_timestamp()
    WHERE id=(link_item->>'id')::uuid AND provider=p_provider
      AND external_repo_id=p_external_repo_id
      AND repo_full_name=(link_item->>'old');
    GET DIAGNOSTICS changed=ROW_COUNT;
    IF changed<>1 THEN
      RAISE EXCEPTION 'forge_repository_rename_stale' USING ERRCODE='40001';
    END IF;
  END LOOP;
  RETURN true;
END;
$$;
REVOKE ALL ON FUNCTION public.reconcile_forge_repository_plain(
  text,text,text,text,text,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.reconcile_forge_repository_plain(
  text,text,text,text,text,jsonb) TO service_role;

COMMIT;
