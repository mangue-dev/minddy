\set ON_ERROR_STOP on
BEGIN ISOLATION LEVEL REPEATABLE READ;
DO $test$
DECLARE rejected boolean := false; plain_rejected boolean := false;
BEGIN
  IF current_database() NOT LIKE 'minddy_min591_%' THEN
    RAISE EXCEPTION 'Use an isolated minddy_min591_* database';
  END IF;
  BEGIN
    INSERT INTO storage.objects(bucket_id,name)
      VALUES('forge-attachments',
        '11111111-1111-4111-8111-111111111111/' || gen_random_uuid() ||
        '/stale-snapshot.png');
  EXCEPTION WHEN SQLSTATE '25001' THEN
    rejected := true;
  END;
  IF NOT rejected THEN
    RAISE EXCEPTION 'A stale-snapshot forge writer was accepted';
  END IF;
  BEGIN
    PERFORM public.reconcile_forge_repository_plain('github','fixture',
      'new/repo','new','repo','[]'::jsonb);
  EXCEPTION WHEN SQLSTATE '25001' THEN
    plain_rejected := true;
  END;
  IF NOT plain_rejected THEN
    RAISE EXCEPTION 'A stale-snapshot plain repository rename was accepted';
  END IF;
END $test$;
ROLLBACK;
