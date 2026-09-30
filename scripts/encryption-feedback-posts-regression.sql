-- Exercise feedback source state, stale writers, revision checks and grants in isolation.
\set ON_ERROR_STOP on
BEGIN;
DO $$ BEGIN
  IF current_database() NOT LIKE 'minddy_min591_%' THEN
    RAISE EXCEPTION 'Use an isolated minddy_min591_* database';
  END IF;
END $$;
CREATE TEMP TABLE feedback_broadcasts(payload jsonb);
CREATE OR REPLACE FUNCTION realtime.send(payload jsonb, event text, topic text, private boolean DEFAULT true)
RETURNS void LANGUAGE plpgsql AS $$ BEGIN
  INSERT INTO pg_temp.feedback_broadcasts VALUES(payload);
END $$;
DO $test$
DECLARE
  actor uuid := gen_random_uuid(); project uuid := gen_random_uuid();
  legacy uuid := gen_random_uuid(); fresh uuid := gen_random_uuid();
  cipher text := '{"format":3,"keyVersion":1,"data":"test-only-placeholder"}';
  before_time timestamptz; written jsonb;
BEGIN
  INSERT INTO auth.users(id) VALUES(actor);
  INSERT INTO public.projects(id,owner_id,name,key) VALUES(project,actor,'Private project','FBT');
  INSERT INTO public.feedback_posts(id,project_id,title,body,submitted_title,submitted_body,source)
    VALUES(legacy,project,'Private title','Private body','Private title','Private body','internal');
  IF EXISTS(SELECT 1 FROM feedback_broadcasts WHERE payload::text LIKE '%Private%') THEN
    RAISE EXCEPTION 'legacy feedback broadcast leaked content';
  END IF;
  SELECT updated_at INTO before_time FROM public.feedback_posts WHERE id=legacy;
  IF NOT public.migrate_feedback_post_ciphertext(legacy,project,0,0) THEN
    RAISE EXCEPTION 'feedback queue attempt failed';
  END IF;
  IF NOT public.migrate_feedback_post_ciphertext(legacy,project,0,0,1,cipher) THEN
    RAISE EXCEPTION 'feedback migration failed';
  END IF;
  IF public.migrate_feedback_post_ciphertext(legacy,project,0,0,1,cipher) THEN
    RAISE EXCEPTION 'stale feedback migration won';
  END IF;
  IF EXISTS(SELECT 1 FROM public.feedback_posts WHERE id=legacy AND
    (title IS NOT NULL OR body IS NOT NULL OR submitted_title IS NOT NULL OR
      submitted_body IS NOT NULL OR embedding IS NOT NULL OR encryption_revision<>1 OR
      updated_at<>before_time)) THEN
    RAISE EXCEPTION 'feedback migration retained content or changed edit metadata';
  END IF;
  BEGIN
    UPDATE public.feedback_posts SET title='Leaked' WHERE id=legacy;
    RAISE EXCEPTION 'encrypted feedback accepted plaintext edit';
  EXCEPTION WHEN check_violation THEN NULL; END;
  BEGIN
    UPDATE public.feedback_posts SET encryption_revision=0 WHERE id=legacy;
    RAISE EXCEPTION 'feedback revision rollback accepted';
  EXCEPTION WHEN check_violation THEN NULL; END;
  BEGIN
    PERFORM public.save_feedback_post_content(legacy,project,0,'{"status":"planned"}');
    RAISE EXCEPTION 'stale feedback edit won';
  EXCEPTION WHEN serialization_failure THEN NULL; END;
  written := public.save_feedback_post_content(legacy,project,1,'{"status":"planned"}');
  IF written->>'status'<>'planned' OR (written->>'encryption_revision')::bigint<>2 THEN
    RAISE EXCEPTION 'guarded feedback edit failed';
  END IF;
  IF has_table_privilege('authenticated','public.feedback_posts','INSERT') OR
     has_table_privilege('authenticated','public.feedback_posts','UPDATE') OR
     has_function_privilege('authenticated','public.save_feedback_post_content(uuid,uuid,bigint,jsonb)','EXECUTE') OR
     to_regprocedure('public.match_feedback_posts(uuid,extensions.vector,uuid,integer,boolean)') IS NOT NULL THEN
    RAISE EXCEPTION 'feedback client or similarity SQL retained plaintext path';
  END IF;
  PERFORM public.create_envelope_data_key_if_absent('project',project,'content','Zml4dHVyZQ==');
  BEGIN
    INSERT INTO public.feedback_posts(project_id,title,body,submitted_title,submitted_body,source)
      VALUES(project,'Obsolete writer','','Obsolete writer','','internal');
    RAISE EXCEPTION 'obsolete feedback writer accepted';
  EXCEPTION WHEN check_violation THEN NULL; END;
  INSERT INTO public.feedback_posts(id,project_id,title,body,submitted_title,submitted_body,
    source,encryption_version,encrypted_content)
    VALUES(fresh,project,NULL,NULL,NULL,NULL,'internal',1,cipher);
  IF EXISTS(SELECT 1 FROM public.feedback_posts WHERE id=fresh AND
    (title IS NOT NULL OR embedding IS NOT NULL)) THEN
    RAISE EXCEPTION 'encrypted feedback retained plaintext';
  END IF;
  IF EXISTS(SELECT 1 FROM feedback_broadcasts WHERE payload::text LIKE '%Private%' OR
    payload::text LIKE '%test-only-placeholder%') THEN
    RAISE EXCEPTION 'feedback broadcast leaked protected content';
  END IF;
END;
$test$;
ROLLBACK;
