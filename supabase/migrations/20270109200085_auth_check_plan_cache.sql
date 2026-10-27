-- MIN-824: `enforce_mfa_aal()` was the most expensive statement of the
-- production database (16 ms on average, once per PostgREST request through
-- `pgrst.db_pre_request`), and `auth_authorization_state()`, the same checks
-- called by every Next API route, came second (12 ms).
--
-- The cost was planning, not reading: the Auth tables hold a few hundred rows.
-- `mfa_aal_ok_for_user` and `is_auth_session_active` were `LANGUAGE sql`
-- functions with `SECURITY DEFINER` and `SET` clauses, which Postgres never
-- inlines and re-plans on every call. PL/pgSQL keeps each statement's plan for
-- the connection, and PostgREST and Supavisor reuse their connections. Measured
-- on production: 3.4 ms → 0.08 ms for the MFA check, 0.7 ms → 0.08 ms for the
-- session check.
--
-- The queries are copied unchanged, so every access decision stays the same;
-- the old and new bodies agreed on every live session of both databases.
-- `variable_conflict use_column` keeps the SQL-function rule that a column
-- name wins over a parameter name. CREATE OR REPLACE keeps the grants, which
-- are restated below anyway.

CREATE OR REPLACE FUNCTION public.mfa_aal_ok_for_user(
  p_user uuid,
  p_session uuid,
  p_aal text,
  p_amr jsonb
)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
#variable_conflict use_column
BEGIN
  RETURN COALESCE((
    SELECT CASE
      WHEN EXISTS (
          SELECT 1
          FROM auth.mfa_factors AS factor
          WHERE factor.user_id = account.id
            AND factor.status = 'verified'
        ) THEN COALESCE(p_aal, '') = 'aal2'
          AND EXISTS (
            SELECT 1
            FROM auth.sessions AS session
            JOIN auth.mfa_factors AS factor
              ON factor.id = session.factor_id
             AND factor.user_id = session.user_id
             AND factor.status = 'verified'
            JOIN auth.mfa_amr_claims AS live_amr
              ON live_amr.session_id = session.id
             AND live_amr.authentication_method = CASE factor.factor_type::text
               WHEN 'totp' THEN 'totp'
               WHEN 'phone' THEN 'mfa/phone'
               WHEN 'webauthn' THEN 'mfa/webauthn'
             END
            JOIN public.auth_mfa_amr_epochs AS live_epoch
              ON live_epoch.session_id = live_amr.session_id
             AND live_epoch.authentication_method =
                 live_amr.authentication_method
            CROSS JOIN LATERAL pg_catalog.jsonb_array_elements(
              CASE
                WHEN pg_catalog.jsonb_typeof(p_amr) = 'array' THEN p_amr
                ELSE '[]'::jsonb
              END
            ) AS signed_amr(value)
            WHERE session.id = p_session
              AND session.user_id = account.id
              AND COALESCE(session.aal::text, 'aal1') = 'aal2'
              AND pg_catalog.jsonb_typeof(signed_amr.value) = 'object'
              AND signed_amr.value ->> 'method' =
                  live_amr.authentication_method
              AND signed_amr.value -> 'timestamp' = pg_catalog.to_jsonb(
                live_epoch.epoch
              )
              AND pg_catalog.floor(
                    EXTRACT(epoch FROM live_amr.updated_at)
                  )::bigint = live_epoch.epoch
          )
      -- A flag without a verified factor is an inconsistent enrollment. Do
      -- not accept either assurance level until the account is repaired.
      WHEN account.raw_app_meta_data @> '{"mfa_enabled":true}'::jsonb
        THEN false
      ELSE COALESCE(p_aal, '') = 'aal1'
    END
    FROM auth.users AS account
    WHERE account.id = p_user
  ), false);
END;
$$;

REVOKE ALL ON FUNCTION public.mfa_aal_ok_for_user(uuid, uuid, text, jsonb)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.mfa_aal_ok_for_user(uuid, uuid, text, jsonb)
  TO service_role;

CREATE OR REPLACE FUNCTION public.is_auth_session_active(
  p_user uuid,
  p_session uuid
)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
SET timezone = 'UTC'
AS $$
#variable_conflict use_column
BEGIN
  RETURN EXISTS (
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
  );
END;
$$;

REVOKE ALL ON FUNCTION public.is_auth_session_active(uuid, uuid)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.is_auth_session_active(uuid, uuid)
  TO service_role;
