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
  capability uuid := gen_random_uuid(); edit uuid := gen_random_uuid();
  old_token text := 'mdyr1:' || repeat('d',64);
  new_token text := 'mdyr1:' || repeat('e',64);
  ciphertext text := '{"format":3,"keyVersion":1,"payload":"YWJj"}';
  path text; legacy text;
BEGIN
  INSERT INTO auth.users(id) VALUES(actor);
  INSERT INTO public.projects(id,owner_id,name,key)
    VALUES(project,actor,'Forge rename fixture','FARM');
  INSERT INTO public.git_connections(id,user_id,provider)
    VALUES(connection,actor,'github');
  INSERT INTO public.forge_repository_names(provider,token,
    full_name_ciphertext,encryption_version)
    VALUES('github',old_token,ciphertext,1),
      ('github',new_token,ciphertext,1);
  INSERT INTO public.project_git_links(id,project_id,connection_id,provider,
    external_repo_id,repo_full_name)
    VALUES(link,project,connection,'github','591-rename',old_token);
  INSERT INTO public.pull_requests(id,provider,repo_full_name,number)
    VALUES(old_pr,'github',old_token,91),
      (twin,'github',new_token,91);
  INSERT INTO public.pr_comment_edits(id,provider,repo_full_name,pr_number,
    comment_id,body) VALUES(edit,'github',old_token,91,1,ciphertext);
  legacy := old_pr || '/' || gen_random_uuid() || '/historical-name.png';
  INSERT INTO storage.objects(bucket_id,name)
    VALUES('forge-attachments',legacy);
  INSERT INTO public.forge_attachment_legacy_owners(old_path_digest,pr_id,project_id)
    VALUES(encode(extensions.digest(legacy,'sha256'),'hex'),old_pr,project);
  IF public.forge_attachment_migration_complete() THEN
    RAISE EXCEPTION 'Migration completed without the durable writer fence';
  END IF;
  PERFORM public.activate_forge_attachment_encryption();
  path := 'projects/' || project || '/forge/' || capability || '/' || gen_random_uuid();
  INSERT INTO storage.objects(bucket_id,name,user_metadata,created_at)
    VALUES('forge-attachments',path,'{"minddy_encrypted":"true"}'::jsonb,
      now()-interval '2 hours');
  INSERT INTO public.forge_attachment_objects(id,pr_id,project_id,storage_path,
    content_key_version,format_version,published_at)
    VALUES(capability,old_pr,project,path,1,4,now());
  BEGIN
    UPDATE public.forge_attachment_objects SET pr_id=twin WHERE id=capability;
    RAISE EXCEPTION 'Unprivileged PR rebind was accepted';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
  BEGIN
    PERFORM public.reconcile_forge_repository_plain('github','591-rename',
      'clear/repo','clear','repo',jsonb_build_array(jsonb_build_object(
        'id',link,'old',old_token,'aliases',jsonb_build_array(old_token))));
    RAISE EXCEPTION 'Plain fallback accepted a protected repository name';
  EXCEPTION WHEN serialization_failure THEN NULL;
  END;
  IF NOT public.reconcile_forge_repository_name('github','591-rename',new_token,
      jsonb_build_array(jsonb_build_object('id',link,'old',old_token,
        'aliases',jsonb_build_array(old_token)))) THEN
    RAISE EXCEPTION 'Atomic repository rename failed';
  END IF;
  IF EXISTS(SELECT 1 FROM public.pull_requests WHERE id=old_pr) OR
      (SELECT pr_id FROM public.forge_attachment_objects WHERE id=capability)
        IS DISTINCT FROM twin OR
      (SELECT pr_id FROM public.forge_attachment_legacy_owners WHERE
        old_path_digest=encode(extensions.digest(legacy,'sha256'),'hex'))
        IS DISTINCT FROM twin OR
      (SELECT current_pr_id FROM public.forge_attachment_legacy_pr_aliases
        WHERE old_pr_id=old_pr) IS DISTINCT FROM twin OR
      (SELECT repo_full_name FROM public.pr_comment_edits WHERE id=edit)
        IS DISTINCT FROM new_token OR
      NOT EXISTS(SELECT 1 FROM public.list_forge_attachment_migration_candidates(10)
        WHERE name=legacy AND pr_id=twin AND project_id=project) THEN
    RAISE EXCEPTION 'Rename lost a published or historical attachment association';
  END IF;
  IF EXISTS(SELECT 1 FROM public.list_forge_attachment_orphans(10)
      WHERE name=path) THEN
    RAISE EXCEPTION 'Published attachment was selected as an orphan';
  END IF;
  IF public.delete_abandoned_forge_attachment(capability,path) THEN
    RAISE EXCEPTION 'Published attachment was selected for cleanup';
  END IF;
  PERFORM set_config('storage.allow_delete_query','true',true);
  DELETE FROM storage.objects WHERE bucket_id='forge-attachments'
    AND name=legacy;
  DELETE FROM public.forge_attachment_legacy_owners WHERE
    old_path_digest=encode(extensions.digest(legacy,'sha256'),'hex');
  IF public.forge_attachment_migration_complete() THEN
    RAISE EXCEPTION 'Unverified renamed attachment passed completion';
  END IF;
  -- This SQL fixture exercises proof CAS; byte authentication is tested in TypeScript.
  PERFORM public.verify_forge_attachment_object(capability,path,1,repeat('f',64));
  IF NOT public.forge_attachment_migration_complete() THEN
    RAISE EXCEPTION 'Migration remained incomplete after historical cleanup';
  END IF;
  DELETE FROM public.projects WHERE id=project;
  IF NOT EXISTS(SELECT 1 FROM public.list_forge_attachment_orphans(10)
      WHERE name=path) THEN
    RAISE EXCEPTION 'Deleted project did not expose abandoned object for cleanup';
  END IF;
  DELETE FROM storage.objects WHERE bucket_id='forge-attachments' AND name=path;
  IF NOT public.forge_attachment_migration_complete() THEN
    RAISE EXCEPTION 'Orphan cleanup did not restore migration completeness';
  END IF;
END $test$;
ROLLBACK;
