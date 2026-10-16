\set ON_ERROR_STOP on
BEGIN;
DO $$ BEGIN
  IF current_database() NOT LIKE 'minddy_min591_%' THEN
    RAISE EXCEPTION 'Use an isolated minddy_min591_* database';
  END IF;
END $$;
DO $test$
DECLARE legacy uuid := gen_random_uuid(); fresh uuid := gen_random_uuid();
  legacy_url text := 'https://example.invalid/private/repo/pull/11';
  encoded text := 'mdyq3:1:eyJmb3JtYXQiOjMsImtleVZlcnNpb24iOjF9';
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
END;
$test$;
ROLLBACK;
