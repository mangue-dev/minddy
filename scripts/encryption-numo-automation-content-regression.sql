-- Run on an isolated schema-only database after migration 20270107550000.
BEGIN;
DO $$
DECLARE
  owner_id uuid := gen_random_uuid();
  project_id uuid := gen_random_uuid();
  issue_id uuid := gen_random_uuid();
  chain_id uuid;
  conversation_id uuid := gen_random_uuid();
  operation_id uuid := gen_random_uuid();
  legacy_id uuid := gen_random_uuid();
  other_issue uuid := gen_random_uuid();
  other_chain uuid;
  reserved public.numo_automation_operations;
  historical_issue uuid := gen_random_uuid();
  historical_chain uuid;
  historical_conversation uuid := gen_random_uuid();
  historical_operation uuid := gen_random_uuid();
  cipher text := 'mdyo3:2:YWJj';
  context_cipher jsonb;
  blockers_cipher jsonb;
BEGIN
  INSERT INTO auth.users(id) VALUES(owner_id);
  INSERT INTO public.projects(id,owner_id,name,key)
    VALUES(project_id,owner_id,'Automation fixture','AUTO');
  INSERT INTO public.issues(id,project_id,number,title)
    VALUES(issue_id,project_id,1,'Generic issue');
  INSERT INTO public.agent_chains(project_id,issue_id,owner_id,status,
    step,played_rule_ids) VALUES(project_id,issue_id,owner_id,'running',
      1,'["rule"]'::jsonb) RETURNING id INTO chain_id;
  INSERT INTO public.conversations(id,user_id,title)
    VALUES(conversation_id,owner_id,'Generic conversation');
  context_cipher := jsonb_build_object(
    'encrypted_operation_value',
      jsonb_build_object('format',3,'keyVersion',2)::text,
    'encryption_version',2,'project_id',project_id,
    'chain_id',chain_id,'step',1,'field','context');
  blockers_cipher := jsonb_set(context_cipher,'{field}',
    '"outcome_blockers"'::jsonb);
  INSERT INTO public.numo_automation_operations(id,chain_id,step,rule_id,
    mode,conversation_id,request_id,prompt,locale,context,outcome,
    outcome_summary,outcome_blockers)
    VALUES(operation_id,chain_id,1,'rule','verify',conversation_id,
      gen_random_uuid(),cipher,'en',context_cipher,'failed',cipher,
      blockers_cipher);
  IF EXISTS (SELECT 1 FROM public.numo_automation_operations
      WHERE id=operation_id AND (prompt LIKE '%Private%' OR
        context::text LIKE '%Private%' OR outcome_summary LIKE '%Private%' OR
        outcome_blockers::text LIKE '%Private%')) THEN
    RAISE EXCEPTION 'operation retained clear content';
  END IF;
  BEGIN
    UPDATE public.numo_automation_operations
      SET outcome_summary='Private outcome' WHERE id=operation_id;
    RAISE EXCEPTION 'old outcome writer was accepted';
  EXCEPTION WHEN check_violation THEN
    IF SQLERRM='old outcome writer was accepted' THEN RAISE; END IF;
  END;
  BEGIN
    UPDATE public.numo_automation_operations
      SET context='{"issue":"Private title"}'::jsonb WHERE id=operation_id;
    RAISE EXCEPTION 'old context writer was accepted';
  EXCEPTION WHEN check_violation THEN
    IF SQLERRM='old context writer was accepted' THEN RAISE; END IF;
  END;
  BEGIN
    UPDATE public.numo_automation_operations SET outcome=NULL,
      outcome_blockers='["Private blocker"]'::jsonb WHERE id=operation_id;
    RAISE EXCEPTION 'old blockers writer was accepted';
  EXCEPTION WHEN check_violation THEN
    IF SQLERRM='old blockers writer was accepted' THEN RAISE; END IF;
  END;
  -- A separate step reaches the original reservation writer, not its replay.
  UPDATE public.agent_chains SET step=2,
    played_rule_ids='["rule","next"]'::jsonb WHERE id=chain_id;
  BEGIN
    PERFORM public.ensure_numo_automation_operation(chain_id,2,'next',
      'verify',owner_id,'Generic conversation',gen_random_uuid(),
      'Private prompt','en','{"issue":"Private title"}'::jsonb);
    RAISE EXCEPTION 'old reservation writer was accepted';
  EXCEPTION WHEN check_violation THEN
    IF SQLERRM='old reservation writer was accepted' THEN RAISE; END IF;
  END;
  INSERT INTO public.issues(id,project_id,number,title)
    VALUES(other_issue,project_id,2,'Private issue title');
  INSERT INTO public.agent_chains(project_id,issue_id,owner_id,status,
    step,played_rule_ids) VALUES(project_id,other_issue,owner_id,'running',
      1,'["rule"]'::jsonb) RETURNING id INTO other_chain;
  context_cipher := jsonb_set(context_cipher,'{chain_id}',
    to_jsonb(other_chain::text));
  SELECT * INTO reserved FROM public.ensure_numo_automation_operation(
    other_chain,1,'rule','verify',owner_id,'Private issue title',
    gen_random_uuid(),cipher,'en',context_cipher);
  IF (SELECT title FROM public.conversations
      WHERE id=reserved.conversation_id) <> 'AUTO-2' THEN
    RAISE EXCEPTION 'reservation copied the private issue title';
  END IF;
  context_cipher := jsonb_set(context_cipher,'{chain_id}',
    to_jsonb(chain_id::text));
  PERFORM set_config('session_replication_role','replica',true);
  INSERT INTO public.numo_automation_operations(id,chain_id,step,rule_id,
    mode,conversation_id,request_id,prompt,locale,context,outcome,
    outcome_summary,outcome_blockers)
    VALUES(legacy_id,chain_id,3,'legacy','verify',conversation_id,
      gen_random_uuid(),'Private legacy prompt','en',
      '{"issue":"Private legacy title"}'::jsonb,'failed',
      'Private legacy summary','["Private legacy blocker"]'::jsonb);
  PERFORM set_config('session_replication_role','origin',true);
  IF public.migrate_numo_automation_content(legacy_id,'wrong',
      '{"issue":"Private legacy title"}'::jsonb,
      'Private legacy summary','["Private legacy blocker"]'::jsonb,
      cipher,context_cipher,cipher,blockers_cipher) THEN
    RAISE EXCEPTION 'stale operation CAS was accepted';
  END IF;
  context_cipher := jsonb_set(context_cipher,'{step}','3'::jsonb);
  blockers_cipher := jsonb_set(blockers_cipher,'{step}','3'::jsonb);
  IF NOT public.migrate_numo_automation_content(legacy_id,
      'Private legacy prompt','{"issue":"Private legacy title"}'::jsonb,
      'Private legacy summary','["Private legacy blocker"]'::jsonb,
      cipher,context_cipher,cipher,blockers_cipher) THEN
    RAISE EXCEPTION 'legacy operation CAS was refused';
  END IF;
  IF EXISTS (SELECT 1 FROM public.numo_automation_operations
      WHERE id=legacy_id AND (prompt LIKE '%Private%' OR
        context::text LIKE '%Private%' OR outcome_summary LIKE '%Private%' OR
        outcome_blockers::text LIKE '%Private%' OR
        content_encryption_checked_at IS NULL)) THEN
    RAISE EXCEPTION 'legacy operation retained clear content';
  END IF;
  INSERT INTO public.issues(id,project_id,number,title)
    VALUES(historical_issue,project_id,3,'Private historical issue');
  INSERT INTO public.agent_chains(project_id,issue_id,owner_id,status)
    VALUES(project_id,historical_issue,owner_id,'stopped')
    RETURNING id INTO historical_chain;
  INSERT INTO public.conversations(id,user_id,title)
    VALUES(historical_conversation,owner_id,
      'AUTO-3: Private historical issue');
  PERFORM set_config('session_replication_role','replica',true);
  INSERT INTO public.numo_automation_operations(id,chain_id,step,rule_id,
    mode,conversation_id,request_id,prompt,locale,context,outcome,
    outcome_summary,outcome_blockers)
    VALUES(historical_operation,historical_chain,1,'legacy','verify',
      historical_conversation,gen_random_uuid(),'Private prompt','en',
      '{}'::jsonb,'failed','Private summary','[]'::jsonb);
  PERFORM set_config('session_replication_role','origin',true);
  context_cipher := jsonb_set(context_cipher,'{chain_id}',
    to_jsonb(historical_chain::text));
  context_cipher := jsonb_set(context_cipher,'{step}','1'::jsonb);
  blockers_cipher := jsonb_set(blockers_cipher,'{chain_id}',
    to_jsonb(historical_chain::text));
  blockers_cipher := jsonb_set(blockers_cipher,'{step}','1'::jsonb);
  IF NOT public.migrate_numo_automation_content(historical_operation,
      'Private prompt','{}'::jsonb,'Private summary','[]'::jsonb,
      cipher,context_cipher,cipher,blockers_cipher) THEN
    RAISE EXCEPTION 'historical operation conversion failed';
  END IF;
  IF (SELECT title FROM public.conversations
      WHERE id=historical_conversation) <> 'AUTO-3' THEN
    RAISE EXCEPTION 'historical conversation retained issue title';
  END IF;
  IF has_function_privilege('authenticated',
    'public.migrate_numo_automation_content(uuid,text,jsonb,text,jsonb,text,jsonb,text,jsonb)',
    'EXECUTE') THEN RAISE EXCEPTION 'client can migrate operations'; END IF;
END $$;
ROLLBACK;
