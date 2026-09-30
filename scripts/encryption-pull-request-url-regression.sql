\set ON_ERROR_STOP on
BEGIN;
DO $$ BEGIN
  IF current_database() NOT LIKE 'minddy_min591_%' THEN
    RAISE EXCEPTION 'Use an isolated minddy_min591_* database';
  END IF;
END $$;
DO $test$
DECLARE legacy uuid := gen_random_uuid(); fresh uuid := gen_random_uuid();
  actor uuid := gen_random_uuid(); project uuid := gen_random_uuid();
  conversation uuid := gen_random_uuid(); connection uuid := gen_random_uuid();
  link uuid := gen_random_uuid(); run uuid := gen_random_uuid();
  legacy_url text := 'https://example.invalid/private/repo/pull/11';
  encoded text := 'mdyq3:1:eyJmb3JtYXQiOjMsImtleVZlcnNpb24iOjF9';
  run_cipher text := 'mdyp3:1:eyJmb3JtYXQiOjMsImtleVZlcnNpb24iOjF9';
  result jsonb; rejected boolean;
BEGIN
  INSERT INTO public.pull_requests(id,provider,repo_full_name,number,url)
    VALUES(legacy,'github','private/repo',11,legacy_url);
  IF NOT public.migrate_pull_request_url(legacy,legacy_url) THEN
    RAISE EXCEPTION 'PR URL attempt failed';
  END IF;
  IF (SELECT url_encryption_attempted_at IS NULL OR
       url_encryption_checked_at IS NOT NULL FROM public.pull_requests WHERE id=legacy) THEN
    RAISE EXCEPTION 'PR URL attempt was incorrectly verified';
  END IF;
  IF NOT public.migrate_pull_request_url(legacy,legacy_url,encoded) OR
      public.migrate_pull_request_url(legacy,legacy_url,encoded) THEN
    RAISE EXCEPTION 'Pull request URL CAS failed';
  END IF;
  IF EXISTS (SELECT 1 FROM public.pull_requests WHERE id=legacy AND
      url LIKE '%private/repo%') THEN
    RAISE EXCEPTION 'Pull request URL remains clear';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.pull_request_url_encryption_scope) THEN
    RAISE EXCEPTION 'Pull request URL activation marker missing';
  END IF;
  rejected := false;
  BEGIN
    UPDATE public.pull_requests SET url=legacy_url WHERE id=legacy;
  EXCEPTION WHEN check_violation THEN rejected := true; END;
  IF NOT rejected THEN RAISE EXCEPTION 'Obsolete update accepted'; END IF;
  rejected := false;
  BEGIN
    INSERT INTO public.pull_requests(provider,repo_full_name,number,url)
      VALUES('github','private/repo',12,legacy_url);
  EXCEPTION WHEN check_violation THEN rejected := true; END;
  IF NOT rejected THEN RAISE EXCEPTION 'Obsolete insert accepted'; END IF;
  result := public.upsert_pull_request_monotonic(jsonb_build_object(
    'id',fresh,'provider','github','repo_full_name','private/repo',
    'number',12,'state','open','url',encoded));
  IF result->'row'->>'id' IS DISTINCT FROM fresh::text OR
      result->'row'->>'url' IS DISTINCT FROM encoded THEN
    RAISE EXCEPTION 'Encrypted monotonic upsert did not retain its identity';
  END IF;
  result := public.upsert_pull_request_monotonic(jsonb_build_object(
    'id',fresh,'provider','github','repo_full_name','private/repo',
    'number',12,'state','merged','url',encoded,
    'updated_at',(now() + interval '1 hour')::text));
  IF result->>'applied' IS DISTINCT FROM 'true' THEN
    RAISE EXCEPTION 'Encrypted monotonic update was not applied';
  END IF;
  rejected := false;
  BEGIN
    PERFORM public.upsert_pull_request_monotonic(jsonb_build_object(
      'id',gen_random_uuid(),'provider','github','repo_full_name','private/repo',
      'number',12,'state','closed','url',encoded,
      'updated_at',(now() + interval '2 hour')::text));
  EXCEPTION WHEN check_violation THEN rejected := true; END;
  IF NOT rejected THEN RAISE EXCEPTION 'Conflicting URL identity accepted'; END IF;
  rejected := false;
  BEGIN
    PERFORM public.upsert_pull_request_monotonic(jsonb_build_object(
      'provider','github','repo_full_name','private/repo',
      'number',12,'state','closed','url',legacy_url,
      'updated_at',(now() + interval '2 hour')::text));
  EXCEPTION WHEN check_violation THEN rejected := true; END;
  IF NOT rejected THEN RAISE EXCEPTION 'Obsolete RPC writer accepted'; END IF;
  INSERT INTO auth.users(id) VALUES(actor);
  INSERT INTO public.projects(id,owner_id,name,key)
    VALUES(project,actor,'PR URL fixture','SHURL');
  INSERT INTO public.git_connections(id,user_id,provider)
    VALUES(connection,actor,'github');
  INSERT INTO public.project_git_links(id,project_id,connection_id,provider,
    external_repo_id,repo_full_name) VALUES(link,project,connection,'github',
      'shared-pr-url-fixture','private/repo');
  INSERT INTO public.agent_conversations(id,project_id,owner_id)
    VALUES(conversation,project,actor);
  INSERT INTO public.agent_runs(id,project_id,conversation_id,created_by,
    repo_link_id,connection_id,repo_provider,repo_external_id,pr_number)
    VALUES(run,project,conversation,actor,link,connection,'github',
      'shared-pr-url-fixture',12);
  IF NOT public.sync_agent_run_pr_url(fresh,
      (SELECT updated_at FROM public.pull_requests WHERE id=fresh),encoded,
      run,NULL,run_cipher) THEN
    RAISE EXCEPTION 'Bound run URL CAS failed';
  END IF;
  IF EXISTS (SELECT 1 FROM public.agent_runs WHERE id=run AND
      pr_url LIKE '%private/repo%') OR
     EXISTS (SELECT 1 FROM public.agent_artifacts WHERE run_id=run AND
      url LIKE '%private/repo%') OR
     EXISTS (SELECT 1 FROM public.numo_artifacts WHERE run_id=run AND
      url LIKE '%private/repo%') OR
     NOT EXISTS (SELECT 1 FROM public.agent_artifacts WHERE run_id=run AND
      url=run_cipher AND url_bound_run_id=run) THEN
    RAISE EXCEPTION 'Shared PR URL copy or projection is clear or unbound';
  END IF;
  IF public.sync_agent_run_pr_url(fresh,now() - interval '1 day',encoded,
      run,run_cipher,run_cipher) THEN
    RAISE EXCEPTION 'Stale forge URL observation accepted';
  END IF;
  PERFORM public.sync_agent_runs_from_pull_request('github','private/repo',12);
  IF (SELECT pr_url FROM public.agent_runs WHERE id=run) IS DISTINCT FROM
      run_cipher THEN
    RAISE EXCEPTION 'SQL state sync copied an incompatible forge cipher';
  END IF;
  rejected := false;
  BEGIN
    UPDATE public.agent_runs SET pr_url=legacy_url WHERE id=run;
  EXCEPTION WHEN check_violation THEN rejected := true; END;
  IF NOT rejected THEN RAISE EXCEPTION 'Obsolete run URL writer accepted'; END IF;
  IF has_function_privilege('authenticated',
      'public.migrate_pull_request_url(uuid,text,text,boolean)','EXECUTE') THEN
    RAISE EXCEPTION 'Migration has client execute privilege';
  END IF;
  UPDATE public.pull_requests SET url=encoded || 'A' WHERE id=legacy;
  IF (SELECT url_encryption_checked_at IS NOT NULL FROM public.pull_requests
      WHERE id=legacy) OR
     public.migrate_pull_request_url(legacy,encoded,p_verified=>true) THEN
    RAISE EXCEPTION 'Changed PR URL retained stale verification';
  END IF;
  IF has_function_privilege('authenticated',
      'public.sync_agent_run_pr_url(uuid,timestamptz,text,uuid,text,text)',
      'EXECUTE') THEN
    RAISE EXCEPTION 'Run URL sync has client execute privilege';
  END IF;
END;
$test$;
ROLLBACK;
