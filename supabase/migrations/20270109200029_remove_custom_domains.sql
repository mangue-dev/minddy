-- MIN-653: public content is served only through application token URLs.
-- Retain the share lock so concurrent revocation and republication remain safe.
CREATE OR REPLACE FUNCTION public.revoke_view_share_guarded(p_view_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_share public.view_shares%ROWTYPE;
BEGIN
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('view-share:' || p_view_id::text, 462)
  );
  SELECT * INTO v_share FROM public.view_shares
    WHERE view_id = p_view_id FOR UPDATE;
  IF v_share.id IS NULL THEN
    RETURN pg_catalog.jsonb_build_object('status', 'absent');
  END IF;
  DELETE FROM public.view_shares WHERE id = v_share.id;
  RETURN pg_catalog.jsonb_build_object('status', 'revoked', 'share_id', v_share.id);
END;
$$;
REVOKE ALL ON FUNCTION public.revoke_view_share_guarded(uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.revoke_view_share_guarded(uuid) TO service_role;

-- Remove target triggers before their backing domain tables and functions.
DROP TRIGGER IF EXISTS custom_domain_board_disabled ON public.feedback_boards;
DROP TRIGGER IF EXISTS custom_domain_project_deleted ON public.projects;
DROP TRIGGER IF EXISTS custom_domain_page_deleted ON public.pages;
DROP TABLE public.custom_domains;
DROP TABLE public.custom_domain_cleanup;
DROP TABLE public.custom_domain_mutation_leases;
DROP TABLE public.custom_domain_verification_scope;

DROP FUNCTION public.delete_custom_domain_if_current(uuid, text);
DROP FUNCTION public.queue_custom_domain_cleanup();
DROP FUNCTION public.remove_disabled_board_domains();
DROP FUNCTION public.remove_unpublished_content_domains();
DROP FUNCTION public.require_active_custom_domain_target();
DROP FUNCTION public.reconcile_inactive_custom_domains();
DROP FUNCTION public.acquire_custom_domain_lease(text);
DROP FUNCTION public.release_custom_domain_lease(text, uuid);
DROP FUNCTION public.guard_custom_domain_verification();
DROP FUNCTION public.activate_custom_domain_verification();
DROP FUNCTION public.custom_domain_verification_version(jsonb);

-- Domain provider reservations have no remaining consumer. Other providers
-- retain their budgets, mutation leases, and operation history.
DELETE FROM public.provider_operation_reservations
  WHERE provider IN ('vercel-domains', 'vercel-domain-names');

NOTIFY pgrst, 'reload schema';
