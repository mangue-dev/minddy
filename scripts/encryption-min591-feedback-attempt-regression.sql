\set ON_ERROR_STOP on
BEGIN;
DO $$ BEGIN
  IF current_database() NOT LIKE 'minddy_min591_%' THEN
    RAISE EXCEPTION 'Use an isolated minddy_min591_* database';
  END IF;
END $$;
DO $test$
DECLARE actor uuid:=gen_random_uuid(); project uuid:=gen_random_uuid();
  bad_project uuid:=gen_random_uuid(); good_project uuid:=gen_random_uuid();
  board uuid:=gen_random_uuid(); bad_user uuid:=gen_random_uuid();
  good_user uuid:=gen_random_uuid(); bad_otp uuid:=gen_random_uuid();
  good_otp uuid:=gen_random_uuid(); bad_board uuid:=gen_random_uuid();
  good_board uuid:=gen_random_uuid(); bad_merge uuid:=gen_random_uuid();
  good_merge uuid:=gen_random_uuid(); marked boolean;
BEGIN
  INSERT INTO auth.users(id) VALUES(actor);
  INSERT INTO public.projects(id,owner_id,name,key)
    VALUES(project,actor,'Feedback queue regression','FQR'),
      (bad_project,actor,'Bad SSO queue regression','FBQ'),
      (good_project,actor,'Good SSO queue regression','FGQ');
  INSERT INTO public.feedback_boards(id,project_id,token,sso_secret)
    VALUES(board,project,'queue-root',NULL),
      (good_board,good_project,'queue-good','sso_legacy_secret');
  INSERT INTO public.feedback_users(id,project_id,email,pseudonym,verified_via)
    VALUES(good_user,project,'good@example.test','Good','email');
  INSERT INTO public.feedback_otp_codes(id,board_id,email,code_hash,expires_at)
    VALUES(good_otp,board,'good@example.test','good-code',now()+interval '5 minutes');
  INSERT INTO public.feedback_boards(id,project_id,token,sso_secret)
    VALUES(bad_board,bad_project,'queue-bad','mdyb3:1:QQ');
  INSERT INTO public.feedback_users(id,project_id,email,email_lookup,pseudonym,verified_via)
    VALUES(bad_user,project,'mdyf3:1:QQ',repeat('a',64),'Bad','email');
  INSERT INTO public.feedback_otp_codes(id,board_id,email,email_lookup,code_hash,expires_at)
    VALUES(bad_otp,board,'mdyf3:1:QQ',repeat('b',64),'bad-code',
      now()+interval '5 minutes');
  IF NOT public.mark_feedback_identity_attempt('user',bad_user,'mdyf3:1:QQ') OR
      NOT public.mark_feedback_identity_attempt('otp',bad_otp,'mdyf3:1:QQ') OR
      NOT public.mark_feedback_sso_attempt(bad_board,'mdyb3:1:QQ') THEN
    RAISE EXCEPTION 'Feedback failed attempts were not recorded';
  END IF;
  IF (SELECT content_encryption_checked_at FROM public.feedback_users
      WHERE id=bad_user) IS NOT NULL OR
     (SELECT content_encryption_checked_at FROM public.feedback_otp_codes
      WHERE id=bad_otp) IS NOT NULL OR
     (SELECT sso_encryption_checked_at FROM public.feedback_boards
      WHERE id=bad_board) IS NOT NULL THEN
    RAISE EXCEPTION 'Failed feedback rows were falsely verified';
  END IF;
  IF (SELECT id FROM public.feedback_users
      WHERE id IN (bad_user,good_user)
      ORDER BY content_encryption_attempted_at NULLS FIRST,id LIMIT 1)
        IS DISTINCT FROM good_user OR
     (SELECT id FROM public.feedback_otp_codes
      WHERE id IN (bad_otp,good_otp)
      ORDER BY content_encryption_attempted_at NULLS FIRST,id LIMIT 1)
        IS DISTINCT FROM good_otp OR
     (SELECT id FROM public.feedback_boards
      WHERE id IN (bad_board,good_board)
      ORDER BY sso_encryption_attempted_at NULLS FIRST,id LIMIT 1)
        IS DISTINCT FROM good_board THEN
    RAISE EXCEPTION 'Failed feedback rows still block the next page';
  END IF;
  IF public.mark_feedback_identity_attempt('user',bad_user,'stale@example.test') OR
      public.mark_feedback_identity_attempt('otp',bad_otp,'stale@example.test') OR
      public.mark_feedback_sso_attempt(bad_board,'stale-secret') THEN
    RAISE EXCEPTION 'Feedback attempt marker lost CAS';
  END IF;
  ALTER TABLE public.feedback_merge_events DISABLE TRIGGER feedback_merge_payload_guard;
  INSERT INTO public.feedback_merge_events(id,project_id,kind,dup_id,
    canonical_id,performed_by,payload)
    VALUES(bad_merge,project,'post',gen_random_uuid(),gen_random_uuid(),
      'team','{"moved_vote_user_ids":"malformed"}'::jsonb),
      (good_merge,project,'post',gen_random_uuid(),gen_random_uuid(),
        'team','{"moved_vote_user_ids":[]}'::jsonb);
  ALTER TABLE public.feedback_merge_events ENABLE TRIGGER feedback_merge_payload_guard;
  marked:=public.mark_feedback_merge_payload_attempt(bad_merge,
    '{"moved_vote_user_ids":"malformed"}'::jsonb);
  IF NOT marked OR
      (SELECT payload_checked_at FROM public.feedback_merge_events
        WHERE id=bad_merge) IS NOT NULL OR
      (SELECT id FROM public.feedback_merge_events
        WHERE id IN (bad_merge,good_merge)
        ORDER BY payload_attempted_at NULLS FIRST,id LIMIT 1)
          IS DISTINCT FROM good_merge OR
      NOT public.mark_feedback_merge_payload_attempt(bad_merge,
        '{}'::jsonb,true) THEN
    RAISE EXCEPTION 'Feedback merge failure or conflict blocks later rows';
  END IF;
END;
$test$;
ROLLBACK;
