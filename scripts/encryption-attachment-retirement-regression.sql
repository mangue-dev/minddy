\set ON_ERROR_STOP on
BEGIN;
DO $$ BEGIN
  IF current_database() NOT LIKE 'minddy_min591_%' THEN
    RAISE EXCEPTION 'Use an isolated minddy_min591_* database';
  END IF;
END $$;
DO $test$
DECLARE actor uuid := gen_random_uuid(); project uuid := gen_random_uuid();
  issue uuid := gen_random_uuid();
  missing text; held text; fresh text; live text; chat text;
  paths text[];
BEGIN
  INSERT INTO auth.users(id) VALUES(actor);
  INSERT INTO public.projects(id,owner_id,name,key)
    VALUES(project,actor,'Retirement fixture','ATRT');
  INSERT INTO public.plan_storage_quotas(plan_id,bytes)
    VALUES('free',1000000000) ON CONFLICT DO NOTHING;
  INSERT INTO public.issues(id,project_id,number,title)
    VALUES(issue,project,1,'Retirement fixture');
  INSERT INTO storage.buckets(id,name) VALUES('attachments','attachments')
    ON CONFLICT DO NOTHING;
  missing := 'projects/'||project||'/'||gen_random_uuid();
  held := 'projects/'||project||'/'||gen_random_uuid();
  fresh := 'projects/'||project||'/'||gen_random_uuid();
  live := 'projects/'||project||'/'||gen_random_uuid();
  chat := 'chat/'||actor||'/'||gen_random_uuid();
  INSERT INTO public.attachment_object_encrypted(path,checked_at) VALUES
    (missing,now()-interval '30 days'), (held,now()-interval '30 days'),
    (fresh,now()), (live,now()-interval '30 days'),
    (chat,now()-interval '30 days');
  INSERT INTO public.attachment_object_aliases(old_path_digest,new_path)
    VALUES(repeat('a',64),missing);
  INSERT INTO storage.objects(bucket_id,name,created_at,metadata,user_metadata)
    VALUES('attachments',live,now(),'{}'::jsonb,'{}'::jsonb),
      ('attachments',held,now(),'{"size":60}'::jsonb,
        '{"minddy_logical_size":12}'::jsonb);
  INSERT INTO public.attachments(project_id,issue_id,kind,storage_path,
    file_name,mime_type,size_bytes)
    VALUES(project,issue,'file',held,'Fixture file','text/plain',12);
  -- Simulate a completed Storage API deletion inside this disposable fixture.
  PERFORM pg_catalog.set_config('storage.allow_delete_query','true',true);
  DELETE FROM storage.objects WHERE bucket_id='attachments' AND name=held;

  SELECT array_agg(name) INTO paths FROM public.orphan_attachment_objects(
    now()-interval '7 days',500);
  IF NOT coalesce(missing=ANY(paths),false) OR NOT coalesce(chat=ANY(paths),false) THEN
    RAISE EXCEPTION 'Missing-object registry rows were not queued for retirement';
  END IF;
  IF held=ANY(paths) OR fresh=ANY(paths) OR live=ANY(paths) THEN
    RAISE EXCEPTION 'Live references or grace-period objects were queued for retirement';
  END IF;
  IF (SELECT count(*) FROM public.orphan_attachment_objects(
    now()-interval '7 days',1)) <> 1 THEN
    RAISE EXCEPTION 'Retirement batch limit was not respected';
  END IF;
  IF has_function_privilege('authenticated',
    'public.orphan_attachment_objects(timestamptz,integer)','EXECUTE') OR
    has_function_privilege('anon',
    'public.orphan_attachment_objects(timestamptz,integer)','EXECUTE') OR
    NOT has_function_privilege('service_role',
    'public.orphan_attachment_objects(timestamptz,integer)','EXECUTE') THEN
    RAISE EXCEPTION 'Retirement scan permissions changed';
  END IF;

  DELETE FROM public.attachment_object_aliases WHERE new_path=missing;
  DELETE FROM public.attachment_object_encrypted WHERE path=missing;
  IF EXISTS (SELECT 1 FROM public.orphan_attachment_objects(
    now()-interval '7 days',500) WHERE name=missing) THEN
    RAISE EXCEPTION 'Retired metadata remained in the cleanup queue';
  END IF;
END;
$test$;
ROLLBACK;
