-- MIN-691: sessions last up to one year and end after 30 days without use.
--
-- The previous 30-day absolute lifetime signed active members out every month,
-- and the 7-day inactivity limit ended a session after one week away. Refresh
-- token rotation with reuse detection and MFA remain the protection against a
-- stolen token. These limits must match the Auth server (hosted
-- `sessions_timebox` / `sessions_inactivity_timeout`, `supabase/config.toml`
-- and the self-hosted compose); when the API is stricter than the Auth server,
-- refreshed sessions receive 401 on every API call.

CREATE OR REPLACE FUNCTION public.is_auth_session_active(
  p_user uuid,
  p_session uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
SET timezone = 'UTC'
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM auth.sessions AS session
    JOIN auth.users AS account ON account.id = session.user_id
    WHERE session.id = p_session
      AND session.user_id = p_user
      AND (session.not_after IS NULL OR session.not_after >= now())
      -- Keep this live check aligned with supabase/config.toml and GoTrue's
      -- session validity rules. Ordinary sessions leave not_after NULL.
      AND session.created_at + interval '8760 hours' >= now()
      AND COALESCE(
        session.refreshed_at,
        (
          SELECT pg_catalog.max(refresh_activity.updated_at)
          FROM auth.refresh_tokens AS refresh_activity
          WHERE refresh_activity.session_id = session.id
            AND refresh_activity.user_id = p_user::text
            AND refresh_activity.revoked IS FALSE
            AND refresh_activity.updated_at > session.created_at
        ),
        session.created_at
      ) + interval '720 hours' >= now()
      AND account.deleted_at IS NULL
      AND (account.banned_until IS NULL OR account.banned_until <= now())
      AND (
        EXISTS (
          SELECT 1
          FROM auth.refresh_tokens AS refresh
          WHERE refresh.session_id = session.id
            AND refresh.user_id = p_user::text
            AND refresh.revoked IS FALSE
        )
        OR (
          -- GoTrue refresh-token v2 stores its live authority on the session
          -- instead of retaining a non-revoked v1 row. Logout still deletes
          -- the session, so this branch preserves immediate revocation.
          session.refresh_token_hmac_key IS NOT NULL
          AND session.refresh_token_counter IS NOT NULL
        )
      )
  )
$$;

REVOKE ALL ON FUNCTION public.is_auth_session_active(uuid, uuid)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.is_auth_session_active(uuid, uuid)
  TO service_role;
