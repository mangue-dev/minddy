-- Fence stale native watchdog cleanup before any hosted process is stopped.
BEGIN;
CREATE OR REPLACE FUNCTION public.check_native_agent_lease(p_id uuid,p_user_id uuid,p_engine text,
  p_generation bigint,p_lease_id uuid,p_revision bigint,p_cleanup boolean)
RETURNS public.native_agent_connections LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v public.native_agent_connections;
BEGIN
  IF p_user_id IS NULL OR p_cleanup IS NULL OR pg_catalog.current_setting('transaction_isolation') <> 'read committed' THEN
    RAISE EXCEPTION 'native_connection_invalid_request';
  END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_user_id::text,5911900));
  SELECT * INTO v FROM public.native_agent_connections WHERE id=p_id AND user_id=p_user_id AND engine=p_engine FOR UPDATE;
  IF NOT FOUND OR v.generation IS DISTINCT FROM p_generation OR v.lease_id IS DISTINCT FROM p_lease_id
    OR p_lease_id IS NULL OR v.revision IS DISTINCT FROM p_revision THEN RAISE EXCEPTION 'native_connection_stale_lease'; END IF;
  IF NOT p_cleanup AND (v.lease_kind='stop' OR v.lease_expires_at <= clock_timestamp()
    OR EXISTS(SELECT 1 FROM public.agent_account_erasure_fences WHERE user_id=p_user_id)) THEN
    RAISE EXCEPTION 'native_connection_stop_required';
  END IF;
  IF NOT p_cleanup AND v.worker_run_id IS NOT NULL AND (
    public.agent_allocation_run_authority_current(v.worker_run_id) IS NOT TRUE
    OR NOT EXISTS(SELECT 1 FROM public.agent_runs r WHERE r.id=v.worker_run_id AND r.created_by=v.user_id
      AND r.status='running' AND r.sandbox_reap_claim IS NULL AND NOT r.local_exec AND r.agent_engine=v.engine AND r.key_mode='subscription'
      AND r.native_connection_id=v.id AND r.native_connection_generation=v.generation)
    OR (v.worker_allocation_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.agent_sandbox_allocations a
      WHERE a.id=v.worker_allocation_id AND a.run_id=v.worker_run_id AND a.created_by=v.user_id AND a.state IN ('reserved','attached')))
  ) THEN RAISE EXCEPTION 'native_worker_authority_revoked'; END IF;
  RETURN v;
END; $$;

CREATE OR REPLACE FUNCTION public.acquire_native_worker_connection(p_run_id uuid)
RETURNS SETOF public.native_agent_connections LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE r public.agent_runs; v public.native_agent_connections;
BEGIN
  SELECT * INTO r FROM public.agent_runs WHERE id=p_run_id;
  IF NOT FOUND OR r.created_by IS NULL OR r.status<>'running' OR r.sandbox_reap_claim IS NOT NULL OR r.local_exec
    OR r.agent_engine NOT IN ('codex','claude_code') OR r.key_mode<>'subscription'
    OR public.agent_allocation_run_authority_current(r.id) IS NOT TRUE THEN RAISE EXCEPTION 'native_worker_invalid_run'; END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(r.created_by::text,5911900));
  -- Re-read under the recovery lock after waiting for account serialization.
  SELECT * INTO r FROM public.agent_runs WHERE id=p_run_id FOR UPDATE;
  IF NOT FOUND OR r.status<>'running' OR r.sandbox_reap_claim IS NOT NULL THEN
    RAISE EXCEPTION 'native_worker_invalid_run'; END IF;
  IF EXISTS(SELECT 1 FROM public.agent_account_erasure_fences WHERE user_id=r.created_by) THEN
    RAISE EXCEPTION 'native_connection_owner_unavailable'; END IF;
  SELECT * INTO v FROM public.native_agent_connections WHERE id=r.native_connection_id AND user_id=r.created_by
    AND engine=r.agent_engine AND generation=r.native_connection_generation AND status='connected' FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'native_connection_not_connected'; END IF;
  IF v.lease_id IS NOT NULL THEN RETURN; END IF;
  UPDATE public.native_agent_connections SET lease_id=gen_random_uuid(),lease_kind='worker',
    lease_expires_at=clock_timestamp()+interval '20 minutes',revision=revision+1,updated_at=clock_timestamp(),
    worker_run_id=r.id,worker_allocation_id=NULL WHERE id=v.id RETURNING * INTO v;
  v.profile_ciphertext:=NULL; v.runtime_ciphertext:=NULL;
  RETURN NEXT v;
END; $$;

CREATE FUNCTION public.claim_native_worker_recovery(p_run_id uuid,p_started_at timestamptz,
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
  -- A completed report owns its rest claim unless this is an existing recovery.
  IF r.sandbox_reap_claim IS NULL AND r.rest_claimed_at IS NOT NULL THEN RETURN NULL; END IF;
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
