\set ON_ERROR_STOP on
BEGIN;
DO $$ BEGIN
  IF current_database() NOT LIKE 'minddy_min591_%' THEN
    RAISE EXCEPTION 'Use an isolated minddy_min591_* database';
  END IF;
END $$;
DO $test$
DECLARE actor uuid := gen_random_uuid(); project uuid := gen_random_uuid();
  connection uuid := gen_random_uuid(); link uuid := gen_random_uuid();
  old_pr uuid := gen_random_uuid(); twin uuid := gen_random_uuid();
  capability uuid := gen_random_uuid(); path text; legacy text;
BEGIN
  INSERT INTO auth.users(id) VALUES(actor);
  INSERT INTO public.projects(id,owner_id,name,key)
    VALUES(project,actor,'Plain forge rename fixture','FARP');
  INSERT INTO public.git_connections(id,user_id,provider)
    VALUES(connection,actor,'github');
  INSERT INTO public.project_git_links(id,project_id,connection_id,provider,
    external_repo_id,repo_full_name,repo_owner,repo_name)
    VALUES(link,project,connection,'github','591-plain','old/repo','old','repo');
  INSERT INTO public.pull_requests(id,provider,repo_full_name,number,issue_id)
    VALUES(old_pr,'github','old/repo',91,NULL),
      (twin,'github','new/repo',91,NULL);
  legacy := old_pr || '/' || gen_random_uuid() || '/historical-name.png';
  INSERT INTO storage.objects(bucket_id,name)
    VALUES('forge-attachments',legacy);
  INSERT INTO public.forge_attachment_legacy_owners(old_path_digest,pr_id,project_id)
    VALUES(encode(extensions.digest(legacy,'sha256'),'hex'),old_pr,project);
  PERFORM public.activate_forge_attachment_encryption();
  path := 'projects/' || project || '/forge/' || capability || '/' || gen_random_uuid();
  INSERT INTO storage.objects(bucket_id,name,user_metadata,created_at)
    VALUES('forge-attachments',path,'{"minddy_encrypted":"true"}'::jsonb,
      now()-interval '2 hours');
  INSERT INTO public.forge_attachment_objects(id,pr_id,project_id,storage_path,
    content_key_version,format_version,published_at)
    VALUES(capability,old_pr,project,path,1,4,now());
  IF NOT public.reconcile_forge_repository_plain('github','591-plain',
      'new/repo','new','repo',jsonb_build_array(jsonb_build_object(
        'id',link,'old','old/repo','aliases',jsonb_build_array('old/repo')))) THEN
    RAISE EXCEPTION 'Plain repository rename failed';
  END IF;
  IF EXISTS(SELECT 1 FROM public.pull_requests WHERE id=old_pr) OR
      (SELECT pr_id FROM public.forge_attachment_objects WHERE id=capability)
        IS DISTINCT FROM twin OR
      (SELECT repo_full_name FROM public.project_git_links WHERE id=link)
        IS DISTINCT FROM 'new/repo' OR
      (SELECT pr_id FROM public.forge_attachment_legacy_owners WHERE
        old_path_digest=encode(extensions.digest(legacy,'sha256'),'hex'))
        IS DISTINCT FROM twin OR
      NOT EXISTS(SELECT 1 FROM public.list_forge_attachment_migration_candidates(10)
        WHERE name=legacy AND pr_id=twin AND project_id=project) OR
      EXISTS(SELECT 1 FROM public.list_forge_attachment_orphans(10)
        WHERE name=path) THEN
    RAISE EXCEPTION 'Plain fallback lost the published attachment';
  END IF;
  IF has_function_privilege('service_role',
      'public.merge_forge_pull_request(uuid,uuid,text)','EXECUTE') OR
      has_table_privilege('service_role','public.forge_attachment_objects','UPDATE') OR
      has_table_privilege('service_role','public.forge_attachment_legacy_owners','UPDATE') OR
      has_table_privilege('service_role',
        'public.forge_attachment_legacy_pr_aliases','UPDATE') THEN
    RAISE EXCEPTION 'Forge attachment rebind bypass remains callable';
  END IF;
END $test$;
ROLLBACK;
