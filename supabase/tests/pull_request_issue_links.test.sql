BEGIN;
INSERT INTO auth.users(id) VALUES ('62500000-0000-4000-8000-000000000001');
INSERT INTO public.projects(id, owner_id, name, key) VALUES
('62500000-0000-4000-8000-000000000010', '62500000-0000-4000-8000-000000000001', 'PR link tests', 'PRL');
INSERT INTO public.issues(id, project_id, number, title, created_by) VALUES
('62500000-0000-4000-8000-000000000020', '62500000-0000-4000-8000-000000000010', 1, 'First issue', '62500000-0000-4000-8000-000000000001'),
('62500000-0000-4000-8000-000000000021', '62500000-0000-4000-8000-000000000010', 2, 'Second issue', '62500000-0000-4000-8000-000000000001');
INSERT INTO public.pull_requests(id, provider, repo_full_name, number, state, issue_id) VALUES
('62500000-0000-4000-8000-000000000030', 'github', 'example/pr-links', 1, 'open', '62500000-0000-4000-8000-000000000020'),
('62500000-0000-4000-8000-000000000031', 'github', 'example/pr-links', 2, 'draft', NULL);
DO $$
BEGIN
  IF public.link_pull_request_to_issue_atomic('62500000-0000-4000-8000-000000000030', '62500000-0000-4000-8000-000000000021') <> 'linked' THEN
    RAISE EXCEPTION 'Adding a secondary issue must succeed';
  END IF;
  IF (SELECT count(*) FROM public.pull_request_issues WHERE pull_request_id = '62500000-0000-4000-8000-000000000030') <> 2 THEN
    RAISE EXCEPTION 'Both associations must be preserved';
  END IF;
  IF public.link_pull_request_to_issue_atomic('62500000-0000-4000-8000-000000000030', '62500000-0000-4000-8000-000000000021') <> 'already' THEN
    RAISE EXCEPTION 'Repeating a secondary association must be idempotent';
  END IF;
  IF public.link_pull_request_to_issue_atomic('62500000-0000-4000-8000-000000000031', '62500000-0000-4000-8000-000000000021') <> 'issue_already_linked' THEN
    RAISE EXCEPTION 'A secondary association must prevent a second live PR';
  END IF;
  PERFORM public.upsert_pull_request_monotonic(jsonb_build_object(
    'provider', 'github', 'repo_full_name', 'example/pr-links', 'number', 2,
    'state', 'open', 'issue_id', '62500000-0000-4000-8000-000000000021'
  ));
  IF EXISTS (SELECT 1 FROM public.pull_request_issues WHERE pull_request_id = '62500000-0000-4000-8000-000000000031') THEN
    RAISE EXCEPTION 'Automatic discovery must honor secondary live associations';
  END IF;
  IF (SELECT issue_id FROM public.pull_requests WHERE id = '62500000-0000-4000-8000-000000000030') <> '62500000-0000-4000-8000-000000000020' THEN
    RAISE EXCEPTION 'Appending must preserve the primary worker context';
  END IF;
END;
$$;
ROLLBACK;
