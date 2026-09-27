BEGIN;

-- Serialize session creation with erasure on the identity row. A transaction
-- waiting here observes the committed erasure before it can insert a session.
CREATE FUNCTION public.guard_feedback_session_identity()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_erased_at timestamptz;
BEGIN
  SELECT u.erased_at INTO v_erased_at
    FROM public.feedback_users u WHERE u.id=NEW.user_id FOR SHARE;
  IF NOT FOUND OR v_erased_at IS NOT NULL OR NOT EXISTS (
      SELECT 1 FROM public.feedback_boards b
        JOIN public.feedback_users u ON u.project_id=b.project_id
       WHERE b.id=NEW.board_id AND u.id=NEW.user_id) THEN
    RAISE EXCEPTION 'feedback_session_identity_unavailable'
      USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER feedback_session_identity_guard
  BEFORE INSERT OR UPDATE OF user_id,board_id ON public.feedback_sessions
  FOR EACH ROW EXECUTE FUNCTION public.guard_feedback_session_identity();
REVOKE ALL ON FUNCTION public.guard_feedback_session_identity()
  FROM PUBLIC,anon,authenticated;

-- Delete sessions, pending codes and private identity in one transaction.
-- The row lock orders this operation with the session insert trigger.
CREATE FUNCTION public.erase_feedback_identity(
  p_project_id uuid,p_user_id uuid,p_email_plain text
) RETURNS TABLE(already_erased boolean,sessions_revoked integer)
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_user public.feedback_users%ROWTYPE;
  v_sessions integer;
BEGIN
  SELECT * INTO v_user FROM public.feedback_users u
    WHERE u.id=p_user_id AND u.project_id=p_project_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'feedback_identity_not_found' USING ERRCODE='P0002';
  END IF;

  DELETE FROM public.feedback_sessions s WHERE s.user_id=p_user_id;
  GET DIAGNOSTICS v_sessions = ROW_COUNT;

  IF v_user.erased_at IS NULL THEN
    DELETE FROM public.feedback_otp_codes c USING public.feedback_boards b
      WHERE c.board_id=b.id AND b.project_id=p_project_id AND (
        (v_user.email_lookup IS NOT NULL AND
          c.email_lookup=v_user.email_lookup) OR
        (p_email_plain IS NOT NULL AND c.email=lower(trim(p_email_plain))) OR
        (v_user.email NOT LIKE 'mdyf3:%' AND c.email=v_user.email)
      );

    UPDATE public.feedback_users u SET email=NULL,name=NULL,external_id=NULL,
      email_lookup=NULL,external_id_lookup=NULL,erased_at=pg_catalog.clock_timestamp()
      WHERE u.id=p_user_id AND u.project_id=p_project_id;
  END IF;
  RETURN QUERY SELECT v_user.erased_at IS NOT NULL,v_sessions;
END;
$$;
REVOKE ALL ON FUNCTION public.erase_feedback_identity(uuid,uuid,text)
  FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.erase_feedback_identity(uuid,uuid,text)
  TO service_role;

-- A stale writer must not put identity data back after erasure.
CREATE FUNCTION public.guard_erased_feedback_identity()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF OLD.erased_at IS NOT NULL AND (
    NEW.erased_at IS DISTINCT FROM OLD.erased_at OR
    NEW.email IS NOT NULL OR NEW.name IS NOT NULL OR
    NEW.external_id IS NOT NULL OR NEW.email_lookup IS NOT NULL OR
    NEW.external_id_lookup IS NOT NULL) THEN
    RAISE EXCEPTION 'feedback_identity_already_erased' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER feedback_users_erased_guard
  BEFORE UPDATE ON public.feedback_users FOR EACH ROW
  EXECUTE FUNCTION public.guard_erased_feedback_identity();
REVOKE ALL ON FUNCTION public.guard_erased_feedback_identity()
  FROM PUBLIC,anon,authenticated;

COMMIT;
