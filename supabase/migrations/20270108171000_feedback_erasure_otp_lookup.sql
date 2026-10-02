BEGIN;

-- A completed erase needs a separate OTP index because the identity and OTP
-- codecs use different scopes and purposes. This marker also identifies old
-- erasures that lost the information needed to match their OTP rows exactly.
ALTER TABLE public.feedback_users
  ADD COLUMN otp_erasure_checked_at timestamptz,
  ADD COLUMN otp_erasure_lookup text,
  ADD COLUMN otp_erasure_until timestamptz;
CREATE INDEX feedback_users_otp_erasure_lookup
  ON public.feedback_users(project_id,otp_erasure_lookup)
  WHERE erased_at IS NOT NULL AND otp_erasure_lookup IS NOT NULL;
CREATE INDEX feedback_users_otp_erasure_cleanup
  ON public.feedback_users(otp_erasure_until)
  WHERE otp_erasure_lookup IS NOT NULL;

DROP FUNCTION public.erase_feedback_identity(uuid,uuid,text);

CREATE FUNCTION public.erase_feedback_identity(
  p_project_id uuid,p_user_id uuid,p_email_plain text,p_otp_email_lookup text
) RETURNS TABLE(already_erased boolean,sessions_revoked integer)
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_user public.feedback_users%ROWTYPE;
  v_sessions integer;
  v_email text := pg_catalog.lower(pg_catalog.btrim(p_email_plain));
  v_erased_at timestamptz;
BEGIN
  -- Keep a request that holds the erasure lock from committing beyond the
  -- short OTP suppression window.
  PERFORM pg_catalog.set_config('lock_timeout','2min',true);
  PERFORM pg_catalog.set_config('statement_timeout','2min',true);
  PERFORM pg_catalog.set_config('idle_in_transaction_session_timeout','2min',true);
  SELECT * INTO v_user FROM public.feedback_users u
    WHERE u.id=p_user_id AND u.project_id=p_project_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'feedback_identity_not_found' USING ERRCODE='P0002';
  END IF;

  -- A protected identity must supply the system-scoped OTP digest before any
  -- mutation. Legacy writers cannot silently leave an encrypted code behind.
  IF v_user.erased_at IS NULL AND v_user.email LIKE 'mdyf3:%' AND
      (v_email IS NULL OR p_otp_email_lookup !~ '^[a-f0-9]{64}$') THEN
    RAISE EXCEPTION 'feedback_otp_lookup_required' USING ERRCODE='22023';
  END IF;
  IF p_otp_email_lookup IS NOT NULL AND
      p_otp_email_lookup !~ '^[a-f0-9]{64}$' THEN
    RAISE EXCEPTION 'feedback_otp_lookup_invalid' USING ERRCODE='22023';
  END IF;

  IF v_user.erased_at IS NULL AND v_email IS NOT NULL THEN
    -- The protected issuer uses the OTP digest; the legacy issuer locks the
    -- normalized clear address. Both serialize with the following delete.
    IF p_otp_email_lookup IS NOT NULL THEN
      PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
        'feedback-otp-email:'||p_otp_email_lookup,461));
    END IF;
    PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
      'feedback-otp-email:'||v_email,461));
  END IF;

  DELETE FROM public.feedback_sessions s WHERE s.user_id=p_user_id;
  GET DIAGNOSTICS v_sessions = ROW_COUNT;

  IF v_user.erased_at IS NULL THEN
    DELETE FROM public.feedback_otp_codes c USING public.feedback_boards b
      WHERE c.board_id=b.id AND b.project_id=p_project_id AND (
        (p_otp_email_lookup IS NOT NULL AND c.email_lookup=p_otp_email_lookup) OR
        (v_email IS NOT NULL AND c.email=v_email) OR
        (v_user.email NOT LIKE 'mdyf3:%' AND c.email=v_user.email)
      );

    v_erased_at:=pg_catalog.clock_timestamp();
    UPDATE public.feedback_users u SET email=NULL,name=NULL,external_id=NULL,
      email_lookup=NULL,external_id_lookup=NULL,erased_at=v_erased_at,
      otp_erasure_checked_at=pg_catalog.clock_timestamp(),
      otp_erasure_lookup=p_otp_email_lookup,
      otp_erasure_until=CASE WHEN p_otp_email_lookup IS NOT NULL
        THEN v_erased_at+interval '15 minutes' ELSE NULL END
      WHERE u.id=p_user_id AND u.project_id=p_project_id;
  ELSIF v_user.otp_erasure_checked_at IS NULL THEN
    -- Earlier erasures removed the source email and its project digest, so
    -- their system digest cannot be reconstructed. Revoke all codes on this
    -- project's boards once, including a code issued during the old race.
    -- This may cancel another participant's pending 10-minute code.
    DELETE FROM public.feedback_otp_codes c USING public.feedback_boards b
      WHERE c.board_id=b.id AND b.project_id=p_project_id;
    UPDATE public.feedback_users u
      SET otp_erasure_checked_at=pg_catalog.clock_timestamp()
      WHERE u.id=p_user_id AND u.project_id=p_project_id;
  END IF;
  RETURN QUERY SELECT v_user.erased_at IS NOT NULL,v_sessions;
END;
$$;
REVOKE ALL ON FUNCTION public.erase_feedback_identity(uuid,uuid,text,text)
  FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.erase_feedback_identity(uuid,uuid,text,text)
  TO service_role;

CREATE OR REPLACE FUNCTION public.guard_erased_feedback_identity()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF OLD.erased_at IS NOT NULL AND (
    NEW.erased_at IS DISTINCT FROM OLD.erased_at OR
    NEW.email IS NOT NULL OR NEW.name IS NOT NULL OR
    NEW.external_id IS NOT NULL OR NEW.email_lookup IS NOT NULL OR
    NEW.external_id_lookup IS NOT NULL OR
    ((NEW.otp_erasure_lookup IS DISTINCT FROM OLD.otp_erasure_lookup OR
      NEW.otp_erasure_until IS DISTINCT FROM OLD.otp_erasure_until) AND
      NOT (OLD.otp_erasure_until<=pg_catalog.clock_timestamp() AND
        NEW.otp_erasure_lookup IS NULL AND NEW.otp_erasure_until IS NULL))) THEN
    RAISE EXCEPTION 'feedback_identity_already_erased' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END;
$$;

-- Direct service writers must obey the same fence as the issuance RPC.
CREATE FUNCTION public.guard_feedback_otp_erasure()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF pg_catalog.current_setting('transaction_isolation') <> 'read committed' THEN
    RAISE EXCEPTION 'feedback_otp_write_requires_read_committed'
      USING ERRCODE='25001';
  END IF;
  IF NEW.email_lookup IS NOT NULL THEN
    PERFORM pg_catalog.pg_advisory_xact_lock(
      pg_catalog.hashtextextended('feedback-otp-email:'||NEW.email_lookup,461));
    IF EXISTS (SELECT 1 FROM public.feedback_users u
        JOIN public.feedback_boards b ON b.project_id=u.project_id
        WHERE b.id=NEW.board_id AND u.erased_at IS NOT NULL AND
          u.otp_erasure_lookup=NEW.email_lookup AND
          u.otp_erasure_until>pg_catalog.clock_timestamp()) THEN
      RAISE EXCEPTION 'feedback_otp_identity_erased' USING ERRCODE='23514';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER feedback_otp_erasure_guard
  BEFORE INSERT OR UPDATE OF board_id,email,email_lookup
  ON public.feedback_otp_codes FOR EACH ROW
  EXECUTE FUNCTION public.guard_feedback_otp_erasure();
REVOKE ALL ON FUNCTION public.guard_feedback_otp_erasure()
  FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION public.issue_feedback_otp_code_protected(
  p_id uuid,p_board_id uuid,p_email_plain text,p_email_cipher text,
  p_email_lookup text,p_ip_hash text,p_code_hash text,
  p_expires_at timestamptz,p_now timestamptz,p_window_seconds integer,
  p_cooldown_seconds integer,p_email_limit integer,p_ip_limit integer
) RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_email text := pg_catalog.lower(pg_catalog.btrim(p_email_plain));
BEGIN
  IF v_email='' OR p_email_cipher !~ '^mdyf3:[1-9][0-9]*:[A-Za-z0-9_-]+$' OR
      p_email_lookup !~ '^[a-f0-9]{64}$' OR p_ip_hash='' OR
      p_window_seconds<=0 OR p_cooldown_seconds<0 OR
      p_email_limit<=0 OR p_ip_limit<=0 OR
      p_expires_at<=pg_catalog.clock_timestamp() OR
      p_expires_at>p_now+interval '10 minutes' THEN
    RAISE EXCEPTION 'feedback_otp_arguments_invalid' USING ERRCODE='22023';
  END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('feedback-otp-email:'||p_email_lookup,461));
  IF EXISTS (SELECT 1 FROM public.feedback_users u
      JOIN public.feedback_boards b ON b.project_id=u.project_id
      WHERE b.id=p_board_id AND u.erased_at IS NOT NULL AND
        u.otp_erasure_lookup=p_email_lookup AND
        u.otp_erasure_until>pg_catalog.clock_timestamp()) THEN
    RETURN 'suppressed';
  END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('feedback-otp-ip:'||p_ip_hash,461));
  IF EXISTS (SELECT 1 FROM public.feedback_otp_codes c
      WHERE c.board_id=p_board_id AND
        (c.email_lookup=p_email_lookup OR c.email=v_email) AND
        c.created_at>p_now-pg_catalog.make_interval(secs=>p_cooldown_seconds))
  THEN RETURN 'cooldown'; END IF;
  IF (SELECT count(*) FROM public.feedback_otp_codes c
      WHERE (c.email_lookup=p_email_lookup OR c.email=v_email) AND
        c.created_at>=p_now-pg_catalog.make_interval(secs=>p_window_seconds))
      >=p_email_limit OR
     (SELECT count(*) FROM public.feedback_otp_codes c
      WHERE c.ip_hash=p_ip_hash AND
        c.created_at>=p_now-pg_catalog.make_interval(secs=>p_window_seconds))
      >=p_ip_limit THEN RETURN 'rate_limited'; END IF;
  INSERT INTO public.feedback_otp_codes(id,board_id,email,email_lookup,
    ip_hash,code_hash,expires_at,created_at)
    VALUES(p_id,p_board_id,p_email_cipher,p_email_lookup,p_ip_hash,
      p_code_hash,p_expires_at,p_now);
  RETURN 'issued';
END;
$$;

COMMIT;
