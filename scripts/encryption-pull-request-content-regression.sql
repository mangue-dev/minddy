\set ON_ERROR_STOP on
BEGIN;
DO $$ BEGIN
  IF current_database() NOT LIKE 'minddy_min591_%' THEN
    RAISE EXCEPTION 'Use an isolated minddy_min591_* database';
  END IF;
END $$;
DO $test$
DECLARE actor uuid := gen_random_uuid(); project uuid := gen_random_uuid();
  pr uuid := gen_random_uuid(); conversation uuid := gen_random_uuid();
  run uuid := gen_random_uuid(); connection uuid := gen_random_uuid();
  link uuid := gen_random_uuid();
  old_title text := 'Private issue-derived PR title';
  head text := 'private/issue-591'; base text := 'private/base';
  cipher text := 'mdym3:1:eyJmb3JtYXQiOjMsImtleVZlcnNpb24iOjF9';
  rejected boolean;
BEGIN
  INSERT INTO auth.users(id) VALUES(actor);
  INSERT INTO public.projects(id,owner_id,name,key)
    VALUES(project,actor,'PR content fixture','PRCT');
  INSERT INTO public.git_connections(id,user_id,provider)
    VALUES(connection,actor,'github');
  INSERT INTO public.project_git_links(id,project_id,connection_id,provider,
    external_repo_id,repo_full_name) VALUES(link,project,connection,'github',
      'pr-content-fixture','private/repo');
  INSERT INTO public.pull_requests(id,provider,repo_full_name,number,title,
    head_branch,base_branch) VALUES(pr,'github','private/repo',1,old_title,head,base);
  IF NOT public.migrate_pull_request_content(pr,old_title,head,base) THEN
    RAISE EXCEPTION 'PR content attempt failed';
  END IF;
  IF (SELECT content_encryption_attempted_at IS NULL OR
       content_encryption_checked_at IS NOT NULL FROM public.pull_requests WHERE id=pr) THEN
    RAISE EXCEPTION 'PR content attempt was incorrectly verified';
  END IF;
  INSERT INTO public.agent_conversations(id,project_id,owner_id)
    VALUES(conversation,project,actor);
  INSERT INTO public.agent_runs(id,project_id,conversation_id,created_by,
    repo_link_id,connection_id,repo_provider,repo_external_id,
    pull_request_id,pr_number) VALUES(run,project,conversation,actor,
      link,connection,'github','pr-content-fixture',pr,1);
  IF NOT public.migrate_pull_request_content(pr,old_title,head,base,
      cipher,cipher,cipher) OR
     public.migrate_pull_request_content(pr,old_title,head,base,
      cipher,cipher,cipher) THEN
    RAISE EXCEPTION 'PR content CAS failed';
  END IF;
  IF EXISTS (SELECT 1 FROM public.pull_requests WHERE id=pr AND
      (title LIKE '%Private issue%' OR head_branch LIKE '%private/issue%'
       OR base_branch LIKE '%private/base%')) THEN
    RAISE EXCEPTION 'PR source content remains clear';
  END IF;
  IF EXISTS (SELECT 1 FROM public.numo_conversation_history
      WHERE legacy_id=conversation AND title=cipher) THEN
    RAISE EXCEPTION 'Numo history projected a PR ciphertext as a title';
  END IF;
  rejected := false;
  BEGIN
    UPDATE public.pull_requests SET title='Private obsolete title' WHERE id=pr;
  EXCEPTION WHEN check_violation THEN rejected := true; END;
  IF NOT rejected THEN RAISE EXCEPTION 'Obsolete title writer accepted'; END IF;
  rejected := false;
  BEGIN
    PERFORM public.upsert_pull_request_monotonic(jsonb_build_object(
      'id',pr,'provider','github','repo_full_name','private/repo',
      'number',1,'state','open','title',old_title,
      'updated_at',(now() + interval '1 hour')::text));
  EXCEPTION WHEN check_violation THEN rejected := true; END;
  IF NOT rejected THEN RAISE EXCEPTION 'Obsolete RPC title writer accepted'; END IF;
  IF NOT public.migrate_pull_request_content(pr,cipher,cipher,cipher,
      p_verified=>true) THEN
    RAISE EXCEPTION 'Current PR content verification failed';
  END IF;
  IF public.migrate_pull_request_content(pr,old_title,head,base,
      cipher,cipher,cipher) THEN
    RAISE EXCEPTION 'Stale content CAS accepted';
  END IF;
  rejected := false;
  BEGIN
    INSERT INTO public.pull_requests(provider,repo_full_name,number,title)
      VALUES('github','private/repo',2,old_title);
  EXCEPTION WHEN check_violation THEN rejected := true; END;
  IF NOT rejected THEN RAISE EXCEPTION 'Obsolete PR insert accepted'; END IF;
  IF has_function_privilege('authenticated',
      'public.migrate_pull_request_content(uuid,text,text,text,text,text,text,boolean)',
      'EXECUTE') THEN
    RAISE EXCEPTION 'PR content migration has client execute privilege';
  END IF;
  UPDATE public.pull_requests SET title=cipher || 'A' WHERE id=pr;
  IF (SELECT content_encryption_checked_at IS NOT NULL FROM public.pull_requests
      WHERE id=pr) OR
     public.migrate_pull_request_content(pr,cipher,cipher,cipher,
       p_verified=>true) THEN
    RAISE EXCEPTION 'Changed PR content retained stale verification';
  END IF;
END;
$test$;
ROLLBACK;
