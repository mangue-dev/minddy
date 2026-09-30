BEGIN;
-- Failed executors revoke their own pending intent before returning. The drain
-- retries physical deletion even when the provider's terminal outcome is unknown.
CREATE FUNCTION public.revoke_agent_sandbox_allocation(p_id uuid)
RETURNS boolean LANGUAGE sql SECURITY DEFINER SET search_path = '' AS $$
  UPDATE public.agent_sandbox_allocations SET state='revoked' WHERE id=p_id AND state<>'cleaned' RETURNING true;
$$;
REVOKE ALL ON FUNCTION public.revoke_agent_sandbox_allocation(uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.revoke_agent_sandbox_allocation(uuid) TO service_role;
COMMIT;
