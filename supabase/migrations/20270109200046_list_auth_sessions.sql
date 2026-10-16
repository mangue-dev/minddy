-- List the live sessions of an account for its Security settings.
--
-- `auth.sessions` is not exposed to PostgREST, so the account route calls this
-- function with the service role after `getAuthedUser` has verified the caller.
-- A session is listed only when `is_auth_session_active` would accept it, so
-- the list never shows a session the API already refuses. The raw user agent
-- leaves the database only to be reduced to a device label on the server; the
-- IP address is not returned.

CREATE OR REPLACE FUNCTION public.list_auth_sessions(p_user uuid)
RETURNS TABLE (
  id uuid,
  created_at timestamptz,
  last_active_at timestamptz,
  user_agent text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
SET timezone = 'UTC'
AS $$
  SELECT
    session.id,
    session.created_at,
    -- GoTrue stores refreshed_at without a time zone, in UTC.
    GREATEST(
      session.created_at,
      session.updated_at,
      session.refreshed_at::timestamptz
    ) AS last_active_at,
    session.user_agent
  FROM auth.sessions AS session
  WHERE session.user_id = p_user
    AND public.is_auth_session_active(p_user, session.id)
  ORDER BY last_active_at DESC
  LIMIT 100
$$;

REVOKE ALL ON FUNCTION public.list_auth_sessions(uuid)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.list_auth_sessions(uuid)
  TO service_role;
