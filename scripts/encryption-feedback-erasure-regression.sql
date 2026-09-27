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
  late_otp uuid := gen_random_uuid(); fresh_otp uuid := gen_random_uuid();
  fresh_now timestamptz; other_project uuid := gen_random_uuid();
  other_board uuid := gen_random_uuid(); other_otp uuid := gen_random_uuid();
  cipher text := 'mdyf3:1:eyJmb3JtYXQiOjMsImtleVZlcnNpb24iOjF9';
  lookup text := repeat('a',64); otp_lookup text := repeat('b',64);
  result record; rejected boolean; other_issue_result text; fresh_issue_result text;
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
    code_hash,expires_at) VALUES(otp,board,cipher,otp_lookup,'fixture-code',
      now()+interval '10 minutes');

  rejected := false;
  BEGIN
    PERFORM * FROM public.erase_feedback_identity(gen_random_uuid(),visitor,
      'private@example.test',otp_lookup);
  EXCEPTION WHEN no_data_found THEN rejected := true; END;
  IF NOT rejected OR NOT EXISTS (
      SELECT 1 FROM public.feedback_sessions WHERE id=session_id) THEN
    RAISE EXCEPTION 'Cross-project erasure was accepted';
  END IF;
  IF has_function_privilege('authenticated',
      'public.erase_feedback_identity(uuid,uuid,text,text)','EXECUTE') THEN
    RAISE EXCEPTION 'Erasure RPC has client privilege';
  END IF;

  CREATE TRIGGER erasure_fixture_delete_failure
    BEFORE DELETE ON public.feedback_sessions FOR EACH ROW
    EXECUTE FUNCTION pg_temp.reject_feedback_session_delete();
  rejected := false;
  BEGIN
    PERFORM * FROM public.erase_feedback_identity(project,visitor,
      'private@example.test',otp_lookup);
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
      'private@example.test',otp_lookup);
  EXCEPTION WHEN OTHERS THEN rejected := true; END;
  IF NOT rejected OR NOT EXISTS (
      SELECT 1 FROM public.feedback_sessions WHERE id=session_id) OR
      NOT EXISTS (SELECT 1 FROM public.feedback_users
        WHERE id=visitor AND erased_at IS NULL) THEN
    RAISE EXCEPTION 'OTP deletion failure did not roll back erasure';
  END IF;
  DROP TRIGGER erasure_fixture_otp_failure ON public.feedback_otp_codes;

  SELECT * INTO result FROM public.erase_feedback_identity(project,visitor,
    'private@example.test',otp_lookup);
  IF result.already_erased OR result.sessions_revoked<>1 OR EXISTS (
      SELECT 1 FROM public.feedback_sessions WHERE user_id=visitor) OR
      EXISTS (SELECT 1 FROM public.feedback_otp_codes WHERE id=otp) OR
      NOT EXISTS (SELECT 1 FROM public.feedback_users WHERE id=visitor
        AND erased_at IS NOT NULL AND email IS NULL AND email_lookup IS NULL)
      THEN RAISE EXCEPTION 'Atomic erasure left private data'; END IF;

  SELECT * INTO result FROM public.erase_feedback_identity(project,visitor,NULL,NULL);
  IF NOT result.already_erased OR result.sessions_revoked<>0 THEN
    RAISE EXCEPTION 'Erasure retry failed';
  END IF;
  IF (SELECT public.issue_feedback_otp_code_protected(late_otp,board,
      'private@example.test',cipher,otp_lookup,'fixture-ip','fixture-code',
      now()+interval '10 minutes',now(),3600,60,5,15)) <> 'suppressed' OR
      EXISTS (SELECT 1 FROM public.feedback_otp_codes WHERE id=late_otp) THEN
    RAISE EXCEPTION 'Erased identity accepted a new OTP';
  END IF;
  fresh_now := pg_catalog.clock_timestamp();
  fresh_issue_result := public.issue_feedback_otp_code_protected(fresh_otp,board,
      'private@example.test',cipher,otp_lookup,'fresh-ip','fresh-code',
      fresh_now+interval '10 minutes',fresh_now,3600,60,5,15);
  IF fresh_issue_result <> 'suppressed' OR
      EXISTS (SELECT 1 FROM public.feedback_otp_codes WHERE id=fresh_otp) THEN
    RAISE EXCEPTION 'Erasure grace period accepted a new OTP: %',
      fresh_issue_result;
  END IF;
  rejected := false;
  BEGIN
    UPDATE public.feedback_users SET otp_erasure_lookup=NULL,
      otp_erasure_until=NULL WHERE id=visitor;
  EXCEPTION WHEN check_violation THEN rejected := true; END;
  IF NOT rejected THEN RAISE EXCEPTION 'Premature OTP digest cleanup accepted'; END IF;
  rejected := false;
  BEGIN
    INSERT INTO public.feedback_otp_codes(id,board_id,email,email_lookup,
      code_hash,expires_at) VALUES(late_otp,board,cipher,otp_lookup,
        'fixture-code',now()+interval '10 minutes');
  EXCEPTION WHEN check_violation THEN rejected := true; END;
  IF NOT rejected THEN RAISE EXCEPTION 'Direct OTP writer bypassed erasure'; END IF;
  INSERT INTO public.projects(id,owner_id,name,key)
    VALUES(other_project,actor,'Other erasure fixture','OTHER');
  INSERT INTO public.feedback_boards(id,project_id,token)
    VALUES(other_board,other_project,'other-erasure-fixture-token');
  other_issue_result := public.issue_feedback_otp_code_protected(other_otp,other_board,
      'private@example.test',cipher,otp_lookup,'other-ip','other-code',
      now()+interval '10 minutes',now(),3600,60,5,15);
  IF other_issue_result <> 'issued' OR
      NOT EXISTS (SELECT 1 FROM public.feedback_otp_codes WHERE id=other_otp) THEN
    RAISE EXCEPTION 'Project-scoped erasure suppressed a different project: %',
      other_issue_result;
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

DO $test$
DECLARE actor uuid := gen_random_uuid(); project uuid := gen_random_uuid();
  board uuid := gen_random_uuid(); visitor uuid := gen_random_uuid();
  historical_otp uuid := gen_random_uuid(); racing_otp uuid := gen_random_uuid();
  unrelated_otp uuid := gen_random_uuid();
  expired_visitor uuid := gen_random_uuid(); expired_otp uuid := gen_random_uuid();
  expired_issue_result text;
  cipher text := 'mdyf3:1:eyJmb3JtYXQiOjMsImtleVZlcnNpb24iOjF9';
  otp_lookup text := repeat('c',64);
BEGIN
  INSERT INTO auth.users(id) VALUES(actor);
  INSERT INTO public.projects(id,owner_id,name,key)
    VALUES(project,actor,'Historical erasure fixture','ERASE2');
  INSERT INTO public.feedback_boards(id,project_id,token)
    VALUES(board,project,'historical-erasure-token');
  INSERT INTO public.feedback_users(id,project_id,pseudonym,verified_via,
    erased_at) VALUES(visitor,project,'Quiet Bird','email',now());
  INSERT INTO public.feedback_otp_codes(id,board_id,email,email_lookup,
    code_hash,expires_at,created_at) VALUES(historical_otp,board,cipher,
      otp_lookup,'fixture-code',now()+interval '10 minutes',now()-interval '1 minute');
  INSERT INTO public.feedback_otp_codes(id,board_id,email,email_lookup,
    code_hash,expires_at,created_at) VALUES(racing_otp,board,cipher,
      otp_lookup,'racing-code',now()+interval '10 minutes',now()+interval '1 second');
  PERFORM * FROM public.erase_feedback_identity(project,visitor,NULL,NULL);
  IF EXISTS (SELECT 1 FROM public.feedback_otp_codes
      WHERE id IN (historical_otp,racing_otp)) OR
      NOT EXISTS (SELECT 1 FROM public.feedback_users
        WHERE id=visitor AND otp_erasure_checked_at IS NOT NULL) THEN
    RAISE EXCEPTION 'Historical erased identity retained a pending OTP';
  END IF;
  INSERT INTO public.feedback_otp_codes(id,board_id,email,email_lookup,
    code_hash,expires_at,created_at) VALUES(unrelated_otp,board,cipher,
      repeat('e',64),'unrelated-code',now()+interval '10 minutes',
      pg_catalog.clock_timestamp());
  PERFORM * FROM public.erase_feedback_identity(project,visitor,NULL,NULL);
  IF NOT EXISTS (SELECT 1 FROM public.feedback_otp_codes WHERE id=unrelated_otp) THEN
    RAISE EXCEPTION 'Historical retry repeated project-wide OTP cleanup';
  END IF;
  INSERT INTO public.feedback_users(id,project_id,pseudonym,verified_via,
    erased_at,otp_erasure_checked_at,otp_erasure_lookup,otp_erasure_until)
    VALUES(expired_visitor,project,'Quiet Owl','email',
      now()-interval '20 minutes',now()-interval '20 minutes',
      repeat('d',64),now()-interval '5 minutes');
  expired_issue_result := public.issue_feedback_otp_code_protected(expired_otp,board,
      'new@example.test',cipher,repeat('d',64),'new-ip','new-code',
      now()+interval '10 minutes',now(),3600,60,5,15);
  IF expired_issue_result <> 'issued' OR
      NOT EXISTS (SELECT 1 FROM public.feedback_otp_codes WHERE id=expired_otp) THEN
    RAISE EXCEPTION 'Expired erasure window blocked re-registration: %',
      expired_issue_result;
  END IF;
  UPDATE public.feedback_users SET otp_erasure_lookup=NULL,
    otp_erasure_until=NULL WHERE id=expired_visitor;
  IF NOT EXISTS (SELECT 1 FROM public.feedback_users
      WHERE id=expired_visitor AND otp_erasure_lookup IS NULL AND
        otp_erasure_until IS NULL) THEN
    RAISE EXCEPTION 'Expired OTP digest cleanup failed';
  END IF;
END;
$test$;
ROLLBACK;
