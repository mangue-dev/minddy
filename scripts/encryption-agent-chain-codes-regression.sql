-- Run on an isolated schema-only database after migration 20270107530000.
BEGIN;
DO $$
DECLARE
  owner_id uuid := gen_random_uuid();
  project_id uuid := gen_random_uuid();
  issue_id uuid := gen_random_uuid();
  chain_id uuid;
  legacy_id uuid := gen_random_uuid();
  invalid_pending jsonb := '{"to":"todo","source":"private issue title"}'::jsonb;
BEGIN
  INSERT INTO auth.users(id) VALUES(owner_id);
  INSERT INTO public.projects(id,owner_id,name,key)
    VALUES(project_id,owner_id,'Chain fixture','CHAIN');
  INSERT INTO public.issues(id,project_id,number,title)
    VALUES(issue_id,project_id,1,'Private issue');
  INSERT INTO public.agent_chains(project_id,issue_id,owner_id,status,
    pending_event,stop_reason)
    VALUES(project_id,issue_id,owner_id,'pending',
      '{"to":"todo","source":"web"}'::jsonb,'interrupted')
    RETURNING id INTO chain_id;
  IF (SELECT codes_checked_at FROM public.agent_chains WHERE id=chain_id)
    IS NULL THEN RAISE EXCEPTION 'new chain was not marked'; END IF;

  BEGIN
    UPDATE public.agent_chains SET pending_event=invalid_pending
      WHERE id=chain_id;
    RAISE EXCEPTION 'old pending event writer was accepted';
  EXCEPTION WHEN check_violation THEN
    IF SQLERRM='old pending event writer was accepted' THEN RAISE; END IF;
  END;
  BEGIN
    UPDATE public.agent_chains SET stop_reason='private issue body'
      WHERE id=chain_id;
    RAISE EXCEPTION 'old stop reason writer was accepted';
  EXCEPTION WHEN check_violation THEN
    IF SQLERRM='old stop reason writer was accepted' THEN RAISE; END IF;
  END;
  IF public.agent_chain_pending_event_is_code('"private text"'::jsonb) THEN
    RAISE EXCEPTION 'scalar payload was accepted';
  END IF;

  PERFORM set_config('session_replication_role','replica',true);
  INSERT INTO public.agent_chains(id,project_id,issue_id,owner_id,status,
    pending_event,stop_reason,codes_checked_at)
    VALUES(legacy_id,project_id,issue_id,owner_id,'stopped',
      invalid_pending,'private error text',null);
  PERFORM set_config('session_replication_role','origin',true);
  IF public.migrate_agent_chain_codes(legacy_id,'{}'::jsonb,
      'private error text') THEN
    RAISE EXCEPTION 'stale chain CAS was accepted';
  END IF;
  IF NOT public.migrate_agent_chain_codes(legacy_id,invalid_pending,
      'private error text') THEN
    RAISE EXCEPTION 'legacy chain CAS was refused';
  END IF;
  IF EXISTS (SELECT 1 FROM public.agent_chains WHERE id=legacy_id
      AND (pending_event IS NOT NULL OR stop_reason<>'invalid'
        OR codes_checked_at IS NULL)) THEN
    RAISE EXCEPTION 'historical chain retained free content';
  END IF;
  IF has_function_privilege('authenticated',
      'public.migrate_agent_chain_codes(uuid,jsonb,text)','EXECUTE') THEN
    RAISE EXCEPTION 'client can migrate chain codes';
  END IF;
END $$;
ROLLBACK;
