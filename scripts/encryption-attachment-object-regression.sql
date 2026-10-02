\set ON_ERROR_STOP on
BEGIN;
DO $$ BEGIN
  IF current_database() NOT LIKE 'minddy_min591_%' THEN
    RAISE EXCEPTION 'Use an isolated minddy_min591_* database';
  END IF;
END $$;
DO $test$
DECLARE actor uuid := gen_random_uuid(); project uuid := gen_random_uuid();
  issue uuid := gen_random_uuid(); attachment uuid := gen_random_uuid();
  old_path text; new_path text; digest text := repeat('a',64);
  rejected boolean;
BEGIN
  INSERT INTO auth.users(id) VALUES(actor);
  INSERT INTO public.projects(id,owner_id,name,key)
    VALUES(project,actor,'Fixture project','ATOB');
  INSERT INTO public.plan_storage_quotas(plan_id,bytes)
    VALUES('free',1000000000) ON CONFLICT DO NOTHING;
  INSERT INTO public.issues(id,project_id,number,title)
    VALUES(issue,project,1,'Private issue');
  old_path := 'projects/'||project||'/'||gen_random_uuid()||'/private-issue-file.txt';
  new_path := 'projects/'||project||'/'||gen_random_uuid();
  INSERT INTO storage.buckets(id,name) VALUES('attachments','attachments')
    ON CONFLICT DO NOTHING;
  INSERT INTO storage.objects(bucket_id,name,metadata)
    VALUES('attachments',old_path,'{"size":12}'::jsonb);
  IF (SELECT count(*) FROM public.list_attachment_object_migration_candidates(10)
      WHERE name=old_path) <> 1 THEN
    RAISE EXCEPTION 'Legacy object missing from queue';
  END IF;
  PERFORM public.record_attachment_object_migration_attempt(
    (SELECT id FROM storage.objects WHERE bucket_id='attachments' AND name=old_path));
  IF NOT EXISTS (SELECT 1 FROM public.attachment_object_migration_attempts) THEN
    RAISE EXCEPTION 'Object attempt not recorded';
  END IF;
  INSERT INTO storage.objects(bucket_id,name,metadata)
    VALUES('attachments','projects/'||project||'/'||gen_random_uuid()||'/later.txt',
      '{"size":5}'::jsonb);
  IF (SELECT name FROM public.list_attachment_object_migration_candidates(1))
      = old_path THEN
    RAISE EXCEPTION 'Failed object starved the next batch';
  END IF;
  INSERT INTO public.attachments(id,project_id,issue_id,kind,storage_path,
    file_name,mime_type,size_bytes) VALUES(attachment,project,issue,'file',
    old_path,'Private issue file','text/plain',12);
  INSERT INTO public.attachment_object_encryption_scope(id) VALUES(true);
  SET LOCAL ROLE authenticated;
  IF public.attachment_browser_upload_allowed() THEN
    RAISE EXCEPTION 'Direct authenticated upload still allowed';
  END IF;
  RESET ROLE;
  rejected := false;
  BEGIN
    INSERT INTO public.attachments(project_id,issue_id,kind,storage_path,
      file_name,mime_type,size_bytes) VALUES(project,issue,'file',old_path,
      'Obsolete file','text/plain',12);
  EXCEPTION WHEN check_violation THEN rejected := true; END;
  IF NOT rejected THEN RAISE EXCEPTION 'Obsolete object reference accepted'; END IF;
  INSERT INTO public.attachment_object_encrypted(path) VALUES(new_path);
  INSERT INTO storage.objects(bucket_id,name,metadata,user_metadata)
    VALUES('attachments',new_path,'{"size":60}'::jsonb,
      '{"minddy_logical_size":12}'::jsonb);
  IF NOT public.migrate_attachment_object_references(old_path,new_path,digest) THEN
    RAISE EXCEPTION 'Object reference swap failed';
  END IF;
  IF (SELECT storage_path FROM public.attachments WHERE id=attachment)
      IS DISTINCT FROM new_path OR
      (SELECT alias.new_path FROM public.attachment_object_aliases alias
        WHERE alias.old_path_digest=digest) IS DISTINCT FROM new_path THEN
    RAISE EXCEPTION 'Object reference or alias remains clear';
  END IF;
  IF public.migrate_attachment_object_references(old_path,
      'projects/'||project||'/'||gen_random_uuid(),digest) THEN
    RAISE EXCEPTION 'Conflicting object swap won';
  END IF;
  INSERT INTO public.attachments(project_id,issue_id,kind,storage_path,
    file_name,mime_type,size_bytes) VALUES(project,issue,'file',new_path,
    'New file','text/plain',12);
  IF has_function_privilege('authenticated',
      'public.migrate_attachment_object_references(text,text,text)',
      'EXECUTE') THEN
    RAISE EXCEPTION 'Object swap RPC has client privilege';
  END IF;
END;
$test$;
ROLLBACK;
