-- Run on an isolated clone before migration 20270108100000. Replace the
-- migration marker with that migration, preserving its transaction boundary.
\set ON_ERROR_STOP on
DO $$ BEGIN
  IF current_database() NOT LIKE 'minddy_min591_%' THEN
    RAISE EXCEPTION 'Use an isolated minddy_min591_* database';
  END IF;
  EXECUTE format(
    'CREATE TABLE IF NOT EXISTS realtime.%I PARTITION OF realtime.messages FOR VALUES FROM (%L) TO (%L)',
    'messages_' || to_char(current_date,'YYYY_MM_DD'),current_date,current_date+1);
END $$;
ALTER TABLE realtime.messages DISABLE TRIGGER version_project_realtime_message;
INSERT INTO realtime.messages(topic,extension,payload,event,private)
VALUES
  ('numo-comment:11111111-1111-4111-8111-111111111111','broadcast',
    '{"text":"MIN591_HISTORICAL_COMMENT_SECRET"}'::jsonb,'stream',true),
  ('numo-page-comment:22222222-2222-4222-8222-222222222222','broadcast',
    '{"quote":"MIN591_HISTORICAL_PAGE_QUOTE"}'::jsonb,'stream',true),
  ('safe-invalidation:33333333-3333-4333-8333-333333333333','broadcast',
    '{"id":"33333333-3333-4333-8333-333333333333"}'::jsonb,'event',true);
ALTER TABLE realtime.messages ENABLE TRIGGER version_project_realtime_message;
DO $$ BEGIN
  IF (SELECT count(*) FROM realtime.messages
      WHERE topic LIKE 'numo-comment:%' OR topic LIKE 'numo-page-comment:%') <> 2 THEN
    RAISE EXCEPTION 'Historical comment rows were not reproduced';
  END IF;
END $$;
-- APPLY_NUMO_ATTEMPT_AND_COMMENT_REALTIME_MIGRATION_HERE
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM realtime.messages
      WHERE topic LIKE 'numo-comment:%' OR topic LIKE 'numo-page-comment:%') THEN
    RAISE EXCEPTION 'Historical comment content survived the purge';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM realtime.messages
      WHERE topic LIKE 'safe-invalidation:%') THEN
    RAISE EXCEPTION 'Unrelated Realtime messages were removed';
  END IF;
  BEGIN
    PERFORM public.broadcast_private_realtime(
      'numo-comment:11111111-1111-4111-8111-111111111111','stream',
      '{"text":"NEW_SECRET"}'::jsonb);
    RAISE EXCEPTION 'Obsolete comment stream writer was accepted';
  EXCEPTION WHEN invalid_parameter_value THEN
    IF SQLERRM='Obsolete comment stream writer was accepted' THEN RAISE; END IF;
  END;
END $$;
