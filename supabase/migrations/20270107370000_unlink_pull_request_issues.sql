-- Remember explicit removals so branch/title conventions cannot recreate them.
CREATE TABLE public.pull_request_issue_unlinks (
  pull_request_id uuid NOT NULL REFERENCES public.pull_requests(id) ON DELETE CASCADE,
  issue_id uuid NOT NULL REFERENCES public.issues(id) ON DELETE CASCADE,
  PRIMARY KEY (pull_request_id, issue_id)
);
ALTER TABLE public.pull_request_issue_unlinks ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.pull_request_issue_unlinks FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.pull_request_issue_unlinks TO service_role;

CREATE FUNCTION public.filter_unlinked_pull_request_issue() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF NEW.issue_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.pull_request_issue_unlinks
    WHERE pull_request_id = NEW.id AND issue_id = NEW.issue_id
  ) THEN
    NEW.issue_id := OLD.issue_id;
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER pull_request_skip_unlinked_issue
BEFORE UPDATE OF issue_id ON public.pull_requests
FOR EACH ROW EXECUTE FUNCTION public.filter_unlinked_pull_request_issue();
REVOKE ALL ON FUNCTION public.filter_unlinked_pull_request_issue() FROM PUBLIC, anon, authenticated;

CREATE FUNCTION public.unlink_pull_request_from_issue_atomic(p_pr_id uuid, p_issue_id uuid)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_pr public.pull_requests%ROWTYPE;
  v_next_issue uuid;
BEGIN
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('issue:' || p_issue_id::text, 459));
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('pr:' || p_pr_id::text, 459));
  SELECT * INTO v_pr FROM public.pull_requests WHERE id = p_pr_id FOR UPDATE;
  IF v_pr.id IS NULL THEN RETURN 'pr_not_found'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.pull_request_issues WHERE pull_request_id = p_pr_id AND issue_id = p_issue_id)
    THEN RETURN 'already'; END IF;
  INSERT INTO public.pull_request_issue_unlinks (pull_request_id, issue_id)
  VALUES (p_pr_id, p_issue_id) ON CONFLICT DO NOTHING;
  DELETE FROM public.pull_request_issues WHERE pull_request_id = p_pr_id AND issue_id = p_issue_id;
  IF v_pr.issue_id = p_issue_id THEN
    SELECT l.issue_id INTO v_next_issue FROM public.pull_request_issues l
    JOIN public.issues i ON i.id = l.issue_id AND i.deleted_at IS NULL
    WHERE l.pull_request_id = p_pr_id ORDER BY l.created_at, l.issue_id LIMIT 1;
    UPDATE public.pull_requests SET issue_id = v_next_issue WHERE id = p_pr_id;
  END IF;
  RETURN 'unlinked';
END;
$$;
REVOKE ALL ON FUNCTION public.unlink_pull_request_from_issue_atomic(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.unlink_pull_request_from_issue_atomic(uuid, uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.link_pull_request_to_issue_atomic(p_pr_id uuid, p_issue_id uuid)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_pr public.pull_requests%ROWTYPE;
BEGIN
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('issue:' || p_issue_id::text, 459));
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('pr:' || p_pr_id::text, 459));
  SELECT * INTO v_pr FROM public.pull_requests WHERE id = p_pr_id FOR UPDATE;
  IF v_pr.id IS NULL THEN RETURN 'pr_not_found'; END IF;
  IF EXISTS (SELECT 1 FROM public.pull_request_issues WHERE pull_request_id = p_pr_id AND issue_id = p_issue_id)
    THEN RETURN 'already'; END IF;
  IF EXISTS (
    SELECT 1 FROM public.pull_request_issues l JOIN public.pull_requests p ON p.id = l.pull_request_id
    WHERE l.issue_id = p_issue_id AND p.state IN ('draft', 'open') AND p.id <> p_pr_id
  ) THEN RETURN 'issue_already_linked'; END IF;
  DELETE FROM public.pull_request_issue_unlinks WHERE pull_request_id = p_pr_id AND issue_id = p_issue_id;
  INSERT INTO public.pull_request_issues (pull_request_id, issue_id) VALUES (p_pr_id, p_issue_id);
  UPDATE public.pull_requests SET issue_id = p_issue_id WHERE id = p_pr_id AND issue_id IS NULL;
  RETURN 'linked';
END;
$$;
REVOKE ALL ON FUNCTION public.link_pull_request_to_issue_atomic(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.link_pull_request_to_issue_atomic(uuid, uuid) TO service_role;
