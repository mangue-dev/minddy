-- Rehearse issue source state and stale-writer rejection on disposable PostgreSQL.
\set ON_ERROR_STOP on
BEGIN;
DO $$ BEGIN
  IF current_database() NOT LIKE 'minddy_min591_%' THEN
    RAISE EXCEPTION 'Use an isolated minddy_min591_* database';
  END IF;
END $$;
CREATE TEMP TABLE issue_broadcasts(payload jsonb);
CREATE OR REPLACE FUNCTION realtime.send(payload jsonb, event text, topic text, private boolean DEFAULT true)
RETURNS void LANGUAGE plpgsql AS $$ BEGIN
  INSERT INTO pg_temp.issue_broadcasts VALUES(payload);
END $$;
DO $test$
DECLARE
  actor uuid := gen_random_uuid(); project uuid := gen_random_uuid();
  legacy uuid := gen_random_uuid(); fresh uuid := gen_random_uuid();
  cipher text := '{"format":3,"keyVersion":1,"data":"test-only-placeholder"}';
  before_time timestamptz;
BEGIN
  INSERT INTO auth.users(id) VALUES(actor);
  INSERT INTO public.projects(id,owner_id,name,key) VALUES(project,actor,'Private project','IST');
  -- A key created by another domain must not fence an unconverted issue project.
  PERFORM public.create_envelope_data_key_if_absent('project',project,'content','Zml4dHVyZQ==');
  INSERT INTO public.issues(id,project_id,number,title,description,plan,remote_url,automation_override)
    VALUES(legacy,project,1,'Private title','Private description','Private plan',
      'https://example.test/private','{"prompt":"Private prompt"}');
  IF EXISTS(SELECT 1 FROM issue_broadcasts WHERE payload::text LIKE '%Private%') THEN
    RAISE EXCEPTION 'legacy issue broadcast leaked content';
  END IF;
  SELECT updated_at INTO before_time FROM public.issues WHERE id=legacy;
  IF NOT public.migrate_issue_ciphertext(legacy,project,0,0) THEN
    RAISE EXCEPTION 'issue queue attempt failed';
  END IF;
  IF NOT public.migrate_issue_ciphertext(legacy,project,0,0,1,cipher) THEN
    RAISE EXCEPTION 'issue migration failed';
  END IF;
  IF public.migrate_issue_ciphertext(legacy,project,0,0,1,cipher) THEN
    RAISE EXCEPTION 'stale issue migration won';
  END IF;
  IF EXISTS(SELECT 1 FROM public.issues WHERE id=legacy AND
    (title IS NOT NULL OR description IS NOT NULL OR plan IS NOT NULL OR
      remote_url IS NOT NULL OR automation_override IS NOT NULL OR
      encryption_revision<>1 OR updated_at<>before_time)) THEN
    RAISE EXCEPTION 'issue migration retained content or changed edit metadata';
  END IF;
  IF NOT EXISTS(SELECT 1 FROM public.issue_encryption_scopes WHERE project_id=project) THEN
    RAISE EXCEPTION 'issue writer fence was not activated';
  END IF;
  BEGIN
    INSERT INTO public.issues(project_id,number,title) VALUES(project,2,'Obsolete writer');
    RAISE EXCEPTION 'obsolete issue writer accepted';
  EXCEPTION WHEN check_violation THEN NULL; END;
  BEGIN
    UPDATE public.issues SET title='Leaked' WHERE id=legacy;
    RAISE EXCEPTION 'encrypted issue accepted plaintext edit';
  EXCEPTION WHEN check_violation THEN NULL; END;
  BEGIN
    UPDATE public.issues SET encryption_revision=0 WHERE id=legacy;
    RAISE EXCEPTION 'issue revision rollback accepted';
  EXCEPTION WHEN check_violation THEN NULL; END;
  INSERT INTO public.issues(id,project_id,number,title,description,plan,remote_url,
    automation_override,encryption_version,encrypted_content)
    VALUES(fresh,project,2,NULL,NULL,NULL,NULL,NULL,1,cipher);
  UPDATE public.issues SET status='todo' WHERE id=fresh;
  IF EXISTS(SELECT 1 FROM public.issues WHERE id=fresh AND
    (title IS NOT NULL OR encryption_revision<>1)) THEN
    RAISE EXCEPTION 'metadata update corrupted issue source';
  END IF;
  IF has_table_privilege('authenticated','public.issues','INSERT') OR
     has_table_privilege('authenticated','public.issues','UPDATE') OR
     has_table_privilege('authenticated','public.issue_encryption_scopes','SELECT') OR
     has_function_privilege('authenticated','public.migrate_issue_ciphertext(uuid,uuid,bigint,integer,integer,text)','EXECUTE') THEN
    RAISE EXCEPTION 'issue client retained direct write or migration privilege';
  END IF;
  IF pg_get_viewdef('public.numo_conversation_history'::regclass, true) LIKE '%issue.title%' OR
     NOT EXISTS (SELECT 1 FROM pg_class WHERE oid='public.numo_conversation_history'::regclass
       AND reloptions @> ARRAY['security_invoker=true']) THEN
    RAISE EXCEPTION 'Numo history retained issue plaintext or lost invoker security';
  END IF;
  IF EXISTS(SELECT 1 FROM issue_broadcasts WHERE payload::text LIKE '%Private%' OR
    payload::text LIKE '%test-only-placeholder%') THEN
    RAISE EXCEPTION 'issue broadcast leaked protected content';
  END IF;
END;
$test$;
ROLLBACK;
