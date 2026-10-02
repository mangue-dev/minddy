-- Exercise context snapshot conversion, parent scope, old writers, and Numo projection.
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
  other_project uuid := gen_random_uuid(); conversation uuid := gen_random_uuid();
  legacy_id uuid := gen_random_uuid(); encrypted_id uuid := gen_random_uuid();
  cipher text := '{"format":3,"keyVersion":1,"data":"test-only-placeholder"}';
  rejected boolean;
BEGIN
  INSERT INTO auth.users(id) VALUES(actor);
  INSERT INTO public.projects(id,owner_id,name,key)
    VALUES(project,actor,'Context fixture project','ACT'),
      (other_project,actor,'Other context fixture','ACO');
  INSERT INTO public.agent_conversations(id,project_id,owner_id)
    VALUES(conversation,project,actor);
  INSERT INTO public.agent_conversation_contexts(id,conversation_id,kind,resource_id,snapshot)
    VALUES(legacy_id,conversation,'issue',gen_random_uuid(),'{"title":"Private legacy title"}');
  INSERT INTO public.agent_conversation_contexts(id,conversation_id,kind,resource_id,
    snapshot,snapshot_ciphertext,snapshot_encryption_version)
    VALUES(encrypted_id,conversation,'page',gen_random_uuid(),'{}',cipher,1);
  rejected := false;
  BEGIN
    INSERT INTO public.agent_conversation_contexts(conversation_id,kind,resource_id,snapshot)
      VALUES(conversation,'feedback',gen_random_uuid(),'{"title":"Obsolete writer"}');
  EXCEPTION WHEN check_violation THEN rejected := true; END;
  IF NOT rejected THEN RAISE EXCEPTION 'obsolete context writer accepted'; END IF;
  rejected := false;
  BEGIN
    INSERT INTO public.agent_conversation_contexts(conversation_id,kind,resource_id)
      VALUES(conversation,'resource',gen_random_uuid());
  EXCEPTION WHEN check_violation THEN rejected := true; END;
  IF NOT rejected THEN RAISE EXCEPTION 'obsolete empty context writer accepted'; END IF;
  rejected := false;
  BEGIN
    UPDATE public.agent_conversation_contexts SET snapshot='{"title":"Obsolete edit"}'
      WHERE id=legacy_id;
  EXCEPTION WHEN check_violation THEN rejected := true; END;
  IF NOT rejected THEN RAISE EXCEPTION 'legacy context edit accepted'; END IF;
  rejected := false;
  BEGIN
    UPDATE public.agent_conversations SET project_id=other_project WHERE id=conversation;
  EXCEPTION WHEN check_violation THEN rejected := true; END;
  IF NOT rejected THEN RAISE EXCEPTION 'encrypted context parent moved'; END IF;
  IF NOT public.migrate_agent_context_snapshot(legacy_id,conversation,project,
      '{"title":"Private legacy title"}'::jsonb,NULL,0) OR
     NOT public.migrate_agent_context_snapshot(legacy_id,conversation,project,
      '{"title":"Private legacy title"}'::jsonb,NULL,0,cipher,1) OR
     public.migrate_agent_context_snapshot(legacy_id,conversation,project,
      '{"title":"Private legacy title"}'::jsonb,NULL,0,cipher,1) THEN
    RAISE EXCEPTION 'context conversion CAS failed';
  END IF;
  IF EXISTS (SELECT 1 FROM public.agent_conversation_contexts x
      WHERE x.id IN (legacy_id,encrypted_id) AND x.snapshot::text LIKE '%Private%') OR
     EXISTS (SELECT 1 FROM public.numo_contexts x
      WHERE x.id IN (legacy_id,encrypted_id) AND x.snapshot::text LIKE '%Private%') THEN
    RAISE EXCEPTION 'context plaintext projection remains';
  END IF;
  IF has_function_privilege('authenticated',
      'public.migrate_agent_context_snapshot(uuid,uuid,uuid,jsonb,text,integer,text,integer)',
      'EXECUTE') OR EXISTS (SELECT 1 FROM pg_publication_tables
        WHERE schemaname='public' AND tablename='agent_conversation_contexts') THEN
    RAISE EXCEPTION 'client privilege or Realtime exposes context';
  END IF;
END;
$test$;
ROLLBACK;
