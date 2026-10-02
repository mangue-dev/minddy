BEGIN;

INSERT INTO auth.users(id, email) VALUES
  ('59119000-0000-4000-8000-000000000001', 'agent-erasure-owner@example.test'),
  ('59119000-0000-4000-8000-000000000002', 'agent-erasure-member@example.test');
INSERT INTO public.projects(id, owner_id, name, key) VALUES
  ('59119000-0000-4000-8000-000000000010', '59119000-0000-4000-8000-000000000001', 'Agent erasure', 'AER');
INSERT INTO public.agent_conversations(id, project_id, owner_id, visibility) VALUES
  ('59119000-0000-4000-8000-000000000020', '59119000-0000-4000-8000-000000000010',
   '59119000-0000-4000-8000-000000000001', 'private');
INSERT INTO public.agent_runs(id, project_id, conversation_id, created_by, status) VALUES
  ('59119000-0000-4000-8000-000000000030', '59119000-0000-4000-8000-000000000010',
   '59119000-0000-4000-8000-000000000020', '59119000-0000-4000-8000-000000000001', 'queued');

DO $$
BEGIN
  IF public.begin_agent_account_erasure('59119000-0000-4000-8000-000000000001') IS NOT TRUE THEN
    RAISE EXCEPTION 'account fence was not installed';
  END IF;
  IF public.begin_agent_account_erasure('59119000-0000-4000-8000-000000000001') IS NOT TRUE THEN
    RAISE EXCEPTION 'account fence retry failed';
  END IF;
END;
$$;

DO $$
BEGIN
  IF pg_catalog.has_table_privilege('authenticated', 'public.agent_account_erasure_fences', 'SELECT') THEN
    RAISE EXCEPTION 'authenticated role can read account fences';
  END IF;
END;
$$;

SET LOCAL ROLE service_role;
DO $$
BEGIN
  BEGIN
    UPDATE public.agent_runs SET status = 'running'
    WHERE id = '59119000-0000-4000-8000-000000000030';
    RAISE EXCEPTION 'claim crossed account fence';
  EXCEPTION WHEN SQLSTATE 'P0001' THEN
    IF SQLERRM <> 'agent_account_erasing' THEN RAISE; END IF;
  END;

  BEGIN
    INSERT INTO public.agent_runs(id, project_id, conversation_id, created_by, status)
    VALUES ('59119000-0000-4000-8000-000000000031',
            '59119000-0000-4000-8000-000000000010',
            '59119000-0000-4000-8000-000000000020',
            '59119000-0000-4000-8000-000000000002', 'queued');
    RAISE EXCEPTION 'project-owner fence missed another creator';
  EXCEPTION WHEN SQLSTATE 'P0001' THEN
    IF SQLERRM <> 'agent_account_erasing' THEN RAISE; END IF;
  END;

  IF (SELECT status FROM public.agent_runs WHERE id = '59119000-0000-4000-8000-000000000030') <> 'queued' THEN
    RAISE EXCEPTION 'blocked claim changed its run';
  END IF;
END;
$$;
RESET ROLE;

UPDATE public.projects SET deleted_at = now()
WHERE id = '59119000-0000-4000-8000-000000000010';

SET LOCAL ROLE service_role;
DO $$
BEGIN
  BEGIN
    INSERT INTO public.agent_runs(id, project_id, conversation_id, created_by, status)
    VALUES ('59119000-0000-4000-8000-000000000032',
            '59119000-0000-4000-8000-000000000010',
            '59119000-0000-4000-8000-000000000020',
            '59119000-0000-4000-8000-000000000002', 'queued');
    RAISE EXCEPTION 'trashed project admitted a new run';
  EXCEPTION WHEN SQLSTATE 'P0001' THEN
    IF SQLERRM <> 'agent_project_unavailable' THEN RAISE; END IF;
  END;

  BEGIN
    UPDATE public.agent_runs SET status = 'running'
    WHERE id = '59119000-0000-4000-8000-000000000030';
    RAISE EXCEPTION 'trashed project resumed a run';
  EXCEPTION WHEN SQLSTATE 'P0001' THEN
    IF SQLERRM <> 'agent_project_unavailable' THEN RAISE; END IF;
  END;
END;
$$;
RESET ROLE;

DO $$
BEGIN
  BEGIN
    PERFORM public.begin_agent_account_erasure('59119000-0000-4000-8000-000000000099');
    RAISE EXCEPTION 'missing account was fenced';
  EXCEPTION WHEN SQLSTATE 'P0001' THEN
    IF SQLERRM <> 'agent_account_erasure_user_missing' THEN RAISE; END IF;
  END;
END;
$$;

ROLLBACK;
