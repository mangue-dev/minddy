BEGIN;
SET LOCAL session_replication_role = replica;
INSERT INTO public.agent_runs (id, project_id, conversation_id)
VALUES ('00000000-0000-4000-8000-00000000a502',
  '00000000-0000-4000-8000-00000000a503',
  '00000000-0000-4000-8000-00000000a504');
INSERT INTO public.agent_run_events
  (id, run_id, seq, type, payload, encryption_version)
VALUES
  ('00000000-0000-4000-8000-00000000a501',
   '00000000-0000-4000-8000-00000000a502', 0, 'summary',
   '{"text":"fixture"}'::jsonb, 0);
SET LOCAL session_replication_role = origin;

DO $$
DECLARE
  v_id uuid := '00000000-0000-4000-8000-00000000a501';
  v_checked timestamptz;
  v_attempted timestamptz;
BEGIN
  IF public.mark_agent_backfill_attempt('agent_run_events', 'id', v_id,
      'encryption_checked_at', jsonb_build_object('id', v_id,
        'encrypted_content', NULL, 'payload', '{"text":"fixture"}'::jsonb,
        'encryption_version', 0)) IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'Matching source row did not record its attempt';
  END IF;
  SELECT encryption_checked_at, encryption_attempted_at
    INTO v_checked, v_attempted FROM public.agent_run_events WHERE id = v_id;
  IF v_checked IS NOT NULL OR v_attempted IS NULL THEN
    RAISE EXCEPTION 'An attempt was mistaken for verification';
  END IF;
  PERFORM set_config('minddy.encryption_maintenance', 'on', true);
  UPDATE public.agent_run_events SET payload = '{"text":"changed"}'::jsonb WHERE id = v_id;
  PERFORM set_config('minddy.encryption_maintenance', '', true);
  PERFORM pg_sleep(0.001);
  IF public.mark_agent_backfill_attempt('agent_run_events', 'id', v_id,
      'encryption_checked_at', jsonb_build_object('id', v_id,
        'encrypted_content', NULL, 'payload', '{"text":"fixture"}'::jsonb,
        'encryption_version', 0)) IS DISTINCT FROM false THEN
    RAISE EXCEPTION 'Stale source value won a compare-and-swap';
  END IF;
  IF (SELECT encryption_attempted_at FROM public.agent_run_events WHERE id = v_id)
      <= v_attempted THEN
    RAISE EXCEPTION 'A conflicting attempt did not advance the retry order';
  END IF;
  IF has_function_privilege('authenticated',
      'public.mark_agent_backfill_attempt(text,text,uuid,text,jsonb)', 'EXECUTE') THEN
    RAISE EXCEPTION 'Client role can advance agent maintenance attempts';
  END IF;
END;
$$;

CREATE TEMP TABLE agent_attempt_broadcast_probe (event text) ON COMMIT DROP;
GRANT INSERT ON pg_temp.agent_attempt_broadcast_probe
  TO postgres, supabase_realtime_admin;
CREATE OR REPLACE FUNCTION realtime.send(
  payload jsonb, event text, topic text, private boolean DEFAULT true
) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO pg_temp.agent_attempt_broadcast_probe VALUES (event);
END;
$$;
SET LOCAL session_replication_role = replica;
INSERT INTO auth.users (id)
VALUES ('00000000-0000-4000-8000-00000000a506');
INSERT INTO public.projects (id, owner_id, key)
VALUES ('00000000-0000-4000-8000-00000000a503',
  '00000000-0000-4000-8000-00000000a506', 'MIN591TEST');
INSERT INTO public.agent_conversations (id, project_id)
VALUES ('00000000-0000-4000-8000-00000000a504',
  '00000000-0000-4000-8000-00000000a503');
UPDATE public.agent_runs SET updated_at = '2000-01-01'::timestamptz
  WHERE id = '00000000-0000-4000-8000-00000000a502';
INSERT INTO public.agent_routines
  (id, project_id, owner_id, frequency, title, prompt, updated_at)
VALUES ('00000000-0000-4000-8000-00000000a505',
  '00000000-0000-4000-8000-00000000a503',
  '00000000-0000-4000-8000-00000000a506', 'daily', 'fixture', 'fixture',
  '2000-01-01'::timestamptz);
SET LOCAL session_replication_role = origin;

DO $$
DECLARE
  v_id uuid := '00000000-0000-4000-8000-00000000a505';
  v_run_id uuid := '00000000-0000-4000-8000-00000000a502';
  v_before public.agent_routines;
  v_after public.agent_routines;
BEGIN
  IF public.mark_agent_backfill_attempt('agent_runs', 'id', v_run_id,
      'launch_encryption_checked_at', jsonb_build_object('id', v_run_id,
        'encrypted_launch_content', NULL, 'launch_encryption_version', 0))
      IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'Run attempt failed its source compare-and-swap';
  END IF;
  IF (SELECT updated_at FROM public.agent_runs WHERE id = v_run_id)
      <> '2000-01-01'::timestamptz OR
      (SELECT launch_encryption_checked_at FROM public.agent_runs WHERE id = v_run_id)
      IS NOT NULL OR
      (SELECT count(*) FROM pg_temp.agent_attempt_broadcast_probe) <> 0 THEN
    RAISE EXCEPTION 'Run attempt changed activity metadata or Realtime';
  END IF;
  SELECT * INTO v_before FROM public.agent_routines WHERE id = v_id;
  IF public.mark_agent_backfill_attempt('agent_routines', 'id', v_id,
      'encryption_checked_at', jsonb_build_object('id', v_id,
        'encrypted_content', NULL, 'content_revision', v_before.content_revision))
      IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'Routine attempt failed its source compare-and-swap';
  END IF;
  SELECT * INTO v_after FROM public.agent_routines WHERE id = v_id;
  IF v_after.content_revision IS DISTINCT FROM v_before.content_revision OR
      v_after.updated_at IS DISTINCT FROM v_before.updated_at OR
      v_after.encryption_checked_at IS DISTINCT FROM v_before.encryption_checked_at OR
      v_after.encryption_attempted_at IS NULL THEN
    RAISE EXCEPTION 'Routine attempt changed content metadata or verification';
  END IF;
  IF (SELECT count(*) FROM pg_temp.agent_attempt_broadcast_probe) <> 0 THEN
    RAISE EXCEPTION 'Routine attempt emitted Realtime activity';
  END IF;
  PERFORM pg_sleep(0.001);
  UPDATE public.agent_routines SET prompt = 'changed' WHERE id = v_id;
  SELECT * INTO v_after FROM public.agent_routines WHERE id = v_id;
  IF v_after.content_revision <> v_before.content_revision + 1 OR
      v_after.updated_at <= v_before.updated_at OR
      (SELECT count(*) FROM pg_temp.agent_attempt_broadcast_probe) <> 1 THEN
    RAISE EXCEPTION 'Normal routine change: revision % to %, updated_at % to %, broadcasts %, maintenance %',
      v_before.content_revision, v_after.content_revision,
      v_before.updated_at, v_after.updated_at,
      (SELECT count(*) FROM pg_temp.agent_attempt_broadcast_probe),
      current_setting('minddy.encryption_maintenance', true);
  END IF;
END;
$$;
ROLLBACK;
