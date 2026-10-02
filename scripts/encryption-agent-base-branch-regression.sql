-- Verify run and runtime base branch copies contain only the encrypted value.
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
  orphan_conversation uuid := gen_random_uuid();
  clear_branch text := 'private/issue-591';
  cipher text := 'mdyb3:1:YWJj'; cipher_v2 text := 'mdyb3:2:YWJj';
  rejected boolean;
BEGIN
  INSERT INTO auth.users(id) VALUES(actor);
  INSERT INTO public.projects(id,owner_id,name,key)
    VALUES(project,actor,'Base branch fixture project','ABB');
  INSERT INTO public.agent_runs(id,project_id,created_by,base_branch)
    VALUES(legacy_run,project,actor,clear_branch);
  INSERT INTO public.agent_runs(id,project_id,created_by,base_branch)
    VALUES(encrypted_run,project,actor,cipher);
  IF NOT EXISTS (SELECT 1 FROM public.agent_runtime_sessions
      WHERE current_run_id=encrypted_run AND base_branch=cipher) THEN
    RAISE EXCEPTION 'runtime encrypted copy missing';
  END IF;
  rejected := false;
  BEGIN
    INSERT INTO public.agent_runs(id,project_id,created_by,base_branch)
      VALUES(gen_random_uuid(),project,actor,clear_branch);
  EXCEPTION WHEN check_violation THEN rejected := true; END;
  IF NOT rejected THEN RAISE EXCEPTION 'obsolete base branch insert accepted'; END IF;
  rejected := false;
  BEGIN
    UPDATE public.agent_runs SET base_branch='private/new' WHERE id=legacy_run;
  EXCEPTION WHEN check_violation THEN rejected := true; END;
  IF NOT rejected THEN RAISE EXCEPTION 'obsolete base branch edit accepted'; END IF;
  IF NOT public.migrate_agent_run_base_branch(legacy_run,project,clear_branch,cipher) OR
     public.migrate_agent_run_base_branch(legacy_run,project,clear_branch,cipher) THEN
    RAISE EXCEPTION 'run base branch compare-and-swap failed';
  END IF;
  IF EXISTS (SELECT 1 FROM public.agent_runs WHERE id IN (legacy_run,encrypted_run)
      AND base_branch LIKE '%private/%') OR
     EXISTS (SELECT 1 FROM public.agent_runtime_sessions
       WHERE current_run_id IN (legacy_run,encrypted_run)
         AND base_branch LIKE '%private/%') THEN
    RAISE EXCEPTION 'run or runtime base branch plaintext remains';
  END IF;
  rejected := false;
  BEGIN
    UPDATE public.agent_runtime_sessions SET base_branch=clear_branch
      WHERE current_run_id=encrypted_run;
  EXCEPTION WHEN check_violation THEN rejected := true; END;
  IF NOT rejected THEN RAISE EXCEPTION 'obsolete runtime writer accepted'; END IF;
  rejected := false;
  BEGIN
    UPDATE public.agent_runtime_sessions SET base_branch=cipher_v2
      WHERE current_run_id=encrypted_run;
  EXCEPTION WHEN check_violation THEN rejected := true; END;
  IF NOT rejected THEN RAISE EXCEPTION 'runtime copy divergence accepted'; END IF;
  UPDATE public.agent_runs SET base_branch=cipher_v2 WHERE id=encrypted_run;
  rejected := false;
  BEGIN
    UPDATE public.agent_runs SET base_branch=cipher WHERE id=encrypted_run;
  EXCEPTION WHEN check_violation THEN rejected := true; END;
  IF NOT rejected THEN RAISE EXCEPTION 'base branch key rollback accepted'; END IF;
  INSERT INTO public.agent_conversations(id,project_id,owner_id)
    VALUES(orphan_conversation,project,actor);
  INSERT INTO public.agent_runtime_sessions(conversation_id,base_branch)
    VALUES(orphan_conversation,cipher);
  IF NOT public.migrate_orphan_agent_runtime_base_branch(
      orphan_conversation,project,cipher,NULL,cipher_v2) OR
     public.migrate_orphan_agent_runtime_base_branch(
      orphan_conversation,project,cipher,NULL,cipher_v2) THEN
    RAISE EXCEPTION 'orphan base branch compare-and-swap failed';
  END IF;
  IF has_function_privilege('authenticated',
      'public.migrate_agent_run_base_branch(uuid,uuid,text,text)','EXECUTE') OR
     has_function_privilege('authenticated',
      'public.migrate_orphan_agent_runtime_base_branch(uuid,uuid,text,uuid,text)','EXECUTE') OR
     EXISTS (SELECT 1 FROM pg_publication_tables
       WHERE schemaname='public' AND tablename IN
         ('agent_runs','agent_runtime_sessions')) THEN
    RAISE EXCEPTION 'base branch client privilege or Realtime exposure';
  END IF;
END;
$test$;
ROLLBACK;
