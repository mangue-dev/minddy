\set ON_ERROR_STOP on
BEGIN;
DO $$ BEGIN
  IF current_database() NOT LIKE 'minddy_min591_%' THEN
    RAISE EXCEPTION 'Use an isolated minddy_min591_* database';
  END IF;
END $$;
DO $test$
DECLARE actor uuid := gen_random_uuid(); project uuid := gen_random_uuid();
  issue uuid := gen_random_uuid(); page uuid := gen_random_uuid();
  attachment uuid := gen_random_uuid(); file uuid := gen_random_uuid();
  path text; name text := 'Private issue attachment';
  url text := 'https://private.example/issue';
  icon text := 'data:image/png;base64,AA==';
  cipher text := 'mdya3:1:eyJmb3JtYXQiOjMsImtleVZlcnNpb24iOjF9';
  rejected boolean;
BEGIN
  INSERT INTO auth.users(id) VALUES(actor);
  INSERT INTO public.projects(id,owner_id,name,key)
    VALUES(project,actor,'Fixture project','ATMT');
  INSERT INTO public.plan_storage_quotas(plan_id,bytes)
    VALUES('free',1000000000) ON CONFLICT DO NOTHING;
  INSERT INTO public.issues(id,project_id,number,title)
    VALUES(issue,project,1,'Private issue');
  INSERT INTO public.pages(id,project_id,title,position,created_by)
    VALUES(page,project,'Private page',0,actor);
  INSERT INTO public.attachments(id,project_id,issue_id,kind,url,
    icon_data_url,file_name,mime_type,size_bytes)
    VALUES(attachment,project,issue,'link',url,icon,name,'text/uri-list',0);
  path := 'projects/'||project||'/pages/'||page||'/'||gen_random_uuid();
  INSERT INTO storage.buckets(id,name) VALUES('attachments','attachments')
    ON CONFLICT DO NOTHING;
  INSERT INTO storage.objects(bucket_id,name,metadata)
    VALUES('attachments',path,'{"size":12}'::jsonb);
  INSERT INTO public.page_files(id,page_id,project_id,storage_path,
    file_name,mime_type,size_bytes,created_by)
    VALUES(file,page,project,path,name,'text/plain',12,actor);
  IF NOT public.migrate_attachment_metadata(attachment,name,url,icon,
      cipher,cipher,cipher) OR
      public.migrate_attachment_metadata(attachment,name,url,icon,
      cipher,cipher,cipher) THEN
    RAISE EXCEPTION 'Attachment metadata CAS failed';
  END IF;
  IF NOT public.migrate_page_file_metadata(file,name,cipher) OR
      public.migrate_page_file_metadata(file,name,cipher) THEN
    RAISE EXCEPTION 'Page file metadata CAS failed';
  END IF;
  IF EXISTS (SELECT 1 FROM public.attachments a WHERE a.id=attachment AND
      (a.file_name LIKE '%Private issue%' OR a.url LIKE '%private.example%' OR
       a.icon_data_url LIKE 'data:%')) OR
     EXISTS (SELECT 1 FROM public.page_files p WHERE p.id=file AND
       p.file_name LIKE '%Private issue%') THEN
    RAISE EXCEPTION 'Attachment metadata remains clear';
  END IF;
  rejected := false;
  BEGIN
    INSERT INTO public.attachments(project_id,issue_id,kind,url,file_name,
      mime_type,size_bytes) VALUES(project,issue,'link',url,name,
      'text/uri-list',0);
  EXCEPTION WHEN check_violation THEN rejected := true; END;
  IF NOT rejected THEN RAISE EXCEPTION 'Obsolete link writer accepted'; END IF;
  rejected := false;
  BEGIN
    UPDATE public.page_files SET file_name=name WHERE id=file;
  EXCEPTION WHEN check_violation THEN rejected := true; END;
  IF NOT rejected THEN RAISE EXCEPTION 'Obsolete page-file writer accepted'; END IF;
  IF has_function_privilege('authenticated',
      'public.migrate_attachment_metadata(uuid,text,text,text,text,text,text)',
      'EXECUTE') THEN RAISE EXCEPTION 'Attachment migration has client privilege'; END IF;
END;
$test$;
ROLLBACK;
