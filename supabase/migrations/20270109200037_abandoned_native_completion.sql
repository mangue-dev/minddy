-- Recover abandoned native completion claims without admitting late report writers.
BEGIN;
CREATE OR REPLACE FUNCTION public.claim_native_worker_recovery(p_run_id uuid,p_started_at timestamptz,
  p_last_activity_at timestamptz,p_loop_command_id text,p_sandbox_name text,p_claim_id uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE owner_id uuid; r public.agent_runs; c public.native_agent_connections; allocation_name text;
BEGIN
  IF p_run_id IS NULL OR p_claim_id IS NULL OR pg_catalog.current_setting('transaction_isolation')<>'read committed' THEN
    RAISE EXCEPTION 'native_worker_recovery_invalid'; END IF;
  SELECT created_by INTO owner_id FROM public.agent_runs WHERE id=p_run_id;
  IF owner_id IS NULL THEN RETURN NULL; END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(owner_id::text,5911900));
  SELECT * INTO r FROM public.agent_runs WHERE id=p_run_id FOR UPDATE;
  IF NOT FOUND OR r.created_by IS DISTINCT FROM owner_id OR r.status<>'running'
    OR r.agent_engine NOT IN ('codex','claude_code') OR r.local_exec
    OR ROW(r.started_at,r.last_activity_at,r.loop_command_id,r.sandbox_id)
      IS DISTINCT FROM ROW(p_started_at,p_last_activity_at,p_loop_command_id,p_sandbox_name) THEN RETURN NULL; END IF;
  -- The HTTP completion route has a 60-second limit. A recent completion wins;
  -- an abandoned claim is recoverable only after 20 minutes, with a fresh rest
  -- timestamp fencing every late native landing even after the reap claim clears.
  IF r.sandbox_reap_claim IS NULL AND r.rest_claimed_at IS NOT NULL
    AND r.rest_claimed_at > clock_timestamp()-interval '20 minutes' THEN RETURN NULL; END IF;
  SELECT * INTO c FROM public.native_agent_connections WHERE worker_run_id=r.id AND lease_id IS NOT NULL FOR UPDATE;
  IF FOUND THEN
    IF c.id IS DISTINCT FROM r.native_connection_id OR c.user_id IS DISTINCT FROM owner_id
      OR c.engine IS DISTINCT FROM r.agent_engine OR c.lease_kind NOT IN ('worker','stop') THEN RETURN NULL; END IF;
    IF c.worker_allocation_id IS NOT NULL THEN
      SELECT sandbox_name INTO allocation_name FROM public.agent_sandbox_allocations
        WHERE id=c.worker_allocation_id AND run_id=r.id AND created_by=owner_id;
      IF NOT FOUND OR allocation_name IS DISTINCT FROM p_sandbox_name THEN RETURN NULL; END IF;
    ELSIF p_sandbox_name IS NOT NULL THEN RETURN NULL;
    END IF;
    IF c.lease_kind='worker' THEN
      UPDATE public.native_agent_connections SET lease_kind='stop',lease_id=gen_random_uuid(),
        revision=revision+1,updated_at=clock_timestamp() WHERE id=c.id;
    END IF;
  END IF;
  IF r.sandbox_reap_claim IS NOT NULL THEN RETURN r.sandbox_reap_claim; END IF;
  UPDATE public.agent_runs SET sandbox_reap_claim=p_claim_id,sandbox_reap_claimed_at=clock_timestamp(),
    rest_claimed_at=clock_timestamp() WHERE id=r.id;
  RETURN p_claim_id;
END; $$;
REVOKE ALL ON FUNCTION public.claim_native_worker_recovery(uuid,timestamptz,timestamptz,text,text,uuid)
 FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.claim_native_worker_recovery(uuid,timestamptz,timestamptz,text,text,uuid) TO service_role;
COMMIT;
