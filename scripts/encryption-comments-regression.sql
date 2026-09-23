-- Rehearse comment migration, concurrency guards and realtime without production data.
\set ON_ERROR_STOP on
BEGIN;
DO $$ BEGIN
  IF current_database() NOT LIKE 'minddy_min591_%' THEN RAISE EXCEPTION 'Use an isolated minddy_min591_* database'; END IF;
END $$;
CREATE TEMP TABLE comment_broadcasts(payload jsonb);
GRANT INSERT ON comment_broadcasts TO postgres;
CREATE OR REPLACE FUNCTION realtime.broadcast_changes(
  topic_name text, event_name text, operation text, table_name text,
  table_schema text, new record, old record, level text DEFAULT 'ROW'
) RETURNS void LANGUAGE plpgsql AS $$ BEGIN
  IF table_name IN ('comments','page_comments') THEN
    INSERT INTO pg_temp.comment_broadcasts VALUES (jsonb_build_object('topic',topic_name,'new',to_jsonb(new),'old',to_jsonb(old)));
  END IF;
END $$;
DO $test$
DECLARE
  actor uuid := gen_random_uuid(); outsider uuid := gen_random_uuid();
  project uuid := gen_random_uuid(); other_project uuid := gen_random_uuid();
  issue uuid := gen_random_uuid(); page uuid := gen_random_uuid();
  comment uuid := gen_random_uuid(); page_comment uuid := gen_random_uuid();
  mirrored uuid := gen_random_uuid(); duplicate uuid := gen_random_uuid();
  stamp timestamptz := '2026-01-01T00:00:00Z'; before_count integer; affected integer;
  cipher text := '{"format":3,"keyVersion":1,"data":"test-only-placeholder"}'; result jsonb;
BEGIN
  INSERT INTO auth.users(id) VALUES(actor),(outsider);
  INSERT INTO public.projects(id,owner_id,name,key) VALUES(project,actor,'Private project','COM'),(other_project,outsider,'Other','OTH');
  INSERT INTO public.issues(id,project_id,number,title) VALUES(issue,project,1,'Private issue');
  INSERT INTO public.pages(id,project_id,title,position,created_by) VALUES(page,project,'Private page',0,actor);
  INSERT INTO public.comments(id,issue_id,author_id,body,updated_at) VALUES(comment,issue,actor,'Private body',stamp);
  INSERT INTO public.page_comments(id,page_id,project_id,author_id,body,quote,updated_at)
    VALUES(page_comment,page,project,actor,'Private page body','Private quote',stamp);
  IF NOT EXISTS(SELECT 1 FROM public.comments WHERE id=comment AND project_id=project) THEN RAISE EXCEPTION 'legacy scope missing'; END IF;
  IF (SELECT count(*) FROM comment_broadcasts) <> 2 THEN RAISE EXCEPTION 'missing invalidation'; END IF;
  IF EXISTS(SELECT 1 FROM comment_broadcasts WHERE payload::text LIKE '%Private%' OR payload::text LIKE '%body%' OR payload::text LIKE '%quote%') THEN
    RAISE EXCEPTION 'realtime retained content';
  END IF;
  BEGIN
    INSERT INTO public.comments(issue_id,project_id,author_id,body) VALUES(issue,other_project,actor,'Wrong owner');
    RAISE EXCEPTION 'cross-project comment accepted';
  EXCEPTION WHEN foreign_key_violation THEN NULL; END;
  SELECT count(*) INTO before_count FROM comment_broadcasts;
  UPDATE public.pages SET deleted_at=now() WHERE id=page;
  IF NOT public.migrate_comment_ciphertext('page_comments',page_comment,project,0,0) THEN RAISE EXCEPTION 'trashed page attempt failed'; END IF;
  IF NOT public.migrate_comment_ciphertext('page_comments',page_comment,project,0,0,1,cipher) THEN RAISE EXCEPTION 'trashed page migration failed'; END IF;
  IF NOT public.migrate_comment_ciphertext('comments',comment,project,0,0,1,cipher) THEN RAISE EXCEPTION 'migration failed'; END IF;
  IF public.migrate_comment_ciphertext('comments',comment,project,0,0,1,cipher) THEN RAISE EXCEPTION 'stale CAS won'; END IF;
  IF EXISTS(SELECT 1 FROM public.comments WHERE id=comment AND (updated_at<>stamp OR body IS NOT NULL OR encryption_revision<>1)) THEN
    RAISE EXCEPTION 'migration changed logical timestamp or retained plaintext';
  END IF;
  IF EXISTS(SELECT 1 FROM public.page_comments WHERE id=page_comment AND (updated_at<>stamp OR quote IS NOT NULL OR body IS NOT NULL)) THEN
    RAISE EXCEPTION 'page migration changed timestamp or retained plaintext';
  END IF;
  IF (SELECT count(*) FROM comment_broadcasts) <> before_count THEN RAISE EXCEPTION 'maintenance broadcast'; END IF;
  BEGIN
    UPDATE public.page_comments SET encrypted_content='{"keyVersion":1,"data":"different"}' WHERE id=page_comment;
    RAISE EXCEPTION 'normal edit on trashed page accepted';
  EXCEPTION WHEN SQLSTATE 'P0001' THEN
    IF SQLERRM <> 'page_not_live' THEN RAISE; END IF;
  END;
  BEGIN
    UPDATE public.comments SET body='Downgrade',encryption_version=0,encrypted_content=NULL WHERE id=comment;
    RAISE EXCEPTION 'downgrade accepted';
  EXCEPTION WHEN check_violation THEN NULL; END;
  BEGIN
    UPDATE public.comments SET body='Leaked' WHERE id=comment;
    RAISE EXCEPTION 'plaintext accepted';
  EXCEPTION WHEN check_violation THEN NULL; END;
  PERFORM set_config('request.jwt.claims',jsonb_build_object('role','authenticated','sub',actor)::text,true);
  UPDATE public.comments SET encrypted_content='{"keyVersion":1,"data":"edited"}' WHERE id=comment AND encryption_revision=1;
  GET DIAGNOSTICS affected=ROW_COUNT;
  IF affected<>1 THEN RAISE EXCEPTION 'author encrypted edit failed'; END IF;
  IF NOT EXISTS(SELECT 1 FROM public.comments WHERE id=comment AND encryption_revision=2 AND updated_at>stamp) THEN
    RAISE EXCEPTION 'edit did not advance revision and timestamp';
  END IF;
  BEGIN
    UPDATE public.comments SET author_id=outsider WHERE id=comment;
    RAISE EXCEPTION 'client identity mutation accepted';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  PERFORM set_config('request.jwt.claims','{"role":"service_role"}',true);
  UPDATE public.comments SET via_assistant=true WHERE id=comment;
  PERFORM set_config('request.jwt.claims',jsonb_build_object('role','authenticated','sub',actor)::text,true);
  BEGIN
    UPDATE public.comments SET encrypted_content=cipher WHERE id=comment;
    RAISE EXCEPTION 'client assistant edit accepted';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  IF has_function_privilege('authenticated','public.migrate_comment_ciphertext(text,uuid,uuid,bigint,integer,integer,text)','execute') THEN
    RAISE EXCEPTION 'client migration privilege';
  END IF;
  PERFORM set_config('request.jwt.claims','{"role":"service_role"}',true);
  BEGIN
    PERFORM public.broadcast_private_realtime('numo-comment:'||comment,'stream','{"text":"Private stream"}');
    RAISE EXCEPTION 'plaintext stream accepted';
  EXCEPTION WHEN invalid_parameter_value THEN NULL; END;
  BEGIN
    PERFORM public.broadcast_private_realtime('numo-page-comment:'||page_comment,'stream','{"text":"Private stream"}');
    RAISE EXCEPTION 'plaintext page stream accepted';
  EXCEPTION WHEN invalid_parameter_value THEN NULL; END;

  result := public.sync_github_issue_comment_atomic(issue,'remote-1',actor,NULL,'login','OWNER','https://example.test',stamp,stamp,NULL,mirrored,1,cipher);
  IF result->>'state'<>'synced' OR result->>'comment_id'<>mirrored::text THEN RAISE EXCEPTION 'forge insert failed'; END IF;
  result := public.sync_github_issue_comment_atomic(issue,'remote-1',actor,NULL,'login','OWNER','https://example.test',stamp,stamp,NULL,duplicate,1,cipher);
  IF result->>'state'<>'conflict' OR EXISTS(SELECT 1 FROM public.comments WHERE id=duplicate) THEN RAISE EXCEPTION 'duplicate identity race'; END IF;
  result := public.sync_github_issue_comment_atomic(issue,'remote-1',actor,NULL,'login','OWNER','https://example.test',stamp,stamp,NULL,mirrored,1,cipher);
  IF result->>'state'<>'synced' THEN RAISE EXCEPTION 'forge replay failed'; END IF;
  UPDATE public.comments SET encrypted_content='{"keyVersion":1,"data":"local edit"}' WHERE id=mirrored;
  result := public.sync_github_issue_comment_atomic(issue,'remote-1',actor,NULL,'login','OWNER','https://example.test',stamp,stamp,NULL,mirrored,1,cipher);
  IF result->>'state'<>'stale' THEN RAISE EXCEPTION 'forge overwrote local edit during encryption'; END IF;
  IF (SELECT count(*) FROM public.github_issue_comment_syncs WHERE remote_comment_id='remote-1' AND issue_id=issue)<>1 THEN
    RAISE EXCEPTION 'forge sidecar identity lost';
  END IF;
  PERFORM public.create_envelope_data_key_if_absent('project',project,'content','Zml4dHVyZQ==');
  BEGIN
    INSERT INTO public.comments(issue_id,author_id,body) VALUES(issue,actor,'Obsolete writer');
    RAISE EXCEPTION 'obsolete writer retained plaintext';
  EXCEPTION WHEN check_violation THEN NULL; END;
  PERFORM set_config('request.jwt.claims',jsonb_build_object('role','authenticated','sub',actor)::text,true);
  SET LOCAL ROLE authenticated;
  IF (SELECT count(*) FROM public.comments)<>2 THEN RAISE EXCEPTION 'owner lost comments'; END IF;
  BEGIN
    PERFORM public.migrate_comment_ciphertext('comments',comment,project,2,1);
    RAISE EXCEPTION 'client executed maintenance';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  RESET ROLE;
  PERFORM set_config('request.jwt.claims',jsonb_build_object('role','authenticated','sub',outsider)::text,true);
  SET LOCAL ROLE authenticated;
  IF EXISTS(SELECT 1 FROM public.comments) OR EXISTS(SELECT 1 FROM public.page_comments) THEN RAISE EXCEPTION 'foreign project content visible'; END IF;
  UPDATE public.comments SET encrypted_content=cipher WHERE id=mirrored;
  GET DIAGNOSTICS affected=ROW_COUNT;
  IF affected<>0 THEN RAISE EXCEPTION 'foreign writer updated comment'; END IF;
  RESET ROLE;
  IF EXISTS(SELECT 1 FROM comment_broadcasts WHERE payload::text LIKE '%Private%' OR payload::text LIKE '%data%') THEN
    RAISE EXCEPTION 'content leaked in later invalidation';
  END IF;
END;
$test$;
ROLLBACK;
