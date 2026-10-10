-- Feedback objectives are explicit project references, never AI classifications.
ALTER TABLE public.objectives ADD CONSTRAINT objectives_id_project_unique UNIQUE (id, project_id);
ALTER TABLE public.feedback_posts ADD COLUMN objective_id uuid;
ALTER TABLE public.integrations ADD COLUMN objective_id uuid;
ALTER TABLE public.feedback_posts ADD CONSTRAINT feedback_objective_project_fk
  FOREIGN KEY (objective_id, project_id) REFERENCES public.objectives (id, project_id)
  ON DELETE SET NULL (objective_id);
ALTER TABLE public.integrations ADD CONSTRAINT integration_objective_project_fk
  FOREIGN KEY (objective_id, project_id) REFERENCES public.objectives (id, project_id)
  ON DELETE SET NULL (objective_id);
ALTER TABLE public.integrations ADD CONSTRAINT integration_feedback_objective_only
  CHECK (objective_id IS NULL OR kind = 'feedback');
CREATE INDEX feedback_posts_objective_idx ON public.feedback_posts (project_id, objective_id)
  WHERE deleted_at IS NULL AND merged_into_id IS NULL;

-- Guard every merge under the existing RPC's row locks, including concurrent edits.
CREATE FUNCTION public.guard_feedback_merge_objective() RETURNS trigger
LANGUAGE plpgsql SET search_path = public AS $$
DECLARE canonical_objective uuid;
BEGIN
  IF NEW.merged_into_id IS NOT NULL AND NEW.merged_into_id IS DISTINCT FROM OLD.merged_into_id THEN
    SELECT objective_id INTO canonical_objective FROM public.feedback_posts
      WHERE id = NEW.merged_into_id;
    IF NEW.objective_id IS DISTINCT FROM canonical_objective THEN
      RAISE EXCEPTION 'feedback_merge_objective_mismatch';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER feedback_merge_objective_guard BEFORE UPDATE OF merged_into_id
  ON public.feedback_posts FOR EACH ROW EXECUTE FUNCTION public.guard_feedback_merge_objective();
REVOKE ALL ON FUNCTION public.guard_feedback_merge_objective() FROM PUBLIC;

-- An explicit choice on a merged group applies to its absorbed requests too.
CREATE FUNCTION public.sync_feedback_descendant_objectives() RETURNS trigger
LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  UPDATE public.feedback_posts SET objective_id = NEW.objective_id
    WHERE merged_into_id = NEW.id
      AND objective_id IS DISTINCT FROM NEW.objective_id;
  RETURN NEW;
END;
$$;
CREATE TRIGGER feedback_descendant_objectives_sync AFTER UPDATE OF objective_id
  ON public.feedback_posts FOR EACH ROW
  WHEN (OLD.objective_id IS DISTINCT FROM NEW.objective_id)
  EXECUTE FUNCTION public.sync_feedback_descendant_objectives();
REVOKE ALL ON FUNCTION public.sync_feedback_descendant_objectives() FROM PUBLIC;

-- Mixed content/objective edits must also work with encrypted feedback.
CREATE OR REPLACE FUNCTION public.save_feedback_post_content(
  p_id uuid, p_project_id uuid, p_revision bigint, p_updates jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_before public.feedback_posts%ROWTYPE; v_after public.feedback_posts%ROWTYPE;
BEGIN
  IF p_updates IS NULL OR jsonb_typeof(p_updates) <> 'object' OR p_updates = '{}'::jsonb OR
    p_updates - ARRAY['title','body','submitted_title','submitted_body','translated_title',
      'translated_body','moderation_reason','embedding','encrypted_content','encryption_version',
      'status','is_public','review_state','classified_at','analyzed_at','analysis_claimed_at',
      'analysis_failures','source_language','translated_language','sensitivity',
      'suggested_merge_into_id','suggested_confidence','objective_id'] <> '{}'::jsonb THEN
    RAISE EXCEPTION 'feedback_post_values_invalid' USING ERRCODE = '22023';
  END IF;
  SELECT * INTO v_before FROM public.feedback_posts
    WHERE id = p_id AND project_id = p_project_id AND deleted_at IS NULL FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'feedback_post_not_found' USING ERRCODE = 'P0002'; END IF;
  IF v_before.encryption_revision <> p_revision THEN
    RAISE EXCEPTION 'feedback_post_revision_conflict' USING ERRCODE = '40001';
  END IF;
  IF p_updates ? 'objective_id' AND v_before.merged_into_id IS NOT NULL THEN
    RAISE EXCEPTION 'feedback_post_already_merged' USING ERRCODE = '40001';
  END IF;
  v_after := jsonb_populate_record(v_before, p_updates);
  UPDATE public.feedback_posts SET
    objective_id = v_after.objective_id,
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
