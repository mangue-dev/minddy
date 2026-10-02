-- Exercise forge comment URL conversion without losing atomic comment synchronization.
\set ON_ERROR_STOP on
BEGIN;
DO $$ BEGIN
  IF current_database() NOT LIKE 'minddy_min591_%' THEN
    RAISE EXCEPTION 'Use an isolated minddy_min591_* database';
  END IF;
END $$;
DO $test$
DECLARE
  actor uuid := gen_random_uuid(); project uuid := gen_random_uuid();
  issue uuid := gen_random_uuid(); legacy_comment uuid := gen_random_uuid();
  fresh_comment uuid := gen_random_uuid();
  cipher text := '{"format":3,"keyVersion":1,"data":"test-only-placeholder"}';
  first_result jsonb; stale_result jsonb; rejected boolean;
  synced_time timestamptz;
BEGIN
  INSERT INTO auth.users(id) VALUES(actor);
  INSERT INTO public.projects(id,owner_id,name,key)
    VALUES(project,actor,'Comment URL fixture','GCU');
  INSERT INTO public.issues(id,project_id,number,title)
    VALUES(issue,project,1,'Fixture issue');
  INSERT INTO public.comments(id,issue_id,author_id,body)
    VALUES(legacy_comment,issue,actor,'Legacy body');
  INSERT INTO public.github_issue_comment_syncs(remote_comment_id,issue_id,comment_id,html_url)
    VALUES('legacy',issue,legacy_comment,'https://example.test/Private-comment');
  first_result := public.sync_github_issue_comment_encrypted_url(
    issue,'fresh',actor,'Fresh body',NULL,NULL,cipher,NULL,
    '2026-09-24T12:00:00Z',NULL,fresh_comment,0,NULL,1);
  IF first_result->>'state' <> 'synced' OR
      NOT EXISTS (SELECT 1 FROM public.github_issue_comment_syncs
        WHERE issue_id=issue AND remote_comment_id='fresh'
          AND html_url=cipher AND html_url_encryption_version=1) THEN
    RAISE EXCEPTION 'atomic encrypted comment sync failed';
  END IF;
  rejected := false;
  BEGIN
    PERFORM public.sync_github_issue_comment_atomic(issue,'obsolete',actor,
      'Obsolete body',NULL,NULL,'https://example.test/clear',NULL,NULL,NULL);
  EXCEPTION WHEN check_violation THEN rejected := true; END;
  IF NOT rejected THEN RAISE EXCEPTION 'obsolete comment URL writer accepted'; END IF;
  SELECT synced_at INTO synced_time FROM public.github_issue_comment_syncs
    WHERE issue_id=issue AND remote_comment_id='legacy';
  IF NOT public.migrate_github_comment_url(issue,'legacy',project,
      'https://example.test/Private-comment',0,synced_time) OR
     NOT public.migrate_github_comment_url(issue,'legacy',project,
      'https://example.test/Private-comment',0,synced_time,cipher,1) OR
     public.migrate_github_comment_url(issue,'legacy',project,
      'https://example.test/Private-comment',0,synced_time,cipher,1) THEN
    RAISE EXCEPTION 'comment URL conversion CAS failed';
  END IF;
  IF EXISTS (SELECT 1 FROM public.github_issue_comment_syncs
      WHERE issue_id=issue AND html_url LIKE '%Private%') THEN
    RAISE EXCEPTION 'comment URL plaintext retained';
  END IF;
  stale_result := public.sync_github_issue_comment_encrypted_url(
    issue,'fresh',actor,'Stale body',NULL,NULL,cipher,NULL,
    '2026-09-23T12:00:00Z',NULL,fresh_comment,0,NULL,1);
  IF stale_result->>'state' <> 'stale' THEN
    RAISE EXCEPTION 'stale encrypted comment delivery won';
  END IF;
  IF has_function_privilege('authenticated',
      'public.migrate_github_comment_url(uuid,text,uuid,text,integer,timestamptz,text,integer)',
      'EXECUTE') OR has_function_privilege('authenticated',
      'public.sync_github_issue_comment_encrypted_url(uuid,text,uuid,text,text,text,text,timestamptz,timestamptz,timestamptz,uuid,integer,text,integer)',
      'EXECUTE') OR EXISTS (SELECT 1 FROM pg_publication_tables
        WHERE schemaname='public' AND tablename='github_issue_comment_syncs') THEN
    RAISE EXCEPTION 'comment URL client or Realtime leak';
  END IF;
END;
$test$;
ROLLBACK;
