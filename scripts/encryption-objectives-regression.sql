-- Rehearse objective encryption, guarded mutations and redacted broadcasts on an isolated database.
\set ON_ERROR_STOP on
BEGIN;
DO $$ BEGIN
  IF current_database() NOT LIKE 'minddy_min591_%' THEN
    RAISE EXCEPTION 'Use an isolated minddy_min591_* database';
  END IF;
END $$;
CREATE TEMP TABLE objective_broadcasts(payload jsonb);
GRANT INSERT ON objective_broadcasts TO postgres;
CREATE OR REPLACE FUNCTION realtime.broadcast_changes(
  topic_name text, event_name text, operation text, table_name text,
  table_schema text, new record, old record, level text DEFAULT 'ROW'
) RETURNS void LANGUAGE plpgsql AS $$ BEGIN
  IF table_name = 'objectives' THEN
    INSERT INTO pg_temp.objective_broadcasts VALUES
      (jsonb_build_object('topic', topic_name, 'new', to_jsonb(new), 'old', to_jsonb(old)));
  END IF;
END $$;
DO $test$
DECLARE
  actor uuid := gen_random_uuid(); outsider uuid := gen_random_uuid();
  project uuid := gen_random_uuid(); legacy uuid := gen_random_uuid(); protected uuid := gen_random_uuid();
  stamp timestamptz := '2026-01-01T00:00:00Z'; result jsonb; count_before integer;
  cipher text := '{"format":3,"keyVersion":1,"data":"test-only-placeholder"}';
BEGIN
  INSERT INTO auth.users(id) VALUES(actor), (outsider);
  INSERT INTO public.projects(id,owner_id,name,key) VALUES(project,actor,'Private project','OBJ');
  INSERT INTO public.objectives(id,project_id,name,description,updated_at)
    VALUES(legacy,project,'Private objective','Private description',stamp);
  IF EXISTS(SELECT 1 FROM objective_broadcasts WHERE payload::text LIKE '%Private%') THEN
    RAISE EXCEPTION 'realtime leaked legacy objective content';
  END IF;
  SELECT count(*) INTO count_before FROM objective_broadcasts;
  IF NOT public.migrate_objective_ciphertext(legacy,project,0,0) THEN RAISE EXCEPTION 'queue attempt failed'; END IF;
  IF NOT public.migrate_objective_ciphertext(legacy,project,0,0,1,cipher) THEN RAISE EXCEPTION 'migration failed'; END IF;
  IF public.migrate_objective_ciphertext(legacy,project,0,0,1,cipher) THEN RAISE EXCEPTION 'stale CAS won'; END IF;
  IF EXISTS(SELECT 1 FROM public.objectives WHERE id=legacy AND
    (name IS NOT NULL OR description IS NOT NULL OR updated_at<>stamp OR encryption_revision<>1)) THEN
    RAISE EXCEPTION 'migration retained plaintext or changed timestamp';
  END IF;
  IF (SELECT count(*) FROM objective_broadcasts)<>count_before THEN RAISE EXCEPTION 'maintenance broadcast'; END IF;
  BEGIN
    UPDATE public.objectives SET name='Leaked' WHERE id=legacy;
    RAISE EXCEPTION 'plaintext edit accepted';
  EXCEPTION WHEN check_violation THEN NULL; END;
  BEGIN
    UPDATE public.objectives SET name='Downgrade',encryption_version=0,encrypted_content=NULL WHERE id=legacy;
    RAISE EXCEPTION 'downgrade accepted';
  EXCEPTION WHEN check_violation THEN NULL; END;
  BEGIN
    UPDATE public.objectives SET project_id=outsider WHERE id=legacy;
    RAISE EXCEPTION 'owner changed';
  EXCEPTION WHEN check_violation THEN NULL; END;
  IF has_table_privilege('authenticated','public.objectives','INSERT') OR
     has_table_privilege('authenticated','public.objectives','UPDATE') THEN
    RAISE EXCEPTION 'direct client write privilege remained';
  END IF;
  PERFORM public.create_envelope_data_key_if_absent('project',project,'content','Zml4dHVyZQ==');
  BEGIN
    INSERT INTO public.objectives(project_id,name) VALUES(project,'Obsolete plaintext writer');
    RAISE EXCEPTION 'plaintext insert accepted after key creation';
  EXCEPTION WHEN check_violation THEN NULL; END;
  result := public.create_objective_guarded(project,actor,jsonb_build_object(
    'id',protected,'name',NULL,'description',NULL,'encrypted_content',cipher,'encryption_version',1));
  IF result->>'id'<>protected::text OR result->>'name' IS NOT NULL THEN
    RAISE EXCEPTION 'guarded encrypted creation failed';
  END IF;
  result := public.update_objective_guarded(protected,actor,jsonb_build_object(
    'status','in_progress','encryption_revision',0));
  IF result->'objective'->>'status'<>'in_progress' OR
     (result->'objective'->>'encryption_revision')::integer<>1 THEN
    RAISE EXCEPTION 'guarded metadata update failed';
  END IF;
  BEGIN
    PERFORM public.update_objective_guarded(protected,actor,jsonb_build_object(
      'status','done','encryption_revision',0));
    RAISE EXCEPTION 'stale guarded update accepted';
  EXCEPTION WHEN SQLSTATE '40001' THEN NULL; END;
  IF EXISTS(SELECT 1 FROM objective_broadcasts WHERE payload::text LIKE '%Private%' OR
    payload::text LIKE '%test-only-placeholder%') THEN
    RAISE EXCEPTION 'realtime leaked objective content';
  END IF;
  INSERT INTO public.issues(project_id,number,title,status,assignee_id,objective_id,completed_at)
    VALUES(project,1,'Test issue','done',actor,protected,clock_timestamp());
  INSERT INTO public.stat_events(user_id,kind,occurred_at,project_id,issue_id)
    SELECT actor,'issue_completed',clock_timestamp(),project,id FROM public.issues WHERE project_id=project AND number=1;
  PERFORM set_config('request.jwt.claims',jsonb_build_object('role','authenticated','sub',actor)::text,true);
  result := public.get_user_stats('UTC',clock_timestamp()-interval '1 day');
  IF jsonb_array_length(result->'per_objective')<>1 OR
    result->'per_objective'->0->>'id'<>protected::text OR
    result->'per_objective'->0->>'name' IS NOT NULL THEN
    RAISE EXCEPTION 'statistics retained objective plaintext or lost its count';
  END IF;
END;
$test$;
ROLLBACK;
