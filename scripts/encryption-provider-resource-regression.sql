\set ON_ERROR_STOP on
BEGIN;
DO $$ BEGIN
  IF current_database() NOT LIKE 'minddy_min591_%' THEN
    RAISE EXCEPTION 'Use an isolated minddy_min591_* database';
  END IF;
END $$;
DO $test$
DECLARE actor uuid := gen_random_uuid();
  legacy text := 'github:private-org/private-repo:issue-591';
  indexed text := 'mdyp1:' || repeat('a',64);
  legacy_release text := 'gitlab:private-org/private-repo:pr-3';
  indexed_release text := 'mdyp1:' || repeat('b',64);
  first_id bigint; first_lease timestamptz;
  refused boolean := false; result jsonb;
BEGIN
  INSERT INTO auth.users(id) VALUES(actor);
  result := public.reserve_provider_operation(actor,'github','review',legacy,
    10,3600,60);
  IF result->>'state' <> 'reserved' THEN
    RAISE EXCEPTION 'Legacy fixture reservation failed';
  END IF;
  result := public.reserve_provider_operation(actor,'gitlab','review',
    legacy_release,10,3600,60);
  IF result->>'state' <> 'reserved' THEN
    RAISE EXCEPTION 'Legacy release fixture failed';
  END IF;
  result := public.reserve_provider_operation_protected(actor,'github',
    'review',legacy,indexed,10,3600,60);
  IF result->>'state' <> 'deduplicated' THEN
    RAISE EXCEPTION 'Protected reservation lost historical lease';
  END IF;
  SELECT id,lease_expires_at INTO first_id,first_lease
    FROM public.provider_operation_reservations WHERE resource_key=legacy;
  IF public.migrate_provider_operation_resource(first_id,legacy,indexed,
      first_lease - interval '1 second') THEN
    RAISE EXCEPTION 'Stale lease migration succeeded';
  END IF;
  IF NOT public.migrate_provider_operation_resource(first_id,legacy,indexed,
      first_lease) THEN
    RAISE EXCEPTION 'Lease conversion failed';
  END IF;
  IF NOT public.release_provider_operation_protected(actor,'gitlab',
      'review',legacy_release,indexed_release) THEN
    RAISE EXCEPTION 'Protected release lost historical lease';
  END IF;
  IF EXISTS (SELECT 1 FROM public.provider_operation_reservations
      WHERE resource_key LIKE '%private-repo%') THEN
    RAISE EXCEPTION 'Provider resource plaintext survived';
  END IF;
  result := public.reserve_provider_operation_protected(actor,'github',
    'review',legacy,indexed,10,3600,60);
  IF result->>'state' <> 'deduplicated' THEN
    RAISE EXCEPTION 'Indexed lease was not reused';
  END IF;
  BEGIN
    PERFORM public.reserve_provider_operation(actor,'github','review',legacy,
      10,3600,60);
  EXCEPTION WHEN check_violation THEN refused := true; END;
  IF NOT refused THEN RAISE EXCEPTION 'Old clear writer accepted'; END IF;
  IF has_function_privilege('authenticated',
      'public.reserve_provider_operation_protected(uuid,text,text,text,text,integer,integer,integer)',
      'EXECUTE') OR has_table_privilege('service_role',
      'public.provider_operation_reservations','SELECT') THEN
    RAISE EXCEPTION 'Provider reservation privilege expanded';
  END IF;
END;
$test$;
ROLLBACK;
