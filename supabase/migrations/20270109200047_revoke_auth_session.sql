-- End one session of an account from its Security settings.
--
-- GoTrue can only sign out the session that makes the request, or every
-- other one. Ending a single other session therefore deletes its row, as
-- GoTrue's own logout does: refresh tokens, AMR claims and MFA epochs follow
-- through their `on delete cascade` foreign keys, and
-- `is_auth_session_active` refuses the deleted session at its next API
-- request. The caller's own session is never deleted here; signing out this
-- device stays the local sign-out.

CREATE OR REPLACE FUNCTION public.revoke_auth_session(
  p_user uuid,
  p_session uuid,
  p_current_session uuid
)
RETURNS boolean
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF p_session = p_current_session THEN
    RETURN false;
  END IF;
  DELETE FROM auth.sessions AS session
  WHERE session.id = p_session
    AND session.user_id = p_user;
  RETURN FOUND;
END
$$;

REVOKE ALL ON FUNCTION public.revoke_auth_session(uuid, uuid, uuid)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.revoke_auth_session(uuid, uuid, uuid)
  TO service_role;
