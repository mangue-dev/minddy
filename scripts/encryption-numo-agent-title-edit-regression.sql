-- Verify Numo edits of protected agent titles on an isolated database.
BEGIN;
DO $$
DECLARE
  actor uuid := gen_random_uuid();
  project uuid := gen_random_uuid();
  run_id uuid := gen_random_uuid();
  conversation_id uuid;
  cipher text := '{"format":3,"keyVersion":2,"data":"test-only-placeholder"}';
BEGIN
  INSERT INTO auth.users(id) VALUES(actor);
  INSERT INTO public.projects(id,owner_id,name,key)
    VALUES(project,actor,'Generic project','AEDIT');
  INSERT INTO public.agent_runs(id,project_id,created_by,
    title_ciphertext,title_encryption_version)
    VALUES(run_id,project,actor,cipher,2);
  SELECT id INTO conversation_id FROM public.numo_conversation_ids
    WHERE agent_id=run_id;
  IF conversation_id IS NULL THEN
    RAISE EXCEPTION 'Numo agent identity is unavailable';
  END IF;
  PERFORM public.update_numo_conversation(conversation_id,actor,
    jsonb_build_object('title',NULL,'title_ciphertext',cipher,
      'title_encryption_version',2));
  IF EXISTS (SELECT 1 FROM public.agent_conversations
      WHERE id=run_id AND (title IS NOT NULL OR
        title_ciphertext IS DISTINCT FROM cipher OR
        title_encryption_version<>2)) THEN
    RAISE EXCEPTION 'Numo edit retained clear agent title';
  END IF;
  IF EXISTS (SELECT 1 FROM public.numo_conversation_history
      WHERE id=conversation_id AND title LIKE '%Private%') THEN
    RAISE EXCEPTION 'Numo history projected a clear agent title';
  END IF;
  BEGIN
    PERFORM public.update_numo_conversation(conversation_id,actor,
      '{"title":"Private obsolete writer"}'::jsonb);
    RAISE EXCEPTION 'obsolete Numo title writer was accepted';
  EXCEPTION WHEN check_violation THEN
    IF SQLERRM='obsolete Numo title writer was accepted' THEN RAISE; END IF;
  END;
  IF has_function_privilege('authenticated',
      'public.update_numo_conversation(uuid,uuid,jsonb)','EXECUTE') THEN
    RAISE EXCEPTION 'client can bypass Numo title authorization';
  END IF;
END $$;
ROLLBACK;
