\set ON_ERROR_STOP on
BEGIN;
DO $$ BEGIN
  IF current_database() NOT LIKE 'minddy_min591_%' THEN
    RAISE EXCEPTION 'Use an isolated minddy_min591_* database';
  END IF;
END $$;
DO $test$
DECLARE actor uuid := gen_random_uuid(); project uuid := gen_random_uuid();
  connection uuid := gen_random_uuid(); pr uuid := gen_random_uuid();
  capability uuid := gen_random_uuid(); legacy text; first_path text;
  second_path text; failed boolean := false;
  abandoned uuid := gen_random_uuid(); abandoned_path text;
  unrelated_project uuid := gen_random_uuid(); unrelated_id uuid := gen_random_uuid();
  duplicate_link uuid := gen_random_uuid();
  unmarked uuid := gen_random_uuid(); unmarked_path text;
BEGIN
  INSERT INTO auth.users(id) VALUES(actor);
  INSERT INTO public.projects(id,owner_id,name,key)
    VALUES(project,actor,'Fixture project','FATC');
  INSERT INTO public.git_connections(id,user_id,provider)
    VALUES(connection,actor,'github');
  INSERT INTO public.project_git_links(project_id,connection_id,provider,
    external_repo_id,repo_full_name)
    VALUES(project,connection,'github','fixture-repo','fixture/repo');
  INSERT INTO public.pull_requests(id,provider,repo_full_name,number)
    VALUES(pr,'github','fixture/repo',1);
  IF public.forge_attachment_migration_complete() THEN
    RAISE EXCEPTION 'Forge migration completed without a writer fence';
  END IF;
  IF has_table_privilege('service_role',
      'public.forge_attachment_encryption_scope','INSERT') OR
      has_table_privilege('service_role',
        'public.forge_attachment_encryption_scope','DELETE') OR
      NOT has_function_privilege('service_role',
        'public.activate_forge_attachment_encryption()','EXECUTE') THEN
    RAISE EXCEPTION 'Forge writer fence bypass privilege is available';
  END IF;
  IF (SELECT public FROM storage.buckets WHERE id='forge-attachments')
      IS DISTINCT FROM false THEN
    RAISE EXCEPTION 'Forge attachment bucket remains public';
  END IF;
  unmarked_path := 'projects/' || project || '/forge/' || unmarked ||
    '/' || gen_random_uuid();
  INSERT INTO storage.objects(bucket_id,name)
    VALUES('forge-attachments',unmarked_path);
  INSERT INTO public.forge_attachment_objects(id,pr_id,project_id,storage_path,
    content_key_version,format_version)
    VALUES(unmarked,pr,project,unmarked_path,1,4);
  legacy := pr || '/' || gen_random_uuid() || '/human-name.png';
  INSERT INTO storage.objects(bucket_id,name)
    VALUES('forge-attachments',legacy);
  INSERT INTO public.projects(id,owner_id,name,key)
    VALUES(unrelated_project,actor,'Unrelated project','FATD');
  INSERT INTO public.project_git_links(id,project_id,connection_id,provider,
    external_repo_id,repo_full_name)
    VALUES(duplicate_link,unrelated_project,connection,'github',
      'fixture-repo','fixture/repo');
  IF EXISTS (SELECT 1 FROM public.list_forge_attachment_migration_candidates(10)
      WHERE name=legacy) THEN
    RAISE EXCEPTION 'Ambiguous forge attachment owner was guessed';
  END IF;
  INSERT INTO public.forge_attachment_legacy_owners(old_path_digest,pr_id,project_id)
    VALUES(encode(extensions.digest(legacy,'sha256'),'hex'),pr,project);
  IF NOT EXISTS (SELECT 1 FROM public.list_forge_attachment_migration_candidates(10)
      WHERE name=legacy AND project_id=project) THEN
    RAISE EXCEPTION 'Explicit forge owner did not resolve migration';
  END IF;
  DELETE FROM public.forge_attachment_legacy_owners
    WHERE old_path_digest=encode(extensions.digest(legacy,'sha256'),'hex');
  DELETE FROM public.project_git_links WHERE id=duplicate_link;
  IF NOT EXISTS (SELECT 1 FROM public.list_forge_attachment_migration_candidates(10)
      WHERE name=legacy AND project_id=project) THEN
    RAISE EXCEPTION 'Legacy forge attachment missing from migration queue';
  END IF;
  IF public.forge_attachment_migration_complete() THEN
    RAISE EXCEPTION 'Forge migration accepted a historical clear object';
  END IF;
  IF NOT public.activate_forge_attachment_encryption() THEN
    RAISE EXCEPTION 'Forge attachment writer fence did not activate';
  END IF;
  BEGIN
    INSERT INTO storage.objects(bucket_id,name)
      VALUES('forge-attachments',pr || '/' || gen_random_uuid() || '/another.png');
    RAISE EXCEPTION 'Legacy writer was accepted';
  EXCEPTION WHEN check_violation THEN failed := true;
  END;
  IF NOT failed THEN RAISE EXCEPTION 'Legacy writer guard failed'; END IF;
  first_path := 'projects/' || project || '/forge/' || capability || '/' || gen_random_uuid();
  second_path := 'projects/' || project || '/forge/' || capability || '/' || gen_random_uuid();
  BEGIN
    INSERT INTO storage.objects(bucket_id,name)
      VALUES('forge-attachments',first_path);
    RAISE EXCEPTION 'Unmarked clear object was accepted';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
  INSERT INTO storage.objects(bucket_id,name,user_metadata)
    VALUES('forge-attachments',first_path,'{"minddy_encrypted":"true"}'::jsonb),
      ('forge-attachments',second_path,'{"minddy_encrypted":"true"}'::jsonb);
  INSERT INTO public.forge_attachment_objects(id,pr_id,project_id,storage_path,
    content_key_version,format_version)
    VALUES(capability,pr,project,first_path,1,4);
  INSERT INTO storage.buckets(id,name,public)
    VALUES('forge-attachment-test-other','forge-attachment-test-other',false);
  BEGIN
    UPDATE storage.objects SET bucket_id='forge-attachment-test-other'
      WHERE bucket_id='forge-attachments' AND name=first_path;
    RAISE EXCEPTION 'Protected forge object escaped its bucket';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
  BEGIN
    INSERT INTO public.forge_attachment_objects(id,pr_id,project_id,storage_path,
      content_key_version,format_version)
      VALUES(unrelated_id,pr,unrelated_project,
        'projects/' || unrelated_project || '/forge/' || unrelated_id ||
        '/' || gen_random_uuid(),1,4);
    RAISE EXCEPTION 'Cross-project registration was accepted';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
  IF public.rotate_forge_attachment_reference(capability,first_path,
      second_path,2,3) THEN
    RAISE EXCEPTION 'Stale forge attachment CAS was accepted';
  END IF;
  IF NOT public.rotate_forge_attachment_reference(capability,first_path,
      second_path,1,2) THEN
    RAISE EXCEPTION 'Valid forge attachment CAS was rejected';
  END IF;
  IF (SELECT storage_path FROM public.forge_attachment_objects
      WHERE id=capability) <> second_path THEN
    RAISE EXCEPTION 'Forge attachment reference did not rotate';
  END IF;
  IF public.reserve_forge_attachment_publications(pr,ARRAY[capability]) <> 1 THEN
    RAISE EXCEPTION 'Publication claim was not reserved';
  END IF;
  IF public.finish_forge_attachment_publications(pr,ARRAY[capability],false) <> 1 OR
      (SELECT published_at IS NOT NULL FROM public.forge_attachment_objects
        WHERE id=capability) THEN
    RAISE EXCEPTION 'Failed forge publication was not released';
  END IF;
  IF public.reserve_forge_attachment_publications(pr,ARRAY[capability]) <> 1 OR
      public.finish_forge_attachment_publications(pr,ARRAY[capability],true) <> 1 THEN
    RAISE EXCEPTION 'Published capability was not marked';
  END IF;
  UPDATE public.forge_attachment_objects SET created_at=now()-interval '31 days'
    WHERE id=capability;
  IF public.delete_abandoned_forge_attachment(capability,second_path) THEN
    RAISE EXCEPTION 'Published capability was deleted as abandoned';
  END IF;
  abandoned_path := 'projects/' || project || '/forge/' || abandoned ||
    '/' || gen_random_uuid();
  INSERT INTO storage.objects(bucket_id,name,user_metadata)
    VALUES('forge-attachments',abandoned_path,
      '{"minddy_encrypted":"true"}'::jsonb);
  INSERT INTO public.forge_attachment_objects(id,pr_id,project_id,storage_path,
    content_key_version,format_version,created_at)
    VALUES(abandoned,pr,project,abandoned_path,1,4,
      now()-interval '31 days');
  IF NOT public.delete_abandoned_forge_attachment(abandoned,abandoned_path) THEN
    RAISE EXCEPTION 'Abandoned capability was not deleted';
  END IF;
  PERFORM set_config('storage.allow_delete_query','true',true);
  DELETE FROM storage.objects WHERE bucket_id='forge-attachments'
    AND name IN (legacy,first_path,abandoned_path);
  IF public.forge_attachment_migration_complete() THEN
    RAISE EXCEPTION 'Unmarked protected-looking object passed completion';
  END IF;
  DELETE FROM public.forge_attachment_objects WHERE id=unmarked;
  DELETE FROM storage.objects WHERE bucket_id='forge-attachments'
    AND name=unmarked_path;
  IF NOT public.forge_attachment_migration_complete() THEN
    RAISE EXCEPTION 'Forge migration did not complete after cleanup';
  END IF;
  DELETE FROM public.projects WHERE id=project;
  IF EXISTS (SELECT 1 FROM public.forge_attachment_objects WHERE id=capability) THEN
    RAISE EXCEPTION 'Deleted project retained a forge attachment registration';
  END IF;
END $test$;
ROLLBACK;
