-- Keep every public abuse-control decision and its write in one database
-- transaction so horizontally scaled workers cannot race past the ceiling.

CREATE OR REPLACE FUNCTION public.issue_feedback_otp_code(
  p_id uuid,
  p_board_id uuid,
  p_email text,
  p_ip_hash text,
  p_code_hash text,
  p_expires_at timestamptz,
  p_now timestamptz DEFAULT now(),
  p_window_seconds integer DEFAULT 3600,
  p_cooldown_seconds integer DEFAULT 60,
  p_email_limit integer DEFAULT 5,
  p_ip_limit integer DEFAULT 15
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_email text := lower(trim(p_email));
BEGIN
  IF v_email = ''
     OR p_ip_hash = ''
     OR p_window_seconds <= 0
     OR p_cooldown_seconds < 0
     OR p_email_limit <= 0
     OR p_ip_limit <= 0 THEN
    RAISE EXCEPTION 'feedback_otp_arguments_invalid' USING ERRCODE = '22023';
  END IF;

  -- Every caller takes these namespaces in the same order. The email lock
  -- protects the cross-board recipient quota; the IP lock protects the
  -- cross-instance origin quota.
  PERFORM pg_advisory_xact_lock(
    hashtextextended('feedback-otp-email:' || v_email, 461)
  );
  PERFORM pg_advisory_xact_lock(
    hashtextextended('feedback-otp-ip:' || p_ip_hash, 461)
  );

  IF EXISTS (
    SELECT 1
    FROM public.feedback_otp_codes
    WHERE board_id = p_board_id
      AND email = v_email
      AND created_at > p_now - make_interval(secs => p_cooldown_seconds)
  ) THEN
    RETURN 'cooldown';
  END IF;

  IF (
    SELECT count(*)
    FROM public.feedback_otp_codes
    WHERE email = v_email
      AND created_at >= p_now - make_interval(secs => p_window_seconds)
  ) >= p_email_limit
  OR (
    SELECT count(*)
    FROM public.feedback_otp_codes
    WHERE ip_hash = p_ip_hash
      AND created_at >= p_now - make_interval(secs => p_window_seconds)
  ) >= p_ip_limit THEN
    RETURN 'rate_limited';
  END IF;

  INSERT INTO public.feedback_otp_codes (
    id,
    board_id,
    email,
    ip_hash,
    code_hash,
    expires_at,
    created_at
  )
  VALUES (
    p_id,
    p_board_id,
    v_email,
    p_ip_hash,
    p_code_hash,
    p_expires_at,
    p_now
  );

  RETURN 'issued';
END;
$function$;

CREATE OR REPLACE FUNCTION public.claim_feedback_otp_attempt(
  p_board_id uuid,
  p_email text,
  p_now timestamptz DEFAULT now(),
  p_max_attempts integer DEFAULT 5
)
RETURNS TABLE(status text, id uuid, code_hash text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_code public.feedback_otp_codes%ROWTYPE;
BEGIN
  IF p_max_attempts <= 0 THEN
    RAISE EXCEPTION 'feedback_otp_arguments_invalid' USING ERRCODE = '22023';
  END IF;

  SELECT *
  INTO v_code
  FROM public.feedback_otp_codes AS codes
  WHERE codes.board_id = p_board_id
    AND codes.email = lower(trim(p_email))
    AND codes.consumed_at IS NULL
  ORDER BY codes.created_at DESC
  LIMIT 1
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN QUERY SELECT 'invalid'::text, NULL::uuid, NULL::text;
    RETURN;
  END IF;
  IF v_code.expires_at <= p_now THEN
    RETURN QUERY SELECT 'expired'::text, v_code.id, NULL::text;
    RETURN;
  END IF;
  IF v_code.attempts >= p_max_attempts THEN
    RETURN QUERY SELECT 'too_many_attempts'::text, v_code.id, NULL::text;
    RETURN;
  END IF;

  UPDATE public.feedback_otp_codes
  SET attempts = attempts + 1
  WHERE feedback_otp_codes.id = v_code.id;

  RETURN QUERY SELECT 'claimed'::text, v_code.id, v_code.code_hash;
END;
$function$;

CREATE OR REPLACE FUNCTION public.consume_feedback_otp_code(
  p_id uuid,
  p_now timestamptz DEFAULT now()
)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $function$
  WITH consumed AS (
    UPDATE public.feedback_otp_codes
    SET consumed_at = p_now
    WHERE id = p_id
      AND consumed_at IS NULL
      AND expires_at > p_now
    RETURNING id
  )
  SELECT EXISTS (SELECT 1 FROM consumed);
$function$;

CREATE OR REPLACE FUNCTION public.consume_share_unlock_attempt(
  p_share_id uuid,
  p_ip_hash text,
  p_now timestamptz DEFAULT now(),
  p_window_seconds integer DEFAULT 3600,
  p_ip_limit integer DEFAULT 10,
  p_share_limit integer DEFAULT 100
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
BEGIN
  IF p_ip_hash = ''
     OR p_window_seconds <= 0
     OR p_ip_limit <= 0
     OR p_share_limit <= 0 THEN
    RAISE EXCEPTION 'share_unlock_arguments_invalid' USING ERRCODE = '22023';
  END IF;

  -- One share lock covers both its aggregate counter and every per-IP counter.
  PERFORM pg_advisory_xact_lock(
    hashtextextended('share-unlock:' || p_share_id::text, 461)
  );

  DELETE FROM public.share_unlock_attempts
  WHERE share_id = p_share_id
    AND created_at < p_now - make_interval(secs => p_window_seconds);

  IF (
    SELECT count(*)
    FROM public.share_unlock_attempts
    WHERE share_id = p_share_id
      AND ip_hash = p_ip_hash
  ) >= p_ip_limit
  OR (
    SELECT count(*)
    FROM public.share_unlock_attempts
    WHERE share_id = p_share_id
  ) >= p_share_limit THEN
    RETURN false;
  END IF;

  INSERT INTO public.share_unlock_attempts (share_id, ip_hash, created_at)
  VALUES (p_share_id, p_ip_hash, p_now);
  RETURN true;
END;
$function$;

CREATE TABLE IF NOT EXISTS public.feedback_voice_attempts (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  board_id uuid NOT NULL REFERENCES public.feedback_boards(id) ON DELETE CASCADE,
  feedback_user_id uuid NOT NULL REFERENCES public.feedback_users(id) ON DELETE CASCADE,
  ip_hash text,
  operation text NOT NULL CHECK (operation IN ('transcribe', 'dictate')),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX feedback_voice_attempts_board_ip
  ON public.feedback_voice_attempts (board_id, operation, ip_hash, created_at DESC)
  WHERE ip_hash IS NOT NULL;
CREATE INDEX feedback_voice_attempts_user
  ON public.feedback_voice_attempts (feedback_user_id, operation, created_at DESC);

ALTER TABLE public.feedback_voice_attempts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.feedback_voice_attempts FROM PUBLIC, anon, authenticated;
REVOKE ALL ON SEQUENCE public.feedback_voice_attempts_id_seq FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, DELETE ON TABLE public.feedback_voice_attempts TO service_role;
GRANT USAGE, SELECT ON SEQUENCE public.feedback_voice_attempts_id_seq TO service_role;

CREATE OR REPLACE FUNCTION public.consume_feedback_voice_attempt(
  p_board_id uuid,
  p_feedback_user_id uuid,
  p_operation text,
  p_ip_hash text DEFAULT NULL,
  p_now timestamptz DEFAULT now(),
  p_window_seconds integer DEFAULT 3600,
  p_user_limit integer DEFAULT 20,
  p_ip_limit integer DEFAULT NULL
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
BEGIN
  IF p_operation NOT IN ('transcribe', 'dictate')
     OR p_window_seconds <= 0
     OR p_user_limit <= 0
     OR (p_ip_limit IS NOT NULL AND (p_ip_limit <= 0 OR p_ip_hash IS NULL OR p_ip_hash = '')) THEN
    RAISE EXCEPTION 'feedback_voice_arguments_invalid' USING ERRCODE = '22023';
  END IF;

  -- A project has one feedback board and feedback identities are project scoped,
  -- so this lock serializes both dimensions without a multi-lock deadlock.
  PERFORM pg_advisory_xact_lock(
    hashtextextended(
      'feedback-voice:' || p_board_id::text || ':' || p_operation,
      461
    )
  );

  DELETE FROM public.feedback_voice_attempts
  WHERE board_id = p_board_id
    AND operation = p_operation
    AND created_at < p_now - make_interval(secs => p_window_seconds);

  IF (
    SELECT count(*)
    FROM public.feedback_voice_attempts
    WHERE feedback_user_id = p_feedback_user_id
      AND operation = p_operation
      AND created_at >= p_now - make_interval(secs => p_window_seconds)
  ) >= p_user_limit THEN
    RETURN false;
  END IF;

  IF p_ip_limit IS NOT NULL AND (
    SELECT count(*)
    FROM public.feedback_voice_attempts
    WHERE board_id = p_board_id
      AND operation = p_operation
      AND ip_hash = p_ip_hash
      AND created_at >= p_now - make_interval(secs => p_window_seconds)
  ) >= p_ip_limit THEN
    RETURN false;
  END IF;

  INSERT INTO public.feedback_voice_attempts (
    board_id,
    feedback_user_id,
    ip_hash,
    operation,
    created_at
  )
  VALUES (
    p_board_id,
    p_feedback_user_id,
    p_ip_hash,
    p_operation,
    p_now
  );
  RETURN true;
END;
$function$;

CREATE OR REPLACE FUNCTION public.write_feedback_sso_secret(
  p_project_id uuid,
  p_sso_secret text,
  p_only_if_absent boolean DEFAULT false
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_board public.feedback_boards%ROWTYPE;
BEGIN
  SELECT *
  INTO v_board
  FROM public.feedback_boards
  WHERE project_id = p_project_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  IF p_only_if_absent AND v_board.sso_secret IS NOT NULL THEN
    RETURN v_board.sso_secret;
  END IF;

  UPDATE public.feedback_boards
  SET sso_secret = p_sso_secret
  WHERE id = v_board.id;
  RETURN p_sso_secret;
END;
$function$;

CREATE OR REPLACE FUNCTION public.delete_public_feedback_comment(
  p_post_id uuid,
  p_comment_id uuid,
  p_feedback_user_id uuid
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_comment public.comments%ROWTYPE;
BEGIN
  SELECT *
  INTO v_comment
  FROM public.comments
  WHERE id = p_comment_id
    AND feedback_post_id = p_post_id
    AND visibility = 'public'
    AND feedback_user_id = p_feedback_user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN false;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.comments
    WHERE parent_id = p_comment_id
  ) THEN
    RETURN false;
  END IF;

  DELETE FROM public.comments WHERE id = p_comment_id;
  RETURN FOUND;
END;
$function$;

REVOKE ALL ON FUNCTION public.issue_feedback_otp_code(
  uuid, uuid, text, text, text, timestamptz, timestamptz, integer, integer, integer, integer
) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.claim_feedback_otp_attempt(
  uuid, text, timestamptz, integer
) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.consume_feedback_otp_code(uuid, timestamptz)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.consume_share_unlock_attempt(
  uuid, text, timestamptz, integer, integer, integer
) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.consume_feedback_voice_attempt(
  uuid, uuid, text, text, timestamptz, integer, integer, integer
) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.write_feedback_sso_secret(uuid, text, boolean)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.delete_public_feedback_comment(uuid, uuid, uuid)
  FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.issue_feedback_otp_code(
  uuid, uuid, text, text, text, timestamptz, timestamptz, integer, integer, integer, integer
) TO service_role;
GRANT EXECUTE ON FUNCTION public.claim_feedback_otp_attempt(
  uuid, text, timestamptz, integer
) TO service_role;
GRANT EXECUTE ON FUNCTION public.consume_feedback_otp_code(uuid, timestamptz)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.consume_share_unlock_attempt(
  uuid, text, timestamptz, integer, integer, integer
) TO service_role;
GRANT EXECUTE ON FUNCTION public.consume_feedback_voice_attempt(
  uuid, uuid, text, text, timestamptz, integer, integer, integer
) TO service_role;
GRANT EXECUTE ON FUNCTION public.write_feedback_sso_secret(uuid, text, boolean)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.delete_public_feedback_comment(uuid, uuid, uuid)
  TO service_role;
