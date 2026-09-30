-- Exercise owner checks, revision guards, legacy conversion and stale writers.
\set ON_ERROR_STOP on
BEGIN;
DO $$ BEGIN
  IF current_database() NOT LIKE 'minddy_min591_%' THEN
    RAISE EXCEPTION 'Use an isolated minddy_min591_* database';
  END IF;
END $$;
DO $test$
DECLARE
  actor uuid := gen_random_uuid(); other_actor uuid := gen_random_uuid();
  legacy uuid := gen_random_uuid(); fresh uuid := gen_random_uuid();
  cipher text := '{"format":3,"keyVersion":1,"data":"test-only-placeholder"}';
  before_time timestamptz; written jsonb;
BEGIN
  INSERT INTO auth.users(id) VALUES(actor),(other_actor);
  INSERT INTO public.project_drafts(id,user_id,name,step,data)
    VALUES(legacy,actor,'Private draft','project','{"seed":{"text":"Private brief"}}');
  SELECT updated_at INTO before_time FROM public.project_drafts WHERE id=legacy;
  IF NOT public.migrate_project_draft_ciphertext(legacy,actor,0,0) THEN
    RAISE EXCEPTION 'draft queue attempt failed';
  END IF;
  IF NOT public.migrate_project_draft_ciphertext(legacy,actor,0,0,1,cipher) THEN
    RAISE EXCEPTION 'draft migration failed';
  END IF;
  IF public.migrate_project_draft_ciphertext(legacy,actor,0,0,1,cipher) THEN
    RAISE EXCEPTION 'stale draft migration won';
  END IF;
  IF EXISTS(SELECT 1 FROM public.project_drafts WHERE id=legacy AND
    (name IS NOT NULL OR data IS NOT NULL OR encryption_revision<>1 OR updated_at<>before_time)) THEN
    RAISE EXCEPTION 'draft migration retained plaintext or changed edit metadata';
  END IF;
  BEGIN
    PERFORM public.save_project_draft_guarded(legacy,other_actor,NULL,'project',NULL,1,cipher,1);
    RAISE EXCEPTION 'other owner changed draft';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN
    PERFORM public.save_project_draft_guarded(legacy,actor,NULL,'icon',NULL,1,cipher,0);
    RAISE EXCEPTION 'stale draft edit won';
  EXCEPTION WHEN serialization_failure THEN NULL; END;
  written := public.save_project_draft_guarded(legacy,actor,NULL,'icon',NULL,1,cipher,1);
  IF written->>'step'<>'icon' OR (written->>'encryption_revision')::bigint<>2 THEN
    RAISE EXCEPTION 'guarded draft edit failed';
  END IF;
  IF has_table_privilege('authenticated','public.project_drafts','INSERT') OR
     has_table_privilege('authenticated','public.project_drafts','UPDATE') OR
     has_function_privilege('authenticated','public.save_project_draft_guarded(uuid,uuid,text,text,jsonb,integer,text,bigint)','EXECUTE') THEN
    RAISE EXCEPTION 'direct draft client writes remained';
  END IF;
  PERFORM public.create_envelope_data_key_if_absent('user',actor,'content','Zml4dHVyZQ==');
  BEGIN
    INSERT INTO public.project_drafts(id,user_id,name,step,data)
      VALUES(fresh,actor,'Obsolete writer','project','{}');
    RAISE EXCEPTION 'obsolete draft writer accepted';
  EXCEPTION WHEN check_violation THEN NULL; END;
  written := public.save_project_draft_guarded(fresh,actor,NULL,'project',NULL,1,cipher,NULL);
  IF written->>'name' IS NOT NULL OR written->'data'<>'null'::jsonb THEN
    RAISE EXCEPTION 'guarded insert retained plaintext';
  END IF;
END;
$test$;
ROLLBACK;
