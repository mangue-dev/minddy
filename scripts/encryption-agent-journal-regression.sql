-- Verify durable agent journal guards and versioned migration on isolated SQL.
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
  other_project uuid := gen_random_uuid();
  conversation uuid := gen_random_uuid(); run uuid := gen_random_uuid();
  legacy bigint; fresh bigint;
  cipher text := '{"format":3,"keyVersion":1,"data":"test-only-placeholder"}';
  digest text := repeat('a',64);
BEGIN
  INSERT INTO auth.users(id) VALUES(actor);
  INSERT INTO public.projects(id,owner_id,name,key) VALUES(project,actor,'Private project','AJT');
  INSERT INTO public.projects(id,owner_id,name,key) VALUES(other_project,actor,'Other project','AJO');
  INSERT INTO public.agent_conversations(id,project_id,owner_id)
    VALUES(conversation,project,actor);
  INSERT INTO public.agent_runs(id,project_id,conversation_id,created_by)
    VALUES(run,project,conversation,actor);
  INSERT INTO public.agent_run_journal(run_id,session_id,events)
    VALUES(run,'session', '[{"output":"private"}]') RETURNING id INTO legacy;
  IF NOT public.agent_journal_legacy_batch_exists(run,'session','[{"output":"private"}]') THEN
    RAISE EXCEPTION 'legacy journal duplicate lookup failed';
  END IF;
  IF NOT public.migrate_agent_journal_ciphertext(legacy,run,0) THEN
    RAISE EXCEPTION 'journal attempt did not mark';
  END IF;
  IF NOT public.migrate_agent_journal_ciphertext(
    legacy,run,0,cipher,digest,1,1,25,20) THEN
    RAISE EXCEPTION 'journal conversion did not commit';
  END IF;
  IF public.migrate_agent_journal_ciphertext(
    legacy,run,0,cipher,digest,1,1,25,20) THEN
    RAISE EXCEPTION 'stale journal migration won';
  END IF;
  IF EXISTS(SELECT 1 FROM public.agent_run_journal WHERE id=legacy AND
    (events IS NOT NULL OR payload_sha256<>digest OR encryption_version<>1)) THEN
    RAISE EXCEPTION 'journal retained plaintext';
  END IF;
  IF NOT EXISTS(SELECT 1 FROM public.agent_journal_encryption_scopes WHERE project_id=project) THEN
    RAISE EXCEPTION 'journal writer fence was not activated';
  END IF;
  BEGIN
    UPDATE public.agent_runs SET project_id=other_project WHERE id=run;
    RAISE EXCEPTION 'journal parent scope moved';
  EXCEPTION WHEN check_violation THEN NULL; END;
  BEGIN
    INSERT INTO public.agent_run_journal(run_id,session_id,events)
      VALUES(run,'session', '[{"output":"obsolete"}]');
    RAISE EXCEPTION 'obsolete journal writer accepted';
  EXCEPTION WHEN check_violation THEN NULL; END;
  BEGIN
    UPDATE public.agent_run_journal SET payload='plaintext' WHERE id=legacy;
    RAISE EXCEPTION 'journal accepted an unguarded edit';
  EXCEPTION WHEN check_violation THEN NULL; END;
  INSERT INTO public.agent_run_journal(run_id,session_id,events,payload,
    payload_encoding,payload_sha256,event_count,payload_bytes,stored_bytes,
    encryption_version)
    VALUES(run,'session',NULL,cipher,'encrypted-gzip-json-v1',
      repeat('b',64),1,25,20,1) RETURNING id INTO fresh;
  IF fresh IS NULL THEN RAISE EXCEPTION 'new encrypted journal failed'; END IF;
  IF has_table_privilege('authenticated','public.agent_run_journal','INSERT') OR
     has_table_privilege('authenticated','public.agent_run_journal','UPDATE') OR
     has_table_privilege('authenticated','public.agent_journal_encryption_scopes','SELECT') OR
     has_function_privilege('authenticated',
       'public.migrate_agent_journal_ciphertext(bigint,uuid,integer,text,text,integer,integer,integer,integer)',
       'EXECUTE') OR
     has_function_privilege('authenticated',
       'public.agent_journal_legacy_batch_exists(uuid,text,jsonb)',
       'EXECUTE') THEN
    RAISE EXCEPTION 'journal client retained write or migration privilege';
  END IF;
  IF EXISTS(SELECT 1 FROM pg_publication_tables
    WHERE schemaname='public' AND tablename='agent_run_journal') OR
    EXISTS(SELECT 1 FROM pg_trigger
      WHERE tgrelid='public.agent_run_journal'::regclass AND NOT tgisinternal
        AND tgname <> 'agent_journal_encryption_guard') THEN
    RAISE EXCEPTION 'journal has a plaintext Realtime path';
  END IF;
END;
$test$;
ROLLBACK;
