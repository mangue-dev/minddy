-- Keep provider cleanup outside target cascades, with durable retries.
CREATE TABLE public.custom_domain_cleanup (
  domain text PRIMARY KEY,
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  next_attempt_at timestamptz NOT NULL DEFAULT now(),
  attempts integer NOT NULL DEFAULT 0 CHECK (attempts >= 0)
);
CREATE INDEX custom_domain_cleanup_due ON public.custom_domain_cleanup(next_attempt_at);
CREATE TABLE public.custom_domain_mutation_leases (
  domain text PRIMARY KEY,
  token uuid NOT NULL,
  expires_at timestamptz NOT NULL
);
ALTER TABLE public.custom_domain_cleanup ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.custom_domain_mutation_leases ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.custom_domain_cleanup, public.custom_domain_mutation_leases
  FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.custom_domain_cleanup TO service_role;
REVOKE ALL ON public.custom_domain_mutation_leases FROM service_role;

CREATE FUNCTION public.acquire_custom_domain_lease(p_domain text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_token uuid;
BEGIN
  INSERT INTO public.custom_domain_mutation_leases(domain, token, expires_at)
    VALUES (lower(p_domain), gen_random_uuid(), clock_timestamp() + interval '2 minutes')
    ON CONFLICT (domain) DO UPDATE
      SET token = EXCLUDED.token, expires_at = EXCLUDED.expires_at
      WHERE public.custom_domain_mutation_leases.expires_at <= clock_timestamp()
    RETURNING token INTO v_token;
  RETURN v_token;
END;
$$;
CREATE FUNCTION public.release_custom_domain_lease(p_domain text, p_token uuid)
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path = '' AS $$
  DELETE FROM public.custom_domain_mutation_leases
    WHERE domain = lower(p_domain) AND token = p_token;
$$;
REVOKE ALL ON FUNCTION public.acquire_custom_domain_lease(text),
  public.release_custom_domain_lease(text, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.acquire_custom_domain_lease(text),
  public.release_custom_domain_lease(text, uuid) TO service_role;

CREATE FUNCTION public.queue_custom_domain_cleanup()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  INSERT INTO public.custom_domain_cleanup(domain) VALUES (lower(OLD.domain))
  ON CONFLICT (domain) DO UPDATE SET id = gen_random_uuid(),
    created_at = now(), next_attempt_at = now(), attempts = 0;
  RETURN OLD;
END;
$$;
CREATE TRIGGER custom_domain_cleanup_on_delete AFTER DELETE ON public.custom_domains
  FOR EACH ROW EXECUTE FUNCTION public.queue_custom_domain_cleanup();

CREATE FUNCTION public.remove_disabled_board_domains()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF NOT NEW.enabled THEN
    DELETE FROM public.custom_domains WHERE board_id = NEW.id;
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER custom_domain_board_disabled AFTER UPDATE OF enabled ON public.feedback_boards
  FOR EACH ROW EXECUTE FUNCTION public.remove_disabled_board_domains();

CREATE FUNCTION public.remove_unpublished_content_domains()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF NEW.deleted_at IS NOT NULL THEN
    IF TG_TABLE_NAME = 'projects' THEN
      DELETE FROM public.custom_domains d WHERE
        d.board_id IN (SELECT id FROM public.feedback_boards WHERE project_id = NEW.id)
        OR d.share_id IN (SELECT s.id FROM public.view_shares s
          LEFT JOIN public.views v ON v.id = s.view_id
          LEFT JOIN public.pages p ON p.id = s.page_id
          WHERE v.project_id = NEW.id OR p.project_id = NEW.id);
    ELSE
      DELETE FROM public.custom_domains WHERE share_id IN
        (SELECT id FROM public.view_shares WHERE page_id = NEW.id);
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER custom_domain_project_deleted AFTER UPDATE OF deleted_at ON public.projects
  FOR EACH ROW EXECUTE FUNCTION public.remove_unpublished_content_domains();
CREATE TRIGGER custom_domain_page_deleted AFTER UPDATE OF deleted_at ON public.pages
  FOR EACH ROW EXECUTE FUNCTION public.remove_unpublished_content_domains();

-- Lock the publication and its project before accepting an attachment. This
-- prevents an in-flight add from restoring a mapping after unpublication.
CREATE FUNCTION public.require_active_custom_domain_target()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_project uuid; v_view uuid; v_page uuid;
BEGIN
  IF NEW.board_id IS NOT NULL THEN
    SELECT project_id INTO v_project FROM public.feedback_boards
      WHERE id = NEW.board_id AND enabled FOR SHARE;
  ELSE
    SELECT view_id, page_id INTO v_view, v_page FROM public.view_shares
      WHERE id = NEW.share_id FOR SHARE;
    IF v_view IS NOT NULL THEN
      SELECT project_id INTO v_project FROM public.views WHERE id = v_view FOR SHARE;
    ELSIF v_page IS NOT NULL THEN
      SELECT project_id INTO v_project FROM public.pages
        WHERE id = v_page AND deleted_at IS NULL FOR SHARE;
    END IF;
  END IF;
  PERFORM 1 FROM public.projects WHERE id = v_project AND deleted_at IS NULL FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Custom domain target is not published'; END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER custom_domain_active_target BEFORE INSERT OR UPDATE OF board_id, share_id
  ON public.custom_domains FOR EACH ROW EXECUTE FUNCTION public.require_active_custom_domain_target();

-- Remove legacy inactive mappings too; the deletion trigger queues their hostnames.
CREATE FUNCTION public.reconcile_inactive_custom_domains()
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_count integer;
BEGIN
  DELETE FROM public.custom_domains d WHERE NOT EXISTS (
    SELECT 1 FROM public.feedback_boards b JOIN public.projects p ON p.id = b.project_id
    WHERE b.id = d.board_id AND b.enabled AND p.deleted_at IS NULL
  ) AND NOT EXISTS (
    SELECT 1 FROM public.view_shares s
    LEFT JOIN public.views v ON v.id = s.view_id
    LEFT JOIN public.pages page ON page.id = s.page_id AND page.deleted_at IS NULL
    JOIN public.projects p ON p.id = COALESCE(v.project_id, page.project_id)
    WHERE s.id = d.share_id AND p.deleted_at IS NULL
  );
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;
REVOKE ALL ON FUNCTION public.reconcile_inactive_custom_domains()
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reconcile_inactive_custom_domains() TO service_role;
REVOKE ALL ON FUNCTION public.queue_custom_domain_cleanup(),
  public.remove_disabled_board_domains(), public.remove_unpublished_content_domains(),
  public.require_active_custom_domain_target()
  FROM PUBLIC, anon, authenticated;
SELECT public.reconcile_inactive_custom_domains();
NOTIFY pgrst, 'reload schema';
