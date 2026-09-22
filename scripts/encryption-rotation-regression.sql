-- Run against an isolated migrated database as its migration administrator.
-- Test-only wrapped-key placeholders never reach KMS. Every write is rolled back.
\set ON_ERROR_STOP on
BEGIN;

DO $test$
DECLARE
  failing_scope uuid := gen_random_uuid();
  healthy_scope uuid := gen_random_uuid();
  index_scope uuid := gen_random_uuid();
  candidate uuid;
BEGIN
  INSERT INTO public.envelope_data_keys
    (scope_kind, scope_id, purpose, version, wrapped_key, is_current, created_at)
  VALUES
    ('user', failing_scope, 'content', 1, 'AA==', true, now() - interval '200 days'),
    ('user', healthy_scope, 'content', 1, 'AA==', true, now() - interval '100 days'),
    ('user', index_scope, 'blind_index', 1, 'AA==', true, now() - interval '300 days');

  IF NOT has_column_privilege('service_role', 'public.envelope_data_keys', 'rotation_attempted_at', 'UPDATE')
     OR has_column_privilege('service_role', 'public.envelope_data_keys', 'wrapped_key', 'UPDATE')
     OR has_column_privilege('service_role', 'public.envelope_data_keys', 'version', 'UPDATE')
     OR has_column_privilege('authenticated', 'public.envelope_data_keys', 'rotation_attempted_at', 'UPDATE')
     OR has_table_privilege('anon', 'public.envelope_data_keys', 'SELECT') THEN
    RAISE EXCEPTION 'incorrect rotation metadata privileges';
  END IF;

  SET LOCAL ROLE service_role;
  SELECT scope_id INTO candidate FROM public.envelope_data_keys
    WHERE purpose = 'content' AND is_current AND created_at < now() - interval '90 days'
      AND scope_id IN (failing_scope, healthy_scope, index_scope)
    ORDER BY rotation_attempted_at ASC NULLS FIRST, created_at, scope_kind, scope_id LIMIT 1;
  IF candidate IS DISTINCT FROM failing_scope THEN RAISE EXCEPTION 'wrong initial rotation candidate'; END IF;

  UPDATE public.envelope_data_keys SET rotation_attempted_at = now()
    WHERE scope_kind = 'user' AND scope_id = failing_scope AND purpose = 'content'
      AND version = 1 AND is_current;
  -- Simulate KMS failure: the key remains current and overdue, but cannot block the next tenant.
  SELECT scope_id INTO candidate FROM public.envelope_data_keys
    WHERE purpose = 'content' AND is_current AND created_at < now() - interval '90 days'
      AND scope_id IN (failing_scope, healthy_scope, index_scope)
    ORDER BY rotation_attempted_at ASC NULLS FIRST, created_at, scope_kind, scope_id LIMIT 1;
  IF candidate IS DISTINCT FROM healthy_scope THEN RAISE EXCEPTION 'failing scope starved another tenant'; END IF;

  BEGIN
    UPDATE public.envelope_data_keys SET wrapped_key = 'AQ==' WHERE scope_id = failing_scope;
    RAISE EXCEPTION 'service role could replace wrapped key material directly';
  EXCEPTION WHEN insufficient_privilege THEN
    NULL;
  END;
  IF NOT public.rotate_envelope_data_key('user', failing_scope, 'content', 1, 'AQ==') THEN
    RAISE EXCEPTION 'guarded rotation stopped working after direct grants were revoked';
  END IF;
  IF public.rotate_envelope_data_key('user', failing_scope, 'content', 1, 'Ag==') THEN
    RAISE EXCEPTION 'guarded rotation accepted a stale expected version';
  END IF;
  IF (public.create_envelope_data_key_if_absent('user', failing_scope, 'content', 'Ag==')).version <> 2 THEN
    RAISE EXCEPTION 'first-key creation failed to preserve the winning current version';
  END IF;
  RESET ROLE;
END;
$test$;

ROLLBACK;
