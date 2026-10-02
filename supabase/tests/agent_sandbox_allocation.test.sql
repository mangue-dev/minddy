BEGIN;
INSERT INTO auth.users(id,email) VALUES('59120000-0000-4000-8000-000000000001','allocation-owner@example.test');
INSERT INTO public.projects(id,owner_id,name,key) VALUES('59120000-0000-4000-8000-000000000010','59120000-0000-4000-8000-000000000001','Allocation fixture','ALS');
INSERT INTO public.agent_conversations(id,project_id,owner_id,visibility) VALUES('59120000-0000-4000-8000-000000000020','59120000-0000-4000-8000-000000000010','59120000-0000-4000-8000-000000000001','private');
INSERT INTO public.agent_runs(id,project_id,conversation_id,created_by,status) VALUES('59120000-0000-4000-8000-000000000030','59120000-0000-4000-8000-000000000010','59120000-0000-4000-8000-000000000020','59120000-0000-4000-8000-000000000001','running');

DO $$ DECLARE v_id uuid; v_state public.agent_sandbox_allocations; BEGIN
  IF has_table_privilege('authenticated','public.agent_sandbox_allocations','SELECT') OR
     has_table_privilege('service_role','public.agent_sandbox_allocations','DELETE') OR
     has_function_privilege('authenticated','public.reserve_agent_sandbox_allocation(uuid,text)','EXECUTE') THEN
    RAISE EXCEPTION 'allocation ledger is exposed';
  END IF;
  v_id:=public.reserve_agent_sandbox_allocation('59120000-0000-4000-8000-000000000030','agent-v2-59120000-0000-4000-8000-000000000030');
  IF public.record_agent_allocation_key(v_id,'synthetic-key-1') IS NOT TRUE THEN RAISE EXCEPTION 'key attachment failed'; END IF;
  PERFORM public.begin_agent_account_erasure('59120000-0000-4000-8000-000000000001');
  IF public.agent_allocation_erasure_complete('account','59120000-0000-4000-8000-000000000001') IS TRUE THEN RAISE EXCEPTION 'pending allocation certified erasure'; END IF;
  IF public.attach_agent_sandbox_allocation(v_id) IS TRUE THEN RAISE EXCEPTION 'late sandbox crossed account fence'; END IF;
  IF public.complete_agent_allocation_cleanup(v_id) IS TRUE THEN RAISE EXCEPTION 'pending request certified cleanup'; END IF;
  SELECT * INTO v_state FROM public.revoke_agent_sandbox_allocations('account','59120000-0000-4000-8000-000000000001');
  IF v_state.provider_pending IS NOT TRUE OR v_state.provider_key_id<>'synthetic-key-1' THEN RAISE EXCEPTION 'revocation lost recovery handles'; END IF;
  IF public.record_agent_allocation_key(v_id,'wrong-overwrite') IS TRUE THEN RAISE EXCEPTION 'revocation handle replaced'; END IF;
  PERFORM public.settle_agent_sandbox_allocation(v_id);
  IF public.attach_agent_sandbox_allocation(v_id) IS TRUE THEN RAISE EXCEPTION 'settlement revived revoked allocation'; END IF;
  IF public.complete_agent_allocation_cleanup(v_id) IS NOT TRUE THEN RAISE EXCEPTION 'settled cleanup failed'; END IF;
  IF public.agent_allocation_erasure_complete('account','59120000-0000-4000-8000-000000000001') IS NOT TRUE THEN RAISE EXCEPTION 'completed cleanup still blocks erasure'; END IF;
  PERFORM public.begin_agent_project_erasure('59120000-0000-4000-8000-000000000010');
  BEGIN
    UPDATE public.agent_runs SET status='queued' WHERE id='59120000-0000-4000-8000-000000000030';
    RAISE EXCEPTION 'old run writer crossed fence';
  EXCEPTION WHEN SQLSTATE 'P0001' THEN IF SQLERRM NOT IN ('agent_project_unavailable','agent_account_erasing') THEN RAISE; END IF; END;
  DELETE FROM public.projects WHERE id='59120000-0000-4000-8000-000000000010';
  IF NOT EXISTS(SELECT 1 FROM public.agent_sandbox_allocations WHERE id=v_id) THEN RAISE EXCEPTION 'project cascade deleted cleanup evidence'; END IF;
END; $$;
ROLLBACK;

BEGIN;
INSERT INTO auth.users(id) VALUES('59120000-0000-4000-8000-000000000002');
INSERT INTO public.projects(id,owner_id,name,key) VALUES('59120000-0000-4000-8000-000000000011','59120000-0000-4000-8000-000000000002','Restore fixture','ALR');
INSERT INTO public.agent_runs(id,project_id,created_by,status) VALUES('59120000-0000-4000-8000-000000000031','59120000-0000-4000-8000-000000000011','59120000-0000-4000-8000-000000000002','running');
DO $$ DECLARE v_id uuid; BEGIN
  v_id:=public.reserve_agent_sandbox_allocation('59120000-0000-4000-8000-000000000031','agent-v2-59120000-0000-4000-8000-000000000031');
  PERFORM public.begin_agent_project_erasure('59120000-0000-4000-8000-000000000011');
  UPDATE public.projects SET deleted_at=now() WHERE id='59120000-0000-4000-8000-000000000011';
  BEGIN
    UPDATE public.projects SET deleted_at=NULL WHERE id='59120000-0000-4000-8000-000000000011';
    RAISE EXCEPTION 'restore ignored pending allocation';
  EXCEPTION WHEN SQLSTATE 'P0001' THEN IF SQLERRM<>'agent_project_allocation_cleanup_pending' THEN RAISE; END IF; END;
  PERFORM public.settle_agent_sandbox_allocation(v_id);
  IF NOT EXISTS(SELECT 1 FROM public.next_agent_allocation_cleanup_batch(1) WHERE id=v_id) THEN RAISE EXCEPTION 'cleanup retry omitted revoked settled row'; END IF;
  PERFORM public.complete_agent_allocation_cleanup(v_id);
  UPDATE public.projects SET deleted_at=NULL WHERE id='59120000-0000-4000-8000-000000000011';
  IF EXISTS(SELECT 1 FROM public.agent_project_erasure_fences WHERE project_id='59120000-0000-4000-8000-000000000011') THEN RAISE EXCEPTION 'restored project retained fence'; END IF;
  PERFORM public.reserve_agent_sandbox_allocation('59120000-0000-4000-8000-000000000031','agent-v2-59120000-0000-4000-8000-000000000031-000000000002');
END; $$;
ROLLBACK;
