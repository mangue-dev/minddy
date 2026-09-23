-- Isolated-database rehearsal. All fixtures and the Realtime spy are rolled back.
\set ON_ERROR_STOP on
BEGIN;
DO $guard$
BEGIN
  IF current_database() NOT LIKE 'minddy_min591_%' THEN
    RAISE EXCEPTION 'Run this rehearsal only in an isolated minddy_min591_* database';
  END IF;
END;
$guard$;

CREATE TEMP TABLE scratchpad_broadcasts (payload jsonb);
GRANT INSERT ON scratchpad_broadcasts TO postgres;
CREATE OR REPLACE FUNCTION realtime.broadcast_changes(
  topic_name text, event_name text, operation text, table_name text,
  table_schema text, new record, old record, level text DEFAULT 'ROW'
) RETURNS void LANGUAGE plpgsql AS $spy$
BEGIN
  INSERT INTO pg_temp.scratchpad_broadcasts VALUES (jsonb_build_object(
    'topic', topic_name, 'new', to_jsonb(new), 'old', to_jsonb(old)));
END;
$spy$;

DO $test$
DECLARE
  actor uuid := gen_random_uuid();
  other_actor uuid := gen_random_uuid();
  before_timestamp timestamptz;
  affected integer;
  cipher text := '{"format":3,"keyVersion":1,"data":"test-only-placeholder"}';
BEGIN
  INSERT INTO auth.users (id) VALUES (actor), (other_actor);
  INSERT INTO public.user_scratchpad (user_id, content, rev, updated_at)
    VALUES (actor, 'private note fixture', 0, '2000-01-01'), (other_actor, 'other private fixture', 0, '2000-01-01');
  SELECT updated_at INTO before_timestamp FROM public.user_scratchpad WHERE user_id = actor;
  UPDATE public.user_scratchpad SET encryption_checked_at = now() WHERE user_id = actor;
  IF (SELECT updated_at FROM public.user_scratchpad WHERE user_id = actor) IS DISTINCT FROM before_timestamp THEN
    RAISE EXCEPTION 'migration attempt changed the user edit timestamp';
  END IF;
  IF (SELECT count(*) FROM pg_temp.scratchpad_broadcasts) <> 2 THEN
    RAISE EXCEPTION 'migration attempt emitted a user edit or the initial broadcast failed';
  END IF;

  PERFORM set_config('request.jwt.claims', jsonb_build_object('sub', actor, 'role', 'authenticated')::text, true);
  SET LOCAL ROLE authenticated;
  IF (SELECT count(*) FROM public.user_scratchpad) <> 1 THEN RAISE EXCEPTION 'personal note RLS leaked another owner'; END IF;
  UPDATE public.user_scratchpad SET content = NULL, encrypted_content = cipher, encryption_version = 1, rev = 1
    WHERE user_id = actor AND rev = 0;
  GET DIAGNOSTICS affected = ROW_COUNT;
  IF affected <> 1 THEN RAISE EXCEPTION 'initial migration did not commit'; END IF;
  UPDATE public.user_scratchpad SET content = 'stale writer', rev = 1 WHERE user_id = actor AND rev = 0;
  GET DIAGNOSTICS affected = ROW_COUNT;
  IF affected <> 0 THEN RAISE EXCEPTION 'stale writer overwrote migration'; END IF;

  BEGIN
    UPDATE public.user_scratchpad SET content = 'plaintext downgrade', encrypted_content = NULL,
      encryption_version = 0, rev = 2 WHERE user_id = actor;
    RAISE EXCEPTION 'plaintext downgrade was accepted';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
  BEGIN
    UPDATE public.user_scratchpad SET content = 'leftover plaintext', rev = 2 WHERE user_id = actor;
    RAISE EXCEPTION 'encrypted row retained plaintext';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
  BEGIN
    UPDATE public.user_scratchpad SET encrypted_content = '{"keyVersion":2}', rev = 2 WHERE user_id = actor;
    RAISE EXCEPTION 'mismatched key version was accepted';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
  BEGIN
    UPDATE public.user_scratchpad SET encrypted_content = '{}', rev = 2 WHERE user_id = actor;
    RAISE EXCEPTION 'missing key version passed a nullable check';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
  BEGIN
    UPDATE public.user_scratchpad SET encrypted_content = '{"keyVersion":1,"data":"changed"}' WHERE user_id = actor;
    RAISE EXCEPTION 'content changed without advancing the revision';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
  BEGIN
    UPDATE public.user_scratchpad SET rev = 0 WHERE user_id = actor;
    RAISE EXCEPTION 'revision downgrade was accepted';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
  RESET ROLE;
  BEGIN
    UPDATE public.user_scratchpad SET user_id = gen_random_uuid() WHERE user_id = actor;
    RAISE EXCEPTION 'owner relocation was accepted';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
  UPDATE public.user_scratchpad SET encryption_version = 2, encrypted_content = '{"keyVersion":2}', rev = 2
    WHERE user_id = actor AND rev = 1;
  IF (SELECT content IS NOT NULL OR encryption_version <> 2 OR rev <> 2 FROM public.user_scratchpad WHERE user_id = actor) THEN
    RAISE EXCEPTION 'key rotation lost the row state';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_temp.scratchpad_broadcasts
    WHERE payload #>> '{new,content}' IS NOT NULL OR payload #>> '{old,content}' IS NOT NULL
      OR payload #>> '{new,encrypted_content}' IS NOT NULL OR payload #>> '{old,encrypted_content}' IS NOT NULL) THEN
    RAISE EXCEPTION 'Realtime disclosed note content or ciphertext';
  END IF;
END;
$test$;
ROLLBACK;
