-- MIN-591: keep only finite routing codes in automation chains.
BEGIN;
ALTER TABLE public.agent_chains ADD COLUMN codes_checked_at timestamptz;
ALTER TABLE public.agent_chains
  ALTER COLUMN codes_checked_at SET DEFAULT clock_timestamp();
CREATE INDEX agent_chains_code_cleanup_queue ON public.agent_chains
  (id) WHERE codes_checked_at IS NULL;

CREATE FUNCTION public.agent_chain_pending_event_is_code(value jsonb)
RETURNS boolean LANGUAGE plpgsql IMMUTABLE SET search_path = '' AS $$
BEGIN
  IF value IS NULL THEN RETURN true; END IF;
  IF jsonb_typeof(value) <> 'object' THEN RETURN false; END IF;
  RETURN (SELECT count(*) FROM jsonb_object_keys(value)) = 2
    AND value ? 'to' AND value ? 'source'
    AND value->>'to' IN ('triage','backlog','todo','in_progress',
      'in_review','done','canceled','duplicate')
    AND value->>'source' IN ('web','numo','mcp','agent',
      'automation','forge','integration','system');
END;
$$;
REVOKE ALL ON FUNCTION public.agent_chain_pending_event_is_code(jsonb)
  FROM PUBLIC,anon,authenticated;

CREATE FUNCTION public.agent_chain_stop_reason_is_code(value text)
RETURNS boolean LANGUAGE sql IMMUTABLE SET search_path = '' AS $$
  SELECT value IS NULL OR value IN ('canceled','disabled','entitlement',
    'expired','gone','interrupted','invalid','max_steps','numo_failed',
    'numo_outcome_missing','rule','run_failed','stalled','superseded',
    'taken_over','verification_failed');
$$;
REVOKE ALL ON FUNCTION public.agent_chain_stop_reason_is_code(text)
  FROM PUBLIC,anon,authenticated;

CREATE FUNCTION public.guard_agent_chain_codes()
RETURNS trigger LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  IF TG_OP = 'INSERT' OR NEW.pending_event IS DISTINCT FROM OLD.pending_event THEN
    IF NOT public.agent_chain_pending_event_is_code(NEW.pending_event) THEN
      RAISE EXCEPTION 'agent_chain_pending_event_requires_code'
        USING ERRCODE='23514';
    END IF;
  END IF;
  IF TG_OP = 'INSERT' OR NEW.stop_reason IS DISTINCT FROM OLD.stop_reason THEN
    IF NOT public.agent_chain_stop_reason_is_code(NEW.stop_reason) THEN
      RAISE EXCEPTION 'agent_chain_stop_reason_requires_code'
        USING ERRCODE='23514';
    END IF;
  END IF;
  IF TG_OP = 'INSERT' AND NEW.codes_checked_at IS NULL THEN
    NEW.codes_checked_at := clock_timestamp();
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER agent_chain_code_guard BEFORE INSERT OR UPDATE
  ON public.agent_chains FOR EACH ROW
  EXECUTE FUNCTION public.guard_agent_chain_codes();
REVOKE ALL ON FUNCTION public.guard_agent_chain_codes()
  FROM PUBLIC,anon,authenticated;

CREATE FUNCTION public.migrate_agent_chain_codes(
  p_id uuid,p_old_pending jsonb,p_old_reason text
) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE row_value public.agent_chains%ROWTYPE;
BEGIN
  SELECT * INTO row_value FROM public.agent_chains WHERE id=p_id FOR UPDATE;
  IF NOT FOUND OR row_value.codes_checked_at IS NOT NULL
    OR row_value.pending_event IS DISTINCT FROM p_old_pending
    OR row_value.stop_reason IS DISTINCT FROM p_old_reason THEN
    RETURN false;
  END IF;
  UPDATE public.agent_chains SET
    pending_event=CASE WHEN public.agent_chain_pending_event_is_code(p_old_pending)
      THEN p_old_pending ELSE NULL END,
    stop_reason=CASE WHEN public.agent_chain_stop_reason_is_code(p_old_reason)
      THEN p_old_reason ELSE 'invalid' END,
    codes_checked_at=clock_timestamp()
    WHERE id=p_id;
  RETURN true;
END;
$$;
REVOKE ALL ON FUNCTION public.migrate_agent_chain_codes(uuid,jsonb,text)
  FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.migrate_agent_chain_codes(uuid,jsonb,text)
  TO service_role;
COMMIT;
