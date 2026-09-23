-- Rehearse category conversion and metadata-only derived statistics in an isolated database.
\set ON_ERROR_STOP on
BEGIN;
DO $$ BEGIN
  IF current_database() NOT LIKE 'minddy_min591_%' THEN
    RAISE EXCEPTION 'Use an isolated minddy_min591_* database';
  END IF;
END $$;
CREATE TEMP TABLE category_broadcasts(payload jsonb);
GRANT INSERT ON category_broadcasts TO postgres;
CREATE OR REPLACE FUNCTION realtime.broadcast_changes(
  topic_name text, event_name text, operation text, table_name text,
  table_schema text, new record, old record, level text DEFAULT 'ROW'
) RETURNS void LANGUAGE plpgsql AS $$ BEGIN
  IF table_name = 'categories' THEN
    INSERT INTO pg_temp.category_broadcasts VALUES
      (jsonb_build_object('topic', topic_name, 'new', to_jsonb(new), 'old', to_jsonb(old)));
  END IF;
END $$;
DO $test$
DECLARE
  actor uuid := gen_random_uuid(); project uuid := gen_random_uuid();
  legacy uuid := gen_random_uuid(); disposable uuid := gen_random_uuid(); issue uuid := gen_random_uuid();
  cipher text := '{"format":3,"keyVersion":1,"data":"test-only-placeholder"}';
  result jsonb; before_count integer; deleted boolean;
BEGIN
  INSERT INTO auth.users(id) VALUES(actor);
  INSERT INTO public.projects(id,owner_id,name,key) VALUES(project,actor,'Private project','CAT');
  INSERT INTO public.categories(id,project_id,name,color)
    VALUES(legacy,project,'Private category','#aabbcc');
  IF EXISTS(SELECT 1 FROM category_broadcasts WHERE payload::text LIKE '%Private category%') THEN
    RAISE EXCEPTION 'legacy category broadcast leaked content';
  END IF;
  SELECT count(*) INTO before_count FROM category_broadcasts;
  IF NOT public.migrate_category_ciphertext(legacy,project,0,0) THEN
    RAISE EXCEPTION 'category queue attempt failed';
  END IF;
  IF NOT public.migrate_category_ciphertext(legacy,project,0,0,1,cipher) THEN
    RAISE EXCEPTION 'category migration failed';
  END IF;
  IF public.migrate_category_ciphertext(legacy,project,0,0,1,cipher) THEN
    RAISE EXCEPTION 'stale category migration won';
  END IF;
  IF EXISTS(SELECT 1 FROM public.categories WHERE id=legacy AND
    (name IS NOT NULL OR encryption_revision<>1)) THEN
    RAISE EXCEPTION 'category migration retained plaintext or revision';
  END IF;
  IF (SELECT count(*) FROM category_broadcasts)<>before_count THEN
    RAISE EXCEPTION 'category maintenance broadcast';
  END IF;
  BEGIN
    UPDATE public.categories SET name='Leaked' WHERE id=legacy;
    RAISE EXCEPTION 'category plaintext edit accepted';
  EXCEPTION WHEN check_violation THEN NULL; END;
  BEGIN
    UPDATE public.categories SET project_id=gen_random_uuid() WHERE id=legacy;
    RAISE EXCEPTION 'category ownership changed';
  EXCEPTION WHEN check_violation THEN NULL; END;
  IF has_table_privilege('authenticated','public.categories','INSERT') OR
     has_table_privilege('authenticated','public.categories','UPDATE') OR
     has_table_privilege('authenticated','public.categories','DELETE') OR
     has_function_privilege('authenticated','public.delete_category_guarded(uuid,uuid,uuid)','EXECUTE') THEN
    RAISE EXCEPTION 'direct category client writes remained';
  END IF;
  PERFORM public.create_envelope_data_key_if_absent('project',project,'content','Zml4dHVyZQ==');
  BEGIN
    INSERT INTO public.categories(project_id,name,color) VALUES(project,'Obsolete writer','#aabbcc');
    RAISE EXCEPTION 'obsolete category writer accepted';
  EXCEPTION WHEN check_violation THEN NULL; END;
  INSERT INTO public.categories(id,project_id,name,color,encryption_version,encrypted_content)
    VALUES(disposable,project,NULL,'#aabbcc',1,cipher);
  deleted := public.delete_category_guarded(disposable,project,actor);
  IF NOT deleted OR EXISTS(SELECT 1 FROM public.categories WHERE id=disposable) THEN
    RAISE EXCEPTION 'guarded category deletion failed';
  END IF;
  UPDATE public.categories SET color='#bbccdd' WHERE id=legacy;
  IF (SELECT encryption_revision FROM public.categories WHERE id=legacy)<>2 THEN
    RAISE EXCEPTION 'category metadata revision not advanced';
  END IF;
  INSERT INTO public.issues(id,project_id,number,title,status,assignee_id,completed_at)
    VALUES(issue,project,1,'Test issue','done',actor,clock_timestamp());
  INSERT INTO public.issue_categories(issue_id,category_id) VALUES(issue,legacy);
  INSERT INTO public.stat_events(user_id,kind,occurred_at,project_id,issue_id)
    VALUES(actor,'issue_completed',clock_timestamp(),project,issue);
  PERFORM set_config('request.jwt.claims',jsonb_build_object('role','authenticated','sub',actor)::text,true);
  result := public.get_user_stats('UTC',clock_timestamp()-interval '1 day');
  IF jsonb_array_length(result->'per_category')<>1 OR
    result->'per_category'->0->>'id'<>legacy::text OR
    result->'per_category'->0->>'name' IS NOT NULL OR
    (result->'per_category'->0->>'completed')::integer<>1 THEN
    RAISE EXCEPTION 'category statistics leaked content or lost aggregation';
  END IF;
  IF EXISTS(SELECT 1 FROM category_broadcasts WHERE payload::text LIKE '%Private category%' OR
    payload::text LIKE '%test-only-placeholder%') THEN
    RAISE EXCEPTION 'category broadcast leaked protected content';
  END IF;
END;
$test$;
ROLLBACK;
