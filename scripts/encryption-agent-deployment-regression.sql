-- Verify deployment affinity never leaves a clear SQL value after conversion.
\set ON_ERROR_STOP on
BEGIN;
DO $$ BEGIN
  IF current_database() NOT LIKE 'minddy_min591_%' THEN
    RAISE EXCEPTION 'Use an isolated minddy_min591_* database';
  END IF;
END $$;
DO $test$
DECLARE
  actor uuid := gen_random_uuid(); project uuid := gen_random_uuid();
  legacy_run uuid := gen_random_uuid(); encrypted_run uuid := gen_random_uuid();
  budget_run uuid := gen_random_uuid(); budget_result jsonb;
  clear_url text := 'private-preview.vercel.app';
  cipher text := 'mdye3:' || repeat('a',64) || ':1:YWJj';
  cipher_v2 text := 'mdye3:' || repeat('a',64) || ':2:YWJj';
  rejected boolean;
BEGIN
  INSERT INTO auth.users(id) VALUES(actor);
  INSERT INTO public.projects(id,owner_id,name,key)
    VALUES(project,actor,'Deployment fixture project','ADP');
  INSERT INTO public.agent_runs(id,project_id,created_by,deployment_url)
    VALUES(legacy_run,project,actor,clear_url);
  INSERT INTO public.agent_runs(id,project_id,created_by,deployment_url)
    VALUES(encrypted_run,project,actor,cipher);
  rejected := false;
  BEGIN
    INSERT INTO public.agent_runs(id,project_id,created_by,deployment_url)
      VALUES(gen_random_uuid(),project,actor,clear_url);
  EXCEPTION WHEN check_violation THEN rejected := true; END;
  IF NOT rejected THEN RAISE EXCEPTION 'obsolete deployment insert accepted'; END IF;
  rejected := false;
  BEGIN
    UPDATE public.agent_runs SET deployment_url='older-preview.vercel.app'
      WHERE id=legacy_run;
  EXCEPTION WHEN check_violation THEN rejected := true; END;
  IF NOT rejected THEN RAISE EXCEPTION 'obsolete deployment edit accepted'; END IF;
  IF NOT public.migrate_agent_run_deployment_url(legacy_run,project,clear_url,cipher) OR
     public.migrate_agent_run_deployment_url(legacy_run,project,clear_url,cipher) THEN
    RAISE EXCEPTION 'deployment compare-and-swap failed';
  END IF;
  IF EXISTS (SELECT 1 FROM public.agent_runs
      WHERE id IN (legacy_run,encrypted_run) AND deployment_url LIKE '%private-preview%') OR
     (SELECT count(*) FROM public.agent_runs WHERE project_id=project
       AND deployment_url LIKE 'mdye3:' || repeat('a',64) || ':%') <> 2 THEN
    RAISE EXCEPTION 'deployment plaintext or equality lookup failed';
  END IF;
  rejected := false;
  BEGIN
    UPDATE public.agent_runs SET deployment_url=clear_url WHERE id=encrypted_run;
  EXCEPTION WHEN check_violation THEN rejected := true; END;
  IF NOT rejected THEN RAISE EXCEPTION 'deployment downgrade accepted'; END IF;
  UPDATE public.agent_runs SET deployment_url=cipher_v2 WHERE id=encrypted_run;
  rejected := false;
  BEGIN
    UPDATE public.agent_runs SET deployment_url=cipher WHERE id=encrypted_run;
  EXCEPTION WHEN check_violation THEN rejected := true; END;
  IF NOT rejected THEN RAISE EXCEPTION 'deployment key rollback accepted'; END IF;
  budget_result := public.create_agent_run_with_budget(actor,now()-interval '1 day',100,1,
    jsonb_build_object('id',budget_run,'project_id',project,'created_by',actor,
      'status','queued','triggered_by','button','key_mode','platform',
      'worker_model_source','account','worker_model_provider','openai',
      'model_forced',false,'reasoning_level','off','run_id',gen_random_uuid(),
      'loop_in_vm',true,'agent_engine','opencode','local_exec',false,
      'local_issue_context_confirmed',false,'local_worktree',false,
      'deployment_url',cipher));
  IF budget_result->'run'->>'id' IS DISTINCT FROM budget_run::text OR
     NOT EXISTS (SELECT 1 FROM public.agent_runs WHERE id=budget_run
       AND deployment_url=cipher) THEN
    RAISE EXCEPTION 'managed run lost encrypted deployment affinity';
  END IF;
  IF has_function_privilege('authenticated',
      'public.migrate_agent_run_deployment_url(uuid,uuid,text,text)',
      'EXECUTE') OR EXISTS (SELECT 1 FROM pg_publication_tables
        WHERE schemaname='public' AND tablename='agent_runs') THEN
    RAISE EXCEPTION 'deployment client privilege or Realtime exposure';
  END IF;
END;
$test$;
ROLLBACK;
