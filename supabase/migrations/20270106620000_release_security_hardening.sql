-- JWT AMR timestamps have one-second precision. Keep a session-scoped epoch
-- outside auth.mfa_amr_claims because GoTrue deletes that row when a factor is
-- removed, then inserts a new row if a replacement factor is verified. The
-- durable epoch prevents a delete-and-reinsert in the same second from giving
-- both factors the same signed `(method, timestamp)` identity.
CREATE TABLE IF NOT EXISTS public.auth_mfa_amr_epochs (
  session_id uuid NOT NULL REFERENCES auth.sessions(id) ON DELETE CASCADE,
  authentication_method text NOT NULL,
  epoch bigint NOT NULL CHECK (epoch >= 0),
  PRIMARY KEY (session_id, authentication_method)
);

ALTER TABLE public.auth_mfa_amr_epochs ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.auth_mfa_amr_epochs
  FROM PUBLIC, anon, authenticated, service_role;

COMMENT ON TABLE public.auth_mfa_amr_epochs IS
  'Server-only monotone MFA epoch registry; rows live for the Auth session.';

CREATE OR REPLACE FUNCTION public.advance_mfa_amr_epoch()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  proposed_epoch bigint;
  assigned_epoch bigint;
BEGIN
  IF NEW.session_id IS NULL
     OR NEW.authentication_method IS NULL
     OR NEW.updated_at IS NULL THEN
    RAISE EXCEPTION 'MFA AMR epoch inputs cannot be null'
      USING ERRCODE = '23502';
  END IF;

  -- Serialize every mutation for the same session and method, including a
  -- concurrent unenrollment. An INSERT .. ON CONFLICT UPDATE fires both row
  -- trigger paths; if the claim already exists, let the UPDATE path advance
  -- the registry exactly once.
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      NEW.session_id::text || ':' || NEW.authentication_method,
      6200
    )
  );
  IF TG_OP = 'INSERT' AND EXISTS (
    SELECT 1
    FROM auth.mfa_amr_claims AS claim
    WHERE claim.session_id = NEW.session_id
      AND claim.authentication_method = NEW.authentication_method
  ) THEN
    RETURN NEW;
  END IF;

  proposed_epoch := pg_catalog.floor(
    EXTRACT(epoch FROM NEW.updated_at)
  )::bigint;
  INSERT INTO public.auth_mfa_amr_epochs (
    session_id,
    authentication_method,
    epoch
  )
  VALUES (
    NEW.session_id,
    NEW.authentication_method,
    proposed_epoch
  )
  ON CONFLICT (session_id, authentication_method) DO UPDATE
  SET epoch = GREATEST(
    public.auth_mfa_amr_epochs.epoch + 1,
    EXCLUDED.epoch
  )
  RETURNING epoch INTO assigned_epoch;

  NEW.updated_at := pg_catalog.to_timestamp(assigned_epoch);
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.advance_mfa_amr_epoch()
  FROM PUBLIC, anon, authenticated, service_role;

DROP TRIGGER IF EXISTS mfa_amr_claims_advance_epoch
  ON auth.mfa_amr_claims;
CREATE TRIGGER mfa_amr_claims_advance_epoch
BEFORE INSERT OR UPDATE OF session_id, authentication_method, updated_at
ON auth.mfa_amr_claims
FOR EACH ROW EXECUTE FUNCTION public.advance_mfa_amr_epoch();

-- Deletion intentionally leaves the registry row in place. Taking the same
-- per-key lock closes a race between unenrollment and concurrent verification;
-- deleting the parent Auth session cascades the registry row instead.
CREATE OR REPLACE FUNCTION public.lock_mfa_amr_epoch_delete()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      OLD.session_id::text || ':' || OLD.authentication_method,
      6200
    )
  );
  RETURN OLD;
END;
$$;

REVOKE ALL ON FUNCTION public.lock_mfa_amr_epoch_delete()
  FROM PUBLIC, anon, authenticated, service_role;

DROP TRIGGER IF EXISTS mfa_amr_claims_lock_epoch_delete
  ON auth.mfa_amr_claims;
CREATE TRIGGER mfa_amr_claims_lock_epoch_delete
BEFORE DELETE ON auth.mfa_amr_claims
FOR EACH ROW EXECUTE FUNCTION public.lock_mfa_amr_epoch_delete();

-- Preserve the live epoch when this migration is applied to existing Auth
-- sessions. The trigger is already active, so no concurrent insert can appear
-- between this snapshot and protection. Reapplying can only move epochs ahead.
INSERT INTO public.auth_mfa_amr_epochs (
  session_id,
  authentication_method,
  epoch
)
SELECT
  claim.session_id,
  claim.authentication_method,
  pg_catalog.floor(EXTRACT(epoch FROM claim.updated_at))::bigint
FROM auth.mfa_amr_claims AS claim
ON CONFLICT (session_id, authentication_method) DO UPDATE
SET epoch = GREATEST(
  public.auth_mfa_amr_epochs.epoch,
  EXCLUDED.epoch
);

-- Read current Auth state instead of trusting access-token metadata. An AAL2
-- token must match both the factor currently associated with its session and
-- the session's durable AMR epoch. GoTrue copies the backing row's Unix epoch
-- into the JWT. Factor types map to GoTrue's official AMR names: `totp`,
-- `mfa/phone`, and `mfa/webauthn`.
CREATE OR REPLACE FUNCTION public.mfa_aal_ok_for_user(
  p_user uuid,
  p_session uuid,
  p_aal text,
  p_amr jsonb
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT COALESCE((
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
  ), false)
$$;

REVOKE ALL ON FUNCTION public.mfa_aal_ok_for_user(uuid, uuid, text, jsonb)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.mfa_aal_ok_for_user(uuid, uuid, text, jsonb)
  TO service_role;

-- Enforce the application-wide MFA contract at every public data boundary.
CREATE OR REPLACE FUNCTION public.mfa_aal_ok()
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  session_id uuid;
BEGIN
  IF auth.role() IN ('anon', 'service_role') THEN
    RETURN true;
  END IF;
  IF auth.role() IS DISTINCT FROM 'authenticated' OR auth.uid() IS NULL THEN
    RETURN false;
  END IF;

  BEGIN
    session_id := NULLIF(auth.jwt() ->> 'session_id', '')::uuid;
  EXCEPTION WHEN OTHERS THEN
    session_id := NULL;
  END;

  RETURN public.mfa_aal_ok_for_user(
    auth.uid(),
    session_id,
    auth.jwt() ->> 'aal',
    auth.jwt() -> 'amr'
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.enforce_mfa_aal()
RETURNS void
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = ''
AS $$
BEGIN
  IF NOT public.mfa_aal_ok() THEN
    RAISE insufficient_privilege USING MESSAGE = 'MFA challenge required';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.mfa_aal_ok()
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.enforce_mfa_aal()
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.mfa_aal_ok() TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.enforce_mfa_aal() TO anon, authenticated, service_role;

-- Privileged routes revalidate the live session because a signed access token
-- remains valid until expiry after its refresh-backed session is revoked.
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
      AND session.created_at + interval '720 hours' >= now()
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
      ) + interval '168 hours' >= now()
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

-- Return the complete live authorization decision in one service-only RPC so
-- every Next API can revalidate session and MFA state without two round trips.
CREATE OR REPLACE FUNCTION public.auth_authorization_state(
  p_user uuid,
  p_session uuid,
  p_aal text,
  p_amr jsonb
)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT pg_catalog.jsonb_build_object(
    'sessionActive', public.is_auth_session_active(p_user, p_session),
    'mfaAllowed', public.mfa_aal_ok_for_user(
      p_user,
      p_session,
      p_aal,
      p_amr
    )
  )
$$;

REVOKE ALL ON FUNCTION public.auth_authorization_state(uuid, uuid, text, jsonb)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.auth_authorization_state(uuid, uuid, text, jsonb)
  TO service_role;

-- Validate the session bound to the current JWT. Access tokens remain
-- cryptographically valid after logout, so every live data boundary must also
-- check current Auth state. Missing and malformed session claims fail closed.
CREATE OR REPLACE FUNCTION public.auth_session_is_current()
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  session_id uuid;
  token_aal text;
BEGIN
  IF auth.role() IN ('anon', 'service_role') THEN
    RETURN true;
  END IF;
  IF auth.role() IS DISTINCT FROM 'authenticated' OR auth.uid() IS NULL THEN
    RETURN false;
  END IF;

  BEGIN
    session_id := NULLIF(auth.jwt() ->> 'session_id', '')::uuid;
  EXCEPTION WHEN OTHERS THEN
    RETURN false;
  END;
  IF session_id IS NULL THEN
    RETURN false;
  END IF;
  token_aal := NULLIF(auth.jwt() ->> 'aal', '');

  RETURN public.is_auth_session_active(auth.uid(), session_id)
    AND EXISTS (
      SELECT 1
      FROM auth.sessions AS session
      WHERE session.id = session_id
        AND session.user_id = auth.uid()
        AND COALESCE(session.aal::text, 'aal1') = token_aal
    );
END;
$$;

REVOKE ALL ON FUNCTION public.auth_session_is_current()
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.auth_session_is_current()
  TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.enforce_mfa_aal()
RETURNS void
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = ''
AS $$
BEGIN
  IF NOT public.mfa_aal_ok() THEN
    RAISE insufficient_privilege USING MESSAGE = 'MFA challenge required';
  END IF;
  IF auth.role() = 'authenticated'
     AND NOT public.auth_session_is_current() THEN
    RAISE insufficient_privilege USING MESSAGE = 'Auth session is no longer active';
  END IF;
END;
$$;

-- PostgREST invokes this hook before tables, views, GraphQL, and RPCs.
ALTER ROLE authenticator SET pgrst.db_pre_request = 'public.enforce_mfa_aal';
NOTIFY pgrst, 'reload config';

DROP POLICY IF EXISTS "mfa_aal_required" ON storage.objects;
CREATE POLICY "mfa_aal_required"
ON storage.objects
AS RESTRICTIVE
FOR ALL
TO authenticated
USING ((SELECT public.mfa_aal_ok()))
WITH CHECK ((SELECT public.mfa_aal_ok()));

DROP POLICY IF EXISTS "auth_session_required" ON storage.objects;
CREATE POLICY "auth_session_required"
ON storage.objects
AS RESTRICTIVE
FOR ALL
TO authenticated
USING ((SELECT public.auth_session_is_current()))
WITH CHECK ((SELECT public.auth_session_is_current()));

DROP POLICY IF EXISTS "mfa_aal_required" ON realtime.messages;
CREATE POLICY "mfa_aal_required"
ON realtime.messages
AS RESTRICTIVE
FOR ALL
TO authenticated
USING ((SELECT public.mfa_aal_ok()))
WITH CHECK ((SELECT public.mfa_aal_ok()));

DROP POLICY IF EXISTS "auth_session_required" ON realtime.messages;
CREATE POLICY "auth_session_required"
ON realtime.messages
AS RESTRICTIVE
FOR ALL
TO authenticated
USING ((SELECT public.auth_session_is_current()))
WITH CHECK ((SELECT public.auth_session_is_current()));

-- Client comment edits are body-only. RLS verifies the old and new parent
-- scope, but it cannot express that identity and scope columns are immutable;
-- changing parent_id alone could attach a whole thread to a foreign cascade.
CREATE OR REPLACE FUNCTION public.guard_comment_client_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
BEGIN
  IF auth.role() = 'authenticated' AND OLD.via_assistant THEN
    RAISE insufficient_privilege
      USING MESSAGE = 'Assistant comments are immutable to clients';
  END IF;
  IF auth.role() = 'authenticated'
     AND (
       pg_catalog.to_jsonb(NEW) - ARRAY['body', 'updated_at']::text[]
     ) IS DISTINCT FROM (
       pg_catalog.to_jsonb(OLD) - ARRAY['body', 'updated_at']::text[]
     ) THEN
    RAISE insufficient_privilege
      USING MESSAGE = 'Comment scope and identity fields are immutable';
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.guard_comment_client_update()
  FROM PUBLIC, anon, authenticated, service_role;

DROP TRIGGER IF EXISTS comments_guard_client_update ON public.comments;
CREATE TRIGGER comments_guard_client_update
BEFORE UPDATE ON public.comments
FOR EACH ROW EXECUTE FUNCTION public.guard_comment_client_update();

DROP TRIGGER IF EXISTS page_comments_guard_client_update
  ON public.page_comments;
CREATE TRIGGER page_comments_guard_client_update
BEFORE UPDATE ON public.page_comments
FOR EACH ROW EXECUTE FUNCTION public.guard_comment_client_update();

-- Match the existing comments policy: the actor whose account launched Numo
-- cannot rewrite the assistant-authored reply that carries the same author_id.
DROP POLICY IF EXISTS page_comments_update ON public.page_comments;
CREATE POLICY page_comments_update ON public.page_comments
FOR UPDATE TO authenticated
USING (
  public.can_access_project(project_id)
  AND author_id = (SELECT auth.uid())
  AND via_assistant = false
  AND EXISTS (
    SELECT 1 FROM public.pages AS page
    WHERE page.id = page_comments.page_id
      AND page.deleted_at IS NULL
  )
)
WITH CHECK (
  public.can_access_project(project_id)
  AND author_id = (SELECT auth.uid())
  AND via_assistant = false
  AND EXISTS (
    SELECT 1 FROM public.pages AS page
    WHERE page.id = page_comments.page_id
      AND page.deleted_at IS NULL
  )
);

-- Parent links are a second scope boundary because both foreign keys cascade
-- on deletion. Validate inserts for every role and retain the check on any
-- privileged scope move; client updates are already body-only above.
CREATE OR REPLACE FUNCTION public.validate_comment_parent_scope()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  parent_scope record;
BEGIN
  IF TG_OP = 'UPDATE'
     AND NEW.issue_id IS NOT DISTINCT FROM OLD.issue_id
     AND NEW.objective_id IS NOT DISTINCT FROM OLD.objective_id
     AND NEW.feedback_post_id IS NOT DISTINCT FROM OLD.feedback_post_id
     AND NEW.parent_id IS NOT DISTINCT FROM OLD.parent_id THEN
    RETURN NEW;
  END IF;
  IF NEW.parent_id IS NOT NULL THEN
    IF NEW.parent_id = NEW.id THEN
      RAISE check_violation USING MESSAGE = 'comment_parent_cycle';
    END IF;

    SELECT parent.issue_id, parent.objective_id, parent.feedback_post_id
    INTO parent_scope
    FROM public.comments AS parent
    WHERE parent.id = NEW.parent_id;
    IF NOT FOUND OR ROW(
      parent_scope.issue_id,
      parent_scope.objective_id,
      parent_scope.feedback_post_id
    ) IS DISTINCT FROM ROW(
      NEW.issue_id,
      NEW.objective_id,
      NEW.feedback_post_id
    ) THEN
      RAISE check_violation USING MESSAGE = 'comment_parent_scope_mismatch';
    END IF;

    IF TG_OP = 'UPDATE' AND EXISTS (
      WITH RECURSIVE descendants(id) AS (
        SELECT child.id
        FROM public.comments AS child
        WHERE child.parent_id = NEW.id
        UNION
        SELECT child.id
        FROM public.comments AS child
        JOIN descendants ON child.parent_id = descendants.id
      )
      SELECT 1 FROM descendants WHERE id = NEW.parent_id
    ) THEN
      RAISE check_violation USING MESSAGE = 'comment_parent_cycle';
    END IF;
  END IF;

  IF TG_OP = 'UPDATE' AND EXISTS (
    SELECT 1
    FROM public.comments AS child
    WHERE child.parent_id = NEW.id
      AND ROW(child.issue_id, child.objective_id, child.feedback_post_id)
          IS DISTINCT FROM ROW(
            NEW.issue_id,
            NEW.objective_id,
            NEW.feedback_post_id
          )
  ) THEN
    RAISE check_violation USING MESSAGE = 'comment_child_scope_mismatch';
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.validate_comment_parent_scope()
  FROM PUBLIC, anon, authenticated, service_role;

DROP TRIGGER IF EXISTS comments_validate_parent_scope ON public.comments;
CREATE TRIGGER comments_validate_parent_scope
BEFORE INSERT OR UPDATE ON public.comments
FOR EACH ROW EXECUTE FUNCTION public.validate_comment_parent_scope();

CREATE OR REPLACE FUNCTION public.validate_page_comment_scope()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  page_project_id uuid;
  parent_scope record;
BEGIN
  IF TG_OP = 'UPDATE'
     AND NEW.page_id IS NOT DISTINCT FROM OLD.page_id
     AND NEW.project_id IS NOT DISTINCT FROM OLD.project_id
     AND NEW.parent_id IS NOT DISTINCT FROM OLD.parent_id THEN
    RETURN NEW;
  END IF;

  SELECT page.project_id
  INTO page_project_id
  FROM public.pages AS page
  WHERE page.id = NEW.page_id;
  IF NOT FOUND OR page_project_id IS DISTINCT FROM NEW.project_id THEN
    RAISE check_violation USING MESSAGE = 'page_comment_scope_mismatch';
  END IF;
  IF NEW.parent_id IS NOT NULL THEN
    IF NEW.parent_id = NEW.id THEN
      RAISE check_violation USING MESSAGE = 'page_comment_parent_cycle';
    END IF;

    SELECT parent.page_id, parent.project_id
    INTO parent_scope
    FROM public.page_comments AS parent
    WHERE parent.id = NEW.parent_id;
    IF NOT FOUND
       OR parent_scope.page_id IS DISTINCT FROM NEW.page_id
       OR parent_scope.project_id IS DISTINCT FROM NEW.project_id THEN
      RAISE check_violation USING MESSAGE = 'page_comment_parent_scope_mismatch';
    END IF;

    IF TG_OP = 'UPDATE' AND EXISTS (
      WITH RECURSIVE descendants(id) AS (
        SELECT child.id
        FROM public.page_comments AS child
        WHERE child.parent_id = NEW.id
        UNION
        SELECT child.id
        FROM public.page_comments AS child
        JOIN descendants ON child.parent_id = descendants.id
      )
      SELECT 1 FROM descendants WHERE id = NEW.parent_id
    ) THEN
      RAISE check_violation USING MESSAGE = 'page_comment_parent_cycle';
    END IF;
  END IF;

  IF TG_OP = 'UPDATE' AND EXISTS (
    SELECT 1
    FROM public.page_comments AS child
    WHERE child.parent_id = NEW.id
      AND (
        child.page_id IS DISTINCT FROM NEW.page_id
        OR child.project_id IS DISTINCT FROM NEW.project_id
      )
  ) THEN
    RAISE check_violation USING MESSAGE = 'page_comment_child_scope_mismatch';
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.validate_page_comment_scope()
  FROM PUBLIC, anon, authenticated, service_role;

DROP TRIGGER IF EXISTS page_comments_validate_scope ON public.page_comments;
CREATE TRIGGER page_comments_validate_scope
BEFORE INSERT OR UPDATE ON public.page_comments
FOR EACH ROW EXECUTE FUNCTION public.validate_page_comment_scope();

-- Do not grandfather a pre-existing cross-scope cascade. A deployment with
-- legacy inconsistent data must stop for explicit repair before promotion.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.comments AS child
    JOIN public.comments AS parent ON parent.id = child.parent_id
    WHERE child.id = child.parent_id
       OR ROW(child.issue_id, child.objective_id, child.feedback_post_id)
          IS DISTINCT FROM ROW(
            parent.issue_id,
            parent.objective_id,
            parent.feedback_post_id
          )
  ) THEN
    RAISE check_violation USING MESSAGE = 'existing_comment_parent_scope_mismatch';
  END IF;
  IF EXISTS (
    WITH RECURSIVE parent_walk(id, parent_id, path, cycle) AS (
      SELECT comment.id, comment.parent_id, ARRAY[comment.id], false
      FROM public.comments AS comment
      UNION ALL
      SELECT parent.id,
             parent.parent_id,
             walk.path || parent.id,
             parent.id = ANY(walk.path)
      FROM parent_walk AS walk
      JOIN public.comments AS parent ON parent.id = walk.parent_id
      WHERE NOT walk.cycle
    )
    SELECT 1 FROM parent_walk WHERE cycle
  ) THEN
    RAISE check_violation USING MESSAGE = 'existing_comment_parent_cycle';
  END IF;
  IF EXISTS (
    SELECT 1
    FROM public.page_comments AS child
    JOIN public.pages AS page ON page.id = child.page_id
    LEFT JOIN public.page_comments AS parent ON parent.id = child.parent_id
    WHERE page.project_id IS DISTINCT FROM child.project_id
       OR child.id = child.parent_id
       OR (
         child.parent_id IS NOT NULL
         AND (
           parent.id IS NULL
           OR parent.page_id IS DISTINCT FROM child.page_id
           OR parent.project_id IS DISTINCT FROM child.project_id
         )
       )
  ) THEN
    RAISE check_violation USING MESSAGE = 'existing_page_comment_scope_mismatch';
  END IF;
  IF EXISTS (
    WITH RECURSIVE parent_walk(id, parent_id, path, cycle) AS (
      SELECT comment.id, comment.parent_id, ARRAY[comment.id], false
      FROM public.page_comments AS comment
      UNION ALL
      SELECT parent.id,
             parent.parent_id,
             walk.path || parent.id,
             parent.id = ANY(walk.path)
      FROM parent_walk AS walk
      JOIN public.page_comments AS parent ON parent.id = walk.parent_id
      WHERE NOT walk.cycle
    )
    SELECT 1 FROM parent_walk WHERE cycle
  ) THEN
    RAISE check_violation USING MESSAGE = 'existing_page_comment_parent_cycle';
  END IF;
END;
$$;

-- Correlate each event and steering message with its own run. The squashed
-- baseline accidentally compared two columns from agent_runs to each other.
DROP POLICY IF EXISTS "agent_run_events_select" ON public.agent_run_events;
CREATE POLICY "agent_run_events_select"
ON public.agent_run_events
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.agent_runs AS run_row
    JOIN public.agent_conversations AS conversation
      ON conversation.id = run_row.conversation_id
    WHERE run_row.id = agent_run_events.run_id
      AND public.can_access_project(conversation.project_id)
      AND (
        conversation.visibility = 'project'
        OR conversation.owner_id = (SELECT auth.uid())
      )
  )
);

DROP POLICY IF EXISTS "agent_run_messages_select" ON public.agent_run_messages;
CREATE POLICY "agent_run_messages_select"
ON public.agent_run_messages
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.agent_runs AS run_row
    JOIN public.agent_conversations AS conversation
      ON conversation.id = run_row.conversation_id
    WHERE run_row.id = agent_run_messages.run_id
      AND public.can_access_project(conversation.project_id)
      AND (
        conversation.visibility = 'project'
        OR conversation.owner_id = (SELECT auth.uid())
      )
  )
);

-- Service-role uploads must account for the complete pending payload because
-- Storage RLS is bypassed on those paths.
-- Keep project ownership available after a hard delete until the final object
-- below that exact project prefix is removed. A plain join to projects loses
-- attribution as soon as the project row disappears and lets repeated project
-- deletion temporarily evade an account-wide quota.
CREATE TABLE public.project_storage_owners (
  project_id uuid PRIMARY KEY,
  owner_id uuid NOT NULL,
  object_count bigint NOT NULL DEFAULT 0
    CHECK (object_count >= 0),
  project_deleted boolean NOT NULL DEFAULT false
);

ALTER TABLE public.project_storage_owners OWNER TO postgres;
ALTER TABLE public.project_storage_owners ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.project_storage_owners FORCE ROW LEVEL SECURITY;

CREATE INDEX project_storage_owners_owner_idx
ON public.project_storage_owners (owner_id);

REVOKE ALL ON TABLE public.project_storage_owners
  FROM PUBLIC, anon, authenticated, service_role;

-- Trigger installation takes write locks later in this transaction. Lock both
-- sources before the backfill so no project or Storage write can land between
-- the snapshot and the lifecycle triggers becoming visible.
LOCK TABLE public.projects IN SHARE ROW EXCLUSIVE MODE;
LOCK TABLE storage.objects IN SHARE ROW EXCLUSIVE MODE;

INSERT INTO public.project_storage_owners (
  project_id,
  owner_id,
  object_count,
  project_deleted
)
SELECT
  project.id,
  project.owner_id,
  COUNT(object.id) FILTER (WHERE object.id IS NOT NULL)::bigint,
  false
FROM public.projects AS project
LEFT JOIN storage.objects AS object
  ON object.bucket_id = 'attachments'
 AND split_part(object.name, '/', 1) = 'projects'
 AND project.id = CASE
   WHEN split_part(object.name, '/', 2) ~*
     '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
   THEN split_part(object.name, '/', 2)::uuid
 END
GROUP BY project.id, project.owner_id;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM storage.objects AS object
    WHERE object.bucket_id = 'attachments'
      AND split_part(object.name, '/', 1) = 'projects'
      AND CASE
        WHEN split_part(object.name, '/', 2) ~*
          '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
        THEN NOT EXISTS (
          SELECT 1
          FROM public.project_storage_owners AS attribution
          WHERE attribution.project_id = split_part(object.name, '/', 2)::uuid
        )
        ELSE true
      END
  ) THEN
    RAISE check_violation
      USING MESSAGE = 'existing_unattributed_project_storage_object';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.account_storage_bytes(p_user uuid)
RETURNS bigint
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT COALESCE(SUM(
    CASE
      WHEN object.metadata ->> 'size' ~ '^[0-9]+$'
      THEN (object.metadata ->> 'size')::bigint
      ELSE 0
    END
  ), 0)::bigint
  FROM storage.objects AS object
  LEFT JOIN public.project_storage_owners AS attribution
    ON split_part(object.name, '/', 1) = 'projects'
   AND attribution.project_id = CASE
     WHEN split_part(object.name, '/', 2) ~*
          '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
     THEN split_part(object.name, '/', 2)::uuid
   END
  WHERE object.bucket_id = 'attachments'
    AND (
      attribution.owner_id = p_user
      OR (
        split_part(object.name, '/', 1) = 'chat'
        AND split_part(object.name, '/', 2) = p_user::text
      )
    )
$$;

REVOKE ALL ON FUNCTION public.account_storage_bytes(uuid)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.account_storage_bytes(uuid)
  TO service_role;

CREATE OR REPLACE FUNCTION public.account_storage_quota_allows(
  p_user uuid,
  p_additional_bytes bigint
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT COALESCE(
    p_user IS NOT NULL
    AND p_additional_bytes IS NOT NULL
    AND p_additional_bytes >= 0
    AND usage.used_bytes <= usage.limit_bytes
    AND p_additional_bytes <= usage.limit_bytes - usage.used_bytes,
    false
  )
  FROM (
    SELECT
      public.account_storage_bytes(p_user) AS used_bytes,
      COALESCE(
        (
          SELECT quota.bytes
          FROM public.plan_storage_quotas AS quota
          WHERE quota.plan_id = public.effective_plan_id(p_user)
        ),
        (
          SELECT quota.bytes
          FROM public.plan_storage_quotas AS quota
          WHERE quota.plan_id = 'free'
        ),
        0
      ) AS limit_bytes
  ) AS usage
$$;

REVOKE ALL ON FUNCTION public.account_storage_quota_allows(uuid, bigint)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.account_storage_quota_allows(uuid, bigint)
  TO service_role;

CREATE OR REPLACE FUNCTION public.project_storage_quota_allows(
  p_project uuid,
  p_additional_bytes bigint
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT COALESCE((
    SELECT public.account_storage_quota_allows(
      attribution.owner_id,
      p_additional_bytes
    )
    FROM public.projects AS project
    JOIN public.project_storage_owners AS attribution
      ON attribution.project_id = project.id
     AND attribution.owner_id = project.owner_id
     AND NOT attribution.project_deleted
    WHERE project.id = p_project
  ), false)
$$;

REVOKE ALL ON FUNCTION public.project_storage_quota_allows(uuid, bigint)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.project_storage_quota_allows(uuid, bigint)
  TO service_role;

-- Enforce physical bytes at the Storage boundary. Metadata rows are created
-- after browser uploads, so counting only those rows lets a client omit or
-- understate them while the bucket continues to grow.
CREATE OR REPLACE FUNCTION public.enforce_storage_object_quota()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  account_id uuid;
  target_project_id uuid;
  stored_bytes bigint;
  previous_bytes bigint := 0;
  additional_bytes bigint;
  first_segment text := split_part(NEW.name, '/', 1);
  second_segment text := split_part(NEW.name, '/', 2);
BEGIN
  IF TG_OP = 'UPDATE'
     AND (OLD.bucket_id, OLD.name) IS DISTINCT FROM (NEW.bucket_id, NEW.name) THEN
    RAISE EXCEPTION 'storage_object_scope_immutable' USING ERRCODE = '22023';
  END IF;
  IF NEW.bucket_id <> 'attachments' THEN
    RETURN NEW;
  END IF;
  IF second_segment !~*
     '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
    RAISE EXCEPTION 'storage_object_scope_mismatch' USING ERRCODE = '22023';
  END IF;
  IF first_segment = 'projects' THEN
    target_project_id := second_segment::uuid;
    SELECT attribution.owner_id
    INTO account_id
    FROM public.project_storage_owners AS attribution
    WHERE attribution.project_id = target_project_id
    FOR UPDATE;
  ELSIF first_segment = 'chat' THEN
    account_id := second_segment::uuid;
    IF NOT EXISTS (
      SELECT 1 FROM auth.users AS account WHERE account.id = account_id
    ) THEN
      account_id := NULL;
    END IF;
  ELSE
    RAISE EXCEPTION 'storage_object_scope_mismatch' USING ERRCODE = '22023';
  END IF;
  IF account_id IS NULL THEN
    RAISE EXCEPTION 'storage_quota_owner_missing' USING ERRCODE = '23503';
  END IF;
  -- Storage API performs a zero-metadata permission probe before writing the
  -- object. Its later metadata update carries the authoritative physical size.
  stored_bytes := 0;
  BEGIN
    IF NEW.metadata ->> 'size' IS NOT NULL THEN
      stored_bytes := (NEW.metadata ->> 'size')::bigint;
    END IF;
    IF TG_OP = 'UPDATE' AND OLD.metadata ->> 'size' IS NOT NULL THEN
      previous_bytes := (OLD.metadata ->> 'size')::bigint;
    END IF;
  EXCEPTION WHEN OTHERS THEN
    RAISE EXCEPTION 'storage_object_size_invalid' USING ERRCODE = '22023';
  END;
  IF stored_bytes < 0 OR previous_bytes < 0 THEN
    RAISE EXCEPTION 'storage_object_size_invalid' USING ERRCODE = '22023';
  END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('storage-quota:' || account_id::text, 467)
  );
  IF TG_OP = 'UPDATE' AND stored_bytes <= previous_bytes THEN
    RETURN NEW;
  END IF;
  additional_bytes := GREATEST(stored_bytes - previous_bytes, 0::bigint);
  IF NOT public.account_storage_quota_allows(account_id, additional_bytes) THEN
    RAISE EXCEPTION 'storage_quota_exceeded' USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.enforce_storage_object_quota()
  FROM PUBLIC, anon, authenticated, service_role;

DROP TRIGGER IF EXISTS objects_enforce_storage_quota ON storage.objects;
CREATE TRIGGER objects_enforce_storage_quota
BEFORE INSERT OR UPDATE OF bucket_id, name, metadata ON storage.objects
FOR EACH ROW EXECUTE FUNCTION public.enforce_storage_object_quota();

-- Maintain a counter under the same attribution-row lock taken by quota
-- enforcement. This makes final cleanup safe even when an object insert,
-- object delete, or project hard delete waits on another transaction.
CREATE OR REPLACE FUNCTION public.track_storage_object_attribution()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  target_project_id uuid;
  remaining_objects bigint;
  project_is_deleted boolean;
  object_name text := CASE WHEN TG_OP = 'DELETE' THEN OLD.name ELSE NEW.name END;
  object_bucket text := CASE
    WHEN TG_OP = 'DELETE' THEN OLD.bucket_id
    ELSE NEW.bucket_id
  END;
  second_segment text := split_part(object_name, '/', 2);
BEGIN
  IF object_bucket <> 'attachments'
     OR split_part(object_name, '/', 1) <> 'projects' THEN
    IF TG_OP = 'DELETE' THEN
      RETURN OLD;
    END IF;
    RETURN NEW;
  END IF;
  IF second_segment !~*
     '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
    IF TG_OP = 'INSERT' THEN
      RAISE EXCEPTION 'storage_object_scope_mismatch' USING ERRCODE = '22023';
    END IF;
    RETURN OLD;
  END IF;
  target_project_id := second_segment::uuid;

  IF TG_OP = 'INSERT' THEN
    UPDATE public.project_storage_owners AS attribution
    SET object_count = attribution.object_count + 1
    WHERE attribution.project_id = target_project_id
    RETURNING attribution.object_count, attribution.project_deleted
    INTO remaining_objects, project_is_deleted;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'storage_quota_owner_missing' USING ERRCODE = '23503';
    END IF;
    RETURN NEW;
  END IF;

  UPDATE public.project_storage_owners AS attribution
  SET object_count = attribution.object_count - 1
  WHERE attribution.project_id = target_project_id
    AND attribution.object_count > 0
  RETURNING attribution.object_count, attribution.project_deleted
  INTO remaining_objects, project_is_deleted;
  IF NOT FOUND THEN
    -- Permit removal of a pre-existing malformed orphan so remediation cannot
    -- be blocked by the registry that is intended to prevent new orphans.
    RETURN OLD;
  END IF;
  IF project_is_deleted AND remaining_objects = 0 THEN
    DELETE FROM public.project_storage_owners AS attribution
    WHERE attribution.project_id = target_project_id
      AND attribution.project_deleted
      AND attribution.object_count = 0;
  END IF;
  RETURN OLD;
END;
$$;

REVOKE ALL ON FUNCTION public.track_storage_object_attribution()
  FROM PUBLIC, anon, authenticated, service_role;

DROP TRIGGER IF EXISTS objects_track_storage_attribution ON storage.objects;
CREATE TRIGGER objects_track_storage_attribution
AFTER INSERT OR DELETE ON storage.objects
FOR EACH ROW EXECUTE FUNCTION public.track_storage_object_attribution();

-- Projects are the authoritative owner source while they exist. The registry
-- rejects identifier reuse while deleted-project objects remain and moves all
-- physical bytes atomically when ownership is transferred.
CREATE OR REPLACE FUNCTION public.sync_project_storage_owner()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  attributed_owner uuid;
  first_owner uuid;
  second_owner uuid;
BEGIN
  IF TG_OP = 'INSERT' THEN
    BEGIN
      INSERT INTO public.project_storage_owners (
        project_id,
        owner_id,
        object_count,
        project_deleted
      ) VALUES (NEW.id, NEW.owner_id, 0, false);
    EXCEPTION WHEN unique_violation THEN
      RAISE EXCEPTION 'storage_project_id_reuse' USING ERRCODE = '23505';
    END;
    RETURN NEW;
  END IF;

  SELECT attribution.owner_id
  INTO attributed_owner
  FROM public.project_storage_owners AS attribution
  WHERE attribution.project_id = NEW.id
  FOR UPDATE;
  IF attributed_owner IS NULL OR attributed_owner <> OLD.owner_id THEN
    RAISE EXCEPTION 'storage_attribution_owner_mismatch'
      USING ERRCODE = '23514';
  END IF;
  IF NEW.owner_id = OLD.owner_id THEN
    RETURN NEW;
  END IF;

  IF OLD.owner_id::text < NEW.owner_id::text THEN
    first_owner := OLD.owner_id;
    second_owner := NEW.owner_id;
  ELSE
    first_owner := NEW.owner_id;
    second_owner := OLD.owner_id;
  END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('storage-quota:' || first_owner::text, 467)
  );
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('storage-quota:' || second_owner::text, 467)
  );

  UPDATE public.project_storage_owners AS attribution
  SET owner_id = NEW.owner_id
  WHERE attribution.project_id = NEW.id;
  IF NOT public.account_storage_quota_allows(NEW.owner_id, 0) THEN
    RAISE EXCEPTION 'storage_quota_exceeded' USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.sync_project_storage_owner()
  FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.retire_project_storage_owner()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  remaining_objects bigint;
BEGIN
  UPDATE public.project_storage_owners AS attribution
  SET project_deleted = true
  WHERE attribution.project_id = OLD.id
    AND attribution.owner_id = OLD.owner_id
  RETURNING attribution.object_count
  INTO remaining_objects;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'storage_attribution_owner_mismatch'
      USING ERRCODE = '23514';
  END IF;
  IF remaining_objects = 0 THEN
    DELETE FROM public.project_storage_owners AS attribution
    WHERE attribution.project_id = OLD.id
      AND attribution.project_deleted
      AND attribution.object_count = 0;
  END IF;
  RETURN OLD;
END;
$$;

REVOKE ALL ON FUNCTION public.retire_project_storage_owner()
  FROM PUBLIC, anon, authenticated, service_role;

-- A project identifier is also its permanent Storage namespace. Allowing an
-- UPDATE to reuse a deleted project's identifier would pair the new project
-- RLS scope with the deleted project's durable owner attribution.
CREATE OR REPLACE FUNCTION public.guard_project_identity()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NEW.id IS DISTINCT FROM OLD.id THEN
    RAISE EXCEPTION 'project_id_immutable' USING ERRCODE = '22023';
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.guard_project_identity()
  FROM PUBLIC, anon, authenticated, service_role;

DROP TRIGGER IF EXISTS projects_guard_identity ON public.projects;
CREATE TRIGGER projects_guard_identity
BEFORE UPDATE OF id ON public.projects
FOR EACH ROW EXECUTE FUNCTION public.guard_project_identity();

DROP TRIGGER IF EXISTS projects_sync_storage_owner ON public.projects;
CREATE TRIGGER projects_sync_storage_owner
AFTER INSERT OR UPDATE OF owner_id ON public.projects
FOR EACH ROW EXECUTE FUNCTION public.sync_project_storage_owner();

DROP TRIGGER IF EXISTS projects_retire_storage_owner ON public.projects;
CREATE TRIGGER projects_retire_storage_owner
AFTER DELETE ON public.projects
FOR EACH ROW EXECUTE FUNCTION public.retire_project_storage_owner();

-- Serialize quota-relevant metadata inserts by account owner. This closes the
-- window in which parallel service-role imports all pass the same preflight
-- before any of their page_files rows become visible.
CREATE OR REPLACE FUNCTION public.enforce_storage_insert_quota()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  owner_id uuid;
  additional_bytes bigint;
  stored_bytes bigint;
BEGIN
  SELECT attribution.owner_id
  INTO owner_id
  FROM public.projects AS project
  JOIN public.project_storage_owners AS attribution
    ON attribution.project_id = project.id
   AND attribution.owner_id = project.owner_id
   AND NOT attribution.project_deleted
  WHERE project.id = NEW.project_id
  FOR UPDATE OF attribution;
  IF owner_id IS NULL THEN
    RAISE EXCEPTION 'storage_quota_project_missing' USING ERRCODE = '23503';
  END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('storage-quota:' || owner_id::text, 467)
  );
  IF TG_TABLE_NAME = 'attachments' AND NEW.storage_path IS NULL THEN
    RETURN NEW;
  ELSE
    IF NEW.storage_path IS NULL
       OR NEW.storage_path NOT LIKE 'projects/' || NEW.project_id::text || '/%'
       OR (
         TG_TABLE_NAME = 'page_files'
         AND NEW.storage_path NOT LIKE
           'projects/' || NEW.project_id::text || '/pages/%'
       ) THEN
      RAISE EXCEPTION 'storage_object_scope_mismatch' USING ERRCODE = '22023';
    END IF;
    SELECT (object.metadata ->> 'size')::bigint
    INTO stored_bytes
    FROM storage.objects AS object
    WHERE object.bucket_id = 'attachments'
      AND object.name = NEW.storage_path;
    IF stored_bytes IS NULL OR stored_bytes <> NEW.size_bytes THEN
      RAISE EXCEPTION 'storage_object_size_mismatch' USING ERRCODE = '22023';
    END IF;
    additional_bytes := 0;
  END IF;
  IF NOT public.project_storage_quota_allows(NEW.project_id, additional_bytes) THEN
    RAISE EXCEPTION 'storage_quota_exceeded' USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.enforce_storage_insert_quota()
  FROM PUBLIC, anon, authenticated, service_role;

DROP TRIGGER IF EXISTS attachments_enforce_storage_quota ON public.attachments;
CREATE TRIGGER attachments_enforce_storage_quota
BEFORE INSERT ON public.attachments
FOR EACH ROW EXECUTE FUNCTION public.enforce_storage_insert_quota();

DROP TRIGGER IF EXISTS page_files_enforce_storage_quota ON public.page_files;
CREATE TRIGGER page_files_enforce_storage_quota
BEFORE INSERT ON public.page_files
FOR EACH ROW EXECUTE FUNCTION public.enforce_storage_insert_quota();

-- Authenticated clients only need to acknowledge their own notifications. Keep
-- every routing, attribution, and target field server-owned: the inbox hydrates
-- those identifiers through the service role, so accepting client rewrites
-- would turn a harmless personal row into a cross-project read primitive.
CREATE OR REPLACE FUNCTION public.guard_notification_client_update()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF auth.role() = 'authenticated'
     AND (
       pg_catalog.to_jsonb(NEW) - 'read_at'
     ) IS DISTINCT FROM (
       pg_catalog.to_jsonb(OLD) - 'read_at'
     ) THEN
    RAISE EXCEPTION 'Notification target and identity fields are immutable'
      USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.guard_notification_client_update()
  FROM PUBLIC, anon, authenticated, service_role;

DROP TRIGGER IF EXISTS notifications_guard_client_update
  ON public.notifications;
CREATE TRIGGER notifications_guard_client_update
BEFORE UPDATE ON public.notifications
FOR EACH ROW EXECUTE FUNCTION public.guard_notification_client_update();

-- Service producers also share one tenant boundary. Validate every target at
-- the database edge so a route or background worker cannot create a row that
-- later becomes a service-role read into a different project.
CREATE OR REPLACE FUNCTION public.notification_targets_match_project(
  p_notification public.notifications
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT
    (
      (p_notification).issue_id IS NULL
      OR EXISTS (
        SELECT 1
        FROM public.issues AS issue
        WHERE issue.id = (p_notification).issue_id
          AND issue.project_id IS NOT DISTINCT FROM (p_notification).project_id
      )
    )
    AND (
      (p_notification).objective_id IS NULL
      OR EXISTS (
        SELECT 1
        FROM public.objectives AS objective
        WHERE objective.id = (p_notification).objective_id
          AND objective.project_id
              IS NOT DISTINCT FROM (p_notification).project_id
      )
    )
    AND (
      (p_notification).feedback_post_id IS NULL
      OR EXISTS (
        SELECT 1
        FROM public.feedback_posts AS post
        WHERE post.id = (p_notification).feedback_post_id
          AND post.project_id IS NOT DISTINCT FROM (p_notification).project_id
      )
    )
    AND (
      (p_notification).routine_id IS NULL
      OR EXISTS (
        SELECT 1
        FROM public.agent_routines AS routine
        WHERE routine.id = (p_notification).routine_id
          AND routine.project_id IS NOT DISTINCT FROM (p_notification).project_id
      )
    )
    AND (
      (p_notification).page_id IS NULL
      OR EXISTS (
        SELECT 1
        FROM public.pages AS page
        WHERE page.id = (p_notification).page_id
          AND page.project_id IS NOT DISTINCT FROM (p_notification).project_id
      )
    )
    AND (
      (p_notification).agent_conversation_id IS NULL
      OR EXISTS (
        SELECT 1
        FROM public.agent_conversations AS conversation
        WHERE conversation.id = (p_notification).agent_conversation_id
          AND conversation.project_id
              IS NOT DISTINCT FROM (p_notification).project_id
      )
    )
    AND (
      (p_notification).comment_id IS NULL
      OR EXISTS (
        SELECT 1
        FROM public.comments AS comment_row
        LEFT JOIN public.issues AS comment_issue
          ON comment_issue.id = comment_row.issue_id
        LEFT JOIN public.objectives AS comment_objective
          ON comment_objective.id = comment_row.objective_id
        LEFT JOIN public.feedback_posts AS comment_feedback
          ON comment_feedback.id = comment_row.feedback_post_id
        WHERE comment_row.id = (p_notification).comment_id
          AND CASE
            WHEN comment_row.issue_id IS NOT NULL
              THEN comment_issue.project_id
            WHEN comment_row.objective_id IS NOT NULL
              THEN comment_objective.project_id
            ELSE comment_feedback.project_id
          END IS NOT DISTINCT FROM (p_notification).project_id
      )
    )
    AND (
      (p_notification).pull_request_id IS NULL
      OR EXISTS (
        SELECT 1
        FROM public.pull_requests AS pull_request
        JOIN public.project_git_links AS project_link
          ON project_link.provider = pull_request.provider
         AND project_link.repo_full_name
             IS NOT DISTINCT FROM pull_request.repo_full_name
        WHERE pull_request.id = (p_notification).pull_request_id
          AND project_link.project_id
              IS NOT DISTINCT FROM (p_notification).project_id
      )
    )
$$;

REVOKE ALL ON FUNCTION public.notification_targets_match_project(
  public.notifications
) FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.validate_notification_target_scope()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  project_owner_id uuid;
BEGIN
  -- A notification may outlive project access, so ordinary updates to an
  -- existing historical row do not recheck its recipient. New rows and an
  -- explicit recipient/project retarget must, however, lock the live access
  -- anchor. A concurrent owner transfer, member removal, or project deletion
  -- then commits either wholly before this check or wholly after the insert.
  IF (
       TG_OP = 'INSERT'
       OR NEW.user_id IS DISTINCT FROM OLD.user_id
       OR NEW.project_id IS DISTINCT FROM OLD.project_id
     )
     AND NEW.project_id IS NOT NULL THEN
    SELECT project.owner_id
    INTO project_owner_id
    FROM public.projects AS project
    WHERE project.id = NEW.project_id
    FOR SHARE;
    IF NOT FOUND THEN
      RAISE check_violation
        USING MESSAGE = 'notification_recipient_scope_mismatch';
    END IF;

    IF project_owner_id IS DISTINCT FROM NEW.user_id THEN
      PERFORM 1
      FROM public.project_members AS member
      WHERE member.project_id = NEW.project_id
        AND member.user_id = NEW.user_id
      FOR SHARE;
      IF NOT FOUND THEN
        RAISE check_violation
          USING MESSAGE = 'notification_recipient_scope_mismatch';
      END IF;
    END IF;
  END IF;

  IF NOT public.notification_targets_match_project(NEW) THEN
    RAISE check_violation USING MESSAGE = 'notification_target_scope_mismatch';
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.validate_notification_target_scope()
  FROM PUBLIC, anon, authenticated, service_role;

DROP TRIGGER IF EXISTS notifications_validate_target_scope
  ON public.notifications;
CREATE TRIGGER notifications_validate_target_scope
BEFORE INSERT OR UPDATE OF
  user_id,
  project_id,
  issue_id,
  objective_id,
  feedback_post_id,
  routine_id,
  page_id,
  agent_conversation_id,
  comment_id,
  pull_request_id
ON public.notifications
FOR EACH ROW EXECUTE FUNCTION public.validate_notification_target_scope();

-- Historical rows are untrusted input to service-role hydration too. Stop the
-- release for explicit repair if any old producer crossed a target boundary.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.notifications AS notification
    WHERE NOT public.notification_targets_match_project(notification)
  ) THEN
    RAISE check_violation
      USING MESSAGE = 'existing_notification_target_scope_mismatch';
  END IF;
END;
$$;
