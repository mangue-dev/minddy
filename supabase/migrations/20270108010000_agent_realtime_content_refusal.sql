-- Agent run content lives in a protected current snapshot. Database Realtime
-- carries only invalidations, and obsolete content broadcasters fail closed.
BEGIN;
-- Wait for earlier broadcasts, then prevent new inserts until the old-writer
-- refusal and historical purge commit together.
LOCK TABLE realtime.messages IN SHARE ROW EXCLUSIVE MODE;
CREATE TABLE public.agent_run_live_snapshots (
  run_id uuid PRIMARY KEY REFERENCES public.agent_runs(id) ON DELETE CASCADE,
  stream_content text,
  stream_version integer NOT NULL DEFAULT 0,
  stream_at bigint NOT NULL DEFAULT 0,
  diff_content text,
  diff_version integer NOT NULL DEFAULT 0,
  diff_at bigint NOT NULL DEFAULT 0,
  CHECK ((stream_content IS NULL AND stream_version = 0) OR
         (stream_content IS NOT NULL AND stream_version > 0)),
  CHECK ((diff_content IS NULL AND diff_version = 0) OR
         (diff_content IS NOT NULL AND diff_version > 0))
);
ALTER TABLE public.agent_run_live_snapshots ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.agent_run_live_snapshots FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT ON public.agent_run_live_snapshots TO service_role;

CREATE FUNCTION public.set_agent_run_live_snapshot(
  p_run_id uuid, p_kind text, p_content text, p_version integer, p_at bigint
) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE run_row public.agent_runs%ROWTYPE; envelope jsonb;
BEGIN
  IF p_kind NOT IN ('stream', 'diff') OR p_content IS NULL OR
      p_version IS NULL OR p_version < 1 OR p_at IS NULL OR p_at < 1 THEN
    RAISE check_violation USING MESSAGE = 'Invalid protected agent snapshot';
  END IF;
  envelope := p_content::jsonb;
  IF NOT COALESCE(
      envelope->>'format' = '3' AND
      (envelope->>'keyVersion')::integer = p_version AND
      envelope->>'encoding' = 'json' AND
      envelope - 'format' - 'keyVersion' - 'salt' - 'encoding' - 'iv' - 'tag' - 'data'
        = '{}'::jsonb AND
      envelope->>'salt' ~ '^[A-Za-z0-9_-]{43}$' AND
      envelope->>'iv' ~ '^[A-Za-z0-9_-]{16}$' AND
      envelope->>'tag' ~ '^[A-Za-z0-9_-]{22}$' AND
      envelope->>'data' ~ '^[A-Za-z0-9_-]+$', false) THEN
    RAISE check_violation USING MESSAGE = 'Invalid protected agent snapshot';
  END IF;
  SELECT * INTO run_row FROM public.agent_runs WHERE id = p_run_id FOR UPDATE;
  IF NOT FOUND OR run_row.status <> 'running' THEN RETURN false; END IF;
  INSERT INTO public.agent_run_live_snapshots(run_id) VALUES(p_run_id)
    ON CONFLICT (run_id) DO NOTHING;
  IF p_kind = 'stream' THEN
    UPDATE public.agent_run_live_snapshots
      SET stream_content = p_content, stream_version = p_version, stream_at = p_at
      WHERE run_id = p_run_id AND stream_at < p_at AND
        (stream_version = 0 OR p_version >= stream_version);
  ELSE
    UPDATE public.agent_run_live_snapshots
      SET diff_content = p_content, diff_version = p_version, diff_at = p_at
      WHERE run_id = p_run_id AND diff_at < p_at AND
        (diff_version = 0 OR p_version >= diff_version);
  END IF;
  RETURN FOUND;
END;
$$;
REVOKE ALL ON FUNCTION public.set_agent_run_live_snapshot(uuid,text,text,integer,bigint)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.set_agent_run_live_snapshot(uuid,text,text,integer,bigint)
  TO service_role;

CREATE FUNCTION public.clear_agent_run_live_snapshot()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF OLD.status = 'running' AND NEW.status <> 'running' THEN
    DELETE FROM public.agent_run_live_snapshots WHERE run_id = NEW.id;
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.clear_agent_run_live_snapshot()
  FROM PUBLIC, anon, authenticated, service_role;
CREATE TRIGGER clear_agent_run_live_snapshot_on_finish
  AFTER UPDATE OF status ON public.agent_runs
  FOR EACH ROW EXECUTE FUNCTION public.clear_agent_run_live_snapshot();

CREATE FUNCTION public.guard_agent_run_live_snapshot_scope()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF OLD.project_id IS DISTINCT FROM NEW.project_id AND EXISTS (
    SELECT 1 FROM public.agent_run_live_snapshots WHERE run_id = OLD.id
  ) THEN
    RAISE check_violation USING MESSAGE = 'Agent live snapshot scope is immutable';
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.guard_agent_run_live_snapshot_scope()
  FROM PUBLIC, anon, authenticated, service_role;
CREATE TRIGGER guard_agent_run_live_snapshot_scope_on_move
  BEFORE UPDATE OF project_id ON public.agent_runs
  FOR EACH ROW EXECUTE FUNCTION public.guard_agent_run_live_snapshot_scope();

CREATE OR REPLACE FUNCTION public.broadcast_private_realtime(
  p_topic text, p_event text, p_payload jsonb
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE resolved text;
BEGIN
  IF split_part(p_topic, ':', 1) = 'agent-run' AND
      (p_event IS DISTINCT FROM 'event' OR p_payload IS NULL OR
       pg_catalog.jsonb_typeof(p_payload) <> 'object' OR
       p_payload - 'id' - 'type' <> '{}'::jsonb OR
       NOT COALESCE(p_payload->>'id' ~* '^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$', false) OR
       NOT COALESCE(p_payload->>'type' IN ('status','thinking','tool_call','tool_result',
         'commit','pr_opened','error','summary','user_message','plan_update',
         'files_changed','question','needs_input','quota_exhausted'), false)) THEN
    RAISE invalid_parameter_value USING MESSAGE = 'Agent run broadcasts require invalidations';
  END IF;
  IF p_topic LIKE 'numo-comment:%' OR p_topic LIKE 'numo-page-comment:%' THEN
    RAISE invalid_parameter_value USING
      MESSAGE = 'Comment streams require encrypted snapshots';
  END IF;
  resolved := public.current_realtime_topic(p_topic);
  IF resolved IS NULL OR NULLIF(p_event, '') IS NULL THEN
    RAISE invalid_parameter_value USING MESSAGE = 'Invalid Realtime broadcast';
  END IF;
  PERFORM realtime.send(COALESCE(p_payload, '{}'::jsonb), p_event, resolved, true);
END;
$$;

-- A real Realtime partition can hold up to three days of historical clear
-- streams, diffs and event payloads. Delete them before the guard is committed.
DO $$
DECLARE removed integer;
BEGIN
  LOOP
    WITH doomed AS (
      SELECT id, inserted_at FROM realtime.messages
      WHERE topic LIKE 'agent-run:%'
      ORDER BY inserted_at, id LIMIT 1000
    )
    DELETE FROM realtime.messages AS message USING doomed
      WHERE message.id = doomed.id AND message.inserted_at = doomed.inserted_at;
    GET DIAGNOSTICS removed = ROW_COUNT;
    EXIT WHEN removed = 0;
  END LOOP;
END;
$$;
COMMIT;
