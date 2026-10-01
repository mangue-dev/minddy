BEGIN;
INSERT INTO auth.users(id) VALUES ('32600000-0000-4000-8000-000000000001');
INSERT INTO public.projects(id, owner_id, name, key) VALUES
('32600000-0000-4000-8000-000000000010', '32600000-0000-4000-8000-000000000001', 'PR reopen tests', 'PRR');
INSERT INTO public.issues(id, project_id, number, title, created_by) VALUES
('32600000-0000-4000-8000-000000000020', '32600000-0000-4000-8000-000000000010', 1, 'Primary issue', '32600000-0000-4000-8000-000000000001'),
('32600000-0000-4000-8000-000000000021', '32600000-0000-4000-8000-000000000010', 2, 'Secondary issue', '32600000-0000-4000-8000-000000000001'),
('32600000-0000-4000-8000-000000000022', '32600000-0000-4000-8000-000000000010', 3, 'Remaining issue', '32600000-0000-4000-8000-000000000001');
INSERT INTO public.pull_requests(id, provider, repo_full_name, number, state, issue_id, updated_at) VALUES
('32600000-0000-4000-8000-000000000030', 'github', 'example/pr-reopen', 1, 'closed', '32600000-0000-4000-8000-000000000020', '2026-01-01'),
('32600000-0000-4000-8000-000000000031', 'github', 'example/pr-reopen', 2, 'draft', NULL, '2026-01-01'),
('32600000-0000-4000-8000-000000000032', 'github', 'example/pr-reopen', 3, 'open', NULL, '2026-01-01');
DO $$
DECLARE
  v_pr uuid := '32600000-0000-4000-8000-000000000030';
  v_other uuid := '32600000-0000-4000-8000-000000000031';
  v_first uuid := '32600000-0000-4000-8000-000000000020';
  v_second uuid := '32600000-0000-4000-8000-000000000021';
  v_remaining uuid := '32600000-0000-4000-8000-000000000022';
BEGIN
  PERFORM public.link_pull_request_to_issue_atomic(v_pr, v_second);
  PERFORM public.link_pull_request_to_issue_atomic(v_pr, v_remaining);
  PERFORM public.link_pull_request_to_issue_atomic(v_other, v_first);
  PERFORM public.link_pull_request_to_issue_atomic('32600000-0000-4000-8000-000000000032', v_second);

  -- Old observations must not detach links or reopen the PR.
  PERFORM public.upsert_pull_request_monotonic(jsonb_build_object(
    'provider', 'github', 'repo_full_name', 'example/pr-reopen', 'number', 1,
    'state', 'open', 'updated_at', '2025-01-01', 'issue_id', v_first
  ));
  IF (SELECT count(*) FROM public.pull_request_issues WHERE pull_request_id = v_pr) <> 3
     OR (SELECT state FROM public.pull_requests WHERE id = v_pr) <> 'closed' THEN
    RAISE EXCEPTION 'Stale reopening must leave the PR and all associations unchanged';
  END IF;

  PERFORM public.upsert_pull_request_monotonic(jsonb_build_object(
    'provider', 'github', 'repo_full_name', 'example/pr-reopen', 'number', 1,
    'state', 'open', 'updated_at', '2026-01-02', 'issue_id', v_first
  ));
  IF (SELECT state FROM public.pull_requests WHERE id = v_pr) <> 'open'
     OR (SELECT issue_id FROM public.pull_requests WHERE id = v_pr) IS DISTINCT FROM v_remaining
     OR (SELECT count(*) FROM public.pull_request_issues WHERE pull_request_id = v_pr) <> 1 THEN
    RAISE EXCEPTION 'Reopening must drop both conflicting issues and promote the remaining issue';
  END IF;
  IF EXISTS (
    SELECT l.issue_id FROM public.pull_request_issues l
    JOIN public.pull_requests p ON p.id = l.pull_request_id
    WHERE p.state IN ('draft', 'open') GROUP BY l.issue_id HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION 'Each issue must have at most one live PR after reopening';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.pull_request_issues WHERE pull_request_id = v_other AND issue_id = v_first)
     OR NOT EXISTS (SELECT 1 FROM public.pull_request_issues WHERE pull_request_id = '32600000-0000-4000-8000-000000000032' AND issue_id = v_second) THEN
    RAISE EXCEPTION 'The competing live PR associations must be preserved';
  END IF;

  -- Reopening without an inferred issue must still inspect existing associations.
  PERFORM public.upsert_pull_request_monotonic(jsonb_build_object(
    'provider', 'github', 'repo_full_name', 'example/pr-reopen', 'number', 1,
    'state', 'merged', 'updated_at', '2026-01-03'
  ));
  PERFORM public.link_pull_request_to_issue_atomic(v_other, v_remaining);
  PERFORM public.upsert_pull_request_monotonic(jsonb_build_object(
    'provider', 'github', 'repo_full_name', 'example/pr-reopen', 'number', 1,
    'state', 'draft', 'updated_at', '2026-01-04'
  ));
  IF (SELECT state FROM public.pull_requests WHERE id = v_pr) <> 'draft'
     OR (SELECT issue_id FROM public.pull_requests WHERE id = v_pr) IS NOT NULL
     OR EXISTS (SELECT 1 FROM public.pull_request_issues WHERE pull_request_id = v_pr) THEN
    RAISE EXCEPTION 'Removing the last conflicting issue must leave the reopened PR unlinked';
  END IF;
END;
$$;
ROLLBACK;
