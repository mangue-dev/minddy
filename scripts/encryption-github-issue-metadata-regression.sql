-- Exercise issue-sidecar ciphertext, old writers, CAS, and stale remote delivery.
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
  other_project uuid := gen_random_uuid(); legacy uuid := gen_random_uuid();
  fresh uuid := gen_random_uuid(); stale uuid := gen_random_uuid();
  cipher text := '{"format":3,"keyVersion":1,"data":"test-only-placeholder"}';
  rejected boolean;
BEGIN
  INSERT INTO auth.users(id) VALUES(actor);
  INSERT INTO public.projects(id,owner_id,name,key)
    VALUES(project,actor,'Issue metadata fixture','GIM'),
      (other_project,actor,'Other metadata fixture','GIO');
  INSERT INTO public.issues(id,project_id,number,title)
    VALUES(legacy,project,1,'Legacy issue'),
      (fresh,project,2,'Fresh issue'),
      (stale,project,3,'Stale issue');
  INSERT INTO public.github_issue_sync_metadata(issue_id,milestone,metadata,synced_at)
    VALUES(legacy,'{"title":"Private milestone"}',
      '{"issue_type":"Private type"}',now());
  INSERT INTO public.github_issue_sync_metadata(issue_id,milestone,metadata,
      content_ciphertext,content_encryption_version)
    VALUES(fresh,NULL,'{}',cipher,1);
  rejected := false;
  BEGIN
    INSERT INTO public.github_issue_sync_metadata(issue_id,milestone)
      VALUES(stale,'{"title":"Obsolete clear writer"}');
  EXCEPTION WHEN check_violation THEN rejected := true; END;
  IF NOT rejected THEN RAISE EXCEPTION 'obsolete issue sidecar writer accepted'; END IF;
  rejected := false;
  BEGIN
    UPDATE public.github_issue_sync_metadata SET metadata='{"leak":"Private"}'
      WHERE issue_id=legacy;
  EXCEPTION WHEN check_violation THEN rejected := true; END;
  IF NOT rejected THEN RAISE EXCEPTION 'obsolete issue sidecar edit accepted'; END IF;
  rejected := false;
  BEGIN
    UPDATE public.github_issue_sync_metadata SET updated_at_remote = now()
      WHERE issue_id=legacy;
  EXCEPTION WHEN check_violation THEN rejected := true; END;
  IF NOT rejected THEN RAISE EXCEPTION 'obsolete issue sidecar metadata edit accepted'; END IF;
  rejected := false;
  BEGIN
    UPDATE public.issues SET project_id=other_project WHERE id=fresh;
  EXCEPTION WHEN check_violation THEN rejected := true; END;
  IF NOT rejected THEN RAISE EXCEPTION 'encrypted sidecar parent moved'; END IF;
  IF NOT public.migrate_github_issue_metadata(legacy,project,
      '{"issue_type":"Private type"}', '{"title":"Private milestone"}',
      NULL,0,(SELECT synced_at FROM public.github_issue_sync_metadata WHERE issue_id=legacy)) OR
     NOT public.migrate_github_issue_metadata(legacy,project,
      '{"issue_type":"Private type"}', '{"title":"Private milestone"}',
      NULL,0,(SELECT synced_at FROM public.github_issue_sync_metadata WHERE issue_id=legacy),
      cipher,1) THEN
    RAISE EXCEPTION 'issue sidecar conversion CAS failed';
  END IF;
  IF EXISTS (SELECT 1 FROM public.github_issue_sync_metadata m
      WHERE m.issue_id IN (legacy,fresh) AND
        (m.metadata::text LIKE '%Private%' OR m.milestone::text LIKE '%Private%')) THEN
    RAISE EXCEPTION 'issue sidecar retained plaintext';
  END IF;
  IF NOT public.sync_github_issue_metadata_encrypted(stale,project,
      jsonb_build_object('metadata','{}'::jsonb,'milestone',NULL,
        'content_ciphertext',cipher,'content_encryption_version',1,
        'locked',false,'updated_at_remote','2026-09-24T12:00:00Z',
        'synced_at','2026-09-24T12:01:00Z')) OR
     public.sync_github_issue_metadata_encrypted(stale,project,
      jsonb_build_object('metadata','{}'::jsonb,'milestone',NULL,
        'content_ciphertext',cipher,'content_encryption_version',1,
        'locked',false,'updated_at_remote','2026-09-23T12:00:00Z',
        'synced_at','2026-09-24T12:02:00Z')) THEN
    RAISE EXCEPTION 'stale remote issue metadata delivery won';
  END IF;
  IF (SELECT updated_at_remote FROM public.github_issue_sync_metadata
      WHERE issue_id=stale) <> '2026-09-24T12:00:00Z'::timestamptz THEN
    RAISE EXCEPTION 'remote issue metadata timestamp changed';
  END IF;
  IF has_function_privilege('authenticated',
      'public.migrate_github_issue_metadata(uuid,uuid,jsonb,jsonb,text,integer,timestamptz,text,integer)',
      'EXECUTE') OR has_function_privilege('authenticated',
      'public.sync_github_issue_metadata_encrypted(uuid,uuid,jsonb)','EXECUTE') OR
     EXISTS (SELECT 1 FROM pg_publication_tables
       WHERE schemaname='public' AND tablename='github_issue_sync_metadata') THEN
    RAISE EXCEPTION 'issue sidecar client or Realtime leak';
  END IF;
END;
$test$;
ROLLBACK;
