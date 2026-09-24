\set ON_ERROR_STOP on
BEGIN;
DO $$ BEGIN
  IF current_database() NOT LIKE 'minddy_min591_%' THEN
    RAISE EXCEPTION 'Use an isolated minddy_min591_* database';
  END IF;
END $$;
DO $test$
DECLARE actor uuid := gen_random_uuid(); project uuid := gen_random_uuid();
  board uuid := gen_random_uuid(); visitor uuid := gen_random_uuid();
  otp uuid := gen_random_uuid(); v_email text := 'private@example.test';
  cipher text := 'mdyf3:1:eyJmb3JtYXQiOjMsImtleVZlcnNpb24iOjF9';
  email_lookup text := repeat('a',64); external_lookup text := repeat('b',64);
  rejected boolean;
BEGIN
  INSERT INTO auth.users(id) VALUES(actor);
  INSERT INTO public.projects(id,owner_id,name,key)
    VALUES(project,actor,'Feedback fixture','FBID');
  INSERT INTO public.feedback_boards(id,project_id,token)
    VALUES(board,project,'fixture-token');
  INSERT INTO public.feedback_users(id,project_id,email,name,external_id,
    pseudonym,verified_via) VALUES(visitor,project,v_email,'Private Visitor',
      'visitor-external','Quiet Bird','email');
  INSERT INTO public.feedback_otp_codes(id,board_id,email,code_hash,
    expires_at) VALUES(otp,board,v_email,'fixture-code',now()+interval '10 minutes');
  IF NOT public.migrate_feedback_user_identity(visitor,v_email,
      'Private Visitor','visitor-external',cipher,cipher,cipher,
      email_lookup,external_lookup) OR
     public.migrate_feedback_user_identity(visitor,v_email,
      'Private Visitor','visitor-external',cipher,cipher,cipher,
      email_lookup,external_lookup) THEN
    RAISE EXCEPTION 'Feedback user CAS failed';
  END IF;
  IF NOT public.migrate_feedback_otp_email(otp,v_email,cipher,email_lookup) OR
     public.migrate_feedback_otp_email(otp,v_email,cipher,email_lookup) THEN
    RAISE EXCEPTION 'Feedback OTP CAS failed';
  END IF;
  IF EXISTS (SELECT 1 FROM public.feedback_users u WHERE u.id=visitor AND
      (u.email=v_email OR u.name='Private Visitor' OR
       u.external_id='visitor-external')) OR
     EXISTS (SELECT 1 FROM public.feedback_otp_codes c
       WHERE c.id=otp AND c.email=v_email) THEN
    RAISE EXCEPTION 'Private feedback identity remains clear';
  END IF;
  rejected := false;
  BEGIN
    INSERT INTO public.feedback_users(project_id,email,pseudonym,verified_via)
      VALUES(project,'obsolete@example.test','Old Writer','email');
  EXCEPTION WHEN check_violation THEN rejected := true; END;
  IF NOT rejected THEN RAISE EXCEPTION 'Old feedback user writer accepted'; END IF;
  rejected := false;
  BEGIN
    PERFORM public.issue_feedback_otp_code(gen_random_uuid(),board,
      'obsolete@example.test','fixture-ip','fixture-code',
      now()+interval '10 minutes',now(),3600,60,5,15);
  EXCEPTION WHEN check_violation THEN rejected := true; END;
  IF NOT rejected THEN RAISE EXCEPTION 'Old OTP writer accepted'; END IF;
  IF public.issue_feedback_otp_code_protected(gen_random_uuid(),board,
      'new@example.test',cipher,repeat('c',64),'fixture-ip','fixture-code',
      now()+interval '10 minutes',now(),3600,60,5,15) <> 'issued' THEN
    RAISE EXCEPTION 'Protected OTP writer failed';
  END IF;
  IF (SELECT status FROM public.claim_feedback_otp_attempt_protected(
      board,v_email,email_lookup,now(),5)) <> 'claimed' THEN
    RAISE EXCEPTION 'Protected OTP lookup failed';
  END IF;
  IF has_function_privilege('authenticated',
      'public.migrate_feedback_user_identity(uuid,text,text,text,text,text,text,text,text)',
      'EXECUTE') THEN
    RAISE EXCEPTION 'Feedback identity migration has client privilege';
  END IF;
END;
$test$;
ROLLBACK;
