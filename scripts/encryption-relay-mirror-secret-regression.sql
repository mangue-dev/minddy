\set ON_ERROR_STOP on
BEGIN;
DO $$ BEGIN
  IF current_database() NOT LIKE 'minddy_min591_%' THEN
    RAISE EXCEPTION 'Use an isolated minddy_min591_* database';
  END IF;
END $$;
DO $test$
DECLARE rejected boolean:=false;
BEGIN
  IF EXISTS(SELECT 1 FROM information_schema.columns
      WHERE table_schema='public' AND table_name='forge_relay_link_mirror'
        AND column_name='webhook_secret_encrypted') THEN
    RAISE EXCEPTION 'Recoverable relay mirror secret remains';
  END IF;
  BEGIN
    EXECUTE 'UPDATE public.forge_relay_link_mirror
      SET webhook_secret_encrypted = ''old writer''';
  EXCEPTION WHEN undefined_column THEN rejected:=true; END;
  IF NOT rejected THEN
    RAISE EXCEPTION 'Old mirror secret writer was accepted';
  END IF;
END;
$test$;
ROLLBACK;
