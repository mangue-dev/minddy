-- Verify encrypted run checkpoints and their runtime-session copies.
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
  other_run uuid := gen_random_uuid();
  orphan_conversation uuid := gen_random_uuid();
  cipher text := '{"format":3,"keyVersion":1,"data":"test-only-placeholder"}';
  clear_state jsonb := '{"messages":[{"role":"user","content":"Private checkpoint text"}]}';
  rejected boolean;
BEGIN
  INSERT INTO auth.users(id) VALUES(actor);
  INSERT INTO public.projects(id,owner_id,name,key)
    VALUES(project,actor,'Fixture project','ACP');
  INSERT INTO public.agent_runs(id,project_id,created_by,checkpoint)
    VALUES(legacy_run,project,actor,clear_state);
  IF NOT EXISTS(SELECT 1 FROM public.agent_runtime_sessions
      WHERE conversation_id=legacy_run AND checkpoint=clear_state) THEN
    RAISE EXCEPTION 'legacy runtime copy missing';
  END IF;
  INSERT INTO public.agent_conversations(id,project_id,owner_id)
    VALUES(orphan_conversation,project,actor);
  INSERT INTO public.agent_runtime_sessions(conversation_id,checkpoint)
    VALUES(orphan_conversation,clear_state);
  INSERT INTO public.agent_runs(id,project_id,created_by,
    checkpoint_ciphertext,checkpoint_encryption_version)
    VALUES(encrypted_run,project,actor,cipher,1);
  IF NOT EXISTS(SELECT 1 FROM public.agent_runtime_sessions
      WHERE conversation_id=encrypted_run AND checkpoint IS NULL
        AND checkpoint_ciphertext=cipher AND checkpoint_encryption_version=1) THEN
    RAISE EXCEPTION 'encrypted runtime copy missing';
  END IF;
  rejected := false;
  BEGIN
    INSERT INTO public.agent_runs(id,project_id,created_by,checkpoint)
      VALUES(other_run,project,actor,clear_state);
  EXCEPTION WHEN check_violation THEN rejected := true; END;
  IF NOT rejected THEN RAISE EXCEPTION 'obsolete run checkpoint writer accepted'; END IF;
  rejected := false;
  BEGIN
    UPDATE public.agent_runs SET checkpoint=clear_state WHERE id=encrypted_run;
  EXCEPTION WHEN check_violation THEN rejected := true; END;
  IF NOT rejected THEN RAISE EXCEPTION 'obsolete checkpoint edit accepted'; END IF;
  UPDATE public.agent_runs SET last_activity_at=now() WHERE id=legacy_run;
  IF NOT public.migrate_agent_checkpoint_ciphertext(
      legacy_run,project,legacy_run,clear_state,NULL,0)
     OR NOT public.migrate_agent_checkpoint_ciphertext(
      legacy_run,project,legacy_run,clear_state,NULL,0,cipher,1)
     OR public.migrate_agent_checkpoint_ciphertext(
      legacy_run,project,legacy_run,clear_state,NULL,0,cipher,1) THEN
    RAISE EXCEPTION 'agent checkpoint migration CAS failed';
  END IF;
  IF EXISTS(SELECT 1 FROM public.agent_runs WHERE id=legacy_run
      AND (checkpoint IS NOT NULL OR checkpoint_ciphertext IS DISTINCT FROM cipher)) OR
     EXISTS(SELECT 1 FROM public.agent_runtime_sessions WHERE conversation_id=legacy_run
      AND (checkpoint IS NOT NULL OR checkpoint_ciphertext IS DISTINCT FROM cipher)) THEN
    RAISE EXCEPTION 'checkpoint migration retained plaintext';
  END IF;
  IF NOT public.migrate_orphan_agent_runtime_checkpoint(
      orphan_conversation,project,clear_state,NULL,0,cipher,1) THEN
    RAISE EXCEPTION 'orphan runtime checkpoint migration failed';
  END IF;
  IF EXISTS(SELECT 1 FROM public.agent_runtime_sessions
       WHERE conversation_id=orphan_conversation AND
         (checkpoint IS NOT NULL OR checkpoint_ciphertext IS DISTINCT FROM cipher)) THEN
    RAISE EXCEPTION 'orphan runtime checkpoint retained plaintext';
  END IF;
  rejected := false;
  BEGIN
    UPDATE public.agent_runtime_sessions SET checkpoint=clear_state,
      checkpoint_ciphertext=NULL, checkpoint_encryption_version=0
      WHERE conversation_id=encrypted_run;
  EXCEPTION WHEN check_violation THEN rejected := true; END;
  IF NOT rejected THEN RAISE EXCEPTION 'direct runtime copy edit accepted'; END IF;
  IF has_table_privilege('authenticated','public.agent_runtime_sessions','UPDATE') OR
     has_function_privilege('authenticated',
       'public.migrate_agent_checkpoint_ciphertext(uuid,uuid,uuid,jsonb,text,integer,text,integer)',
       'EXECUTE') OR
     has_function_privilege('authenticated',
       'public.migrate_orphan_agent_runtime_checkpoint(uuid,uuid,jsonb,text,integer,text,integer)',
       'EXECUTE') THEN
    RAISE EXCEPTION 'client retained checkpoint mutation privilege';
  END IF;
  IF EXISTS(SELECT 1 FROM pg_publication_tables WHERE schemaname='public'
      AND tablename IN ('agent_runs','agent_runtime_sessions')) THEN
    RAISE EXCEPTION 'agent checkpoint is published to Realtime';
  END IF;
END;
$test$;
ROLLBACK;
