BEGIN;
-- PostgREST may truncate SETOF RPC responses. A separate boolean oracle covers
-- every reservation before soft-trash/account erasure can report completion.
CREATE FUNCTION public.agent_allocation_erasure_complete(p_scope text,p_scope_id uuid)
RETURNS boolean LANGUAGE sql SECURITY DEFINER SET search_path = '' AS $$
  SELECT p_scope IN ('account','project') AND p_scope_id IS NOT NULL AND
    CASE WHEN p_scope='project' THEN EXISTS(SELECT 1 FROM public.agent_project_erasure_fences WHERE project_id=p_scope_id)
      ELSE EXISTS(SELECT 1 FROM public.agent_account_erasure_fences WHERE user_id=p_scope_id) END AND
    NOT EXISTS(SELECT 1 FROM public.agent_sandbox_allocations a WHERE a.state<>'cleaned' AND
      CASE WHEN p_scope='project' THEN a.project_id=p_scope_id ELSE a.user_ids @> ARRAY[p_scope_id] END);
$$;
REVOKE ALL ON FUNCTION public.agent_allocation_erasure_complete(text,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.agent_allocation_erasure_complete(text,uuid) TO service_role;
COMMIT;
