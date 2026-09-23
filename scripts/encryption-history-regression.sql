-- Exercise history migration and SQL consumers in an isolated database; roll back all fixtures.
\set ON_ERROR_STOP on
BEGIN;
DO $guard$
BEGIN
  IF current_database() NOT LIKE 'minddy_min591_%' THEN
    RAISE EXCEPTION 'Run this rehearsal only in an isolated minddy_min591_* database';
  END IF;
END;
$guard$;

CREATE TEMP TABLE history_broadcasts (payload jsonb);
GRANT INSERT ON history_broadcasts TO postgres;
CREATE OR REPLACE FUNCTION realtime.broadcast_changes(
  topic_name text, event_name text, operation text, table_name text,
  table_schema text, new record, old record, level text DEFAULT 'ROW'
) RETURNS void LANGUAGE plpgsql AS $spy$
BEGIN
  INSERT INTO pg_temp.history_broadcasts VALUES (jsonb_build_object(
    'topic', topic_name, 'new', to_jsonb(new), 'old', to_jsonb(old)));
END;
$spy$;

DO $test$
DECLARE
  actor uuid := gen_random_uuid();
  outsider uuid := gen_random_uuid();
  project uuid := gen_random_uuid();
  other_project uuid := gen_random_uuid();
  issue uuid := gen_random_uuid();
  page uuid := gen_random_uuid();
  other_page uuid := gen_random_uuid();
  event uuid := gen_random_uuid();
  snapshot uuid := gen_random_uuid();
  cipher text := '{"format":3,"keyVersion":1,"data":"test-only-placeholder"}';
  affected integer;
  totals jsonb;
BEGIN
  IF current_database() NOT LIKE 'minddy_min591_%' THEN
    RAISE EXCEPTION 'Run only in an isolated minddy_min591_* database';
  END IF;
  INSERT INTO auth.users(id) VALUES(actor), (outsider);
  INSERT INTO public.projects(id, owner_id, name, key) VALUES(project, actor, 'Private project', 'HIST'),
    (other_project, outsider, 'Other project', 'OTH');
  INSERT INTO public.issues(id, project_id, number, title, status, assignee_id, effort, completed_at)
    VALUES(issue, project, 1, 'Private title', 'done', actor, 's', now());
  INSERT INTO public.pages(id, project_id, title, position, created_by) VALUES(page, project, 'Private page', 0, actor),
    (other_page, other_project, 'Other page', 0, outsider);
  INSERT INTO public.issue_events(id, issue_id, actor_id, type, field, from_value, to_value, created_at)
    VALUES(event, issue, actor, 'updated', 'status', 'backlog', 'in_progress', now() - interval '1 hour');
  IF NOT EXISTS(SELECT 1 FROM public.issue_events WHERE id = event AND project_id = project AND starts_work) THEN
    RAISE EXCEPTION 'legacy writer lost owner or statistics projection';
  END IF;
  INSERT INTO public.page_versions(id, page_id, project_id, version, title, icon, content, author_id, author_kind)
    VALUES(snapshot, page, project, 1, 'Previous private title', 'book', '{"type":"doc"}', actor, 'human');
  BEGIN
    INSERT INTO public.page_versions(page_id, project_id, version, title, content, author_kind)
      VALUES(other_page, project, 1, 'Wrong owner', '{}', 'human');
    RAISE EXCEPTION 'cross-project snapshot accepted';
  EXCEPTION WHEN foreign_key_violation THEN NULL;
  END;
  BEGIN
    INSERT INTO public.issue_events(issue_id, project_id, actor_id, type)
      VALUES(issue, other_project, actor, 'created');
    RAISE EXCEPTION 'cross-project event accepted';
  EXCEPTION WHEN foreign_key_violation THEN NULL;
  END;
  UPDATE public.issue_events SET from_value = NULL, to_value = NULL, encrypted_content = cipher,
    encryption_version = 1, encryption_revision = 1 WHERE id = event AND encryption_revision = 0;
  UPDATE public.page_versions SET title = NULL, icon = NULL, content = NULL, encrypted_content = cipher,
    encryption_version = 1, encryption_revision = 1 WHERE id = snapshot AND encryption_revision = 0;
  UPDATE public.issue_events SET encryption_revision = 2 WHERE id = event AND encryption_revision = 0;
  GET DIAGNOSTICS affected = ROW_COUNT;
  IF affected <> 0 THEN RAISE EXCEPTION 'stale migration won'; END IF;
  BEGIN
    UPDATE public.issue_events SET to_value = 'leaked text', encryption_revision = 2 WHERE id = event;
    RAISE EXCEPTION 'plaintext activity accepted';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
  BEGIN
    UPDATE public.page_versions SET title = 'leaked title', encryption_revision = 2 WHERE id = snapshot;
    RAISE EXCEPTION 'plaintext snapshot accepted';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
  BEGIN
    UPDATE public.page_versions SET encrypted_content = NULL, encryption_version = 0,
      title = 'downgrade', content = '{}', encryption_revision = 2 WHERE id = snapshot;
    RAISE EXCEPTION 'snapshot downgrade accepted';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
  BEGIN
    UPDATE public.issue_events SET encrypted_content = '{"keyVersion":2}', encryption_version = 2 WHERE id = event;
    RAISE EXCEPTION 'unversioned activity mutation accepted';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
  BEGIN
    UPDATE public.page_versions SET page_id = other_page, project_id = other_project,
      encryption_revision = 2 WHERE id = snapshot;
    RAISE EXCEPTION 'snapshot moved';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
  BEGIN
    UPDATE public.issue_events SET id = gen_random_uuid(), encryption_revision = 2 WHERE id = event;
    RAISE EXCEPTION 'activity identity changed';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
  BEGIN
    UPDATE public.issue_events SET starts_work = false, encryption_revision = 2 WHERE id = event;
    RAISE EXCEPTION 'migration changed statistics';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
  BEGIN
    UPDATE public.pages SET project_id = other_project WHERE id = page;
    RAISE EXCEPTION 'snapshot key scope changed through its parent';
  EXCEPTION WHEN foreign_key_violation OR insufficient_privilege THEN
    IF SQLERRM <> 'cross_project_move' AND SQLSTATE <> '23503' THEN RAISE; END IF;
  END;
  UPDATE public.issue_events SET encrypted_content = '{"keyVersion":2}', encryption_version = 2,
    encryption_revision = 2 WHERE id = event AND encryption_revision = 1;
  UPDATE public.page_versions SET encrypted_content = '{"keyVersion":2}', encryption_version = 2,
    encryption_revision = 2 WHERE id = snapshot AND encryption_revision = 1;
  UPDATE public.issue_events SET encryption_checked_at = now() WHERE id = event;
  UPDATE public.page_versions SET encryption_checked_at = now() WHERE id = snapshot;

  IF NOT EXISTS (SELECT 1 FROM pg_temp.history_broadcasts
    WHERE payload ->> 'topic' = 'project:' || project AND payload #>> '{new,id}' = event::text) THEN
    RAISE EXCEPTION 'activity invalidation was not broadcast';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_temp.history_broadcasts WHERE
      payload #>> '{new,id}' = event::text AND (
        payload #>> '{new,from_value}' IS NOT NULL OR payload #>> '{new,to_value}' IS NOT NULL
        OR payload #>> '{new,encrypted_content}' IS NOT NULL)) THEN
    RAISE EXCEPTION 'activity broadcast disclosed content';
  END IF;
  IF (SELECT count(*) FROM pg_temp.history_broadcasts WHERE payload #>> '{new,id}' = event::text) <> 1 THEN
    RAISE EXCEPTION 'history maintenance broadcast a user activity change';
  END IF;

  PERFORM public.create_envelope_data_key_if_absent('project', project, 'content', 'Zml4dHVyZQ==');
  BEGIN
    INSERT INTO public.issue_events(issue_id, actor_id, type, to_value) VALUES(issue, actor, 'updated', 'obsolete writer');
    RAISE EXCEPTION 'stale activity writer leaked plaintext';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
  BEGIN
    INSERT INTO public.page_versions(page_id, project_id, version, title, content, author_kind)
      VALUES(page, project, 2, 'obsolete writer', '{}', 'human');
    RAISE EXCEPTION 'stale snapshot writer leaked plaintext';
  EXCEPTION WHEN check_violation THEN NULL;
  END;

  PERFORM set_config('request.jwt.claims', jsonb_build_object('sub', actor, 'role', 'authenticated')::text, true);
  SET LOCAL ROLE authenticated;
  SELECT public.get_cycle_stats() INTO totals;
  IF (totals #>> '{by_effort,0,sample}')::integer IS DISTINCT FROM 1
    OR (totals #>> '{by_effort,0,median_seconds}')::numeric IS DISTINCT FROM 3600 THEN
    RAISE EXCEPTION 'encrypted events broke duration statistics: %', totals;
  END IF;
  IF (SELECT count(*) FROM public.issue_events) <> 1 THEN RAISE EXCEPTION 'owner lost access to activity'; END IF;
  RESET ROLE;
  PERFORM set_config('request.jwt.claims', jsonb_build_object('sub', outsider, 'role', 'authenticated')::text, true);
  SET LOCAL ROLE authenticated;
  IF EXISTS(SELECT 1 FROM public.issue_events) OR EXISTS(SELECT 1 FROM public.page_versions) THEN
    RAISE EXCEPTION 'history RLS leaked another project';
  END IF;
  RESET ROLE;
  DELETE FROM public.pages WHERE id = page;
  IF EXISTS(SELECT 1 FROM public.page_versions WHERE id = snapshot) THEN RAISE EXCEPTION 'snapshot cascade failed'; END IF;
  DELETE FROM public.issues WHERE id = issue;
  IF EXISTS(SELECT 1 FROM public.issue_events WHERE id = event) THEN RAISE EXCEPTION 'event cascade failed'; END IF;
END;
$test$;
ROLLBACK;
