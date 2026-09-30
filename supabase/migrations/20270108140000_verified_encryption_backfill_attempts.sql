BEGIN;

-- Progress-only updates must not change a run's operational timestamp.
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger LANGUAGE plpgsql SET search_path = '' AS $function$
BEGIN
  IF current_setting('minddy.encryption_maintenance', true) = 'on' THEN
    NEW.updated_at := OLD.updated_at;
  ELSE
    NEW.updated_at := pg_catalog.now();
  END IF;
  RETURN NEW;
END;
$function$;

ALTER TABLE public.pull_requests
  ADD COLUMN url_encryption_attempted_at timestamptz,
  ADD COLUMN content_encryption_attempted_at timestamptz;
ALTER TABLE public.agent_runs
  ADD COLUMN checkpoint_encryption_attempted_at timestamptz;
ALTER TABLE public.agent_runtime_sessions
  ADD COLUMN checkpoint_encryption_attempted_at timestamptz;
ALTER TABLE public.agent_run_journal
  ADD COLUMN encryption_attempted_at timestamptz;

DROP INDEX public.pull_request_url_encryption_queue;
CREATE INDEX pull_request_url_encryption_queue ON public.pull_requests
  (url_encryption_attempted_at NULLS FIRST,id) WHERE url IS NOT NULL;
DROP INDEX public.pull_request_content_encryption_queue;
CREATE INDEX pull_request_content_encryption_queue ON public.pull_requests
  (content_encryption_attempted_at NULLS FIRST,id)
  WHERE title IS NOT NULL OR head_branch IS NOT NULL OR base_branch IS NOT NULL;
DROP INDEX public.agent_runs_checkpoint_encryption_queue;
CREATE INDEX agent_runs_checkpoint_encryption_queue ON public.agent_runs
  (checkpoint_encryption_attempted_at NULLS FIRST,id);
DROP INDEX public.agent_runtime_checkpoint_encryption_queue;
CREATE INDEX agent_runtime_checkpoint_encryption_queue ON public.agent_runtime_sessions
  (checkpoint_encryption_attempted_at NULLS FIRST,conversation_id)
  WHERE current_run_id IS NULL;
DROP INDEX public.agent_run_journal_encryption_queue;
CREATE INDEX agent_run_journal_encryption_queue ON public.agent_run_journal
  (encryption_attempted_at NULLS FIRST,id);

-- A later writer invalidates verification of the previous encrypted value.
CREATE FUNCTION public.invalidate_pull_request_encryption_checks()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF NEW.url IS DISTINCT FROM OLD.url AND
      NEW.url_encryption_checked_at IS NOT DISTINCT FROM OLD.url_encryption_checked_at THEN
    NEW.url_encryption_checked_at := NULL;
  END IF;
  IF (NEW.title,NEW.head_branch,NEW.base_branch) IS DISTINCT FROM
      (OLD.title,OLD.head_branch,OLD.base_branch) AND
      NEW.content_encryption_checked_at IS NOT DISTINCT FROM
        OLD.content_encryption_checked_at THEN
    NEW.content_encryption_checked_at := NULL;
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER a_invalidate_pull_request_encryption_checks
  BEFORE UPDATE ON public.pull_requests FOR EACH ROW
  EXECUTE FUNCTION public.invalidate_pull_request_encryption_checks();
REVOKE ALL ON FUNCTION public.invalidate_pull_request_encryption_checks()
  FROM PUBLIC,anon,authenticated;

-- Old checked timestamps could have been written before ciphertext authentication.
UPDATE public.pull_requests SET url_encryption_checked_at=NULL,
  content_encryption_checked_at=NULL
  WHERE url_encryption_checked_at IS NOT NULL
     OR content_encryption_checked_at IS NOT NULL;
SELECT pg_catalog.set_config('minddy.encryption_maintenance','on',true);
UPDATE public.agent_runs SET checkpoint_encryption_checked_at=NULL
  WHERE checkpoint_encryption_checked_at IS NOT NULL;
UPDATE public.agent_runtime_sessions SET checkpoint_encryption_checked_at=NULL
  WHERE checkpoint_encryption_checked_at IS NOT NULL;
UPDATE public.agent_run_journal SET encryption_checked_at=NULL
  WHERE encryption_checked_at IS NOT NULL;
SELECT pg_catalog.set_config('minddy.encryption_maintenance','',true);

DROP FUNCTION public.migrate_pull_request_url(uuid,text,text);
CREATE FUNCTION public.migrate_pull_request_url(
  p_id uuid,p_old_url text,p_new_url text DEFAULT NULL,
  p_verified boolean DEFAULT false
) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE row public.pull_requests;
BEGIN
  SELECT * INTO row FROM public.pull_requests WHERE id=p_id FOR UPDATE;
  IF NOT FOUND THEN RETURN false; END IF;
  IF row.url IS DISTINCT FROM p_old_url THEN
    UPDATE public.pull_requests SET url_encryption_attempted_at=pg_catalog.clock_timestamp()
      WHERE id=p_id;
    RETURN false;
  END IF;
  IF p_new_url IS NOT NULL THEN
    UPDATE public.pull_requests SET url=p_new_url,
      url_encryption_attempted_at=pg_catalog.clock_timestamp(),
      url_encryption_checked_at=pg_catalog.clock_timestamp() WHERE id=p_id;
  ELSIF p_verified THEN
    UPDATE public.pull_requests SET
      url_encryption_attempted_at=pg_catalog.clock_timestamp(),
      url_encryption_checked_at=pg_catalog.clock_timestamp() WHERE id=p_id;
  ELSE
    UPDATE public.pull_requests SET url_encryption_attempted_at=pg_catalog.clock_timestamp()
      WHERE id=p_id;
  END IF;
  RETURN true;
END;
$$;
REVOKE ALL ON FUNCTION public.migrate_pull_request_url(uuid,text,text,boolean)
  FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.migrate_pull_request_url(uuid,text,text,boolean)
  TO service_role;

DROP FUNCTION public.migrate_pull_request_content(uuid,text,text,text,text,text,text);
CREATE FUNCTION public.migrate_pull_request_content(
  p_id uuid,p_old_title text,p_old_head text,p_old_base text,
  p_new_title text DEFAULT NULL,p_new_head text DEFAULT NULL,
  p_new_base text DEFAULT NULL,p_verified boolean DEFAULT false
) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE row public.pull_requests;
  changed boolean := p_new_title IS NOT NULL OR p_new_head IS NOT NULL
    OR p_new_base IS NOT NULL;
BEGIN
  SELECT * INTO row FROM public.pull_requests WHERE id=p_id FOR UPDATE;
  IF NOT FOUND THEN RETURN false; END IF;
  IF row.title IS DISTINCT FROM p_old_title OR
      row.head_branch IS DISTINCT FROM p_old_head OR
      row.base_branch IS DISTINCT FROM p_old_base THEN
    UPDATE public.pull_requests SET
      content_encryption_attempted_at=pg_catalog.clock_timestamp() WHERE id=p_id;
    RETURN false;
  END IF;
  IF changed OR p_verified THEN
    UPDATE public.pull_requests SET title=COALESCE(p_new_title,row.title),
      head_branch=COALESCE(p_new_head,row.head_branch),
      base_branch=COALESCE(p_new_base,row.base_branch),
      content_encryption_attempted_at=pg_catalog.clock_timestamp(),
      content_encryption_checked_at=pg_catalog.clock_timestamp() WHERE id=p_id;
  ELSE
    UPDATE public.pull_requests SET
      content_encryption_attempted_at=pg_catalog.clock_timestamp() WHERE id=p_id;
  END IF;
  RETURN true;
END;
$$;
REVOKE ALL ON FUNCTION public.migrate_pull_request_content(
  uuid,text,text,text,text,text,text,boolean) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.migrate_pull_request_content(
  uuid,text,text,text,text,text,text,boolean) TO service_role;

DROP FUNCTION public.migrate_agent_checkpoint_ciphertext(
  uuid,uuid,uuid,jsonb,text,integer,text,integer);
CREATE FUNCTION public.migrate_agent_checkpoint_ciphertext(
  p_id uuid,p_project_id uuid,p_conversation_id uuid,
  p_old_checkpoint jsonb,p_old_cipher text,p_old_version integer,
  p_cipher text DEFAULT NULL,p_version integer DEFAULT NULL,
  p_verified boolean DEFAULT false
) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE r public.agent_runs; runtime public.agent_runtime_sessions;
  prior text := pg_catalog.current_setting('minddy.encryption_maintenance',true);
BEGIN
  SELECT * INTO r FROM public.agent_runs WHERE id=p_id
    AND project_id=p_project_id AND conversation_id=p_conversation_id FOR UPDATE;
  IF NOT FOUND THEN RETURN false; END IF;
  IF r.checkpoint IS DISTINCT FROM p_old_checkpoint OR
    r.checkpoint_ciphertext IS DISTINCT FROM p_old_cipher OR
    r.checkpoint_encryption_version IS DISTINCT FROM p_old_version THEN
    PERFORM pg_catalog.set_config('minddy.encryption_maintenance','on',true);
    UPDATE public.agent_runs SET
      checkpoint_encryption_attempted_at=pg_catalog.clock_timestamp() WHERE id=p_id;
    PERFORM pg_catalog.set_config('minddy.encryption_maintenance',COALESCE(prior,''),true);
    RETURN false;
  END IF;
  IF p_cipher IS NULL AND p_version IS NULL THEN
    PERFORM pg_catalog.set_config('minddy.encryption_maintenance','on',true);
    UPDATE public.agent_runs SET
      checkpoint_encryption_attempted_at=pg_catalog.clock_timestamp(),
      checkpoint_encryption_checked_at=CASE WHEN p_verified
        THEN pg_catalog.clock_timestamp() ELSE checkpoint_encryption_checked_at END
      WHERE id=p_id;
    PERFORM pg_catalog.set_config('minddy.encryption_maintenance',COALESCE(prior,''),true);
    RETURN true;
  END IF;
  IF p_cipher IS NULL OR p_version IS NULL OR p_version < 1 THEN
    RAISE EXCEPTION 'agent_checkpoint_migration_invalid' USING ERRCODE='22023';
  END IF;
  SELECT * INTO runtime FROM public.agent_runtime_sessions
    WHERE conversation_id=p_conversation_id FOR UPDATE;
  PERFORM pg_catalog.set_config('minddy.encryption_maintenance','on',true);
  UPDATE public.agent_runs SET checkpoint=NULL,checkpoint_ciphertext=p_cipher,
    checkpoint_encryption_version=p_version,
    checkpoint_encryption_attempted_at=pg_catalog.clock_timestamp(),
    checkpoint_encryption_checked_at=pg_catalog.clock_timestamp() WHERE id=p_id;
  PERFORM pg_catalog.set_config('minddy.encryption_maintenance',COALESCE(prior,''),true);
  IF runtime.current_run_id=p_id AND NOT EXISTS (
    SELECT 1 FROM public.agent_runtime_sessions s
    WHERE s.conversation_id=p_conversation_id AND s.checkpoint IS NULL
      AND s.checkpoint_ciphertext=p_cipher
      AND s.checkpoint_encryption_version=p_version
  ) THEN RAISE EXCEPTION 'agent_runtime_checkpoint_migration_copy_failed' USING ERRCODE='23514'; END IF;
  RETURN true;
END;
$$;
REVOKE ALL ON FUNCTION public.migrate_agent_checkpoint_ciphertext(
  uuid,uuid,uuid,jsonb,text,integer,text,integer,boolean) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.migrate_agent_checkpoint_ciphertext(
  uuid,uuid,uuid,jsonb,text,integer,text,integer,boolean) TO service_role;

DROP FUNCTION public.migrate_orphan_agent_runtime_checkpoint(
  uuid,uuid,jsonb,text,integer,text,integer);
CREATE FUNCTION public.migrate_orphan_agent_runtime_checkpoint(
  p_conversation_id uuid,p_project_id uuid,p_old_checkpoint jsonb,
  p_old_cipher text,p_old_version integer,p_cipher text,p_version integer,
  p_verified boolean DEFAULT false
) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE runtime public.agent_runtime_sessions;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.agent_conversations c
      WHERE c.id=p_conversation_id AND c.project_id=p_project_id) THEN RETURN false; END IF;
  SELECT * INTO runtime FROM public.agent_runtime_sessions
    WHERE conversation_id=p_conversation_id AND current_run_id IS NULL FOR UPDATE;
  IF NOT FOUND THEN RETURN false; END IF;
  IF runtime.checkpoint IS DISTINCT FROM p_old_checkpoint OR
    runtime.checkpoint_ciphertext IS DISTINCT FROM p_old_cipher OR
    runtime.checkpoint_encryption_version IS DISTINCT FROM p_old_version THEN
    UPDATE public.agent_runtime_sessions SET
      checkpoint_encryption_attempted_at=pg_catalog.clock_timestamp()
      WHERE conversation_id=p_conversation_id AND current_run_id IS NULL;
    RETURN false;
  END IF;
  IF p_cipher IS NULL AND p_version IS NULL THEN
    UPDATE public.agent_runtime_sessions SET
      checkpoint_encryption_attempted_at=pg_catalog.clock_timestamp(),
      checkpoint_encryption_checked_at=CASE WHEN p_verified
        THEN pg_catalog.clock_timestamp() ELSE checkpoint_encryption_checked_at END
      WHERE conversation_id=p_conversation_id;
    RETURN true;
  END IF;
  IF p_cipher IS NULL OR p_version IS NULL OR p_version < 1 THEN
    RAISE EXCEPTION 'agent_checkpoint_migration_invalid' USING ERRCODE='22023';
  END IF;
  UPDATE public.agent_runtime_sessions SET checkpoint=NULL,
    checkpoint_ciphertext=p_cipher,checkpoint_encryption_version=p_version,
    checkpoint_encryption_attempted_at=pg_catalog.clock_timestamp(),
    checkpoint_encryption_checked_at=pg_catalog.clock_timestamp()
    WHERE conversation_id=p_conversation_id AND current_run_id IS NULL;
  RETURN true;
END;
$$;
REVOKE ALL ON FUNCTION public.migrate_orphan_agent_runtime_checkpoint(
  uuid,uuid,jsonb,text,integer,text,integer,boolean) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.migrate_orphan_agent_runtime_checkpoint(
  uuid,uuid,jsonb,text,integer,text,integer,boolean) TO service_role;

DROP FUNCTION public.migrate_agent_journal_ciphertext(
  bigint,uuid,integer,text,text,integer,integer,integer,integer);
CREATE FUNCTION public.migrate_agent_journal_ciphertext(
  p_id bigint,p_run_id uuid,p_previous_version integer,
  p_payload text DEFAULT NULL,p_digest text DEFAULT NULL,
  p_version integer DEFAULT NULL,p_event_count integer DEFAULT NULL,
  p_payload_bytes integer DEFAULT NULL,p_stored_bytes integer DEFAULT NULL,
  p_verified boolean DEFAULT false,
  p_previous_events jsonb DEFAULT NULL,
  p_previous_payload text DEFAULT NULL,
  p_previous_digest text DEFAULT NULL,
  p_previous_encoding text DEFAULT NULL,
  p_previous_event_count integer DEFAULT NULL,
  p_previous_payload_bytes integer DEFAULT NULL,
  p_previous_stored_bytes integer DEFAULT NULL
) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE affected integer;
  prior text := pg_catalog.current_setting('minddy.encryption_maintenance',true);
BEGIN
  PERFORM pg_catalog.set_config('minddy.encryption_maintenance','on',true);
  IF p_payload IS NULL AND p_digest IS NULL AND p_version IS NULL THEN
    UPDATE public.agent_run_journal SET
      encryption_attempted_at=pg_catalog.clock_timestamp(),
      encryption_checked_at=CASE WHEN p_verified
        THEN pg_catalog.clock_timestamp() ELSE encryption_checked_at END
      WHERE id=p_id AND run_id=p_run_id
        AND encryption_version=p_previous_version
        AND events IS NOT DISTINCT FROM p_previous_events
        AND payload IS NOT DISTINCT FROM p_previous_payload
        AND payload_sha256 IS NOT DISTINCT FROM p_previous_digest
        AND payload_encoding IS NOT DISTINCT FROM p_previous_encoding
        AND event_count IS NOT DISTINCT FROM p_previous_event_count
        AND payload_bytes IS NOT DISTINCT FROM p_previous_payload_bytes
        AND stored_bytes IS NOT DISTINCT FROM p_previous_stored_bytes;
  ELSE
    UPDATE public.agent_run_journal SET events=NULL,payload=p_payload,
      payload_sha256=p_digest,payload_encoding='encrypted-gzip-json-v1',
      encryption_version=p_version,event_count=p_event_count,
      payload_bytes=p_payload_bytes,stored_bytes=p_stored_bytes,
      encryption_attempted_at=pg_catalog.clock_timestamp(),
      encryption_checked_at=pg_catalog.clock_timestamp()
      WHERE id=p_id AND run_id=p_run_id
        AND encryption_version=p_previous_version
        AND events IS NOT DISTINCT FROM p_previous_events
        AND payload IS NOT DISTINCT FROM p_previous_payload
        AND payload_sha256 IS NOT DISTINCT FROM p_previous_digest
        AND payload_encoding IS NOT DISTINCT FROM p_previous_encoding
        AND event_count IS NOT DISTINCT FROM p_previous_event_count
        AND payload_bytes IS NOT DISTINCT FROM p_previous_payload_bytes
        AND stored_bytes IS NOT DISTINCT FROM p_previous_stored_bytes;
  END IF;
  GET DIAGNOSTICS affected=ROW_COUNT;
  IF affected=0 THEN
    UPDATE public.agent_run_journal SET
      encryption_attempted_at=pg_catalog.clock_timestamp() WHERE id=p_id;
  END IF;
  PERFORM pg_catalog.set_config('minddy.encryption_maintenance',COALESCE(prior,''),true);
  RETURN affected=1;
END;
$$;
REVOKE ALL ON FUNCTION public.migrate_agent_journal_ciphertext(
  bigint,uuid,integer,text,text,integer,integer,integer,integer,boolean,
  jsonb,text,text,text,integer,integer,integer)
  FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.migrate_agent_journal_ciphertext(
  bigint,uuid,integer,text,text,integer,integer,integer,integer,boolean,
  jsonb,text,text,text,integer,integer,integer)
  TO service_role;

COMMIT;
