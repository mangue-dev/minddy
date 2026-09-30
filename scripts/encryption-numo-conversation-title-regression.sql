-- Run on an isolated schema-only database after migration 20270107570000.
BEGIN;
DO $$
DECLARE
  actor uuid := gen_random_uuid();
  legacy uuid := gen_random_uuid();
  protected uuid := gen_random_uuid();
  request_id uuid := gen_random_uuid();
  project_id uuid := gen_random_uuid();
  issue_id uuid := gen_random_uuid();
  chain_id uuid;
  operation public.numo_automation_operations;
  routine_id uuid;
  occurrence public.numo_routine_occurrences;
  cipher text := 'mdyn3:2:YWJj';
  long_cipher text := 'mdyn3:2:' || repeat('A',220);
  context_cipher jsonb;
BEGIN
  INSERT INTO auth.users(id) VALUES(actor);
  INSERT INTO public.conversations(id,user_id,title)
    VALUES(legacy,actor,'Private legacy conversation title');
  INSERT INTO public.conversations(id,user_id,title)
    VALUES(protected,actor,cipher);
  IF EXISTS (SELECT 1 FROM public.conversations WHERE id=protected
      AND title LIKE '%Private%') OR
     EXISTS (SELECT 1 FROM public.numo_conversation_history
       WHERE legacy_id=protected AND title LIKE '%Private%') THEN
    RAISE EXCEPTION 'Numo title source or projection retained plaintext';
  END IF;
  BEGIN
    INSERT INTO public.conversations(user_id,title)
      VALUES(actor,'Private obsolete title');
    RAISE EXCEPTION 'old conversation writer was accepted';
  EXCEPTION WHEN check_violation THEN
    IF SQLERRM='old conversation writer was accepted' THEN RAISE; END IF;
  END;
  BEGIN
    UPDATE public.conversations SET title='Private obsolete edit'
      WHERE id=protected;
    RAISE EXCEPTION 'old title editor was accepted';
  EXCEPTION WHEN check_violation THEN
    IF SQLERRM='old title editor was accepted' THEN RAISE; END IF;
  END;
  IF public.migrate_numo_conversation_title(legacy,'wrong',cipher) OR
      NOT public.migrate_numo_conversation_title(legacy,
        'Private legacy conversation title',cipher) THEN
    RAISE EXCEPTION 'title migration CAS failed';
  END IF;
  IF EXISTS (SELECT 1 FROM public.conversations WHERE id=legacy
      AND (title LIKE '%Private%' OR title_encryption_checked_at IS NULL)) THEN
    RAISE EXCEPTION 'historical Numo title retained plaintext';
  END IF;
  SELECT id INTO request_id FROM public.numo_conversation_ids
    WHERE assistant_id=protected;
  PERFORM public.update_numo_conversation(request_id,actor,
    jsonb_build_object('title',long_cipher));
  IF (SELECT title FROM public.conversations WHERE id=protected)
      IS DISTINCT FROM long_cipher THEN
    RAISE EXCEPTION 'protected assistant title edit was refused';
  END IF;
  INSERT INTO public.projects(id,owner_id,name,key)
    VALUES(project_id,actor,'Generic project','AUTO');
  INSERT INTO public.agent_routines(project_id,owner_id,title,prompt,
    frequency) VALUES(project_id,actor,'Generic routine','Generic prompt',
      'daily') RETURNING id INTO routine_id;
  request_id := gen_random_uuid();
  SELECT * INTO occurrence FROM public.ensure_numo_routine_occurrence(
    routine_id,actor,'manual',NULL,request_id,cipher);
  IF occurrence.conversation_id IS DISTINCT FROM request_id OR
      (SELECT title FROM public.conversations WHERE id=request_id)
        IS DISTINCT FROM cipher THEN
    RAISE EXCEPTION 'routine reservation copied a clear title';
  END IF;
  INSERT INTO public.issues(id,project_id,number,title)
    VALUES(issue_id,project_id,1,'Private issue title');
  INSERT INTO public.agent_chains(project_id,issue_id,owner_id,status,
    step,played_rule_ids) VALUES(project_id,issue_id,actor,'running',
      1,'["rule"]'::jsonb) RETURNING id INTO chain_id;
  request_id := gen_random_uuid();
  context_cipher := jsonb_build_object('encrypted_operation_value',
      jsonb_build_object('format',3,'keyVersion',2)::text,
      'encryption_version',2,'project_id',project_id,
      'chain_id',chain_id,'step',1,'field','context');
  SELECT * INTO operation FROM public.ensure_numo_automation_operation(
    chain_id,1,'rule','verify',actor,cipher,request_id,
    'mdyo3:2:YWJj','en',context_cipher);
  IF operation.conversation_id IS DISTINCT FROM request_id OR
      (SELECT title FROM public.conversations WHERE id=request_id)
        IS DISTINCT FROM cipher THEN
    RAISE EXCEPTION 'automation reservation copied a clear title';
  END IF;
  IF has_function_privilege('authenticated',
      'public.migrate_numo_conversation_title(uuid,text,text)','EXECUTE') THEN
    RAISE EXCEPTION 'client can migrate Numo titles';
  END IF;
END $$;
ROLLBACK;
