-- Run against an isolated migrated database. All fixtures roll back.
BEGIN;
DO $$
DECLARE
  v_owner uuid := gen_random_uuid();
  v_project uuid := gen_random_uuid();
  v_board uuid := gen_random_uuid();
  v_view uuid := gen_random_uuid();
  v_page uuid := gen_random_uuid();
  v_share uuid := gen_random_uuid();
  v_page_share uuid := gen_random_uuid();
  v_lease uuid;
  v_new_lease uuid;
  v_cleanup uuid;
  v_count integer;
BEGIN
  IF has_table_privilege('anon', 'public.custom_domain_cleanup', 'SELECT') OR
    has_table_privilege('authenticated', 'public.custom_domain_mutation_leases', 'SELECT') OR
    has_function_privilege('authenticated', 'public.acquire_custom_domain_lease(text)', 'EXECUTE') THEN
    RAISE EXCEPTION 'Cleanup metadata and leases must remain service-only';
  END IF;
  INSERT INTO auth.users(id, email) VALUES(v_owner, 'domain-cleanup@example.test');
  INSERT INTO public.projects(id, owner_id, name, key)
    VALUES(v_project, v_owner, 'Domain cleanup regression', 'DCR');
  INSERT INTO public.feedback_boards(id, project_id, token, enabled)
    VALUES(v_board, v_project, 'domain-cleanup-board', true);
  INSERT INTO public.views(id, project_id, name) VALUES(v_view, v_project, 'Shared view');
  INSERT INTO public.pages(id, project_id, title, position)
    VALUES(v_page, v_project, 'Published page', 'a0');
  INSERT INTO public.view_shares(id, view_id, level, token)
    VALUES(v_share, v_view, 'public', 'domain-cleanup-view');
  INSERT INTO public.view_shares(id, page_id, level, token)
    VALUES(v_page_share, v_page, 'public', 'domain-cleanup-page');
  INSERT INTO public.custom_domains(domain, board_id)
    VALUES('board.cleanup.example', v_board);
  INSERT INTO public.custom_domains(domain, share_id) VALUES
    ('view.cleanup.example', v_share), ('page.cleanup.example', v_page_share);

  UPDATE public.feedback_boards SET enabled = false WHERE id = v_board;
  IF EXISTS(SELECT 1 FROM public.custom_domains WHERE board_id = v_board) OR
    NOT EXISTS(SELECT 1 FROM public.custom_domain_cleanup WHERE domain = 'board.cleanup.example') THEN
    RAISE EXCEPTION 'Board deactivation must remove and queue its domain';
  END IF;
  BEGIN
    INSERT INTO public.custom_domains(domain, board_id) VALUES('inactive.cleanup.example', v_board);
    RAISE EXCEPTION 'Inactive board accepted a new domain';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM <> 'Custom domain target is not published' THEN RAISE; END IF;
  END;
  UPDATE public.feedback_boards SET enabled = true WHERE id = v_board;
  IF EXISTS(SELECT 1 FROM public.custom_domains WHERE board_id = v_board) THEN
    RAISE EXCEPTION 'Reactivation must not restore a removed domain';
  END IF;

  DELETE FROM public.views WHERE id = v_view;
  IF NOT EXISTS(SELECT 1 FROM public.custom_domain_cleanup WHERE domain = 'view.cleanup.example') THEN
    RAISE EXCEPTION 'View cascade lost the domain cleanup';
  END IF;
  UPDATE public.pages SET deleted_at = now() WHERE id = v_page;
  IF EXISTS(SELECT 1 FROM public.custom_domains WHERE share_id = v_page_share) OR
    NOT EXISTS(SELECT 1 FROM public.custom_domain_cleanup WHERE domain = 'page.cleanup.example') THEN
    RAISE EXCEPTION 'Page trash must remove and queue its domain';
  END IF;

  INSERT INTO public.custom_domains(domain, board_id) VALUES('board.cleanup.example', v_board);
  SELECT id INTO v_cleanup FROM public.custom_domain_cleanup WHERE domain = 'board.cleanup.example';
  DELETE FROM public.custom_domains WHERE board_id = v_board;
  IF EXISTS(SELECT 1 FROM public.custom_domain_cleanup WHERE id = v_cleanup) THEN
    RAISE EXCEPTION 'A newer deletion must replace the cleanup identity';
  END IF;

  INSERT INTO public.custom_domains(domain, board_id) VALUES('legacy.cleanup.example', v_board);
  ALTER TABLE public.feedback_boards DISABLE TRIGGER custom_domain_board_disabled;
  UPDATE public.feedback_boards SET enabled = false WHERE id = v_board;
  ALTER TABLE public.feedback_boards ENABLE TRIGGER custom_domain_board_disabled;
  v_count := public.reconcile_inactive_custom_domains();
  IF v_count <> 1 OR
    NOT EXISTS(SELECT 1 FROM public.custom_domain_cleanup WHERE domain = 'legacy.cleanup.example') THEN
    RAISE EXCEPTION 'Reconciliation must queue legacy inactive mappings';
  END IF;
  UPDATE public.feedback_boards SET enabled = true WHERE id = v_board;
  INSERT INTO public.custom_domains(domain, board_id) VALUES('project.cleanup.example', v_board);
  UPDATE public.projects SET deleted_at = now() WHERE id = v_project;
  IF NOT EXISTS(SELECT 1 FROM public.custom_domain_cleanup WHERE domain = 'project.cleanup.example') OR
    EXISTS(SELECT 1 FROM public.custom_domains WHERE board_id = v_board) THEN
    RAISE EXCEPTION 'Project trash must queue its domains';
  END IF;
  DELETE FROM public.projects WHERE id = v_project;
  IF NOT EXISTS(SELECT 1 FROM public.custom_domain_cleanup WHERE domain = 'project.cleanup.example') THEN
    RAISE EXCEPTION 'Project deletion must preserve provider cleanup';
  END IF;

  v_project := gen_random_uuid(); v_board := gen_random_uuid();
  INSERT INTO public.projects(id, owner_id, name, key)
    VALUES(v_project, v_owner, 'Cascade regression', 'DCC');
  INSERT INTO public.feedback_boards(id, project_id, token, enabled)
    VALUES(v_board, v_project, 'cascade-cleanup-board', true);
  INSERT INTO public.custom_domains(domain, board_id) VALUES('cascade.cleanup.example', v_board);
  DELETE FROM public.projects WHERE id = v_project;
  IF NOT EXISTS(SELECT 1 FROM public.custom_domain_cleanup WHERE domain = 'cascade.cleanup.example') THEN
    RAISE EXCEPTION 'Project cascade must persist its domain cleanup';
  END IF;

  v_lease := public.acquire_custom_domain_lease('View.Cleanup.Example');
  IF v_lease IS NULL OR public.acquire_custom_domain_lease('view.cleanup.example') IS NOT NULL THEN
    RAISE EXCEPTION 'Concurrent hostname mutations must be excluded';
  END IF;
  PERFORM public.release_custom_domain_lease('view.cleanup.example', gen_random_uuid());
  IF public.acquire_custom_domain_lease('view.cleanup.example') IS NOT NULL THEN
    RAISE EXCEPTION 'A foreign token released the hostname lease';
  END IF;
  UPDATE public.custom_domain_mutation_leases SET expires_at = now() - interval '1 second'
    WHERE domain = 'view.cleanup.example';
  v_new_lease := public.acquire_custom_domain_lease('view.cleanup.example');
  PERFORM public.release_custom_domain_lease('view.cleanup.example', v_lease);
  IF v_new_lease IS NULL OR public.acquire_custom_domain_lease('view.cleanup.example') IS NOT NULL THEN
    RAISE EXCEPTION 'Expired lease recovery or stale-token protection failed';
  END IF;
  PERFORM public.release_custom_domain_lease('view.cleanup.example', v_new_lease);
  IF public.acquire_custom_domain_lease('view.cleanup.example') IS NULL THEN
    RAISE EXCEPTION 'Completed cleanup must release its hostname';
  END IF;
END;
$$;
ROLLBACK;
