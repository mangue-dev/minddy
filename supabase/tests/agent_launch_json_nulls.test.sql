-- Run after migrations against a disposable database; no fixture rows survive.
BEGIN;

INSERT INTO auth.users(id) VALUES ('62000000-0000-4000-8000-000000000001');
INSERT INTO public.projects(id,owner_id,name,key) VALUES
  ('62000000-0000-4000-8000-000000000010','62000000-0000-4000-8000-000000000001','Encrypted admission','JNLE'),
  ('62000000-0000-4000-8000-000000000011','62000000-0000-4000-8000-000000000001','Legacy admission','JNLL');
INSERT INTO public.conversations(id,user_id,title) VALUES
  ('62000000-0000-4000-8000-000000000020','62000000-0000-4000-8000-000000000001','Encrypted parent'),
  ('62000000-0000-4000-8000-000000000021','62000000-0000-4000-8000-000000000001','Legacy parent');
INSERT INTO public.numo_assistant_turns(id,conversation_id,user_id,request_id,run_id,status,managed_budget_usd) VALUES
  ('62000000-0000-4000-8000-000000000030','62000000-0000-4000-8000-000000000020','62000000-0000-4000-8000-000000000001',gen_random_uuid(),gen_random_uuid(),'reconciling',2),
  ('62000000-0000-4000-8000-000000000031','62000000-0000-4000-8000-000000000021','62000000-0000-4000-8000-000000000001',gen_random_uuid(),gen_random_uuid(),'reconciling',2);

CREATE FUNCTION pg_temp.launch_values(encrypted boolean, call_id text) RETURNS jsonb
LANGUAGE plpgsql AS $$
DECLARE
  project_id uuid := CASE WHEN encrypted THEN '62000000-0000-4000-8000-000000000010' ELSE '62000000-0000-4000-8000-000000000011' END;
  parent_id uuid := CASE WHEN encrypted THEN '62000000-0000-4000-8000-000000000020' ELSE '62000000-0000-4000-8000-000000000021' END;
  turn_id uuid := CASE WHEN encrypted THEN '62000000-0000-4000-8000-000000000030' ELSE '62000000-0000-4000-8000-000000000031' END;
  conversation_id uuid := gen_random_uuid();
  brief jsonb;
BEGIN
  INSERT INTO public.agent_conversations(id,owner_id,project_id,visibility,title)
    VALUES(conversation_id,'62000000-0000-4000-8000-000000000001',project_id,'private','Admission fixture');
  brief := jsonb_build_object('version',1,'objective','Read the repository',
    'correlation',jsonb_build_object('parentConversationId',parent_id,'parentTurnId',turn_id,'toolCallId',call_id),
    'targetRepository',jsonb_build_object('projectId',project_id),
    'sourceReferences','[]'::jsonb,'constraints','[]'::jsonb,
    'authorizedWork','["read_repository"]'::jsonb,'expectedOutput','["report"]'::jsonb);
  RETURN jsonb_build_object('id',gen_random_uuid(),'run_id',gen_random_uuid(),
    'conversation_id',conversation_id,'project_id',project_id,
    'created_by','62000000-0000-4000-8000-000000000001','status','queued',
    'triggered_by','chat','key_mode','platform','worker_model_source','account',
    'worker_model_provider','openrouter','model','fixture-model','model_forced',false,
    'reasoning_level','medium','agent_engine','opencode','loop_in_vm',true,
    'local_exec',false,'local_worktree',false,'local_issue_context_confirmed',false,
    'parent_numo_conversation_id',parent_id,'parent_numo_turn_id',turn_id,'parent_numo_tool_call_id',call_id,
    'prompt',CASE WHEN encrypted THEN NULL ELSE 'Read the repository' END,
    'prompt_mentions',CASE WHEN encrypted THEN NULL ELSE '[]'::jsonb END,
    'encrypted_launch_content',CASE WHEN encrypted THEN '{"format":3,"keyVersion":1}' ELSE NULL END,
    'launch_encryption_version',CASE WHEN encrypted THEN 1 ELSE 0 END,'has_launch_prompt',true,
    'delegation_brief',CASE WHEN encrypted THEN NULL ELSE brief END,
    'delegation_attachments','[]'::jsonb,
    'encrypted_delegation_input',CASE WHEN encrypted THEN '{"format":3,"keyVersion":1}' ELSE NULL END,
    'delegation_encryption_version',CASE WHEN encrypted THEN 1 ELSE 0 END);
END $$;

CREATE FUNCTION pg_temp.admit(payload jsonb, cap numeric DEFAULT 10, requested numeric DEFAULT 1) RETURNS jsonb
LANGUAGE sql AS $$
  SELECT public.create_agent_run_with_budget('62000000-0000-4000-8000-000000000001',
    '2026-10-01T00:00:00Z',cap,requested,payload);
$$;

DO $$
DECLARE
  payload jsonb;
  result jsonb;
  run public.agent_runs;
  run_count integer;
  constraint_name text;
BEGIN
  IF has_function_privilege('anon','public.create_agent_run_with_budget(uuid,timestamptz,numeric,numeric,jsonb)','EXECUTE')
     OR has_function_privilege('authenticated','public.create_agent_run_with_budget(uuid,timestamptz,numeric,numeric,jsonb)','EXECUTE')
     OR NOT has_function_privilege('service_role','public.create_agent_run_with_budget(uuid,timestamptz,numeric,numeric,jsonb)','EXECUTE') THEN
    RAISE EXCEPTION 'Admission RPC execution grants changed';
  END IF;
  -- This exact encrypted payload failed on the original RPC with 23514.
  payload := pg_temp.launch_values(true,'encrypted-explicit-null');
  result := pg_temp.admit(payload);
  SELECT * INTO run FROM public.agent_runs WHERE id=(result#>>'{run,id}')::uuid;
  IF run.id IS NULL OR run.delegation_brief IS NOT NULL OR run.prompt_mentions IS NOT NULL
     OR run.delegation_encryption_version <> 1 OR run.launch_encryption_version <> 1
     OR run.encrypted_delegation_input IS NULL OR run.encrypted_launch_content IS NULL
     OR run.delegation_attachments <> '[]'::jsonb OR run.managed_budget_usd <> 2 THEN
    RAISE EXCEPTION 'Encrypted admission failed to preserve SQL NULL, ciphertext, or parent budget';
  END IF;

  payload := pg_temp.launch_values(true,'encrypted-omitted-null') - 'delegation_brief' - 'prompt_mentions';
  result := pg_temp.admit(payload);
  IF result#>>'{run,id}' IS NULL THEN RAISE EXCEPTION 'Omitted nullable fields were rejected'; END IF;

  payload := pg_temp.launch_values(false,'legacy-brief');
  result := pg_temp.admit(payload);
  SELECT * INTO run FROM public.agent_runs WHERE id=(result#>>'{run,id}')::uuid;
  IF run.delegation_brief IS DISTINCT FROM payload->'delegation_brief'
     OR run.prompt_mentions IS DISTINCT FROM '[]'::jsonb OR run.prompt <> 'Read the repository'
     OR run.delegation_encryption_version <> 0 THEN
    RAISE EXCEPTION 'Legacy launch content changed';
  END IF;

  -- Explicit JSON null is normalized even for a non-delegated legacy launch.
  payload := pg_temp.launch_values(false,'no-parent') - ARRAY[
    'parent_numo_conversation_id','parent_numo_turn_id','parent_numo_tool_call_id'];
  payload := payload || '{"delegation_brief":null,"prompt_mentions":null}'::jsonb;
  result := pg_temp.admit(payload);
  IF result#>>'{run,id}' IS NULL OR result#>'{run,delegation_brief}' <> 'null'::jsonb THEN
    RAISE EXCEPTION 'Non-delegated null brief was rejected';
  END IF;

  SELECT count(*) INTO run_count FROM public.agent_runs;
  IF pg_temp.admit(payload,0)#>>'{run,id}' IS NOT NULL THEN RAISE EXCEPTION 'Account cap was bypassed'; END IF;
  BEGIN
    PERFORM pg_temp.admit(payload,10,0);
    RAISE EXCEPTION 'Zero reservation was accepted';
  EXCEPTION WHEN SQLSTATE '22023' THEN NULL; END;
  BEGIN
    PERFORM pg_temp.admit(payload || '{"unsupported_field":true}'::jsonb);
    RAISE EXCEPTION 'Unknown admission field was accepted';
  EXCEPTION WHEN SQLSTATE '22023' THEN NULL; END;

  payload := pg_temp.launch_values(true,'wrong-parent') || jsonb_build_object('parent_numo_turn_id',gen_random_uuid());
  IF pg_temp.admit(payload)#>>'{run,id}' IS NOT NULL THEN RAISE EXCEPTION 'Missing parent was admitted'; END IF;

  -- Reject plaintext alongside ciphertext, rather than weakening encryption checks.
  payload := pg_temp.launch_values(true,'mixed-encryption') || '{"prompt_mentions":[]}'::jsonb;
  BEGIN
    PERFORM pg_temp.admit(payload);
    RAISE EXCEPTION 'Mixed plaintext and encrypted launch was accepted';
  EXCEPTION WHEN SQLSTATE '23514' THEN
    GET STACKED DIAGNOSTICS constraint_name = CONSTRAINT_NAME;
    IF constraint_name <> 'agent_runs_launch_encryption_state' THEN RAISE; END IF;
  END;
  payload := pg_temp.launch_values(false,'json-scalar') || '{"delegation_brief":false}'::jsonb;
  BEGIN
    PERFORM pg_temp.admit(payload);
    RAISE EXCEPTION 'Invalid scalar brief was accepted';
  EXCEPTION WHEN SQLSTATE '23514' THEN NULL; END;

  payload := pg_temp.launch_values(true,'encrypted-explicit-null');
  BEGIN
    PERFORM pg_temp.admit(payload);
    RAISE EXCEPTION 'Duplicate tool-call launch was accepted';
  EXCEPTION WHEN SQLSTATE '23505' THEN NULL; END;
  IF (SELECT count(*) FROM public.agent_runs) <> run_count THEN
    RAISE EXCEPTION 'Rejected admission left an extra run';
  END IF;
  IF (SELECT managed_budget_usd FROM public.numo_assistant_turns
      WHERE id='62000000-0000-4000-8000-000000000030') <> 2 THEN
    RAISE EXCEPTION 'Rejected admission changed the parent budget';
  END IF;
END $$;

ROLLBACK;
