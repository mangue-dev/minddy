-- MIN-591: feedback post content moves behind the project-scoped row codec.
BEGIN;

ALTER TABLE public.feedback_posts
  ALTER COLUMN title DROP NOT NULL,
  ALTER COLUMN body DROP NOT NULL,
  ALTER COLUMN submitted_title DROP NOT NULL,
  ALTER COLUMN submitted_body DROP NOT NULL,
  ADD COLUMN encryption_version integer NOT NULL DEFAULT 0,
  ADD COLUMN encrypted_content text,
  ADD COLUMN encryption_revision bigint NOT NULL DEFAULT 0 CHECK (encryption_revision >= 0),
  ADD COLUMN encryption_checked_at timestamptz,
  ADD CONSTRAINT feedback_posts_encryption_state CHECK (
    (encryption_version = 0 AND encrypted_content IS NULL AND title IS NOT NULL
      AND body IS NOT NULL AND submitted_title IS NOT NULL AND submitted_body IS NOT NULL)
    OR (encryption_version > 0 AND encrypted_content IS NOT NULL
      AND title IS NULL AND body IS NULL AND submitted_title IS NULL AND submitted_body IS NULL
      AND translated_title IS NULL AND translated_body IS NULL AND moderation_reason IS NULL
      AND embedding IS NULL
      AND COALESCE((encrypted_content::jsonb ->> 'format')::integer = 3, false)
      AND COALESCE((encrypted_content::jsonb ->> 'keyVersion')::integer = encryption_version, false)));
CREATE INDEX feedback_posts_encryption_queue
  ON public.feedback_posts(encryption_checked_at NULLS FIRST, id);
REVOKE INSERT, UPDATE, DELETE ON public.feedback_posts FROM anon, authenticated;

CREATE FUNCTION public.guard_feedback_post_encryption()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF NEW.encryption_version = 0 AND EXISTS (
    SELECT 1 FROM public.envelope_data_keys WHERE scope_kind = 'project'
      AND scope_id = NEW.project_id AND purpose = 'content') THEN
    IF TG_OP = 'INSERT' THEN
      RAISE EXCEPTION 'feedback_post_requires_encryption' USING ERRCODE = '23514';
    END IF;
    IF ROW(NEW.title, NEW.body, NEW.submitted_title, NEW.submitted_body,
      NEW.translated_title, NEW.translated_body, NEW.moderation_reason, NEW.embedding)
      IS DISTINCT FROM ROW(OLD.title, OLD.body, OLD.submitted_title, OLD.submitted_body,
      OLD.translated_title, OLD.translated_body, OLD.moderation_reason, OLD.embedding) THEN
      RAISE EXCEPTION 'feedback_post_requires_encryption' USING ERRCODE = '23514';
    END IF;
  END IF;
  IF TG_OP = 'UPDATE' THEN
    IF NEW.id IS DISTINCT FROM OLD.id OR NEW.project_id IS DISTINCT FROM OLD.project_id THEN
      RAISE EXCEPTION 'feedback_post_identity_is_immutable' USING ERRCODE = '23514';
    END IF;
    IF NEW.encryption_version < OLD.encryption_version OR
      (OLD.encryption_version > 0 AND NEW.encryption_version = 0) THEN
      RAISE EXCEPTION 'feedback_post_encryption_downgrade' USING ERRCODE = '23514';
    END IF;
    IF NEW.encryption_revision IS DISTINCT FROM OLD.encryption_revision THEN
      RAISE EXCEPTION 'feedback_post_revision_is_managed' USING ERRCODE = '23514';
    END IF;
    IF (to_jsonb(NEW) - ARRAY['encryption_checked_at','encryption_revision','updated_at'])
       IS DISTINCT FROM (to_jsonb(OLD) - ARRAY['encryption_checked_at','encryption_revision','updated_at']) THEN
      NEW.encryption_revision := OLD.encryption_revision + 1;
    ELSE NEW.encryption_revision := OLD.encryption_revision;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER feedback_posts_encryption_guard BEFORE INSERT OR UPDATE ON public.feedback_posts
  FOR EACH ROW EXECUTE FUNCTION public.guard_feedback_post_encryption();
REVOKE ALL ON FUNCTION public.guard_feedback_post_encryption() FROM PUBLIC, anon, authenticated;

CREATE FUNCTION public.set_feedback_post_updated_at()
RETURNS trigger LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  IF current_setting('minddy.encryption_maintenance', true) = 'on' OR
    (to_jsonb(NEW) - ARRAY['encryption_checked_at','updated_at']) =
    (to_jsonb(OLD) - ARRAY['encryption_checked_at','updated_at']) THEN
    NEW.updated_at := OLD.updated_at;
  ELSE NEW.updated_at := clock_timestamp(); END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER feedback_posts_set_updated_at ON public.feedback_posts;
CREATE TRIGGER feedback_posts_set_updated_at BEFORE UPDATE ON public.feedback_posts
  FOR EACH ROW EXECUTE FUNCTION public.set_feedback_post_updated_at();
REVOKE ALL ON FUNCTION public.set_feedback_post_updated_at() FROM PUBLIC, anon, authenticated;

CREATE FUNCTION public.save_feedback_post_content(
  p_id uuid, p_project_id uuid, p_revision bigint, p_updates jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_before public.feedback_posts%ROWTYPE; v_after public.feedback_posts%ROWTYPE;
BEGIN
  IF p_updates IS NULL OR jsonb_typeof(p_updates) <> 'object' OR p_updates = '{}'::jsonb OR
    p_updates - ARRAY['title','body','submitted_title','submitted_body','translated_title',
      'translated_body','moderation_reason','embedding','encrypted_content','encryption_version',
      'status','is_public','review_state','classified_at','analyzed_at','analysis_claimed_at',
      'analysis_failures','source_language','translated_language','sensitivity',
      'suggested_merge_into_id','suggested_confidence'] <> '{}'::jsonb THEN
    RAISE EXCEPTION 'feedback_post_values_invalid' USING ERRCODE = '22023';
  END IF;
  SELECT * INTO v_before FROM public.feedback_posts
    WHERE id = p_id AND project_id = p_project_id AND deleted_at IS NULL FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'feedback_post_not_found' USING ERRCODE = 'P0002'; END IF;
  IF v_before.encryption_revision <> p_revision THEN
    RAISE EXCEPTION 'feedback_post_revision_conflict' USING ERRCODE = '40001';
  END IF;
  v_after := jsonb_populate_record(v_before, p_updates);
  UPDATE public.feedback_posts SET
    title = v_after.title, body = v_after.body,
    submitted_title = v_after.submitted_title, submitted_body = v_after.submitted_body,
    translated_title = v_after.translated_title, translated_body = v_after.translated_body,
    moderation_reason = v_after.moderation_reason, embedding = v_after.embedding,
    encrypted_content = v_after.encrypted_content, encryption_version = v_after.encryption_version,
    status = v_after.status, is_public = v_after.is_public, review_state = v_after.review_state,
    classified_at = v_after.classified_at, analyzed_at = v_after.analyzed_at,
    analysis_claimed_at = v_after.analysis_claimed_at, analysis_failures = v_after.analysis_failures,
    source_language = v_after.source_language, translated_language = v_after.translated_language,
    sensitivity = v_after.sensitivity, suggested_merge_into_id = v_after.suggested_merge_into_id,
    suggested_confidence = v_after.suggested_confidence
    WHERE id = p_id RETURNING * INTO v_after;
  RETURN to_jsonb(v_after);
END;
$$;
REVOKE ALL ON FUNCTION public.save_feedback_post_content(uuid,uuid,bigint,jsonb)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.save_feedback_post_content(uuid,uuid,bigint,jsonb)
  TO service_role;

CREATE FUNCTION public.migrate_feedback_post_ciphertext(
  p_id uuid, p_project_id uuid, p_revision bigint, p_previous_version integer,
  p_encryption_version integer DEFAULT NULL, p_encrypted_content text DEFAULT NULL)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE affected integer; previous_setting text := current_setting('minddy.encryption_maintenance', true);
BEGIN
  PERFORM set_config('minddy.encryption_maintenance', 'on', true);
  IF p_encryption_version IS NULL AND p_encrypted_content IS NULL THEN
    UPDATE public.feedback_posts SET encryption_checked_at = clock_timestamp()
      WHERE id = p_id AND project_id = p_project_id AND encryption_revision = p_revision
        AND encryption_version = p_previous_version;
  ELSE
    UPDATE public.feedback_posts SET title = NULL, body = NULL, submitted_title = NULL,
      submitted_body = NULL, translated_title = NULL, translated_body = NULL,
      moderation_reason = NULL, embedding = NULL,
      encrypted_content = p_encrypted_content, encryption_version = p_encryption_version
      WHERE id = p_id AND project_id = p_project_id AND encryption_revision = p_revision
        AND encryption_version = p_previous_version;
  END IF;
  GET DIAGNOSTICS affected = ROW_COUNT;
  PERFORM set_config('minddy.encryption_maintenance', COALESCE(previous_setting, ''), true);
  RETURN affected = 1;
END;
$$;
REVOKE ALL ON FUNCTION public.migrate_feedback_post_ciphertext(uuid,uuid,bigint,integer,integer,text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.migrate_feedback_post_ciphertext(uuid,uuid,bigint,integer,integer,text)
  TO service_role;

-- An old SQL similarity caller must not silently omit encrypted neighbors.
DROP FUNCTION public.match_feedback_posts(uuid, extensions.vector, uuid, integer, boolean);

CREATE OR REPLACE FUNCTION public.broadcast_feedback_post()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE pid uuid := COALESCE(NEW.project_id, OLD.project_id);
BEGIN
  PERFORM realtime.send(jsonb_build_object(
    'operation', TG_OP, 'table', TG_TABLE_NAME, 'schema', TG_TABLE_SCHEMA,
    'record', CASE WHEN TG_OP = 'DELETE' THEN NULL ELSE
      jsonb_build_object('id', NEW.id, 'project_id', NEW.project_id) END,
    'old_record', CASE WHEN TG_OP = 'INSERT' THEN NULL ELSE
      jsonb_build_object('id', OLD.id, 'project_id', OLD.project_id) END
  ), TG_OP, 'project:' || pid, true);
  RETURN NULL;
EXCEPTION WHEN OTHERS THEN RETURN NULL;
END;
$$;
REVOKE ALL ON FUNCTION public.broadcast_feedback_post() FROM PUBLIC, anon, authenticated;

COMMIT;
