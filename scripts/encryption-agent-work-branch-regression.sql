-- Verify work branches and their runtime/Numo artifact copies never retain clear text.
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
  prefix text := 'mdyw3:' || repeat('a',64);
  cipher text := prefix || ':1:YWJj'; cipher_v2 text := prefix || ':2:YWJj';
  rejected boolean;
BEGIN
  INSERT INTO auth.users(id) VALUES(actor);
  INSERT INTO public.projects(id,owner_id,name,key)
    VALUES(project,actor,'Work branch fixture project','AWB');
  INSERT INTO public.agent_runs(id,project_id,created_by,branch_name)
    VALUES(legacy_run,project,actor,clear_branch);
  INSERT INTO public.agent_runs(id,project_id,created_by,branch_name)
    VALUES(encrypted_run,project,actor,cipher);
  IF NOT EXISTS (SELECT 1 FROM public.agent_runtime_sessions
      WHERE current_run_id=encrypted_run AND work_branch=cipher) OR
     NOT EXISTS (SELECT 1 FROM public.agent_artifacts
      WHERE run_id=encrypted_run AND kind='branch' AND ref=prefix
        AND ref_ciphertext=cipher AND ref_bound_run_id=encrypted_run) OR
     NOT EXISTS (SELECT 1 FROM public.numo_artifacts
       WHERE run_id=encrypted_run AND kind='branch' AND ref=prefix) THEN
    RAISE EXCEPTION 'encrypted runtime or artifact copy missing';
  END IF;
  rejected := false;
  BEGIN
    INSERT INTO public.agent_runs(id,project_id,created_by,branch_name)
      VALUES(gen_random_uuid(),project,actor,clear_branch);
  EXCEPTION WHEN check_violation THEN rejected := true; END;
  IF NOT rejected THEN RAISE EXCEPTION 'obsolete work branch insert accepted'; END IF;
  rejected := false;
  BEGIN
    UPDATE public.agent_runs SET branch_name='private/new' WHERE id=legacy_run;
  EXCEPTION WHEN check_violation THEN rejected := true; END;
  IF NOT rejected THEN RAISE EXCEPTION 'obsolete work branch edit accepted'; END IF;
  IF NOT public.migrate_agent_run_work_branch(legacy_run,project,clear_branch,cipher) OR
     public.migrate_agent_run_work_branch(legacy_run,project,clear_branch,cipher) THEN
    RAISE EXCEPTION 'run work branch compare-and-swap failed';
  END IF;
  IF EXISTS (SELECT 1 FROM public.agent_runs WHERE id IN (legacy_run,encrypted_run)
      AND branch_name LIKE '%private/%') OR
     EXISTS (SELECT 1 FROM public.agent_runtime_sessions
       WHERE current_run_id IN (legacy_run,encrypted_run)
         AND work_branch LIKE '%private/%') OR
     EXISTS (SELECT 1 FROM public.agent_artifacts
       WHERE conversation_id IN (SELECT conversation_id FROM public.agent_runs
         WHERE id IN (legacy_run,encrypted_run)) AND
         (ref LIKE '%private/%' OR ref_ciphertext LIKE '%private/%')) OR
     EXISTS (SELECT 1 FROM public.numo_artifacts
       WHERE ref LIKE '%private/%') THEN
    RAISE EXCEPTION 'run, runtime or Numo artifact plaintext remains';
  END IF;
  rejected := false;
  BEGIN
    UPDATE public.agent_runtime_sessions SET work_branch=clear_branch
      WHERE current_run_id=encrypted_run;
  EXCEPTION WHEN check_violation THEN rejected := true; END;
  IF NOT rejected THEN RAISE EXCEPTION 'obsolete runtime writer accepted'; END IF;
  rejected := false;
  BEGIN
    INSERT INTO public.agent_artifacts(conversation_id,kind,ref)
      SELECT conversation_id,'branch',clear_branch FROM public.agent_runs
      WHERE id=encrypted_run;
  EXCEPTION WHEN check_violation THEN rejected := true; END;
  IF NOT rejected THEN RAISE EXCEPTION 'obsolete artifact writer accepted'; END IF;
  UPDATE public.agent_runs SET branch_name=cipher_v2 WHERE id=encrypted_run;
  rejected := false;
  BEGIN
    UPDATE public.agent_runs SET branch_name=cipher WHERE id=encrypted_run;
  EXCEPTION WHEN check_violation THEN rejected := true; END;
  IF NOT rejected THEN RAISE EXCEPTION 'work branch key rollback accepted'; END IF;
  INSERT INTO public.agent_conversations(id,project_id,owner_id)
    VALUES(orphan_conversation,project,actor);
  INSERT INTO public.agent_runtime_sessions(conversation_id,work_branch)
    VALUES(orphan_conversation,cipher);
  IF NOT public.migrate_orphan_agent_runtime_work_branch(
      orphan_conversation,project,cipher,NULL,cipher_v2) OR
     public.migrate_orphan_agent_runtime_work_branch(
      orphan_conversation,project,cipher,NULL,cipher_v2) THEN
    RAISE EXCEPTION 'orphan runtime compare-and-swap failed';
  END IF;
  IF has_function_privilege('authenticated',
      'public.migrate_agent_run_work_branch(uuid,uuid,text,text)','EXECUTE') OR
     has_function_privilege('authenticated',
      'public.migrate_agent_artifact_branch(uuid,uuid,text,text,uuid,text,text)','EXECUTE') OR
     EXISTS (SELECT 1 FROM pg_publication_tables
       WHERE schemaname='public' AND tablename IN
         ('agent_runs','agent_runtime_sessions','agent_artifacts')) THEN
    RAISE EXCEPTION 'work branch client privilege or Realtime exposure';
  END IF;
END;
$test$;
ROLLBACK;
