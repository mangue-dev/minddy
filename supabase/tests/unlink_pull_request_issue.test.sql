BEGIN;
INSERT INTO auth.users(id) VALUES ('62600000-0000-4000-8000-000000000001');
INSERT INTO public.projects(id, owner_id, name, key) VALUES
('62600000-0000-4000-8000-000000000010', '62600000-0000-4000-8000-000000000001', 'PR unlink tests', 'PRU');
INSERT INTO public.issues(id, project_id, number, title, created_by) VALUES
('62600000-0000-4000-8000-000000000020', '62600000-0000-4000-8000-000000000010', 1, 'First issue', '62600000-0000-4000-8000-000000000001'),
('62600000-0000-4000-8000-000000000021', '62600000-0000-4000-8000-000000000010', 2, 'Second issue', '62600000-0000-4000-8000-000000000001');
INSERT INTO public.pull_requests(id, provider, repo_full_name, number, state, issue_id) VALUES
('62600000-0000-4000-8000-000000000030', 'github', 'example/pr-links', 1, 'open', '62600000-0000-4000-8000-000000000020'),
('62600000-0000-4000-8000-000000000031', 'github', 'example/pr-links', 2, 'draft', NULL);
DO $$
DECLARE
  v_pr uuid := '62600000-0000-4000-8000-000000000030';
  v_first uuid := '62600000-0000-4000-8000-000000000020';
  v_second uuid := '62600000-0000-4000-8000-000000000021';
BEGIN
  PERFORM public.link_pull_request_to_issue_atomic(v_pr, v_second);
  IF public.unlink_pull_request_from_issue_atomic(v_pr, v_first) <> 'unlinked' THEN
    RAISE EXCEPTION 'Removing the primary association must succeed';
  END IF;
  IF (SELECT issue_id FROM public.pull_requests WHERE id = v_pr) IS DISTINCT FROM v_second THEN
    RAISE EXCEPTION 'The remaining issue must become the primary';
  END IF;
  UPDATE public.pull_requests SET issue_id = v_first WHERE id = v_pr;
  IF EXISTS (SELECT 1 FROM public.pull_request_issues WHERE pull_request_id = v_pr AND issue_id = v_first) THEN
    RAISE EXCEPTION 'Automatic ingestion must not restore an explicit unlink';
  END IF;
  IF public.unlink_pull_request_from_issue_atomic(v_pr, v_first) <> 'already' THEN
    RAISE EXCEPTION 'Repeated unlinking must be idempotent';
  END IF;
  PERFORM public.unlink_pull_request_from_issue_atomic(v_pr, v_second);
  UPDATE public.pull_requests SET issue_id = v_second WHERE id = v_pr;
  IF (SELECT issue_id FROM public.pull_requests WHERE id = v_pr) IS NOT NULL THEN
    RAISE EXCEPTION 'Removing the last association must remain durable';
  END IF;
  IF public.link_pull_request_to_issue_atomic(v_pr, v_first) <> 'linked' THEN
    RAISE EXCEPTION 'Explicit manual relinking must be allowed';
  END IF;
  IF EXISTS (SELECT 1 FROM public.pull_request_issue_unlinks WHERE pull_request_id = v_pr AND issue_id = v_first) THEN
    RAISE EXCEPTION 'Manual relinking must clear suppression';
  END IF;
  IF has_function_privilege('authenticated', 'public.unlink_pull_request_from_issue_atomic(uuid,uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'Only the authorized server may remove associations';
  END IF;
END;
$$;
ROLLBACK;
