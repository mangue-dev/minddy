\set ON_ERROR_STOP on
BEGIN;
DO $$ BEGIN
  IF current_database() NOT LIKE 'minddy_min591_%' THEN
    RAISE EXCEPTION 'Use an isolated minddy_min591_* database';
  END IF;
END $$;
DO $test$
DECLARE actor uuid := gen_random_uuid(); project uuid := gen_random_uuid();
  board uuid := gen_random_uuid();
  cipher text := 'mdyb3:1:eyJmb3JtYXQiOjMsImtleVZlcnNpb24iOjF9';
  newer text := 'mdyb3:2:eyJmb3JtYXQiOjN9';
  rejected boolean := false;
BEGIN
  INSERT INTO auth.users(id) VALUES(actor);
  INSERT INTO public.projects(id,owner_id,name,key)
    VALUES(project,actor,'SSO fixture','FSSO');
  INSERT INTO public.feedback_boards(id,project_id,token,sso_secret)
    VALUES(board,project,'fixture-token','fbsso_legacy_secret');
  IF NOT public.migrate_feedback_sso_secret(board,'fbsso_legacy_secret',
      cipher) OR public.migrate_feedback_sso_secret(board,
      'fbsso_legacy_secret',cipher) THEN
    RAISE EXCEPTION 'Feedback SSO CAS failed';
  END IF;
  IF EXISTS (SELECT 1 FROM public.feedback_boards WHERE id=board AND
      sso_secret LIKE '%legacy_secret%') THEN
    RAISE EXCEPTION 'Feedback SSO remains clear';
  END IF;
  IF public.write_feedback_sso_secret_protected(project,board,newer,true)
      IS DISTINCT FROM cipher THEN
    RAISE EXCEPTION 'Protected initialization lost existing secret';
  END IF;
  IF public.write_feedback_sso_secret_protected(project,board,newer,false)
      IS DISTINCT FROM newer THEN
    RAISE EXCEPTION 'Protected rotation failed';
  END IF;
  BEGIN
    PERFORM public.write_feedback_sso_secret(project,'fbsso_old_writer',false);
  EXCEPTION WHEN check_violation THEN rejected := true; END;
  IF NOT rejected THEN RAISE EXCEPTION 'Old SSO writer accepted'; END IF;
  IF has_function_privilege('authenticated',
      'public.migrate_feedback_sso_secret(uuid,text,text)','EXECUTE') THEN
    RAISE EXCEPTION 'Feedback SSO migration has client privilege';
  END IF;
END;
$test$;
ROLLBACK;
