-- Reproduce activated legacy feedback and coupled Agent runtime backfills.
\set ON_ERROR_STOP on
BEGIN;
DO $$ BEGIN
  IF current_database() NOT LIKE 'minddy_min591_%' THEN
    RAISE EXCEPTION 'Use an isolated minddy_min591_* database';
  END IF;
END $$;
DO $test$
DECLARE actor uuid := gen_random_uuid(); project uuid := gen_random_uuid();
  feedback uuid := gen_random_uuid(); run_id uuid; index integer;
  expected jsonb; revision bigint;
  base_cipher text := 'mdyb3:1:YWJj';
  work_cipher text := 'mdyw3:' || repeat('a',64) || ':1:YWJj';
BEGIN
  INSERT INTO auth.users(id) VALUES(actor);
  INSERT INTO public.projects(id,owner_id,name,key) VALUES(project,actor,'Backfill fixture','HBF');
  INSERT INTO public.feedback_posts(id,project_id,title,body,submitted_title,submitted_body,source)
    VALUES(feedback,project,'Private feedback','Private body','Private feedback','Private body','internal');
  FOR index IN 1..2 LOOP
    INSERT INTO public.agent_runs(project_id,created_by,base_branch,branch_name)
      VALUES(project,actor,'private-base','private-work-' || index);
  END LOOP;
  PERFORM public.create_envelope_data_key_if_absent('project',project,'content','Zml4dHVyZQ==');
  INSERT INTO public.agent_base_branch_encryption_scopes(project_id) VALUES(project);
  INSERT INTO public.agent_work_branch_encryption_scopes(project_id) VALUES(project);
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
  FOR index IN 1..2 LOOP
    SELECT id INTO run_id FROM public.agent_runs WHERE project_id=project
      AND branch_name='private-work-' || index;
    IF index=1 THEN
      PERFORM public.migrate_agent_run_base_branch(run_id,project,'private-base',base_cipher);
      PERFORM public.migrate_agent_run_work_branch(run_id,project,'private-work-' || index,work_cipher);
    ELSE
      PERFORM public.migrate_agent_run_work_branch(run_id,project,'private-work-' || index,work_cipher);
      PERFORM public.migrate_agent_run_base_branch(run_id,project,'private-base',base_cipher);
    END IF;
    IF NOT EXISTS(SELECT 1 FROM public.agent_runtime_sessions WHERE current_run_id=run_id
      AND base_branch=base_cipher AND work_branch=work_cipher) THEN
      RAISE EXCEPTION 'Coupled runtime copies did not migrate';
    END IF;
    BEGIN
      UPDATE public.agent_runtime_sessions SET base_branch='obsolete' WHERE current_run_id=run_id;
      RAISE EXCEPTION 'Runtime downgrade accepted';
    EXCEPTION WHEN check_violation THEN NULL; END;
  END LOOP;
  IF EXISTS(SELECT 1 FROM public.agent_artifacts a JOIN public.agent_conversations c ON c.id=a.conversation_id
    WHERE c.project_id=project AND a.kind='branch' AND a.ref LIKE 'private-work-%') THEN
    RAISE EXCEPTION 'Legacy branch artifact survived';
  END IF;
END;
$test$;
ROLLBACK;
