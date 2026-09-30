BEGIN;
ALTER TABLE public.agent_sandbox_allocations ADD COLUMN key_request_pending boolean NOT NULL DEFAULT false;

CREATE FUNCTION public.begin_agent_allocation_key_request(p_id uuid)
RETURNS boolean LANGUAGE sql SECURITY DEFINER SET search_path = '' AS $$
  UPDATE public.agent_sandbox_allocations SET key_request_pending=true
    WHERE id=p_id AND state IN ('reserved','attached') AND provider_pending AND NOT key_request_pending
      AND provider_key_id IS NULL RETURNING true;
$$;
CREATE OR REPLACE FUNCTION public.record_agent_allocation_key(p_id uuid,p_key_id text)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_state text;
BEGIN
  UPDATE public.agent_sandbox_allocations SET provider_key_id=p_key_id,key_request_pending=false
    WHERE id=p_id AND state<>'cleaned' AND provider_key_id IS NULL RETURNING state INTO v_state;
  RETURN FOUND AND v_state<>'revoked';
END; $$;
CREATE FUNCTION public.confirm_agent_allocation_key_revoked(p_id uuid,p_key_id text)
RETURNS boolean LANGUAGE sql SECURITY DEFINER SET search_path = '' AS $$
  UPDATE public.agent_sandbox_allocations SET provider_key_id=NULL,key_request_pending=false
    WHERE id=p_id AND state<>'cleaned' AND p_key_id IS NOT NULL AND
      (provider_key_id IS NULL OR provider_key_id=p_key_id) RETURNING true;
$$;
CREATE OR REPLACE FUNCTION public.complete_agent_allocation_cleanup(p_id uuid)
RETURNS boolean LANGUAGE sql SECURITY DEFINER SET search_path = '' AS $$
  UPDATE public.agent_sandbox_allocations SET state='cleaned',cleaned_at=clock_timestamp(),provider_key_id=NULL
    WHERE id=p_id AND NOT provider_pending AND NOT key_request_pending RETURNING true;
$$;
REVOKE ALL ON FUNCTION public.begin_agent_allocation_key_request(uuid),public.confirm_agent_allocation_key_revoked(uuid,text)
  FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.begin_agent_allocation_key_request(uuid),public.confirm_agent_allocation_key_revoked(uuid,text) TO service_role;
REVOKE ALL ON FUNCTION public.record_agent_allocation_key(uuid,text) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.confirm_agent_allocation_key_revoked(uuid,text) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.complete_agent_allocation_cleanup(uuid) FROM PUBLIC,anon,authenticated;
COMMIT;
