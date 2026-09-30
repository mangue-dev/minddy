-- Verify fair retries and exact progress CAS on disposable PostgreSQL only.
\set ON_ERROR_STOP on
BEGIN;
DO $$ BEGIN
  IF current_database() NOT LIKE 'minddy_min591_%' THEN
    RAISE EXCEPTION 'Use an isolated minddy_min591_* database';
  END IF;
END $$;

CREATE TEMP TABLE issue_broadcasts(payload jsonb);
CREATE OR REPLACE FUNCTION realtime.send(payload jsonb, event text, topic text,
  private boolean DEFAULT true)
RETURNS void LANGUAGE plpgsql AS $$ BEGIN
  INSERT INTO pg_temp.issue_broadcasts VALUES(payload);
END $$;

DO $test$
DECLARE actor uuid := gen_random_uuid(); project uuid := gen_random_uuid();
  first_id uuid := gen_random_uuid(); second_id uuid := gen_random_uuid();
  first_row public.issues%ROWTYPE; original_edit timestamptz;
  first_attempt timestamptz;
  before_broadcasts integer;
  cipher text := '{"format":3,"keyVersion":1,"data":"test-only-placeholder"}';
  expected jsonb;
BEGIN
  INSERT INTO auth.users(id) VALUES(actor);
  INSERT INTO public.projects(id,owner_id,name,key)
    VALUES(project,actor,'Worker fixture','WPR');
  INSERT INTO public.issues(id,project_id,number,title)
    VALUES(first_id,project,1,'Corrupt fixture'),
      (second_id,project,2,'Healthy fixture');
  SELECT * INTO first_row FROM public.issues WHERE id=first_id;
  SELECT count(*) INTO before_broadcasts FROM issue_broadcasts;
  original_edit := first_row.updated_at;
  expected := jsonb_build_object('id',first_id,'project_id',project,
    'encryption_revision',first_row.encryption_revision,
    'encryption_version',first_row.encryption_version,
    'encrypted_content',first_row.encrypted_content);
  IF public.record_encryption_backfill_progress('issues',
      'encryption_attempted_at',expected || jsonb_build_object(
        'project_id',gen_random_uuid()),false) THEN
    RAISE EXCEPTION 'Wrong owner won attempt CAS';
  END IF;
  SELECT encryption_attempted_at INTO first_attempt FROM public.issues
    WHERE id=first_id;
  IF first_attempt IS NULL OR
      (SELECT id FROM public.issues WHERE id IN (first_id,second_id)
        ORDER BY encryption_attempted_at NULLS FIRST,id LIMIT 1)<>second_id THEN
    RAISE EXCEPTION 'Conflicted head row blocked a later row';
  END IF;
  PERFORM pg_sleep(0.001);
  IF public.record_encryption_backfill_progress('issues',
      'encryption_attempted_at',expected || '{"encryption_revision":9}'::jsonb,false) THEN
    RAISE EXCEPTION 'Wrong revision won attempt CAS';
  END IF;
  IF (SELECT encryption_attempted_at<=first_attempt OR
      encryption_checked_at IS NOT NULL FROM public.issues WHERE id=first_id) THEN
    RAISE EXCEPTION 'Repeated conflict failed to advance attempt safely';
  END IF;
  IF public.record_encryption_backfill_progress('issues',
      'encryption_attempted_at',expected || '{"encryption_revision":9}'::jsonb,true) THEN
    RAISE EXCEPTION 'Conflict forged a verification proof';
  END IF;
  IF public.record_encryption_backfill_progress('issues',
      'encryption_attempted_at',expected || '{"encrypted_content":"wrong"}'::jsonb,false) THEN
    RAISE EXCEPTION 'Wrong ciphertext won attempt CAS';
  END IF;
  IF NOT public.record_encryption_backfill_progress('issues',
      'encryption_attempted_at',expected,false) THEN
    RAISE EXCEPTION 'Exact attempt CAS failed';
  END IF;
  IF (SELECT encryption_checked_at IS NOT NULL OR updated_at<>original_edit OR
      encryption_revision<>first_row.encryption_revision FROM public.issues
      WHERE id=first_id) THEN
    RAISE EXCEPTION 'Attempt changed verification or edit metadata: %',
      (SELECT jsonb_build_object('checked',encryption_checked_at,
        'updated',updated_at,'before',original_edit,'revision',encryption_revision)
        FROM public.issues WHERE id=first_id);
  END IF;
  IF (SELECT id FROM public.issues WHERE id IN (first_id,second_id)
      ORDER BY encryption_attempted_at NULLS FIRST,id LIMIT 1)<>second_id THEN
    RAISE EXCEPTION 'Failed head row starved a later row';
  END IF;
  IF NOT public.migrate_issue_ciphertext(first_id,project,0,0) THEN
    RAISE EXCEPTION 'Legacy worker attempt did not find row';
  END IF;
  IF (SELECT encryption_checked_at IS NOT NULL FROM public.issues
      WHERE id=first_id) THEN
    RAISE EXCEPTION 'Legacy worker forged a verification proof';
  END IF;
  IF NOT public.migrate_issue_ciphertext(first_id,project,0,0,1,cipher) THEN
    RAISE EXCEPTION 'Fixture conversion failed';
  END IF;
  IF public.record_encryption_backfill_progress('issues',
      'encryption_attempted_at',expected,true) THEN
    RAISE EXCEPTION 'Obsolete state won verification CAS';
  END IF;
  expected := jsonb_build_object('id',first_id,'project_id',project,
    'encryption_revision',1,'encryption_version',1,
    'encrypted_content',cipher);
  IF NOT public.record_encryption_backfill_progress('issues',
      'encryption_attempted_at',expected,true) THEN
    RAISE EXCEPTION 'Verified state could not be marked';
  END IF;
  IF (SELECT encryption_checked_at IS NULL OR updated_at<>original_edit
      FROM public.issues WHERE id=first_id) THEN
    RAISE EXCEPTION 'Verified marker changed edit metadata or was missing';
  END IF;
  IF (SELECT count(*) FROM issue_broadcasts)<>before_broadcasts THEN
    RAISE EXCEPTION 'Progress marker emitted realtime payload';
  END IF;
  BEGIN
    PERFORM public.record_encryption_backfill_progress('issues',
      'title',expected,false);
    RAISE EXCEPTION 'Unexpected progress column accepted';
  EXCEPTION WHEN invalid_parameter_value THEN NULL; END;
END
$test$;

DO $composite_identity$
DECLARE instance uuid := gen_random_uuid();
  first_name text := 'owner/first'; second_name text := 'owner/second';
BEGIN
  INSERT INTO public.forge_relay_instances(id,public_key)
    VALUES(instance,'isolated-fixture-public-key');
  INSERT INTO public.forge_relay_link_mirror(
    instance_id,provider,external_repo_id,repo_full_name)
    VALUES(instance,'github','first',first_name),
      (instance,'github','second',second_name);
  IF NOT public.record_encryption_backfill_progress(
      'forge_relay_link_mirror','repo_name_attempted_at',
      jsonb_build_object('instance_id',instance,'provider','github',
        'external_repo_id','first','repo_full_name',first_name),false) THEN
    RAISE EXCEPTION 'Composite mirror attempt failed';
  END IF;
  IF NOT EXISTS(SELECT 1 FROM public.forge_relay_link_mirror
      WHERE instance_id=instance AND external_repo_id='first'
        AND repo_name_attempted_at IS NOT NULL)
      OR EXISTS(SELECT 1 FROM public.forge_relay_link_mirror
      WHERE instance_id=instance AND external_repo_id='second'
        AND (repo_name_attempted_at IS NOT NULL OR repo_name_checked_at IS NOT NULL)) THEN
    RAISE EXCEPTION 'Mirror attempt crossed a composite identity';
  END IF;
  BEGIN
    PERFORM public.record_encryption_backfill_progress(
      'forge_relay_link_mirror','repo_name_attempted_at',
      jsonb_build_object('instance_id',instance,'repo_full_name',first_name),true);
    RAISE EXCEPTION 'Incomplete mirror identity was accepted';
  EXCEPTION WHEN invalid_parameter_value THEN NULL; END;
END
$composite_identity$;
ROLLBACK;
