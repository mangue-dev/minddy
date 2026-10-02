BEGIN;

-- Retry failed rows fairly while revisiting ciphertext written with retired keys.
CREATE TABLE public.invitation_email_rotation_attempts (
  invitation_id uuid PRIMARY KEY REFERENCES public.project_invitations(id) ON DELETE CASCADE,
  checked_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
ALTER TABLE public.invitation_email_rotation_attempts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.invitation_email_rotation_attempts FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.invitation_email_rotation_attempts TO service_role;

CREATE FUNCTION public.list_invitation_email_rotation_candidates(p_limit integer)
RETURNS TABLE(id uuid, project_id uuid, invited_email text, status text,
  expires_at timestamptz, token text, encryption_version integer,
  invited_email_ciphertext text, invited_email_blind_index text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF p_limit < 1 OR p_limit > 500 THEN
    RAISE EXCEPTION 'invalid_invitation_rotation_batch' USING ERRCODE='22023';
  END IF;
  RETURN QUERY
    SELECT i.id, i.project_id, i.invited_email, i.status::text,
      i.expires_at, i.token, i.encryption_version,
      i.invited_email_ciphertext, i.invited_email_blind_index
    FROM public.project_invitations i
    LEFT JOIN public.envelope_data_keys k
      ON k.scope_kind='project' AND k.scope_id=i.project_id
      AND k.purpose='content' AND k.is_current
    LEFT JOIN public.invitation_email_rotation_attempts a
      ON a.invitation_id=i.id
    WHERE i.invited_email IS NOT NULL OR
      (i.invited_email_ciphertext IS NOT NULL AND
        (i.status <> 'pending' OR i.expires_at <= now() OR
         i.encryption_version < k.version OR
         i.invited_email_ciphertext ~ '"format"[[:space:]]*:[[:space:]]*[12]([,}])'))
    ORDER BY a.checked_at NULLS FIRST, i.created_at, i.id
    LIMIT p_limit;
END;
$$;
REVOKE ALL ON FUNCTION public.list_invitation_email_rotation_candidates(integer)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.list_invitation_email_rotation_candidates(integer)
  TO service_role;

CREATE FUNCTION public.record_invitation_email_rotation_attempt(p_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  INSERT INTO public.invitation_email_rotation_attempts(invitation_id, checked_at)
    SELECT i.id, clock_timestamp() FROM public.project_invitations i WHERE i.id=p_id
    ON CONFLICT(invitation_id) DO UPDATE SET checked_at=EXCLUDED.checked_at;
END;
$$;
REVOKE ALL ON FUNCTION public.record_invitation_email_rotation_attempt(uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_invitation_email_rotation_attempt(uuid)
  TO service_role;

ALTER TABLE public.attachment_object_encrypted
  ADD COLUMN format_version integer NOT NULL DEFAULT 3,
  ADD COLUMN content_key_version integer NOT NULL DEFAULT 0,
  ADD COLUMN replaced_by text REFERENCES public.attachment_object_encrypted(path),
  ADD CONSTRAINT attachment_object_format_version_check
    CHECK (format_version IN (3,4)),
  ADD CONSTRAINT attachment_object_content_key_version_check
    CHECK (content_key_version >= 0);

CREATE OR REPLACE FUNCTION public.guard_attachment_object_reference()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF NEW.storage_path IS NOT NULL AND
      (TG_OP='INSERT' OR NEW.storage_path IS DISTINCT FROM OLD.storage_path) THEN
    PERFORM pg_catalog.pg_advisory_xact_lock(
      pg_catalog.hashtextextended(NEW.storage_path,59140));
    IF EXISTS (SELECT 1 FROM public.attachment_object_encrypted e
        WHERE e.path=NEW.storage_path AND e.replaced_by IS NOT NULL) OR
        (EXISTS (SELECT 1 FROM public.attachment_object_encryption_scope) AND
          NOT EXISTS (SELECT 1 FROM public.attachment_object_encrypted e
            WHERE e.path=NEW.storage_path AND e.replaced_by IS NULL)) THEN
      RAISE EXCEPTION 'attachment_object_requires_encryption'
        USING ERRCODE='23514';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP FUNCTION public.list_attachment_object_migration_candidates(integer);
CREATE FUNCTION public.list_attachment_object_migration_candidates(p_limit integer)
RETURNS TABLE(id uuid,name text,format_version integer,content_key_version integer,
  replaced_by text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF p_limit < 1 OR p_limit > 100 THEN
    RAISE EXCEPTION 'invalid_attachment_object_batch' USING ERRCODE='22023';
  END IF;
  RETURN QUERY SELECT o.id,o.name,e.format_version,e.content_key_version,e.replaced_by
    FROM storage.objects o
    LEFT JOIN public.attachment_object_encrypted e ON e.path=o.name
    LEFT JOIN public.attachment_object_migration_attempts a ON a.object_id=o.id
    LEFT JOIN public.envelope_data_keys k
      ON k.scope_kind=CASE split_part(o.name,'/',1)
        WHEN 'projects' THEN 'project' WHEN 'chat' THEN 'user' ELSE '' END
      AND k.scope_id::text=split_part(o.name,'/',2)
      AND k.purpose='content' AND k.is_current
    WHERE o.bucket_id='attachments' AND
      (e.path IS NULL OR e.replaced_by IS NOT NULL OR e.format_version<4 OR
       e.content_key_version=0 OR e.content_key_version<k.version)
    ORDER BY a.checked_at NULLS FIRST,o.created_at,o.id LIMIT p_limit;
END;
$$;
REVOKE ALL ON FUNCTION public.list_attachment_object_migration_candidates(integer)
  FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.list_attachment_object_migration_candidates(integer)
  TO service_role;

-- Publish an immutable verified copy and swap every reference under one lock.
-- The old Storage object is removed only after the transaction commits.
CREATE FUNCTION public.rotate_attachment_object_references(
  p_old_path text,p_new_path text,p_old_digest text,
  p_expected_format integer,p_expected_key_version integer
) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE old_row public.attachment_object_encrypted%ROWTYPE;
  existing_alias text;
BEGIN
  IF p_old_path=p_new_path OR p_old_digest !~ '^[a-f0-9]{64}$' THEN
    RETURN false;
  END IF;
  IF split_part(p_old_path,'/',1) IS DISTINCT FROM split_part(p_new_path,'/',1) OR
      split_part(p_old_path,'/',2) IS DISTINCT FROM split_part(p_new_path,'/',2) THEN
    RETURN false;
  END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(p_old_path,59140));
  SELECT * INTO old_row FROM public.attachment_object_encrypted
    WHERE path=p_old_path FOR UPDATE;
  IF NOT FOUND OR old_row.replaced_by IS NOT NULL OR
      old_row.format_version IS DISTINCT FROM p_expected_format OR
      old_row.content_key_version IS DISTINCT FROM p_expected_key_version OR
      NOT EXISTS (SELECT 1 FROM public.attachment_object_encrypted
        WHERE path=p_new_path AND format_version=4 AND replaced_by IS NULL AND
          content_key_version >= old_row.content_key_version) THEN
    RETURN false;
  END IF;
  SELECT new_path INTO existing_alias FROM public.attachment_object_aliases
    WHERE old_path_digest=p_old_digest FOR UPDATE;
  IF FOUND AND existing_alias<>p_old_path THEN RETURN false; END IF;
  UPDATE public.attachments SET storage_path=p_new_path WHERE storage_path=p_old_path;
  UPDATE public.page_files SET storage_path=p_new_path WHERE storage_path=p_old_path;
  UPDATE public.attachment_object_aliases SET new_path=p_new_path
    WHERE new_path=p_old_path;
  INSERT INTO public.attachment_object_aliases(old_path_digest,new_path)
    VALUES(p_old_digest,p_new_path)
    ON CONFLICT(old_path_digest) DO UPDATE SET new_path=EXCLUDED.new_path;
  UPDATE public.attachment_object_encrypted SET replaced_by=p_new_path
    WHERE path=p_old_path;
  RETURN true;
END;
$$;
REVOKE ALL ON FUNCTION public.rotate_attachment_object_references(
  text,text,text,integer,integer) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.rotate_attachment_object_references(
  text,text,text,integer,integer) TO service_role;

COMMIT;
