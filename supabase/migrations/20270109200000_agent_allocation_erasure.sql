-- An unresolved external allocation is an erasure blocker, never an expiring lease.
BEGIN;

CREATE TABLE public.agent_project_erasure_fences (
  project_id uuid PRIMARY KEY,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.agent_sandbox_allocations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id uuid NOT NULL,
  project_id uuid NOT NULL,
  user_ids uuid[] NOT NULL,
  sandbox_name text NOT NULL,
  provider_key_id text,
  provider_pending boolean NOT NULL DEFAULT true,
  state text NOT NULL DEFAULT 'reserved' CHECK (state IN ('reserved','attached','revoked','cleaned')),
  created_at timestamptz NOT NULL DEFAULT now(),
  cleaned_at timestamptz
);
-- No foreign keys: account/project/run cascades must not erase cleanup evidence.
CREATE UNIQUE INDEX agent_sandbox_allocation_active_run
  ON public.agent_sandbox_allocations(run_id) WHERE provider_pending AND state<>'cleaned';
CREATE INDEX agent_sandbox_allocation_project ON public.agent_sandbox_allocations(project_id) WHERE state <> 'cleaned';
CREATE INDEX agent_sandbox_allocation_users ON public.agent_sandbox_allocations USING gin(user_ids);
ALTER TABLE public.agent_project_erasure_fences ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agent_sandbox_allocations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.agent_project_erasure_fences, public.agent_sandbox_allocations FROM PUBLIC, anon, authenticated;

CREATE FUNCTION public.begin_agent_project_erasure(p_project_id uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF pg_catalog.current_setting('transaction_isolation') <> 'read committed' THEN
    RAISE EXCEPTION 'agent_allocation_requires_read_committed';
  END IF;
  PERFORM id FROM public.projects WHERE id=p_project_id FOR UPDATE;
  INSERT INTO public.agent_project_erasure_fences(project_id) VALUES(p_project_id) ON CONFLICT DO NOTHING;
  UPDATE public.agent_sandbox_allocations SET state='revoked' WHERE project_id=p_project_id AND state<>'cleaned';
  RETURN true;
END; $$;

CREATE OR REPLACE FUNCTION public.begin_agent_account_erasure(p_user_id uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF p_user_id IS NULL OR pg_catalog.current_setting('transaction_isolation') <> 'read committed' THEN
    RAISE EXCEPTION 'agent_account_erasure_requires_read_committed';
  END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_user_id::text,5911900));
  IF NOT EXISTS(SELECT 1 FROM auth.users WHERE id=p_user_id) THEN
    RAISE EXCEPTION 'agent_account_erasure_user_missing';
  END IF;
  INSERT INTO public.agent_account_erasure_fences(user_id) VALUES(p_user_id) ON CONFLICT DO NOTHING;
  UPDATE public.agent_sandbox_allocations SET state='revoked' WHERE user_ids @> ARRAY[p_user_id] AND state<>'cleaned';
  RETURN true;
END; $$;

CREATE FUNCTION public.reserve_agent_sandbox_allocation(p_run_id uuid,p_sandbox_name text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_run public.agent_runs; v_owner uuid; v_private uuid; v_deleted timestamptz; v_users uuid[]; v_user uuid; v_id uuid;
BEGIN
  IF pg_catalog.current_setting('transaction_isolation') <> 'read committed' THEN
    RAISE EXCEPTION 'agent_allocation_requires_read_committed';
  END IF;
  SELECT * INTO v_run FROM public.agent_runs WHERE id=p_run_id;
  IF NOT FOUND OR v_run.status <> 'running' OR p_sandbox_name !~ ('^agent-v2-'||p_run_id::text||'(-[0-9a-f]{12})?$') THEN
    RAISE EXCEPTION 'agent_allocation_run_unavailable';
  END IF;
  SELECT owner_id,deleted_at INTO v_owner,v_deleted FROM public.projects WHERE id=v_run.project_id FOR SHARE;
  IF NOT FOUND OR v_deleted IS NOT NULL OR EXISTS(SELECT 1 FROM public.agent_project_erasure_fences WHERE project_id=v_run.project_id) THEN
    RAISE EXCEPTION 'agent_allocation_project_unavailable';
  END IF;
  SELECT owner_id INTO v_private FROM public.agent_conversations WHERE id=v_run.conversation_id AND visibility='private';
  SELECT array_agg(u ORDER BY u) INTO v_users FROM (SELECT DISTINCT u FROM unnest(ARRAY[v_run.created_by,v_owner,v_private]) u WHERE u IS NOT NULL) q;
  FOREACH v_user IN ARRAY v_users LOOP
    PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_user::text,5911900));
    IF NOT EXISTS(SELECT 1 FROM auth.users WHERE id=v_user) OR EXISTS(SELECT 1 FROM public.agent_account_erasure_fences WHERE user_id=v_user) THEN
      RAISE EXCEPTION 'agent_allocation_account_erasing';
    END IF;
  END LOOP;
  IF EXISTS(SELECT 1 FROM public.agent_sandbox_allocations WHERE run_id=p_run_id AND (provider_pending OR state='revoked')) THEN
    RAISE EXCEPTION 'agent_allocation_cleanup_pending';
  END IF;
  INSERT INTO public.agent_sandbox_allocations(run_id,project_id,user_ids,sandbox_name)
    VALUES(p_run_id,v_run.project_id,v_users,p_sandbox_name) RETURNING id INTO v_id;
  RETURN v_id;
END; $$;

CREATE FUNCTION public.record_agent_allocation_key(p_id uuid,p_key_id text)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_state text;
BEGIN
  UPDATE public.agent_sandbox_allocations SET provider_key_id=p_key_id
    WHERE id=p_id AND state<>'cleaned' AND provider_key_id IS NULL RETURNING state INTO v_state;
  RETURN FOUND AND v_state<>'revoked';
END; $$;

CREATE FUNCTION public.attach_agent_sandbox_allocation(p_id uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_alloc public.agent_sandbox_allocations; v_user uuid; v_deleted timestamptz;
BEGIN
  IF pg_catalog.current_setting('transaction_isolation') <> 'read committed' THEN
    RAISE EXCEPTION 'agent_allocation_requires_read_committed';
  END IF;
  SELECT * INTO v_alloc FROM public.agent_sandbox_allocations WHERE id=p_id;
  IF NOT FOUND THEN RETURN false; END IF;
  SELECT deleted_at INTO v_deleted FROM public.projects WHERE id=v_alloc.project_id FOR SHARE;
  IF NOT FOUND OR v_deleted IS NOT NULL OR EXISTS(SELECT 1 FROM public.agent_project_erasure_fences WHERE project_id=v_alloc.project_id) THEN RETURN false; END IF;
  FOREACH v_user IN ARRAY v_alloc.user_ids LOOP
    PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_user::text,5911900));
    IF NOT EXISTS(SELECT 1 FROM auth.users WHERE id=v_user) OR EXISTS(SELECT 1 FROM public.agent_account_erasure_fences WHERE user_id=v_user) THEN RETURN false; END IF;
  END LOOP;
  IF NOT EXISTS(SELECT 1 FROM public.agent_runs WHERE id=v_alloc.run_id AND status='running') THEN RETURN false; END IF;
  UPDATE public.agent_sandbox_allocations SET state='attached' WHERE id=p_id AND state IN ('reserved','attached');
  RETURN FOUND;
END; $$;

CREATE FUNCTION public.settle_agent_sandbox_allocation(p_id uuid)
RETURNS boolean LANGUAGE sql SECURITY DEFINER SET search_path = '' AS $$
  UPDATE public.agent_sandbox_allocations SET provider_pending=false WHERE id=p_id AND state<>'cleaned' RETURNING true;
$$;
CREATE FUNCTION public.complete_agent_allocation_cleanup(p_id uuid)
RETURNS boolean LANGUAGE sql SECURITY DEFINER SET search_path = '' AS $$
  UPDATE public.agent_sandbox_allocations SET state='cleaned',cleaned_at=clock_timestamp(),provider_key_id=NULL
    WHERE id=p_id AND NOT provider_pending RETURNING true;
$$;
CREATE FUNCTION public.revoke_agent_sandbox_allocations(p_scope text,p_scope_id uuid)
RETURNS SETOF public.agent_sandbox_allocations LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF p_scope NOT IN ('account','project') OR p_scope IS NULL OR p_scope_id IS NULL THEN RAISE EXCEPTION 'agent_allocation_scope_invalid'; END IF;
  IF p_scope='project' AND NOT EXISTS(SELECT 1 FROM public.agent_project_erasure_fences WHERE project_id=p_scope_id) OR
     p_scope='account' AND NOT EXISTS(SELECT 1 FROM public.agent_account_erasure_fences WHERE user_id=p_scope_id) THEN
    RAISE EXCEPTION 'agent_allocation_erasure_fence_missing';
  END IF;
  RETURN QUERY UPDATE public.agent_sandbox_allocations SET state='revoked'
    WHERE state<>'cleaned' AND CASE WHEN p_scope='project' THEN project_id=p_scope_id ELSE user_ids @> ARRAY[p_scope_id] END
    RETURNING *;
END; $$;

REVOKE ALL ON FUNCTION public.begin_agent_project_erasure(uuid), public.reserve_agent_sandbox_allocation(uuid,text),
  public.record_agent_allocation_key(uuid,text),public.attach_agent_sandbox_allocation(uuid),public.settle_agent_sandbox_allocation(uuid),
  public.complete_agent_allocation_cleanup(uuid),public.revoke_agent_sandbox_allocations(text,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.begin_agent_project_erasure(uuid),public.reserve_agent_sandbox_allocation(uuid,text),
  public.record_agent_allocation_key(uuid,text),public.attach_agent_sandbox_allocation(uuid),public.settle_agent_sandbox_allocation(uuid),
  public.complete_agent_allocation_cleanup(uuid),public.revoke_agent_sandbox_allocations(text,uuid) TO service_role;
COMMIT;
