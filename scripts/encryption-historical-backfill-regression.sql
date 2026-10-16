-- Reproduce an activated legacy feedback backfill.
\set ON_ERROR_STOP on
BEGIN;
DO $$ BEGIN
  IF current_database() NOT LIKE 'minddy_min591_%' THEN
    RAISE EXCEPTION 'Use an isolated minddy_min591_* database';
  END IF;
END $$;
DO $test$
DECLARE actor uuid := gen_random_uuid(); project uuid := gen_random_uuid();
  feedback uuid := gen_random_uuid();
  expected jsonb; revision bigint;
BEGIN
  INSERT INTO auth.users(id) VALUES(actor);
  INSERT INTO public.projects(id,owner_id,name,key) VALUES(project,actor,'Backfill fixture','HBF');
  INSERT INTO public.feedback_posts(id,project_id,title,body,submitted_title,submitted_body,source)
    VALUES(feedback,project,'Private feedback','Private body','Private feedback','Private body','internal');
  PERFORM public.create_envelope_data_key_if_absent('project',project,'content','Zml4dHVyZQ==');
  SELECT jsonb_build_object('id',id,'project_id',project_id,'encryption_revision',encryption_revision,
      'encryption_version',encryption_version,'encrypted_content',encrypted_content),encryption_revision
    INTO expected,revision FROM public.feedback_posts WHERE id=feedback;
  IF NOT public.record_encryption_backfill_progress('feedback_posts','encryption_attempted_at',expected,false) THEN
    RAISE EXCEPTION 'Legacy feedback attempt failed';
  END IF;
  IF (SELECT encryption_revision FROM public.feedback_posts WHERE id=feedback) <> revision THEN
    RAISE EXCEPTION 'Progress changed feedback revision';
  END IF;
  BEGIN
    UPDATE public.feedback_posts SET title='Obsolete writer' WHERE id=feedback;
    RAISE EXCEPTION 'Legacy feedback edit accepted';
  EXCEPTION WHEN check_violation THEN NULL; END;
END;
$test$;
ROLLBACK;
