-- MIN-822: the Supabase linter (lints 0028 and 0029) reported 24 SECURITY
-- DEFINER functions of `public` executable by `anon` and 37 by
-- `authenticated`. They are not a regression of MIN-338: the schema guardrail
-- deliberately exempts trigger functions and policy helpers, and these kept the
-- PUBLIC, anon and authenticated grants that Supabase's default privileges give
-- every new function.
--
-- No policy targets `anon`, so `anon` reaches a definer only through the
-- `enforce_mfa_aal` pre-request hook, which called `mfa_aal_ok()`. The hook now
-- decides `anon` and `service_role` itself, which `mfa_aal_ok()` already
-- accepted, and every anon grant goes.
--
-- `authenticated` keeps only what it calls itself:
--   * policy helpers: a policy runs as the querying role, so revoking one makes
--     the whole policy raise;
--   * `is_numo_routine_conversation`, read by the security_invoker view
--     `numo_user_conversation_history`;
--   * the RPCs the app calls: `delete_comment_thread_atomic`, `move_app_tab`,
--     `mutate_app_tab`, `resolve_realtime_topic`.
-- Each of these checks the caller's own access and reveals nothing about
-- other accounts, so being callable through /rest/v1/rpc is accepted.
-- Trigger functions need no EXECUTE grant to fire, and
-- `can_access_comment_parent` is only called by a definer.

CREATE OR REPLACE FUNCTION public.enforce_mfa_aal()
RETURNS void
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = ''
AS $$
BEGIN
  -- Same answer as `mfa_aal_ok()` for these roles, without the definer call
  -- that would keep `mfa_aal_ok()` executable by anon.
  IF auth.role() IN ('anon', 'service_role') THEN
    RETURN;
  END IF;
  IF NOT public.mfa_aal_ok() THEN
    RAISE insufficient_privilege USING MESSAGE = 'MFA challenge required';
  END IF;
  IF auth.role() = 'authenticated'
     AND NOT public.auth_session_is_current() THEN
    RAISE insufficient_privilege USING MESSAGE = 'Auth session is no longer active';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.enforce_mfa_aal()
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.enforce_mfa_aal() TO anon, authenticated, service_role;

-- Trigger functions: nobody calls them directly.
REVOKE ALL ON FUNCTION public.broadcast_activity_scoped() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.broadcast_agent_routine_row() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.broadcast_billing_row() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.broadcast_event_scoped() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.broadcast_feedback_child() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.broadcast_issue_scoped() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.broadcast_members_row() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.broadcast_notifications_row() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.broadcast_page_row() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.broadcast_project_scoped() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.broadcast_projects_row() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.broadcast_pull_request_row() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.broadcast_views_row() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.feedback_votes_maintain_count() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.issues_sync_objective_status() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.stamp_numo_success_attempt() FROM PUBLIC, anon, authenticated;

-- Only `delete_comment_thread_atomic` (a definer) calls it.
REVOKE ALL ON FUNCTION public.can_access_comment_parent(uuid, uuid, uuid)
  FROM PUBLIC, anon, authenticated;

-- Policy helpers and the hook's checks: `authenticated` only.
REVOKE ALL ON FUNCTION public.can_access_project(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.can_watch_pull_request(text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.is_project_member(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.is_project_owner(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.mfa_aal_ok() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.project_storage_quota_ok(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.storage_quota_ok(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_access_project(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.can_watch_pull_request(text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.is_project_member(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.is_project_owner(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.mfa_aal_ok() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.project_storage_quota_ok(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.storage_quota_ok(uuid) TO authenticated, service_role;
