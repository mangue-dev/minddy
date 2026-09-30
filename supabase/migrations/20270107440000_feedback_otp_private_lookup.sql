BEGIN;

-- New names let the old application continue using the original RPC until
-- protected writes are activated. The trigger then rejects its clear inserts.
CREATE FUNCTION public.issue_feedback_otp_code_protected(
  p_id uuid,p_board_id uuid,p_email_plain text,p_email_cipher text,
  p_email_lookup text,p_ip_hash text,p_code_hash text,
  p_expires_at timestamptz,p_now timestamptz,p_window_seconds integer,
  p_cooldown_seconds integer,p_email_limit integer,p_ip_limit integer
) RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_email text := lower(trim(p_email_plain));
BEGIN
  IF v_email='' OR p_email_cipher !~ '^mdyf3:[1-9][0-9]*:[A-Za-z0-9_-]+$' OR
      p_email_lookup !~ '^[a-f0-9]{64}$' OR p_ip_hash='' OR
      p_window_seconds<=0 OR p_cooldown_seconds<0 OR
      p_email_limit<=0 OR p_ip_limit<=0 THEN
    RAISE EXCEPTION 'feedback_otp_arguments_invalid' USING ERRCODE='22023';
  END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('feedback-otp-email:'||p_email_lookup,461));
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
REVOKE ALL ON FUNCTION public.issue_feedback_otp_code_protected(
  uuid,uuid,text,text,text,text,text,timestamptz,timestamptz,
  integer,integer,integer,integer) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.issue_feedback_otp_code_protected(
  uuid,uuid,text,text,text,text,text,timestamptz,timestamptz,
  integer,integer,integer,integer) TO service_role;

CREATE FUNCTION public.claim_feedback_otp_attempt_protected(
  p_board_id uuid,p_email_plain text,p_email_lookup text,
  p_now timestamptz,p_max_attempts integer
) RETURNS TABLE(status text,id uuid,code_hash text)
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_code public.feedback_otp_codes%ROWTYPE;
BEGIN
  IF p_max_attempts<=0 OR p_email_lookup !~ '^[a-f0-9]{64}$' THEN
    RAISE EXCEPTION 'feedback_otp_arguments_invalid' USING ERRCODE='22023';
  END IF;
  SELECT * INTO v_code FROM public.feedback_otp_codes c
    WHERE c.board_id=p_board_id AND
      (c.email_lookup=p_email_lookup OR c.email=lower(trim(p_email_plain))) AND
      c.consumed_at IS NULL
    ORDER BY c.created_at DESC LIMIT 1 FOR UPDATE;
  IF NOT FOUND THEN
    RETURN QUERY SELECT 'invalid'::text,NULL::uuid,NULL::text; RETURN;
  END IF;
  IF v_code.expires_at<=p_now THEN
    RETURN QUERY SELECT 'expired'::text,v_code.id,NULL::text; RETURN;
  END IF;
  IF v_code.attempts>=p_max_attempts THEN
    RETURN QUERY SELECT 'too_many_attempts'::text,v_code.id,NULL::text; RETURN;
  END IF;
  UPDATE public.feedback_otp_codes c SET attempts=c.attempts+1
    WHERE c.id=v_code.id;
  RETURN QUERY SELECT 'claimed'::text,v_code.id,v_code.code_hash;
END;
$$;
REVOKE ALL ON FUNCTION public.claim_feedback_otp_attempt_protected(
  uuid,text,text,timestamptz,integer) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.claim_feedback_otp_attempt_protected(
  uuid,text,text,timestamptz,integer) TO service_role;

COMMIT;
