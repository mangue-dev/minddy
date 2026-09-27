\set ON_ERROR_STOP on
BEGIN;
DO $$ BEGIN
  IF current_database() NOT LIKE 'minddy_min591_%' THEN
    RAISE EXCEPTION 'Use an isolated minddy_min591_* database';
  END IF;
END $$;
DO $test$
DECLARE actor uuid:=gen_random_uuid(); project uuid:=gen_random_uuid();
  issue uuid:=gen_random_uuid(); invitation uuid:=gen_random_uuid();
  old_format_invitation uuid:=gen_random_uuid();
  attachment uuid:=gen_random_uuid(); old_path text; new_path text;
  old_id uuid; digest text:=repeat('a',64);
BEGIN
  INSERT INTO auth.users(id) VALUES(actor);
  INSERT INTO public.projects(id,owner_id,name,key)
    VALUES(project,actor,'Rotation fixture','ROT');
  INSERT INTO public.issues(id,project_id,number,title)
    VALUES(issue,project,1,'Rotation issue');
  INSERT INTO public.plan_storage_quotas(plan_id,bytes)
    VALUES('free',1000000000) ON CONFLICT DO NOTHING;
  INSERT INTO public.envelope_data_keys(scope_kind,scope_id,purpose,version,
    wrapped_key,is_current) VALUES('project',project,'content',1,'YWJj',false),
    ('project',project,'content',2,'YWJj',true);
  INSERT INTO public.project_invitations(id,project_id,invited_by,status,token,
    invited_email_ciphertext,invited_email_blind_index,encryption_version)
    VALUES(invitation,project,actor,'pending','sha256:'||repeat('b',64),
      '{"format":3,"keyVersion":1}',repeat('c',64),1);
  IF NOT EXISTS (SELECT 1 FROM public.list_invitation_email_rotation_candidates(10)
      WHERE id=invitation) THEN
    RAISE EXCEPTION 'Historical invitation missing from rotation queue';
  END IF;
  INSERT INTO public.project_invitations(id,project_id,invited_by,status,token,
    invited_email_ciphertext,invited_email_blind_index,encryption_version)
    VALUES(old_format_invitation,project,actor,'pending','sha256:'||repeat('d',64),
      '{"format":1,"keyVersion":2}',repeat('e',64),2);
  IF NOT EXISTS (SELECT 1 FROM public.list_invitation_email_rotation_candidates(10)
      WHERE id=old_format_invitation) THEN
    RAISE EXCEPTION 'Historical envelope format missing from rotation queue';
  END IF;
  PERFORM public.record_invitation_email_rotation_attempt(invitation);
  IF NOT EXISTS (SELECT 1 FROM public.invitation_email_rotation_attempts
      WHERE invitation_id=invitation) THEN
    RAISE EXCEPTION 'Invitation rotation attempt missing';
  END IF;
  INSERT INTO storage.buckets(id,name) VALUES('attachments','attachments')
    ON CONFLICT DO NOTHING;
  old_path:='projects/'||project||'/'||gen_random_uuid();
  new_path:='projects/'||project||'/'||gen_random_uuid();
  INSERT INTO storage.objects(bucket_id,name,metadata)
    VALUES('attachments',old_path,'{"size":60}'::jsonb)
    RETURNING id INTO old_id;
  UPDATE storage.objects SET user_metadata='{"minddy_logical_size":12}'::jsonb
    WHERE id=old_id;
  INSERT INTO storage.objects(bucket_id,name,metadata,user_metadata)
    VALUES('attachments',new_path,'{"size":60}'::jsonb,
      '{"minddy_logical_size":12}'::jsonb);
  INSERT INTO public.attachment_object_encrypted(path,format_version,
    content_key_version) VALUES(old_path,3,1),(new_path,4,2);
  INSERT INTO public.attachments(id,project_id,issue_id,kind,storage_path,
    file_name,mime_type,size_bytes) VALUES(attachment,project,issue,'file',
    old_path,'rotation.txt','text/plain',12);
  IF NOT EXISTS (SELECT 1 FROM public.list_attachment_object_migration_candidates(10)
      WHERE id=old_id) THEN
    RAISE EXCEPTION 'Registered historical object missing from rotation queue';
  END IF;
  IF public.rotate_attachment_object_references(old_path,new_path,digest,4,1) THEN
    RAISE EXCEPTION 'Stale object compare-and-swap succeeded';
  END IF;
  IF NOT public.rotate_attachment_object_references(old_path,new_path,digest,3,1) THEN
    RAISE EXCEPTION 'Object reference rotation failed';
  END IF;
  IF (SELECT storage_path FROM public.attachments WHERE id=attachment)
      IS DISTINCT FROM new_path OR
      (SELECT alias.new_path FROM public.attachment_object_aliases alias
        WHERE alias.old_path_digest=digest) IS DISTINCT FROM new_path OR
      (SELECT replaced_by FROM public.attachment_object_encrypted
        WHERE path=old_path) IS DISTINCT FROM new_path THEN
    RAISE EXCEPTION 'Object rotation left an old reference';
  END IF;
  IF public.rotate_attachment_object_references(old_path,new_path,digest,3,1) THEN
    RAISE EXCEPTION 'Repeated object rotation succeeded';
  END IF;
  IF has_function_privilege('authenticated',
      'public.rotate_attachment_object_references(text,text,text,integer,integer)',
      'EXECUTE') THEN
    RAISE EXCEPTION 'Object rotation RPC has client privilege';
  END IF;
END;
$test$;
ROLLBACK;
