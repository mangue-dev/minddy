\set ON_ERROR_STOP on
BEGIN;
DO $$ BEGIN
  IF current_database() NOT LIKE 'minddy_min591_%' THEN
    RAISE EXCEPTION 'Use an isolated minddy_min591_* database';
  END IF;
END $$;
DO $test$
<<proof_fixture>>
DECLARE actor uuid := gen_random_uuid(); project uuid := gen_random_uuid();
  connection uuid := gen_random_uuid(); pr uuid := gen_random_uuid();
  id uuid := gen_random_uuid(); later uuid := gen_random_uuid(); legacy text;
  first_path text; second_path text; later_path text; digest text;
BEGIN
  INSERT INTO auth.users(id) VALUES(actor);
  INSERT INTO public.projects(id,owner_id,name,key) VALUES(project,actor,'Proof fixture','FAPR');
  INSERT INTO public.git_connections(id,user_id,provider) VALUES(connection,actor,'github');
  INSERT INTO public.project_git_links(project_id,connection_id,provider,external_repo_id,repo_full_name)
    VALUES(project,connection,'github','proof-fixture','proof/fixture');
  INSERT INTO public.pull_requests(id,provider,repo_full_name,number) VALUES(pr,'github','proof/fixture',1);
  legacy := pr || '/' || gen_random_uuid() || '/fixture.bin';
  digest := encode(extensions.digest(legacy,'sha256'),'hex');
  first_path := 'projects/' || project || '/forge/' || id || '/' || gen_random_uuid();
  second_path := 'projects/' || project || '/forge/' || id || '/' || gen_random_uuid();
  later_path := 'projects/' || project || '/forge/' || later || '/' || gen_random_uuid();
  INSERT INTO storage.objects(bucket_id,name) VALUES('forge-attachments',legacy);
  PERFORM public.activate_forge_attachment_encryption();
  INSERT INTO storage.objects(bucket_id,name,user_metadata)
    VALUES('forge-attachments',first_path,'{"minddy_encrypted":"true"}'),
      ('forge-attachments',second_path,'{"minddy_encrypted":"true"}'),
      ('forge-attachments',later_path,'{"minddy_encrypted":"true"}');
  INSERT INTO public.forge_attachment_objects(id,pr_id,project_id,storage_path,
    legacy_path_digest,content_key_version,format_version)
    VALUES(id,pr,project,first_path,digest,1,4),(later,pr,project,later_path,NULL,1,4);
  BEGIN
    UPDATE public.forge_attachment_objects SET rotation_checked_at=clock_timestamp(),
      verified_object_digest=repeat('c',64) WHERE forge_attachment_objects.id=proof_fixture.id;
    RAISE EXCEPTION 'Direct marker update manufactured proof';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
  IF public.forge_attachment_migration_complete() THEN RAISE EXCEPTION 'Clear source certified'; END IF;
  IF public.verify_forge_attachment_legacy_cleanup(digest,second_path,pr,project,1,repeat('a',64)) OR
      public.verify_forge_attachment_legacy_cleanup(digest,first_path,pr,gen_random_uuid(),1,repeat('a',64)) THEN
    RAISE EXCEPTION 'Conflicting cleanup proof accepted';
  END IF;
  IF NOT public.verify_forge_attachment_legacy_cleanup(digest,first_path,pr,project,1,repeat('a',64)) THEN
    RAISE EXCEPTION 'Valid cleanup proof refused';
  END IF;
  UPDATE public.forge_attachment_objects SET created_at=now()-interval '31 days'
    WHERE forge_attachment_objects.id=proof_fixture.id;
  IF public.delete_abandoned_forge_attachment(id,first_path) OR
      has_table_privilege('service_role','public.forge_attachment_objects','DELETE') THEN
    RAISE EXCEPTION 'Abandonment deleted a reserved cleanup registration';
  END IF;
  IF public.rotate_forge_attachment_reference(id,first_path,second_path,1,2) THEN
    RAISE EXCEPTION 'Rotation changed a reserved cleanup replacement';
  END IF;
  PERFORM set_config('storage.allow_delete_query','true',true);
  BEGIN
    DELETE FROM storage.objects WHERE bucket_id='forge-attachments' AND name=first_path;
    RAISE EXCEPTION 'Reserved cleanup replacement deleted';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
  BEGIN
    UPDATE storage.objects SET metadata='{"size":1}' WHERE bucket_id='forge-attachments' AND name=first_path;
    RAISE EXCEPTION 'Reserved cleanup replacement overwritten';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
  PERFORM public.mark_forge_attachment_rotation_checked(id,'stale-path',99);
  IF (SELECT rotation_checked_at IS NOT NULL OR verified_object_digest IS NOT NULL
      FROM public.forge_attachment_objects f WHERE f.id=proof_fixture.id) THEN
    RAISE EXCEPTION 'Old marker recreated proof';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.list_forge_attachment_rotation_candidates(1) c WHERE c.id=later) THEN
    RAISE EXCEPTION 'Failed CAS attempt starved later row';
  END IF;
  DELETE FROM storage.objects WHERE bucket_id='forge-attachments' AND name=legacy;
  IF NOT public.rotate_forge_attachment_reference(id,first_path,second_path,1,2) THEN
    RAISE EXCEPTION 'Cleanup completion did not release rotation';
  END IF;
  IF public.verify_forge_attachment_object(id,first_path,1,repeat('a',64)) THEN
    RAISE EXCEPTION 'Stale byte proof accepted';
  END IF;
  DELETE FROM storage.objects WHERE bucket_id='forge-attachments' AND name=first_path;
  PERFORM public.verify_forge_attachment_object(id,second_path,2,repeat('a',64));
  PERFORM public.verify_forge_attachment_object(later,later_path,1,repeat('b',64));
  IF NOT public.forge_attachment_migration_complete() THEN RAISE EXCEPTION 'Proof plumbing incomplete'; END IF;
  UPDATE storage.objects SET metadata='{"size":42}' WHERE bucket_id='forge-attachments' AND name=second_path;
  IF public.forge_attachment_migration_complete() THEN RAISE EXCEPTION 'Changed Storage retained proof'; END IF;
  DELETE FROM storage.objects WHERE bucket_id='forge-attachments' AND name=second_path;
  IF public.verify_forge_attachment_object(id,second_path,2,repeat('a',64)) THEN
    RAISE EXCEPTION 'Missing replacement certified after independent Storage restore';
  END IF;
  IF has_function_privilege('authenticated','public.verify_forge_attachment_object(uuid,text,integer,text)','EXECUTE') OR
      has_function_privilege('anon','public.verify_forge_attachment_legacy_cleanup(text,text,uuid,uuid,integer,text)','EXECUTE') THEN
    RAISE EXCEPTION 'Client can manufacture forge proof';
  END IF;
END $test$;
ROLLBACK;
