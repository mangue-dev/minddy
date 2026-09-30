\set ON_ERROR_STOP on
BEGIN;
DO $$ BEGIN
  IF current_database() NOT LIKE 'minddy_min591_%' THEN
    RAISE EXCEPTION 'Use an isolated minddy_min591_* database';
  END IF;
END $$;
DO $test$
DECLARE actor uuid := gen_random_uuid(); project uuid := gen_random_uuid();
  conversation uuid := gen_random_uuid(); legacy_run uuid := gen_random_uuid();
  new_run uuid := gen_random_uuid(); artifact_id uuid;
  old_url text := 'https://example.invalid/private/repo/pull/11';
  artifact_cipher text := 'mdyp3:1:eyJmb3JtYXQiOjMsImtleVZlcnNpb24iOjF9';
  run_cipher text := 'mdyp3:2:eyJmb3JtYXQiOjMsImtleVZlcnNpb24iOjJ9';
  rejected boolean; branch_artifact uuid;
  branch_prefix text := 'mdyw3:' || repeat('b',64);
  branch_v1 text := 'mdyw3:' || repeat('b',64) || ':1:YWJj';
  branch_v2 text := 'mdyw3:' || repeat('b',64) || ':2:YWJj';
BEGIN
  INSERT INTO auth.users(id) VALUES(actor);
  INSERT INTO public.projects(id,owner_id,name,key)
    VALUES(project,actor,'PR URL fixture','PURL');
  INSERT INTO public.agent_conversations(id,project_id,owner_id)
    VALUES(conversation,project,actor);
  INSERT INTO public.agent_runs(id,project_id,conversation_id,created_by,
    pr_number,pr_url,branch_name) VALUES(legacy_run,project,conversation,actor,11,old_url,branch_v1);
  SELECT id INTO branch_artifact FROM public.agent_artifacts WHERE run_id=legacy_run AND kind='branch';
  IF NOT public.migrate_agent_artifact_branch(branch_artifact,project,branch_prefix,
      branch_v1,legacy_run,branch_prefix,branch_v2) THEN
    RAISE EXCEPTION 'Independent branch artifact rotation failed';
  END IF;
  SELECT id INTO artifact_id FROM public.agent_artifacts
    WHERE run_id=legacy_run AND kind='pull_request';
  IF artifact_id IS NULL THEN RAISE EXCEPTION 'PR artifact missing'; END IF;
  IF NOT public.migrate_agent_artifact_url(artifact_id,project,old_url,NULL,
      artifact_cipher) THEN
    RAISE EXCEPTION 'PR artifact CAS failed';
  END IF;
  IF NOT public.migrate_agent_run_pr_url(legacy_run,project,old_url,run_cipher) OR
     public.migrate_agent_run_pr_url(legacy_run,project,old_url,run_cipher) THEN
    RAISE EXCEPTION 'Run PR URL CAS failed';
  END IF;
  IF EXISTS (SELECT 1 FROM public.agent_runs WHERE id=legacy_run AND
      pr_url LIKE '%private/repo%') OR
     EXISTS (SELECT 1 FROM public.agent_artifacts WHERE id=artifact_id AND
      url LIKE '%private/repo%') OR
     EXISTS (SELECT 1 FROM public.numo_artifacts WHERE id=artifact_id AND
      url LIKE '%private/repo%') THEN
    RAISE EXCEPTION 'PR URL source or copy remains clear';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.agent_artifacts WHERE id=artifact_id
      AND url=run_cipher AND url_bound_run_id=legacy_run) THEN
    RAISE EXCEPTION 'PR artifact did not retain run binding';
  END IF;
  IF NOT EXISTS(SELECT 1 FROM public.agent_artifacts WHERE id=branch_artifact AND ref_ciphertext=branch_v2) THEN
    RAISE EXCEPTION 'PR URL backfill replaced the rotated branch';
  END IF;
  UPDATE public.agent_runs SET pr_state='merged',cost_usd=1 WHERE id=legacy_run;
  IF NOT EXISTS(SELECT 1 FROM public.agent_artifacts WHERE id=branch_artifact AND ref_ciphertext=branch_v2) THEN
    RAISE EXCEPTION 'Ordinary metadata update replaced the rotated branch';
  END IF;
  BEGIN
    UPDATE public.agent_artifacts SET ref_ciphertext=branch_v1 WHERE id=branch_artifact;
    RAISE EXCEPTION 'Artifact key rollback was accepted';
  EXCEPTION WHEN check_violation THEN NULL; END;
  rejected := false;
  BEGIN
    UPDATE public.agent_runs SET pr_url=old_url WHERE id=legacy_run;
  EXCEPTION WHEN check_violation THEN rejected := true; END;
  IF NOT rejected THEN RAISE EXCEPTION 'Obsolete run PR URL writer accepted'; END IF;
  rejected := false;
  BEGIN
    UPDATE public.agent_artifacts SET url=old_url WHERE id=artifact_id;
  EXCEPTION WHEN check_violation THEN rejected := true; END;
  IF NOT rejected THEN RAISE EXCEPTION 'Obsolete artifact URL writer accepted'; END IF;
  INSERT INTO public.agent_runs(id,project_id,conversation_id,created_by,
    pr_number,pr_url) VALUES(new_run,project,conversation,actor,12,run_cipher);
  IF NOT EXISTS (SELECT 1 FROM public.agent_artifacts WHERE run_id=new_run
      AND url=run_cipher AND url_bound_run_id=new_run) THEN
    RAISE EXCEPTION 'New PR artifact was not bound atomically';
  END IF;
  IF has_function_privilege('authenticated',
      'public.migrate_agent_run_pr_url(uuid,uuid,text,text)','EXECUTE') OR
     has_function_privilege('authenticated',
      'public.migrate_agent_artifact_url(uuid,uuid,text,uuid,text)','EXECUTE') THEN
    RAISE EXCEPTION 'PR URL migration has client execute privilege';
  END IF;
END;
$test$;
ROLLBACK;
