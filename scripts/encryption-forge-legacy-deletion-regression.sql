\set ON_ERROR_STOP on
BEGIN;
DO $$ BEGIN
  IF current_database() NOT LIKE 'minddy_min591_%' THEN
    RAISE EXCEPTION 'Use an isolated minddy_min591_* database';
  END IF;
END $$;
DO $test$
DECLARE actor uuid := gen_random_uuid();
  doomed uuid := gen_random_uuid(); survivor uuid := gen_random_uuid();
  connection uuid := gen_random_uuid();
  doomed_link uuid := gen_random_uuid(); survivor_link uuid := gen_random_uuid();
  old_pr uuid := gen_random_uuid(); twin uuid := gen_random_uuid();
  old_path text;
BEGIN
  INSERT INTO auth.users(id) VALUES(actor);
  INSERT INTO public.projects(id,owner_id,name,key)
    VALUES(doomed,actor,'Doomed forge project','FGDA'),
      (survivor,actor,'Surviving forge project','FGSA');
  INSERT INTO public.git_connections(id,user_id,provider)
    VALUES(connection,actor,'github');
  INSERT INTO public.project_git_links(id,project_id,connection_id,provider,
    external_repo_id,repo_full_name,repo_owner,repo_name)
    VALUES(doomed_link,doomed,connection,'github','591-legacy-delete',
      'old/repo','old','repo'),
      (survivor_link,survivor,connection,'github','591-legacy-delete',
      'old/repo','old','repo');
  INSERT INTO public.pull_requests(id,provider,repo_full_name,number)
    VALUES(old_pr,'github','old/repo',91),
      (twin,'github','new/repo',91);
  old_path := old_pr || '/' || gen_random_uuid() || '/ownerless.png';
  INSERT INTO storage.objects(bucket_id,name,created_at)
    VALUES('forge-attachments',old_path,now()-interval '2 hours');
  IF NOT public.reconcile_forge_repository_plain('github',
      '591-legacy-delete','new/repo','new','repo',jsonb_build_array(
        jsonb_build_object('id',doomed_link,'old','old/repo',
          'aliases',jsonb_build_array('old/repo')),
        jsonb_build_object('id',survivor_link,'old','old/repo',
          'aliases',jsonb_build_array('old/repo')))) THEN
    RAISE EXCEPTION 'Repository rename failed';
  END IF;
  IF (SELECT current_pr_id FROM public.forge_attachment_legacy_pr_aliases
      WHERE old_pr_id=old_pr) IS DISTINCT FROM twin THEN
    RAISE EXCEPTION 'Historical PR alias was not retained';
  END IF;
  DELETE FROM public.projects WHERE id=doomed;
  IF EXISTS(SELECT 1 FROM public.list_forge_attachment_orphans(100)
      WHERE name=old_path) THEN
    RAISE EXCEPTION 'Surviving project historical object was orphaned';
  END IF;
  DELETE FROM public.projects WHERE id=survivor;
  IF NOT EXISTS(SELECT 1 FROM public.list_forge_attachment_orphans(100)
      WHERE name=old_path) THEN
    RAISE EXCEPTION 'Ownerless historical object was hidden after final cascade';
  END IF;
  PERFORM set_config('storage.allow_delete_query','true',true);
  DELETE FROM storage.objects WHERE bucket_id='forge-attachments'
    AND name=old_path;
  IF EXISTS(SELECT 1 FROM storage.objects WHERE bucket_id='forge-attachments'
      AND name=old_path) THEN
    RAISE EXCEPTION 'Historical object remained after cleanup';
  END IF;
END $test$;
ROLLBACK;
