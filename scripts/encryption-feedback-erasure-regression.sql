\set ON_ERROR_STOP on
BEGIN;
DO $$ BEGIN
  IF current_database() NOT LIKE 'minddy_min591_%' THEN
    RAISE EXCEPTION 'Use an isolated minddy_min591_* database';
  END IF;
END $$;

CREATE FUNCTION pg_temp.reject_feedback_session_delete()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'fixture_session_delete_failed';
END;
$$;
CREATE FUNCTION pg_temp.reject_feedback_otp_delete()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'fixture_otp_delete_failed';
END;
$$;

DO $test$
DECLARE actor uuid := gen_random_uuid(); project uuid := gen_random_uuid();
  board uuid := gen_random_uuid(); visitor uuid := gen_random_uuid();
  session_id uuid := gen_random_uuid(); otp uuid := gen_random_uuid();
  cipher text := 'mdyf3:1:eyJmb3JtYXQiOjMsImtleVZlcnNpb24iOjF9';
  lookup text := repeat('a',64); result record; rejected boolean;
BEGIN
  INSERT INTO auth.users(id) VALUES(actor);
  INSERT INTO public.projects(id,owner_id,name,key)
    VALUES(project,actor,'Erasure fixture','ERASE');
  INSERT INTO public.feedback_boards(id,project_id,token)
    VALUES(board,project,'erasure-fixture-token');
  INSERT INTO public.feedback_users(id,project_id,email,email_lookup,
    pseudonym,verified_via) VALUES(visitor,project,cipher,lookup,
    'Quiet Bird','email');
  INSERT INTO public.feedback_sessions(id,token_hash,board_id,user_id,expires_at)
    VALUES(session_id,'erasure-fixture-token-hash',board,visitor,
      now()+interval '1 day');
  INSERT INTO public.feedback_otp_codes(id,board_id,email,email_lookup,
    code_hash,expires_at) VALUES(otp,board,cipher,lookup,'fixture-code',
      now()+interval '10 minutes');

  rejected := false;
  BEGIN
    PERFORM * FROM public.erase_feedback_identity(gen_random_uuid(),visitor,
      'private@example.test');
  EXCEPTION WHEN no_data_found THEN rejected := true; END;
  IF NOT rejected OR NOT EXISTS (
      SELECT 1 FROM public.feedback_sessions WHERE id=session_id) THEN
    RAISE EXCEPTION 'Cross-project erasure was accepted';
  END IF;
  IF has_function_privilege('authenticated',
      'public.erase_feedback_identity(uuid,uuid,text)','EXECUTE') THEN
    RAISE EXCEPTION 'Erasure RPC has client privilege';
  END IF;

  CREATE TRIGGER erasure_fixture_delete_failure
    BEFORE DELETE ON public.feedback_sessions FOR EACH ROW
    EXECUTE FUNCTION pg_temp.reject_feedback_session_delete();
  rejected := false;
  BEGIN
    PERFORM * FROM public.erase_feedback_identity(project,visitor,
      'private@example.test');
  EXCEPTION WHEN OTHERS THEN rejected := true; END;
  IF NOT rejected OR NOT EXISTS (
      SELECT 1 FROM public.feedback_sessions WHERE id=session_id) OR
      NOT EXISTS (SELECT 1 FROM public.feedback_users
        WHERE id=visitor AND erased_at IS NULL) THEN
    RAISE EXCEPTION 'Session deletion failure did not roll back erasure';
  END IF;
  DROP TRIGGER erasure_fixture_delete_failure ON public.feedback_sessions;

  CREATE TRIGGER erasure_fixture_otp_failure
    BEFORE DELETE ON public.feedback_otp_codes FOR EACH ROW
    EXECUTE FUNCTION pg_temp.reject_feedback_otp_delete();
  rejected := false;
  BEGIN
    PERFORM * FROM public.erase_feedback_identity(project,visitor,
      'private@example.test');
  EXCEPTION WHEN OTHERS THEN rejected := true; END;
  IF NOT rejected OR NOT EXISTS (
      SELECT 1 FROM public.feedback_sessions WHERE id=session_id) OR
      NOT EXISTS (SELECT 1 FROM public.feedback_users
        WHERE id=visitor AND erased_at IS NULL) THEN
    RAISE EXCEPTION 'OTP deletion failure did not roll back erasure';
  END IF;
  DROP TRIGGER erasure_fixture_otp_failure ON public.feedback_otp_codes;

  SELECT * INTO result FROM public.erase_feedback_identity(project,visitor,
    'private@example.test');
  IF result.already_erased OR result.sessions_revoked<>1 OR EXISTS (
      SELECT 1 FROM public.feedback_sessions WHERE user_id=visitor) OR
      EXISTS (SELECT 1 FROM public.feedback_otp_codes WHERE id=otp) OR
      NOT EXISTS (SELECT 1 FROM public.feedback_users WHERE id=visitor
        AND erased_at IS NOT NULL AND email IS NULL AND email_lookup IS NULL)
      THEN RAISE EXCEPTION 'Atomic erasure left private data'; END IF;

  SELECT * INTO result FROM public.erase_feedback_identity(project,visitor,NULL);
  IF NOT result.already_erased OR result.sessions_revoked<>0 THEN
    RAISE EXCEPTION 'Erasure retry failed';
  END IF;
  rejected := false;
  BEGIN
    INSERT INTO public.feedback_sessions(token_hash,board_id,user_id,expires_at)
      VALUES('erasure-fixture-late-session',board,visitor,now()+interval '1 day');
  EXCEPTION WHEN check_violation THEN rejected := true; END;
  IF NOT rejected THEN RAISE EXCEPTION 'Erased identity accepted a session'; END IF;
  rejected := false;
  BEGIN
    UPDATE public.feedback_users SET email=cipher,email_lookup=lookup
      WHERE id=visitor;
  EXCEPTION WHEN check_violation THEN rejected := true; END;
  IF NOT rejected THEN RAISE EXCEPTION 'Erased identity was resurrected'; END IF;
END;
$test$;
ROLLBACK;
