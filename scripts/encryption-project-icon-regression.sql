\set ON_ERROR_STOP on
BEGIN;
DO $$ BEGIN
  IF current_database() NOT LIKE 'minddy_min591_%' THEN
    RAISE EXCEPTION 'Use an isolated minddy_min591_* database';
  END IF;
END $$;
DO $test$
DECLARE actor uuid:=gen_random_uuid(); project uuid:=gen_random_uuid();
  another uuid:=gen_random_uuid(); target text;
  old_url text:='https://storage.example/project-icons/legacy.png';
  new_url text; rejected boolean;
BEGIN
  INSERT INTO auth.users(id) VALUES(actor);
  INSERT INTO storage.buckets(id,name,public)
    VALUES('project-icons','project-icons',true) ON CONFLICT (id) DO UPDATE
      SET public=true;
  INSERT INTO public.projects(id,owner_id,name,key,icon_url)
    VALUES(project,actor,'Private project','ICON',old_url);
  INSERT INTO storage.objects(bucket_id,name,metadata)
    VALUES('project-icons',project::text||'.png','{"size":8}'::jsonb);
  IF public.activate_private_project_icons() THEN
    RAISE EXCEPTION 'Legacy icon activated';
  END IF;
  target:=project::text||'/'||gen_random_uuid()||'.enc';
  new_url:='/api/projects/'||project::text||'/icon/content?v=1';
  INSERT INTO storage.objects(bucket_id,name,metadata)
    VALUES('project-icons',target,'{"size":120}'::jsonb);
  INSERT INTO public.project_icon_encrypted_objects(path,project_id)
    VALUES(target,project);
  IF NOT public.replace_project_icon(project,old_url,NULL,new_url,target) OR
      public.replace_project_icon(project,old_url,NULL,new_url,target) THEN
    RAISE EXCEPTION 'Project icon CAS failed';
  END IF;
  IF (SELECT icon_url FROM public.projects WHERE id=project)<>new_url OR
      (SELECT icon_storage_path FROM public.projects WHERE id=project)<>target THEN
    RAISE EXCEPTION 'Project icon row copy remains clear';
  END IF;
  rejected:=false;
  BEGIN
    UPDATE public.projects SET icon_url=old_url WHERE id=project;
  EXCEPTION WHEN check_violation THEN rejected:=true; END;
  IF NOT rejected THEN RAISE EXCEPTION 'Old icon writer accepted'; END IF;
  IF public.activate_private_project_icons() THEN
    RAISE EXCEPTION 'Clear storage object activated';
  END IF;
  IF (SELECT count(*) FROM public.list_orphan_project_icon_objects(10)
      WHERE name=project::text||'.png')<>1 THEN
    RAISE EXCEPTION 'Clear object missing from cleanup queue';
  END IF;
  PERFORM pg_catalog.set_config('storage.allow_delete_query','true',true);
  DELETE FROM storage.objects WHERE bucket_id='project-icons'
    AND name=project::text||'.png';
  IF NOT public.activate_private_project_icons() THEN
    RAISE EXCEPTION 'Private bucket activation refused';
  END IF;
  IF (SELECT public FROM storage.buckets WHERE id='project-icons') THEN
    RAISE EXCEPTION 'Project icon bucket remained public';
  END IF;
  rejected:=false;
  BEGIN
    INSERT INTO public.projects(id,owner_id,name,key,icon_url)
      VALUES(another,actor,'Old writer','OLD',old_url);
  EXCEPTION WHEN check_violation THEN rejected:=true; END;
  IF NOT rejected THEN RAISE EXCEPTION 'Old insert accepted'; END IF;
  rejected:=false;
  BEGIN
    UPDATE public.projects SET icon_url=old_url,
      icon_storage_path=NULL WHERE id=project;
  EXCEPTION WHEN check_violation THEN rejected:=true; END;
  IF NOT rejected THEN RAISE EXCEPTION 'Old update accepted'; END IF;
  rejected:=false;
  BEGIN
    INSERT INTO storage.objects(bucket_id,name,metadata)
      VALUES('project-icons',project::text||'.jpg',
        '{"size":8}'::jsonb);
  EXCEPTION WHEN check_violation THEN rejected:=true; END;
  IF NOT rejected THEN RAISE EXCEPTION 'Old service object writer accepted'; END IF;
  IF has_function_privilege('authenticated',
      'public.replace_project_icon(uuid,text,text,text,text)','EXECUTE') OR
     has_function_privilege('authenticated',
      'public.activate_private_project_icons()','EXECUTE') THEN
    RAISE EXCEPTION 'Client has icon migration privilege';
  END IF;
  IF (SELECT count(*) FROM pg_catalog.pg_policies WHERE
      schemaname='storage' AND tablename='objects' AND
      policyname IN ('project_icons_private_select',
        'project_icons_private_insert','project_icons_private_update') AND
      permissive='RESTRICTIVE')<>3 THEN
    RAISE EXCEPTION 'Private Storage policies are missing';
  END IF;
  rejected:=false;
  BEGIN
    SET LOCAL ROLE authenticated;
    INSERT INTO storage.objects(bucket_id,name,metadata)
      VALUES('project-icons',project::text||'/old-writer.png',
        '{"size":8}'::jsonb);
  EXCEPTION WHEN insufficient_privilege OR check_violation THEN rejected:=true;
  END;
  RESET ROLE;
  IF NOT rejected THEN RAISE EXCEPTION 'Direct icon object writer accepted'; END IF;
END;
$test$;
ROLLBACK;
