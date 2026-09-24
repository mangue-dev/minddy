-- Verify verdict conversion, obsolete-writer refusal and absence from projections.
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
  v_verdict jsonb := '{"ok":false,"summary":"Private check result","blockers":["Private blocker"]}';
  cipher text := '{"format":3,"keyVersion":1,"data":"test-only-placeholder"}';
  rejected boolean;
BEGIN
  INSERT INTO auth.users(id) VALUES(actor);
  INSERT INTO public.projects(id,owner_id,name,key)
    VALUES(project,actor,'Verdict fixture project','AVD');
  INSERT INTO public.agent_runs(id,project_id,created_by,verdict)
    VALUES(legacy_run,project,actor,v_verdict);
  INSERT INTO public.agent_runs(id,project_id,created_by,verdict_ciphertext,
    verdict_encryption_version)
    VALUES(encrypted_run,project,actor,cipher,1);
  rejected := false;
  BEGIN
    INSERT INTO public.agent_runs(id,project_id,created_by,verdict)
      VALUES(gen_random_uuid(),project,actor,v_verdict);
  EXCEPTION WHEN check_violation THEN rejected := true; END;
  IF NOT rejected THEN RAISE EXCEPTION 'obsolete verdict insert accepted'; END IF;
  rejected := false;
  BEGIN
    UPDATE public.agent_runs SET verdict = jsonb_set(verdict,'{summary}',
      '"Obsolete verdict edit"') WHERE id=legacy_run;
  EXCEPTION WHEN check_violation THEN rejected := true; END;
  IF NOT rejected THEN RAISE EXCEPTION 'obsolete verdict update accepted'; END IF;
  IF NOT public.migrate_agent_run_verdict(legacy_run,project,v_verdict,NULL,0,cipher,1) OR
     public.migrate_agent_run_verdict(legacy_run,project,v_verdict,NULL,0,cipher,1) THEN
    RAISE EXCEPTION 'verdict compare-and-swap failed';
  END IF;
  IF EXISTS (SELECT 1 FROM public.agent_runs
      WHERE id IN (legacy_run,encrypted_run) AND verdict IS NOT NULL) OR
     EXISTS (SELECT 1 FROM public.numo_work
      WHERE id IN (legacy_run,encrypted_run) AND row_to_json(numo_work)::text LIKE '%Private%') OR
     EXISTS (SELECT 1 FROM public.numo_turns
      WHERE run_id IN (legacy_run,encrypted_run) AND row_to_json(numo_turns)::text LIKE '%Private%') THEN
    RAISE EXCEPTION 'verdict plaintext remains in a SQL projection';
  END IF;
  rejected := false;
  BEGIN
    UPDATE public.agent_runs SET verdict = v_verdict, verdict_ciphertext=NULL,
      verdict_encryption_version=0 WHERE id=encrypted_run;
  EXCEPTION WHEN check_violation THEN rejected := true; END;
  IF NOT rejected THEN RAISE EXCEPTION 'verdict downgrade accepted'; END IF;
  UPDATE public.agent_runs SET verdict_ciphertext =
    replace(cipher,'"keyVersion":1','"keyVersion":2'),
    verdict_encryption_version=2 WHERE id=encrypted_run;
  rejected := false;
  BEGIN
    UPDATE public.agent_runs SET verdict_ciphertext=cipher,
      verdict_encryption_version=1 WHERE id=encrypted_run;
  EXCEPTION WHEN check_violation THEN rejected := true; END;
  IF NOT rejected THEN RAISE EXCEPTION 'verdict key rollback accepted'; END IF;
  IF has_function_privilege('authenticated',
      'public.migrate_agent_run_verdict(uuid,uuid,jsonb,text,integer,text,integer)',
      'EXECUTE') OR EXISTS (SELECT 1 FROM pg_publication_tables
        WHERE schemaname='public' AND tablename='agent_runs') THEN
    RAISE EXCEPTION 'verdict client privilege or Realtime exposure';
  END IF;
END;
$test$;
ROLLBACK;
