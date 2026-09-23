-- Isolated PostgreSQL checks; all fixtures are rolled back.
\set ON_ERROR_STOP on
BEGIN;
DO $test$
DECLARE
  actor uuid := gen_random_uuid();
  other_actor uuid := gen_random_uuid();
  project uuid := gen_random_uuid();
  event_id uuid := gen_random_uuid();
  cipher text := '{"format":3,"keyVersion":1,"data":"test-only-placeholder"}';
  affected integer;
  totals jsonb;
BEGIN
  IF current_database() NOT LIKE 'minddy_min591_%' THEN
    RAISE EXCEPTION 'Run this rehearsal only in an isolated minddy_min591_* database';
  END IF;
  INSERT INTO auth.users(id) VALUES(actor), (other_actor);
  INSERT INTO public.projects(id, owner_id, name, key) VALUES(project, actor, 'Fixture project', 'CRYPTOTEST');
  INSERT INTO public.stat_events(id, user_id, kind, occurred_at, project_id, project_name, issue_title, task_text)
    VALUES(event_id, actor, 'scratchpad_task_completed', now(), project, 'private project snapshot', 'private issue snapshot', 'private task snapshot');
  INSERT INTO public.stat_events(user_id, kind, occurred_at) VALUES(other_actor, 'issue_created', now());
  UPDATE public.stat_events SET project_name = NULL, issue_title = NULL, task_text = NULL,
    encrypted_content = cipher, encryption_version = 1, encryption_revision = 1
    WHERE id = event_id AND encryption_revision = 0;
  GET DIAGNOSTICS affected = ROW_COUNT;
  IF affected <> 1 THEN RAISE EXCEPTION 'snapshot migration failed'; END IF;
  BEGIN
    UPDATE public.stat_events SET task_text = 'obsolete writer', encryption_revision = 2 WHERE id = event_id;
    RAISE EXCEPTION 'encrypted snapshot retained plaintext';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
  BEGIN
    UPDATE public.stat_events SET encrypted_content = NULL, encryption_version = 0,
      encryption_revision = 2 WHERE id = event_id;
    RAISE EXCEPTION 'plaintext downgrade was accepted';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
  BEGIN
    UPDATE public.stat_events SET encrypted_content = '{}' WHERE id = event_id;
    RAISE EXCEPTION 'ciphertext changed without a revision';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
  BEGIN
    UPDATE public.stat_events SET encrypted_content = '{}', encryption_revision = 2 WHERE id = event_id;
    RAISE EXCEPTION 'missing key version passed a nullable check';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
  BEGIN
    UPDATE public.stat_events SET user_id = other_actor WHERE id = event_id;
    RAISE EXCEPTION 'snapshot owner changed';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
  BEGIN
    UPDATE public.stat_events SET id = gen_random_uuid() WHERE id = event_id;
    RAISE EXCEPTION 'snapshot identity changed';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
  BEGIN
    UPDATE public.stat_events SET encryption_revision = 0 WHERE id = event_id;
    RAISE EXCEPTION 'snapshot revision moved backwards';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
  UPDATE public.stat_events SET encrypted_content = '{"keyVersion":2}', encryption_version = 2,
    encryption_revision = 2 WHERE id = event_id AND encryption_revision = 1;
  DELETE FROM public.projects WHERE id = project;
  IF NOT EXISTS (SELECT 1 FROM public.stat_events WHERE id = event_id AND project_id IS NULL
    AND user_id = actor AND encryption_version = 2 AND encrypted_content = '{"keyVersion":2}') THEN
    RAISE EXCEPTION 'deleting the source project destroyed its protected snapshot';
  END IF;

  PERFORM set_config('request.jwt.claims', jsonb_build_object('sub', actor, 'role', 'authenticated')::text, true);
  SET LOCAL ROLE authenticated;
  IF (SELECT count(*) FROM public.stat_events) <> 1 THEN RAISE EXCEPTION 'statistics RLS leaked another owner'; END IF;
  SELECT public.get_user_stats() INTO totals;
  IF (totals #>> '{totals,tasks_completed}')::integer <> 1 THEN
    RAISE EXCEPTION 'encryption broke SQL statistics aggregation';
  END IF;
  UPDATE public.stat_events SET encryption_checked_at = now() WHERE id = event_id;
  GET DIAGNOSTICS affected = ROW_COUNT;
  IF affected <> 0 THEN RAISE EXCEPTION 'authenticated caller updated append-only ledger'; END IF;
  RESET ROLE;
END;
$test$;
ROLLBACK;
