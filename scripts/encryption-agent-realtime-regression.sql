-- Reproduce and remove durable agent content with a real Realtime partition.
\set ON_ERROR_STOP on
BEGIN;
DO $$ BEGIN
  IF current_database() NOT LIKE 'minddy_min591_%' THEN
    RAISE EXCEPTION 'Use an isolated minddy_min591_* database';
  END IF;
  EXECUTE format(
    'CREATE TABLE IF NOT EXISTS realtime.%I PARTITION OF realtime.messages FOR VALUES FROM (%L) TO (%L)',
    'messages_' || to_char(current_date, 'YYYY_MM_DD'), current_date, current_date + 1
  );
  IF NOT EXISTS (
    SELECT 1 FROM pg_inherits WHERE inhparent = 'realtime.messages'::regclass
      AND inhrelid = to_regclass('realtime.messages_' || to_char(current_date, 'YYYY_MM_DD'))
  ) THEN
    RAISE EXCEPTION 'No effective Realtime partition for today';
  END IF;
END $$;
DO $$
DECLARE actor uuid := gen_random_uuid(); project uuid := gen_random_uuid();
  conversation uuid := gen_random_uuid(); run uuid := gen_random_uuid();
  resolved text;
BEGIN
  INSERT INTO auth.users(id) VALUES(actor);
  INSERT INTO public.projects(id,owner_id,name,key)
    VALUES(project,actor,'Fixture project','REA');
  INSERT INTO public.agent_conversations(id,project_id,owner_id)
    VALUES(conversation,project,actor);
  INSERT INTO public.agent_runs(id,project_id,conversation_id,created_by)
    VALUES(run,project,conversation,actor);
  resolved := public.current_realtime_topic('agent-run:' || run);
  PERFORM public.broadcast_private_realtime('agent-run:' || run, 'stream',
    '{"text":"MIN591_AGENT_REALTIME_SENTINEL"}'::jsonb);
  IF NOT EXISTS (
    SELECT 1 FROM realtime.messages WHERE topic = resolved
      AND payload::text LIKE '%MIN591_AGENT_REALTIME_SENTINEL%'
      AND tableoid = to_regclass('realtime.messages_' || to_char(current_date, 'YYYY_MM_DD'))
  ) THEN
    RAISE EXCEPTION 'Original cleartext persistence was not reproduced';
  END IF;
  PERFORM set_config('min591.agent_run', run::text, true);
  PERFORM set_config('min591.agent_topic', resolved, true);
END $$;
-- APPLY_AGENT_REALTIME_MIGRATION_HERE
DO $$
DECLARE run uuid := current_setting('min591.agent_run')::uuid;
  resolved text := current_setting('min591.agent_topic');
  sealed text := jsonb_build_object('format',3,'keyVersion',1,
    'encoding','json','salt',repeat('A',43),'iv',repeat('A',16),
    'tag',repeat('A',22),'data','AA')::text;
BEGIN
  IF EXISTS (SELECT 1 FROM realtime.messages WHERE topic = resolved
      AND payload::text LIKE '%MIN591_AGENT_REALTIME_SENTINEL%') THEN
    RAISE EXCEPTION 'Historical agent content survived cleanup';
  END IF;
  BEGIN
    PERFORM public.broadcast_private_realtime('agent-run:' || run, 'stream',
      '{"text":"MIN591_NEW_SENTINEL"}'::jsonb);
    RAISE EXCEPTION 'Old agent broadcaster was accepted';
  EXCEPTION WHEN invalid_parameter_value THEN
    IF SQLERRM = 'Old agent broadcaster was accepted' THEN RAISE; END IF;
  END;
  IF EXISTS (SELECT 1 FROM realtime.messages WHERE topic = resolved
      AND payload::text LIKE '%MIN591_NEW_SENTINEL%') THEN
    RAISE EXCEPTION 'New agent content reached durable Realtime';
  END IF;
  BEGIN
    PERFORM public.broadcast_private_realtime('agent-run:' || run, 'event',
      '{"row":{"id":"old","payload":{"text":"MIN591_OLD_EVENT"}}}'::jsonb);
    RAISE EXCEPTION 'Old event payload broadcaster was accepted';
  EXCEPTION WHEN invalid_parameter_value THEN
    IF SQLERRM = 'Old event payload broadcaster was accepted' THEN RAISE; END IF;
  END;
  PERFORM public.broadcast_private_realtime('agent-run:' || run, 'event',
    jsonb_build_object('id',gen_random_uuid(),'type','summary'));
  IF NOT EXISTS (SELECT 1 FROM realtime.messages WHERE topic = resolved
      AND event = 'event' AND payload ? 'id' AND payload ? 'type'
      AND NOT payload ? 'row') THEN
    RAISE EXCEPTION 'Safe event invalidation was not delivered to real partition';
  END IF;
  UPDATE public.agent_runs SET status = 'running' WHERE id = run;
  IF NOT public.set_agent_run_live_snapshot(run,'stream',sealed,1,10) OR
     public.set_agent_run_live_snapshot(run,'stream',sealed,1,9) THEN
    RAISE EXCEPTION 'Snapshot ordering failed';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.agent_run_live_snapshots
      WHERE run_id = run AND stream_content = sealed AND stream_at = 10) THEN
    RAISE EXCEPTION 'Protected current snapshot was not stored';
  END IF;
  IF NOT public.set_agent_run_live_snapshot(run,'stream',
      jsonb_set(sealed::jsonb,'{keyVersion}','2'::jsonb)::text,2,12) OR
     public.set_agent_run_live_snapshot(run,'stream',sealed,1,13) THEN
    RAISE EXCEPTION 'Snapshot key version rollback was accepted';
  END IF;
  BEGIN
    UPDATE public.agent_runs SET project_id = gen_random_uuid() WHERE id = run;
    RAISE EXCEPTION 'Agent snapshot project binding moved';
  EXCEPTION WHEN check_violation THEN
    IF SQLERRM = 'Agent snapshot project binding moved' THEN RAISE; END IF;
  END;
  BEGIN
    PERFORM public.set_agent_run_live_snapshot(run,'diff',
      '{"format":3,"keyVersion":1,"text":"Private diff"}',1,11);
    RAISE EXCEPTION 'Clear extra field accepted as snapshot';
  EXCEPTION WHEN check_violation THEN
    IF SQLERRM = 'Clear extra field accepted as snapshot' THEN RAISE; END IF;
  END;
  IF has_table_privilege('authenticated','public.agent_run_live_snapshots','SELECT') OR
     has_table_privilege('service_role','public.agent_run_live_snapshots','INSERT') THEN
    RAISE EXCEPTION 'Snapshot table grants allow bypass';
  END IF;
  UPDATE public.agent_runs SET status = 'completed' WHERE id = run;
  IF EXISTS (SELECT 1 FROM public.agent_run_live_snapshots WHERE run_id = run) THEN
    RAISE EXCEPTION 'Completed run retained current snapshot';
  END IF;
END $$;
ROLLBACK;
