\set ON_ERROR_STOP on
BEGIN;
DO $$ BEGIN
  IF current_database() NOT LIKE 'minddy_min591_%' THEN
    RAISE EXCEPTION 'Use an isolated minddy_min591_* database';
  END IF;
END $$;
DO $test$
DECLARE actor uuid := gen_random_uuid(); project uuid := gen_random_uuid();
  view_one uuid := gen_random_uuid(); view_two uuid := gen_random_uuid();
  share_one uuid := gen_random_uuid(); share_two uuid := gen_random_uuid();
  cipher text := 'mdys3:1:eyJmb3JtYXQiOjMsImtleVZlcnNpb24iOjF9';
  rejected boolean := false; result jsonb;
BEGIN
  INSERT INTO auth.users(id) VALUES(actor);
  INSERT INTO public.projects(id,owner_id,name,key)
    VALUES(project,actor,'Share fixture','SHARE');
  INSERT INTO public.views(id,project_id,name)
    VALUES(view_one,project,'First'),(view_two,project,'Second');
  INSERT INTO public.view_shares(id,view_id,level,token)
    VALUES(share_one,view_one,'public','legacy-private-token');
  IF NOT public.migrate_view_share_token(share_one,'legacy-private-token',
      cipher,repeat('a',64)) OR
     public.migrate_view_share_token(share_one,'legacy-private-token',
      cipher,repeat('a',64)) THEN
    RAISE EXCEPTION 'Share token CAS failed';
  END IF;
  IF EXISTS(SELECT 1 FROM public.view_shares WHERE id=share_one AND
      (token='legacy-private-token' OR token_lookup IS NULL)) THEN
    RAISE EXCEPTION 'Clear share token survived migration';
  END IF;
  result := public.upsert_view_share_guarded_protected(share_two,
    view_two,'public','mdys3:1:eyJmb3JtYXQiOjN9',repeat('b',64),NULL,NULL,actor);
  IF result->>'status' <> 'ok' OR
      (result->'share'->>'id')::uuid <> share_two THEN
    RAISE EXCEPTION 'Protected share upsert failed';
  END IF;
  BEGIN
    PERFORM public.upsert_view_share_guarded(gen_random_uuid(),
      'public','old-plaintext-token',NULL,NULL,actor);
  EXCEPTION WHEN check_violation THEN rejected := true; END;
  IF NOT rejected THEN
    RAISE EXCEPTION 'Legacy share writer accepted plaintext';
  END IF;
  IF has_function_privilege('authenticated',
      'public.migrate_view_share_token(uuid,text,text,text)','EXECUTE') THEN
    RAISE EXCEPTION 'Share token migration has client privilege';
  END IF;
END;
$test$;
ROLLBACK;
