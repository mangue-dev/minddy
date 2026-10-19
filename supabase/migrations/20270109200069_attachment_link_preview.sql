-- MIN-742: a link resource carries the page's og:image as a small inline
-- thumbnail (WebP data URI, a few kB), shown on its card. Same storage and
-- protection as the favicon: in the row, encrypted with the other attachment
-- metadata once that protection is active.
BEGIN;

ALTER TABLE public.attachments ADD COLUMN preview_data_url text;
COMMENT ON COLUMN public.attachments.preview_data_url IS
  'Link og:image as a WebP data URI thumbnail; null when the page has none.';

-- The guard now treats preview_data_url like icon_data_url.
CREATE OR REPLACE FUNCTION public.guard_attachment_metadata()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE field text; old_value text; new_value text;
  active boolean; old_version integer; new_version integer;
BEGIN
  IF TG_OP='UPDATE' AND NEW.project_id IS DISTINCT FROM OLD.project_id THEN
    RAISE EXCEPTION 'attachment_metadata_scope_immutable' USING ERRCODE='23514';
  END IF;
  active := EXISTS (SELECT 1 FROM public.attachment_metadata_encryption_scope)
    OR NEW.file_name LIKE 'mdya3:%'
    OR (TG_TABLE_NAME='attachments' AND
      ((to_jsonb(NEW)->>'url') LIKE 'mdya3:%' OR
       (to_jsonb(NEW)->>'icon_data_url') LIKE 'mdya3:%' OR
       (to_jsonb(NEW)->>'preview_data_url') LIKE 'mdya3:%'));
  FOREACH field IN ARRAY CASE WHEN TG_TABLE_NAME='attachments'
      THEN ARRAY['file_name','url','icon_data_url','preview_data_url']
      ELSE ARRAY['file_name'] END LOOP
    new_value := to_jsonb(NEW)->>field;
    old_value := CASE WHEN TG_OP='UPDATE' THEN to_jsonb(OLD)->>field ELSE NULL END;
    IF new_value LIKE 'mdya3:%' THEN
      IF new_value !~ '^mdya3:[1-9][0-9]*:[A-Za-z0-9_-]+$' THEN
        RAISE EXCEPTION 'attachment_ciphertext_invalid' USING ERRCODE='23514';
      END IF;
      new_version := split_part(new_value,':',2)::integer;
      IF old_value LIKE 'mdya3:%' THEN
        old_version := split_part(old_value,':',2)::integer;
        IF new_version<old_version THEN
          RAISE EXCEPTION 'attachment_key_version_rollback' USING ERRCODE='23514';
        END IF;
      END IF;
    ELSIF new_value IS NOT NULL AND active AND
        (TG_OP='INSERT' OR new_value IS DISTINCT FROM old_value) THEN
      RAISE EXCEPTION 'attachment_metadata_requires_encryption'
        USING ERRCODE='23514';
    END IF;
  END LOOP;
  IF NEW.file_name LIKE 'mdya3:%' OR
      (TG_TABLE_NAME='attachments' AND
        ((to_jsonb(NEW)->>'url') LIKE 'mdya3:%' OR
         (to_jsonb(NEW)->>'icon_data_url') LIKE 'mdya3:%' OR
         (to_jsonb(NEW)->>'preview_data_url') LIKE 'mdya3:%')) THEN
    INSERT INTO public.attachment_metadata_encryption_scope(id)
      VALUES(true) ON CONFLICT DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.guard_attachment_metadata()
  FROM PUBLIC,anon,authenticated;

-- The backfill's compare-and-swap with the new column. A new name rather than
-- an overload: the deployed backfill keeps calling the 7-argument function
-- until the code that uses this one ships, and PostgREST cannot choose between
-- overloads that share named arguments.
CREATE FUNCTION public.migrate_attachment_metadata_v2(
  p_id uuid,p_old_file_name text,p_old_url text,p_old_icon text,
  p_old_preview text,
  p_new_file_name text DEFAULT NULL,p_new_url text DEFAULT NULL,
  p_new_icon text DEFAULT NULL,p_new_preview text DEFAULT NULL
) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE row public.attachments;
BEGIN
  SELECT * INTO row FROM public.attachments WHERE id=p_id FOR UPDATE;
  IF NOT FOUND OR row.file_name IS DISTINCT FROM p_old_file_name OR
      row.url IS DISTINCT FROM p_old_url OR
      row.icon_data_url IS DISTINCT FROM p_old_icon OR
      row.preview_data_url IS DISTINCT FROM p_old_preview THEN RETURN false; END IF;
  UPDATE public.attachments SET
    file_name=COALESCE(p_new_file_name,row.file_name),
    url=COALESCE(p_new_url,row.url),
    icon_data_url=COALESCE(p_new_icon,row.icon_data_url),
    preview_data_url=COALESCE(p_new_preview,row.preview_data_url),
    content_encryption_checked_at=clock_timestamp() WHERE id=p_id;
  RETURN true;
END;
$$;
REVOKE ALL ON FUNCTION public.migrate_attachment_metadata_v2(
  uuid,text,text,text,text,text,text,text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.migrate_attachment_metadata_v2(
  uuid,text,text,text,text,text,text,text,text) TO service_role;

COMMIT;
