-- Hosted native subscription workers share the encrypted account vault and allocation ledger.
BEGIN;
ALTER TABLE public.user_agent_preferences ADD COLUMN default_engine text NOT NULL DEFAULT 'opencode'
  CHECK (default_engine IN ('opencode','codex','claude_code'));
ALTER TABLE public.agent_runs
  DROP CONSTRAINT agent_runs_agent_engine_check,
  DROP CONSTRAINT agent_runs_key_mode_check,
  ADD CONSTRAINT agent_runs_agent_engine_check CHECK(agent_engine IN ('loop','opencode','codex','claude_code')),
  ADD CONSTRAINT agent_runs_key_mode_check CHECK(key_mode IN ('platform','byok','subscription')),
  ADD COLUMN native_connection_id uuid,
  ADD COLUMN native_connection_generation bigint,
  ADD CONSTRAINT agent_runs_native_subscription_shape CHECK (COALESCE((
    (agent_engine IN ('codex','claude_code') AND key_mode='subscription' AND NOT local_exec
      AND loop_in_vm AND native_connection_id IS NOT NULL AND native_connection_generation>0
      AND worker_model_source='account'
      AND ((agent_engine='codex' AND model='codex/default' AND worker_model_provider='openai')
        OR (agent_engine='claude_code' AND model='claude_code/default' AND worker_model_provider='anthropic')))
    OR (agent_engine IN ('loop','opencode') AND key_mode IN ('platform','byok')
      AND native_connection_id IS NULL AND native_connection_generation IS NULL)),false));
ALTER TABLE public.native_agent_connections
  DROP CONSTRAINT native_agent_connections_lease_kind_check,
  ADD CONSTRAINT native_agent_connections_lease_kind_check CHECK(lease_kind IN ('login','test','worker','stop')),
  ADD COLUMN worker_run_id uuid,
  ADD COLUMN worker_allocation_id uuid,
  ADD CONSTRAINT native_agent_worker_binding CHECK (
    (worker_run_id IS NULL AND worker_allocation_id IS NULL AND lease_kind IS DISTINCT FROM 'worker')
    OR (worker_run_id IS NOT NULL AND lease_kind IN ('worker','stop')));
-- Run/allocation identities deliberately have no cascade FK: teardown evidence must survive run deletion.
CREATE INDEX native_agent_worker_run ON public.native_agent_connections(worker_run_id) WHERE worker_run_id IS NOT NULL;

CREATE FUNCTION public.guard_native_worker_run_contract()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
  IF TG_OP='UPDATE' AND (OLD.agent_engine IN ('codex','claude_code') OR NEW.agent_engine IN ('codex','claude_code'))
    AND ROW(NEW.created_by,NEW.agent_engine,NEW.key_mode,NEW.model,NEW.worker_model_source,
      NEW.worker_model_provider,NEW.native_connection_id,NEW.native_connection_generation,NEW.local_exec,NEW.loop_in_vm)
    IS DISTINCT FROM ROW(OLD.created_by,OLD.agent_engine,OLD.key_mode,OLD.model,OLD.worker_model_source,
      OLD.worker_model_provider,OLD.native_connection_id,OLD.native_connection_generation,OLD.local_exec,OLD.loop_in_vm) THEN
    RAISE EXCEPTION 'native_worker_contract_immutable';
  END IF;
  IF TG_OP='INSERT' AND NEW.agent_engine IN ('codex','claude_code') THEN
    PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(NEW.created_by::text,5911900));
    IF EXISTS(SELECT 1 FROM public.agent_account_erasure_fences WHERE user_id=NEW.created_by)
      OR NOT EXISTS(SELECT 1 FROM public.native_agent_connections WHERE id=NEW.native_connection_id
        AND user_id=NEW.created_by AND engine=NEW.agent_engine AND generation=NEW.native_connection_generation
        AND status='connected') THEN RAISE EXCEPTION 'native_worker_connection_unavailable'; END IF;
  END IF;
  RETURN NEW;
END; $$;
CREATE TRIGGER agent_runs_native_contract BEFORE INSERT OR UPDATE ON public.agent_runs
  FOR EACH ROW EXECUTE FUNCTION public.guard_native_worker_run_contract();
REVOKE ALL ON FUNCTION public.guard_native_worker_run_contract() FROM PUBLIC,anon,authenticated,service_role;

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
      AND r.status='running' AND NOT r.local_exec AND r.agent_engine=v.engine AND r.key_mode='subscription'
      AND r.native_connection_id=v.id AND r.native_connection_generation=v.generation)
    OR (v.worker_allocation_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.agent_sandbox_allocations a
      WHERE a.id=v.worker_allocation_id AND a.run_id=v.worker_run_id AND a.created_by=v.user_id AND a.state IN ('reserved','attached')))
  ) THEN RAISE EXCEPTION 'native_worker_authority_revoked'; END IF;
  RETURN v;
END; $$;

CREATE FUNCTION public.acquire_native_worker_connection(p_run_id uuid)
RETURNS SETOF public.native_agent_connections LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE r public.agent_runs; v public.native_agent_connections;
BEGIN
  SELECT * INTO r FROM public.agent_runs WHERE id=p_run_id;
  IF NOT FOUND OR r.created_by IS NULL OR r.status<>'running' OR r.local_exec
    OR r.agent_engine NOT IN ('codex','claude_code') OR r.key_mode<>'subscription'
    OR public.agent_allocation_run_authority_current(r.id) IS NOT TRUE THEN RAISE EXCEPTION 'native_worker_invalid_run'; END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(r.created_by::text,5911900));
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

CREATE FUNCTION public.bind_native_worker_allocation(p_id uuid,p_user_id uuid,p_engine text,
  p_generation bigint,p_lease_id uuid,p_revision bigint,p_allocation_id uuid)
RETURNS SETOF public.native_agent_connections LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v public.native_agent_connections;
BEGIN
  v:=public.check_native_agent_lease(p_id,p_user_id,p_engine,p_generation,p_lease_id,p_revision,false);
  IF v.lease_kind<>'worker' OR v.worker_allocation_id IS NOT NULL OR NOT EXISTS(
    SELECT 1 FROM public.agent_sandbox_allocations a WHERE a.id=p_allocation_id AND a.run_id=v.worker_run_id
      AND a.created_by=v.user_id AND a.state IN ('reserved','attached')) THEN
    RAISE EXCEPTION 'native_worker_allocation_invalid'; END IF;
  UPDATE public.native_agent_connections SET worker_allocation_id=p_allocation_id,revision=revision+1,
    updated_at=clock_timestamp() WHERE id=v.id RETURNING * INTO v;
  v.profile_ciphertext:=NULL; v.runtime_ciphertext:=NULL;
  RETURN NEXT v;
END; $$;

CREATE FUNCTION public.get_native_worker_connection(p_run_id uuid,p_sandbox_name text DEFAULT NULL,p_execution boolean DEFAULT true)
RETURNS SETOF public.native_agent_connections LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v public.native_agent_connections;
BEGIN
  IF p_execution IS NULL THEN RAISE EXCEPTION 'native_connection_invalid_request'; END IF;
  SELECT * INTO v FROM public.native_agent_connections WHERE worker_run_id=p_run_id AND lease_id IS NOT NULL;
  IF NOT FOUND THEN RETURN; END IF;
  v:=public.check_native_agent_lease(v.id,v.user_id,v.engine,v.generation,v.lease_id,v.revision,NOT p_execution);
  IF p_execution AND (v.lease_kind<>'worker' OR NOT EXISTS(SELECT 1 FROM public.agent_sandbox_allocations a
    WHERE a.id=v.worker_allocation_id AND a.run_id=p_run_id AND a.state='attached'
      AND a.sandbox_name=p_sandbox_name AND NOT a.provider_pending)) THEN
    RAISE EXCEPTION 'native_worker_allocation_invalid'; END IF;
  v.profile_ciphertext:=NULL; v.runtime_ciphertext:=NULL;
  RETURN NEXT v;
END; $$;

CREATE FUNCTION public.renew_native_worker_connection(p_id uuid,p_user_id uuid,p_engine text,
  p_generation bigint,p_lease_id uuid,p_revision bigint)
RETURNS SETOF public.native_agent_connections LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v public.native_agent_connections;
BEGIN
  v:=public.check_native_agent_lease(p_id,p_user_id,p_engine,p_generation,p_lease_id,p_revision,false);
  IF v.lease_kind<>'worker' THEN RAISE EXCEPTION 'native_worker_invalid_run'; END IF;
  UPDATE public.native_agent_connections SET lease_expires_at=clock_timestamp()+interval '20 minutes',
    updated_at=clock_timestamp() WHERE id=v.id RETURNING * INTO v;
  -- Heartbeats do not change the profile revision or compete with write-back CAS.
  v.profile_ciphertext:=NULL; v.runtime_ciphertext:=NULL;
  RETURN NEXT v;
END; $$;

CREATE OR REPLACE FUNCTION public.release_native_agent_connection(p_id uuid,p_user_id uuid,p_engine text,
  p_generation bigint,p_lease_id uuid,p_revision bigint)
RETURNS SETOF public.native_agent_connections LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v public.native_agent_connections;
BEGIN
  v:=public.check_native_agent_lease(p_id,p_user_id,p_engine,p_generation,p_lease_id,p_revision,true);
  IF v.worker_allocation_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.agent_sandbox_allocations a
    WHERE a.id=v.worker_allocation_id AND a.state='cleaned' AND NOT a.provider_pending AND NOT a.key_request_pending) THEN
    RAISE EXCEPTION 'native_worker_cleanup_unconfirmed'; END IF;
  UPDATE public.native_agent_connections SET lease_id=NULL,lease_kind=NULL,lease_expires_at=NULL,
    runtime_ciphertext=NULL,worker_run_id=NULL,worker_allocation_id=NULL,revision=revision+1,updated_at=clock_timestamp()
    WHERE id=v.id RETURNING * INTO v;
  v.profile_ciphertext:=NULL;
  RETURN NEXT v;
END; $$;

CREATE FUNCTION public.stop_native_worker_connection(p_id uuid,p_user_id uuid,p_engine text,
  p_generation bigint,p_lease_id uuid,p_revision bigint)
RETURNS SETOF public.native_agent_connections LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v public.native_agent_connections;
BEGIN
  v:=public.check_native_agent_lease(p_id,p_user_id,p_engine,p_generation,p_lease_id,p_revision,true);
  IF v.worker_run_id IS NULL THEN RAISE EXCEPTION 'native_worker_invalid_run'; END IF;
  IF v.lease_kind='stop' THEN v.profile_ciphertext:=NULL; v.runtime_ciphertext:=NULL; RETURN NEXT v; RETURN; END IF;
  UPDATE public.native_agent_connections SET lease_id=gen_random_uuid(),lease_kind='stop',revision=revision+1,
    updated_at=clock_timestamp() WHERE id=v.id RETURNING * INTO v;
  v.profile_ciphertext:=NULL; v.runtime_ciphertext:=NULL;
  RETURN NEXT v;
END; $$;
REVOKE ALL ON FUNCTION public.stop_native_worker_connection(uuid,uuid,text,bigint,uuid,bigint) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.stop_native_worker_connection(uuid,uuid,text,bigint,uuid,bigint) TO service_role;

CREATE FUNCTION public.get_native_worker_allocation(p_id uuid,p_user_id uuid,p_engine text,
  p_generation bigint,p_lease_id uuid,p_revision bigint)
RETURNS SETOF public.agent_sandbox_allocations LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v public.native_agent_connections;
BEGIN
  v:=public.check_native_agent_lease(p_id,p_user_id,p_engine,p_generation,p_lease_id,p_revision,true);
  IF v.worker_run_id IS NULL THEN RAISE EXCEPTION 'native_worker_invalid_run'; END IF;
  RETURN QUERY SELECT a.* FROM public.agent_sandbox_allocations a WHERE a.id=v.worker_allocation_id AND a.run_id=v.worker_run_id;
END; $$;
REVOKE ALL ON FUNCTION public.get_native_worker_allocation(uuid,uuid,text,bigint,uuid,bigint) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.get_native_worker_allocation(uuid,uuid,text,bigint,uuid,bigint) TO service_role;

REVOKE ALL ON FUNCTION public.acquire_native_worker_connection(uuid),
  public.bind_native_worker_allocation(uuid,uuid,text,bigint,uuid,bigint,uuid),
  public.get_native_worker_connection(uuid,text,boolean),
  public.renew_native_worker_connection(uuid,uuid,text,bigint,uuid,bigint) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.acquire_native_worker_connection(uuid),
  public.bind_native_worker_allocation(uuid,uuid,text,bigint,uuid,bigint,uuid),
  public.get_native_worker_connection(uuid,text,boolean),
  public.renew_native_worker_connection(uuid,uuid,text,bigint,uuid,bigint) TO service_role;

CREATE OR REPLACE FUNCTION public.upsert_agent_preferences_protected(
  p_user_id uuid,p_values jsonb,p_branch_cipher text,p_replace_branch boolean
) RETURNS public.user_agent_preferences LANGUAGE plpgsql SECURITY DEFINER
SET search_path='' AS $$
DECLARE saved public.user_agent_preferences;
BEGIN
  IF p_user_id IS NULL OR p_values IS NULL OR
      pg_catalog.jsonb_typeof(p_values)<>'object' OR
      p_replace_branch IS NULL OR
      public.agent_branch_prefix_version(p_branch_cipher)=0 OR
      EXISTS(SELECT 1 FROM pg_catalog.jsonb_object_keys(p_values) AS k(key)
        WHERE k.key NOT IN ('default_engine','default_model','default_model_provider',
          'default_reasoning_level','sandbox_region','sandbox_size')) THEN
    RAISE EXCEPTION 'agent_preferences_protected_invalid'
      USING ERRCODE='22023';
  END IF;
  INSERT INTO public.user_agent_preferences(user_id,branch_prefix,
    default_engine,default_model,default_model_provider,default_reasoning_level,
    sandbox_region,sandbox_size)
  VALUES(p_user_id,p_branch_cipher,COALESCE(p_values->>'default_engine','opencode'),p_values->>'default_model',
    p_values->>'default_model_provider',p_values->>'default_reasoning_level',
    COALESCE(p_values->>'sandbox_region','eu'),
    COALESCE(p_values->>'sandbox_size','standard'))
  ON CONFLICT(user_id) DO UPDATE SET
    branch_prefix=CASE WHEN p_replace_branch THEN EXCLUDED.branch_prefix
      ELSE user_agent_preferences.branch_prefix END,
    default_engine=CASE WHEN p_values ? 'default_engine' THEN EXCLUDED.default_engine ELSE user_agent_preferences.default_engine END,
    default_model=CASE WHEN p_values ? 'default_model'
      THEN EXCLUDED.default_model ELSE user_agent_preferences.default_model END,
    default_model_provider=CASE WHEN p_values ? 'default_model_provider'
      THEN EXCLUDED.default_model_provider
      ELSE user_agent_preferences.default_model_provider END,
    default_reasoning_level=CASE WHEN p_values ? 'default_reasoning_level'
      THEN EXCLUDED.default_reasoning_level
      ELSE user_agent_preferences.default_reasoning_level END,
    sandbox_region=CASE WHEN p_values ? 'sandbox_region'
      THEN EXCLUDED.sandbox_region ELSE user_agent_preferences.sandbox_region END,
    sandbox_size=CASE WHEN p_values ? 'sandbox_size'
      THEN EXCLUDED.sandbox_size ELSE user_agent_preferences.sandbox_size END,
    updated_at=pg_catalog.clock_timestamp()
  RETURNING * INTO saved;
  RETURN saved;
END;
$$;
REVOKE ALL ON FUNCTION public.upsert_agent_preferences_protected(
  uuid,jsonb,text,boolean) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.upsert_agent_preferences_protected(
  uuid,jsonb,text,boolean) TO service_role;


-- Native workers reserve hosted compute from the same managed account budget.
CREATE OR REPLACE FUNCTION public.create_agent_run_with_budget(
  p_user_id uuid,
  p_usage_since timestamptz,
  p_budget_cap numeric,
  p_requested_budget numeric,
  p_values jsonb
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_spent numeric;
  v_reserved numeric;
  v_granted numeric;
  v_operation_spent numeric;
  v_operation_total_spent numeric;
  v_parent public.numo_assistant_turns%ROWTYPE;
  v_run public.agent_runs%ROWTYPE;
BEGIN
  IF p_user_id IS NULL
     OR p_usage_since IS NULL
     OR p_budget_cap IS NULL OR p_budget_cap < 0
     OR p_requested_budget IS NULL OR p_requested_budget <= 0
     OR p_values IS NULL OR pg_catalog.jsonb_typeof(p_values) <> 'object'
     OR p_values - ARRAY[
       'id', 'conversation_id', 'project_id', 'issue_id', 'pull_request_id', 'pr_head_sha',
       'repo_link_id', 'connection_id', 'repo_provider', 'repo_external_id',
       'status', 'triggered_by', 'created_by', 'prompt', 'prompt_mentions',
       'encrypted_launch_content', 'launch_encryption_version', 'has_launch_prompt',
       'parent_numo_conversation_id', 'parent_numo_turn_id',
       'parent_numo_tool_call_id', 'continued_from_run_id', 'delegation_brief',
       'delegation_attachments', 'encrypted_delegation_input',
       'delegation_encryption_version', 'title', 'title_ciphertext',
       'title_encryption_version', 'model', 'model_forced',
       'reasoning_level', 'key_mode', 'worker_model_source',
       'worker_model_provider', 'native_connection_id', 'native_connection_generation', 'base_branch', 'branch_name', 'pr_number',
       'pr_url', 'pr_state', 'run_id', 'chain_id', 'budget_usd', 'routine_id',
       'intent', 'deployment_url', 'loop_in_vm', 'agent_engine', 'local_exec',
       'local_issue_context_confirmed', 'local_worktree'
     ] <> '{}'::jsonb
     OR nullif(p_values->>'created_by', '')::uuid IS DISTINCT FROM p_user_id
     OR COALESCE(p_values->>'key_mode','') NOT IN ('platform','subscription')
     OR p_values->>'worker_model_source' IS DISTINCT FROM 'account'
     OR nullif(p_values->>'worker_model_provider', '') IS NULL
     OR p_values->>'status' IS DISTINCT FROM 'queued' THEN
    RAISE EXCEPTION 'agent_run_budget_values_invalid' USING ERRCODE = '22023';
  END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(p_user_id::text, 460)
  );

  IF nullif(p_values->>'parent_numo_turn_id', '') IS NOT NULL THEN
    SELECT * INTO v_parent
    FROM public.numo_assistant_turns
    WHERE id = (p_values->>'parent_numo_turn_id')::uuid
      AND user_id = p_user_id
      AND conversation_id = (p_values->>'parent_numo_conversation_id')::uuid
      AND status IN ('running', 'waiting_work', 'reconciling')
    FOR UPDATE;
    IF v_parent.id IS NULL THEN
      RETURN pg_catalog.jsonb_build_object(
        'run', NULL, 'granted_budget_usd', 0,
        'spent_usd', 0, 'reserved_usd', 0
      );
    END IF;
    SELECT COALESCE(SUM(cost), 0) INTO v_operation_spent
    FROM public.ai_usage
    WHERE numo_turn_id = v_parent.id AND key_mode = 'platform';
    SELECT COALESCE(SUM(cost), 0) INTO v_operation_total_spent
    FROM public.ai_usage
    WHERE numo_turn_id = v_parent.id;
    IF nullif(p_values->>'budget_usd', '') IS NOT NULL
       AND v_operation_total_spent >= (p_values->>'budget_usd')::numeric THEN
      RETURN pg_catalog.jsonb_build_object(
        'run', NULL, 'granted_budget_usd', 0,
        'spent_usd', v_operation_total_spent,
        'reserved_usd', COALESCE(v_parent.managed_budget_usd, 0)
      );
    END IF;
    IF v_parent.managed_budget_usd IS NULL THEN
      SELECT COALESCE(SUM(cost), 0) INTO v_spent
      FROM public.ai_usage
      WHERE user_id = p_user_id
        AND created_at >= p_usage_since
        AND key_mode = 'platform';
      SELECT
        COALESCE((
          SELECT SUM(GREATEST(
            run.managed_budget_usd - COALESCE(usage.spent, 0), 0
          ))
          FROM public.agent_runs AS run
          LEFT JOIN LATERAL (
            SELECT SUM(cost) AS spent FROM public.ai_usage
            WHERE run_id = run.run_id AND key_mode = 'platform'
          ) AS usage ON true
          WHERE run.created_by = p_user_id AND run.key_mode IN ('platform','subscription')
            AND run.parent_numo_turn_id IS NULL
            AND run.status IN ('queued', 'running')
            AND run.managed_budget_usd IS NOT NULL
        ), 0)
        + COALESCE((
          SELECT SUM(GREATEST(
            turn.managed_budget_usd - COALESCE(usage.spent, 0), 0
          ))
          FROM public.numo_assistant_turns AS turn
          LEFT JOIN LATERAL (
            SELECT SUM(cost) AS spent FROM public.ai_usage
            WHERE numo_turn_id = turn.id AND key_mode = 'platform'
          ) AS usage ON true
          WHERE turn.user_id = p_user_id
            AND turn.id IS DISTINCT FROM v_parent.id
            AND turn.status IN (
              'queued', 'running', 'waiting_work', 'stopping', 'retryable', 'reconciling'
            )
            AND turn.managed_budget_usd IS NOT NULL
        ), 0)
      INTO v_reserved;
      v_granted := LEAST(
        p_requested_budget,
        GREATEST(p_budget_cap - v_spent - v_reserved, 0)
      );
      IF v_granted <= 0 THEN
        RETURN pg_catalog.jsonb_build_object(
          'run', NULL, 'granted_budget_usd', 0,
          'spent_usd', v_spent, 'reserved_usd', v_reserved
        );
      END IF;
      UPDATE public.numo_assistant_turns
      SET managed_budget_usd = v_granted
      WHERE id = v_parent.id;
      v_parent.managed_budget_usd := v_granted;
    ELSIF v_operation_spent >= v_parent.managed_budget_usd THEN
      RETURN pg_catalog.jsonb_build_object(
        'run', NULL, 'granted_budget_usd', 0,
        'spent_usd', v_operation_spent,
        'reserved_usd', v_parent.managed_budget_usd
      );
    ELSE
      v_granted := v_parent.managed_budget_usd;
    END IF;
  ELSE
    SELECT COALESCE(SUM(cost), 0) INTO v_spent
    FROM public.ai_usage
    WHERE user_id = p_user_id
      AND created_at >= p_usage_since
      AND key_mode = 'platform';
    SELECT
      COALESCE((
        SELECT SUM(GREATEST(
          run.managed_budget_usd - COALESCE(usage.spent, 0), 0
        ))
        FROM public.agent_runs AS run
        LEFT JOIN LATERAL (
          SELECT SUM(cost) AS spent FROM public.ai_usage
          WHERE run_id = run.run_id AND key_mode = 'platform'
        ) AS usage ON true
        WHERE run.created_by = p_user_id AND run.key_mode IN ('platform','subscription')
          AND run.parent_numo_turn_id IS NULL
          AND run.status IN ('queued', 'running')
          AND run.managed_budget_usd IS NOT NULL
      ), 0)
      + COALESCE((
        SELECT SUM(GREATEST(
          turn.managed_budget_usd - COALESCE(usage.spent, 0), 0
        ))
        FROM public.numo_assistant_turns AS turn
        LEFT JOIN LATERAL (
          SELECT SUM(cost) AS spent FROM public.ai_usage
          WHERE numo_turn_id = turn.id AND key_mode = 'platform'
        ) AS usage ON true
        WHERE turn.user_id = p_user_id
          AND turn.status IN (
            'queued', 'running', 'waiting_work', 'stopping', 'retryable', 'reconciling'
          )
          AND turn.managed_budget_usd IS NOT NULL
      ), 0)
    INTO v_reserved;
    v_granted := LEAST(
      p_requested_budget,
      GREATEST(p_budget_cap - v_spent - v_reserved, 0)
    );
    IF v_granted <= 0 THEN
      RETURN pg_catalog.jsonb_build_object(
        'run', NULL, 'granted_budget_usd', 0,
        'spent_usd', v_spent, 'reserved_usd', v_reserved
      );
    END IF;
  END IF;

  INSERT INTO public.agent_runs (
    id, conversation_id, project_id, issue_id, pull_request_id, pr_head_sha,
    repo_link_id, connection_id, repo_provider, repo_external_id, status,
    triggered_by, created_by, prompt, prompt_mentions,
    encrypted_launch_content, launch_encryption_version, has_launch_prompt,
    parent_numo_conversation_id, parent_numo_turn_id, parent_numo_tool_call_id,
    continued_from_run_id, delegation_brief, delegation_attachments,
    encrypted_delegation_input, delegation_encryption_version, title, title_ciphertext, title_encryption_version,
    model, model_forced, reasoning_level, key_mode, worker_model_source,
    worker_model_provider, native_connection_id, native_connection_generation, base_branch, branch_name, pr_number, pr_url, pr_state,
    run_id, chain_id, budget_usd, routine_id, intent, deployment_url,
    loop_in_vm, agent_engine, local_exec, local_issue_context_confirmed,
    local_worktree, managed_budget_usd
  ) VALUES (
    COALESCE(nullif(p_values->>'id', '')::uuid, gen_random_uuid()),
    nullif(p_values->>'conversation_id', '')::uuid,
    (p_values->>'project_id')::uuid,
    nullif(p_values->>'issue_id', '')::uuid,
    nullif(p_values->>'pull_request_id', '')::uuid,
    p_values->>'pr_head_sha', nullif(p_values->>'repo_link_id', '')::uuid,
    nullif(p_values->>'connection_id', '')::uuid, p_values->>'repo_provider',
    p_values->>'repo_external_id', p_values->>'status', p_values->>'triggered_by',
    (p_values->>'created_by')::uuid, p_values->>'prompt', NULLIF(p_values->'prompt_mentions', 'null'::jsonb),
    p_values->>'encrypted_launch_content',
    COALESCE((p_values->>'launch_encryption_version')::integer, 0),
    COALESCE((p_values->>'has_launch_prompt')::boolean, false),
    nullif(p_values->>'parent_numo_conversation_id', '')::uuid,
    nullif(p_values->>'parent_numo_turn_id', '')::uuid,
    p_values->>'parent_numo_tool_call_id',
    nullif(p_values->>'continued_from_run_id', '')::uuid,
    NULLIF(p_values->'delegation_brief', 'null'::jsonb), COALESCE(p_values->'delegation_attachments', '[]'::jsonb),
    p_values->>'encrypted_delegation_input',
    COALESCE((p_values->>'delegation_encryption_version')::integer, 0),
    p_values->>'title', p_values->>'title_ciphertext',
    COALESCE((p_values->>'title_encryption_version')::integer, 0), p_values->>'model', (p_values->>'model_forced')::boolean,
    p_values->>'reasoning_level', p_values->>'key_mode',
    p_values->>'worker_model_source', p_values->>'worker_model_provider',
    nullif(p_values->>'native_connection_id','')::uuid,
    nullif(p_values->>'native_connection_generation','')::bigint,
    p_values->>'base_branch', p_values->>'branch_name',
    nullif(p_values->>'pr_number', '')::integer, p_values->>'pr_url',
    p_values->>'pr_state', (p_values->>'run_id')::uuid,
    nullif(p_values->>'chain_id', '')::uuid,
    nullif(p_values->>'budget_usd', '')::numeric,
    nullif(p_values->>'routine_id', '')::uuid, p_values->>'intent',
    p_values->>'deployment_url', (p_values->>'loop_in_vm')::boolean,
    p_values->>'agent_engine', (p_values->>'local_exec')::boolean,
    (p_values->>'local_issue_context_confirmed')::boolean,
    (p_values->>'local_worktree')::boolean, v_granted
  ) RETURNING * INTO v_run;

  RETURN pg_catalog.jsonb_build_object(
    'run', pg_catalog.to_jsonb(v_run), 'granted_budget_usd', v_granted,
    'spent_usd', COALESCE(v_spent, v_operation_spent, 0),
    'reserved_usd', COALESCE(v_reserved, v_parent.managed_budget_usd, 0)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.create_agent_run_with_budget(uuid,timestamptz,numeric,numeric,jsonb)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_agent_run_with_budget(uuid,timestamptz,numeric,numeric,jsonb)
  TO service_role;


CREATE OR REPLACE FUNCTION public.resume_agent_run_with_budget(
  p_run_id uuid,
  p_user_id uuid,
  p_usage_since timestamptz,
  p_budget_cap numeric,
  p_requested_budget numeric,
  p_not_before timestamptz
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_run public.agent_runs%ROWTYPE;
  v_parent public.numo_assistant_turns%ROWTYPE;
  v_spent numeric;
  v_reserved numeric;
  v_operation_spent numeric;
  v_granted numeric;
  v_stored_budget numeric;
  v_updated integer;
BEGIN
  IF p_run_id IS NULL OR p_user_id IS NULL OR p_usage_since IS NULL
     OR p_budget_cap IS NULL OR p_budget_cap < 0
     OR p_requested_budget IS NULL OR p_requested_budget <= 0
     OR p_not_before IS NULL THEN
    RAISE EXCEPTION 'agent_resume_budget_invalid' USING ERRCODE = '22023';
  END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(p_user_id::text, 460)
  );
  SELECT * INTO v_run FROM public.agent_runs WHERE id = p_run_id FOR UPDATE;
  IF v_run.id IS NULL OR v_run.created_by IS DISTINCT FROM p_user_id
     OR COALESCE(v_run.key_mode,'') NOT IN ('platform','subscription')
     OR v_run.status NOT IN ('completed', 'failed', 'canceled')
     OR (v_run.status = 'failed' AND (v_run.checkpoint IS NULL AND v_run.checkpoint_ciphertext IS NULL))
     OR v_run.sandbox_reap_claim IS NOT NULL THEN
    RETURN pg_catalog.jsonb_build_object('state', 'conflict');
  END IF;

  SELECT COALESCE(SUM(cost), 0) INTO v_spent
  FROM public.ai_usage
  WHERE user_id = p_user_id
    AND created_at >= p_usage_since
    AND key_mode = 'platform';
  SELECT
    COALESCE((
      SELECT SUM(GREATEST(
        run.managed_budget_usd - COALESCE(usage.spent, 0), 0
      ))
      FROM public.agent_runs AS run
      LEFT JOIN LATERAL (
        SELECT SUM(cost) AS spent FROM public.ai_usage
        WHERE run_id = run.run_id AND key_mode = 'platform'
      ) AS usage ON true
      WHERE run.created_by = p_user_id AND run.key_mode IN ('platform','subscription')
        AND run.parent_numo_turn_id IS NULL
        AND run.status IN ('queued', 'running')
        AND run.managed_budget_usd IS NOT NULL
    ), 0)
    + COALESCE((
      SELECT SUM(GREATEST(
        turn.managed_budget_usd - COALESCE(usage.spent, 0), 0
      ))
      FROM public.numo_assistant_turns AS turn
      LEFT JOIN LATERAL (
        SELECT SUM(cost) AS spent FROM public.ai_usage
        WHERE numo_turn_id = turn.id AND key_mode = 'platform'
      ) AS usage ON true
      WHERE turn.user_id = p_user_id
        AND turn.id IS DISTINCT FROM v_run.parent_numo_turn_id
        AND turn.status IN (
          'queued', 'running', 'waiting_work', 'stopping', 'retryable', 'reconciling'
        )
        AND turn.managed_budget_usd IS NOT NULL
    ), 0)
  INTO v_reserved;

  IF v_run.parent_numo_turn_id IS NOT NULL THEN
    SELECT * INTO v_parent FROM public.numo_assistant_turns
    WHERE id = v_run.parent_numo_turn_id AND user_id = p_user_id
      AND status IN ('running', 'waiting_input', 'waiting_work')
    FOR UPDATE;
    IF v_parent.id IS NULL THEN
      RETURN pg_catalog.jsonb_build_object('state', 'conflict');
    END IF;
    SELECT COALESCE(SUM(cost), 0) INTO v_operation_spent
    FROM public.ai_usage WHERE numo_turn_id = v_parent.id;
    IF v_run.budget_usd IS NOT NULL
       AND v_operation_spent >= v_run.budget_usd THEN
      RETURN pg_catalog.jsonb_build_object('state', 'no_budget');
    END IF;
  END IF;

  v_granted := LEAST(
    p_requested_budget,
    GREATEST(p_budget_cap - v_spent - v_reserved, 0),
    CASE
      WHEN v_parent.id IS NOT NULL AND v_run.budget_usd IS NOT NULL
        THEN GREATEST(v_run.budget_usd - v_operation_spent, 0)
      ELSE p_requested_budget
    END
  );
  IF v_granted <= 0 THEN
    RETURN pg_catalog.jsonb_build_object(
      'state', 'no_budget', 'spent_usd', v_spent, 'reserved_usd', v_reserved
    );
  END IF;

  v_stored_budget := CASE
    WHEN v_parent.id IS NOT NULL THEN v_granted + COALESCE(v_operation_spent, 0)
    ELSE v_granted
  END;

  UPDATE public.agent_runs
  SET status = 'queued', not_before = p_not_before,
      managed_budget_usd = v_stored_budget
  WHERE id = p_run_id;
  GET DIAGNOSTICS v_updated = ROW_COUNT;
  IF v_updated = 0 THEN
    RETURN pg_catalog.jsonb_build_object('state', 'conflict');
  END IF;
  IF v_parent.id IS NOT NULL THEN
    UPDATE public.numo_assistant_turns
    SET managed_budget_usd = v_stored_budget
    WHERE id = v_parent.id;
  END IF;
  RETURN pg_catalog.jsonb_build_object(
    'state', 'queued', 'granted_budget_usd', v_stored_budget
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.resume_latest_agent_run_with_message(
  p_run_id uuid,
  p_owner_id uuid,
  p_actor_id uuid,
  p_message_id uuid,
  p_content text,
  p_mentions jsonb,
  p_not_before timestamptz,
  p_usage_since timestamptz DEFAULT NULL,
  p_budget_cap numeric DEFAULT NULL,
  p_requested_budget numeric DEFAULT NULL
) RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_run public.agent_runs%ROWTYPE;
  v_parent public.numo_assistant_turns%ROWTYPE;
  v_conversation public.agent_conversations%ROWTYPE;
  v_latest_id uuid;
  v_anchor text;
  v_key_mode text;
  v_project_id uuid;
  v_conversation_id uuid;
  v_access text;
  v_spent numeric;
  v_reserved numeric;
  v_operation_platform_spent numeric;
  v_operation_total_spent numeric;
  v_granted numeric;
  v_stored_budget numeric;
  v_inserted integer;
BEGIN
  IF p_run_id IS NULL OR p_owner_id IS NULL OR p_actor_id IS NULL
     OR p_message_id IS NULL OR p_content IS NULL OR p_not_before IS NULL THEN
    RAISE EXCEPTION 'agent_resume_message_invalid' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_run FROM public.agent_runs WHERE id = p_run_id;
  IF v_run.id IS NULL OR v_run.created_by IS DISTINCT FROM p_owner_id THEN
    RETURN 'conflict';
  END IF;
  v_key_mode := v_run.key_mode;
  v_project_id := v_run.project_id;
  v_conversation_id := v_run.conversation_id;

  IF v_key_mode IN ('platform','subscription') THEN
    IF p_usage_since IS NULL OR p_budget_cap IS NULL OR p_budget_cap < 0
       OR p_requested_budget IS NULL OR p_requested_budget <= 0 THEN
      RAISE EXCEPTION 'agent_resume_budget_invalid' USING ERRCODE = '22023';
    END IF;
    PERFORM pg_catalog.pg_advisory_xact_lock(
      pg_catalog.hashtextextended(p_owner_id::text, 460)
    );
  END IF;

  v_anchor := CASE
    WHEN v_run.issue_id IS NOT NULL THEN 'issue:' || v_run.issue_id::text
    WHEN v_run.pull_request_id IS NOT NULL THEN 'pr:' || v_run.pull_request_id::text
    WHEN v_run.routine_id IS NOT NULL THEN 'routine:' || v_run.routine_id::text
    ELSE 'conversation:' || v_run.conversation_id::text
  END;
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('agent-run:' || v_anchor, 459)
  );

  v_access := public.lock_live_agent_run_project_access(
    v_project_id, p_owner_id, p_actor_id
  );
  IF v_access IS DISTINCT FROM 'ok' THEN RETURN v_access; END IF;

  SELECT * INTO v_run FROM public.agent_runs WHERE id = p_run_id FOR UPDATE;
  IF v_run.id IS NULL
     OR v_run.created_by IS DISTINCT FROM p_owner_id
     OR v_run.status NOT IN ('completed', 'failed', 'canceled')
     OR (v_run.status = 'failed' AND (v_run.checkpoint IS NULL AND v_run.checkpoint_ciphertext IS NULL))
     OR v_run.sandbox_reap_claim IS NOT NULL
     OR v_run.key_mode IS DISTINCT FROM v_key_mode
     OR v_run.project_id IS DISTINCT FROM v_project_id
     OR v_run.conversation_id IS DISTINCT FROM v_conversation_id THEN
    RETURN 'conflict';
  END IF;

  SELECT * INTO v_conversation FROM public.agent_conversations
  WHERE id = v_conversation_id AND project_id = v_project_id
  FOR UPDATE;
  IF v_conversation.id IS NULL OR (
    v_conversation.visibility IS DISTINCT FROM 'project'
    AND v_conversation.owner_id IS DISTINCT FROM p_actor_id
  ) THEN
    RETURN 'forbidden';
  END IF;
  IF v_anchor IS DISTINCT FROM (CASE
    WHEN v_run.issue_id IS NOT NULL THEN 'issue:' || v_run.issue_id::text
    WHEN v_run.pull_request_id IS NOT NULL THEN 'pr:' || v_run.pull_request_id::text
    WHEN v_run.routine_id IS NOT NULL THEN 'routine:' || v_run.routine_id::text
    ELSE 'conversation:' || v_run.conversation_id::text
  END) THEN
    RETURN 'conflict';
  END IF;

  SELECT id INTO v_latest_id FROM public.agent_runs
  WHERE CASE
    WHEN v_run.issue_id IS NOT NULL THEN issue_id = v_run.issue_id
    WHEN v_run.pull_request_id IS NOT NULL THEN pull_request_id = v_run.pull_request_id
    WHEN v_run.routine_id IS NOT NULL THEN routine_id = v_run.routine_id
    ELSE conversation_id = v_run.conversation_id
  END
  ORDER BY created_at DESC, id DESC LIMIT 1;
  IF v_latest_id IS DISTINCT FROM p_run_id THEN RETURN 'superseded'; END IF;
  IF NOT public.agent_run_repository_binding_is_current(
    v_run.project_id, v_run.repo_link_id, v_run.connection_id,
    v_run.repo_provider, v_run.repo_external_id
  ) THEN
    RETURN 'conflict';
  END IF;

  IF v_run.parent_numo_turn_id IS NOT NULL THEN
    SELECT * INTO v_parent FROM public.numo_assistant_turns
    WHERE id = v_run.parent_numo_turn_id
      AND conversation_id = v_run.parent_numo_conversation_id
      AND user_id = p_owner_id
      AND status IN ('running', 'waiting_input', 'waiting_work')
    FOR UPDATE;
    IF v_parent.id IS NULL THEN RETURN 'conflict'; END IF;
  END IF;

  IF v_key_mode IN ('platform','subscription') THEN
    SELECT COALESCE(SUM(cost), 0) INTO v_spent
    FROM public.ai_usage
    WHERE user_id = p_owner_id
      AND created_at >= p_usage_since
      AND key_mode = 'platform';
    SELECT
      COALESCE((
        SELECT SUM(GREATEST(
          run.managed_budget_usd - COALESCE(usage.spent, 0), 0
        ))
        FROM public.agent_runs AS run
        LEFT JOIN LATERAL (
          SELECT SUM(cost) AS spent FROM public.ai_usage
          WHERE run_id = run.run_id AND key_mode = 'platform'
        ) AS usage ON true
        WHERE run.created_by = p_owner_id AND run.key_mode IN ('platform','subscription')
          AND run.parent_numo_turn_id IS NULL
          AND run.status IN ('queued', 'running')
          AND run.managed_budget_usd IS NOT NULL
      ), 0)
      + COALESCE((
        SELECT SUM(GREATEST(
          turn.managed_budget_usd - COALESCE(usage.spent, 0), 0
        ))
        FROM public.numo_assistant_turns AS turn
        LEFT JOIN LATERAL (
          SELECT SUM(cost) AS spent FROM public.ai_usage
          WHERE numo_turn_id = turn.id AND key_mode = 'platform'
        ) AS usage ON true
        WHERE turn.user_id = p_owner_id
          AND turn.id IS DISTINCT FROM v_run.parent_numo_turn_id
          AND turn.status IN (
            'queued', 'running', 'waiting_work', 'stopping', 'retryable', 'reconciling'
          )
          AND turn.managed_budget_usd IS NOT NULL
      ), 0)
    INTO v_reserved;

    IF v_parent.id IS NOT NULL THEN
      SELECT COALESCE(SUM(cost), 0) INTO v_operation_platform_spent
      FROM public.ai_usage
      WHERE numo_turn_id = v_parent.id AND key_mode = 'platform';
      SELECT COALESCE(SUM(cost), 0) INTO v_operation_total_spent
      FROM public.ai_usage WHERE numo_turn_id = v_parent.id;
    END IF;
    v_granted := LEAST(
      p_requested_budget,
      GREATEST(p_budget_cap - v_spent - v_reserved, 0),
      CASE
        WHEN v_parent.id IS NOT NULL AND v_run.budget_usd IS NOT NULL
          THEN GREATEST(v_run.budget_usd - v_operation_total_spent, 0)
        ELSE p_requested_budget
      END
    );
    IF v_granted <= 0 THEN RETURN 'no_budget'; END IF;
    v_stored_budget := CASE
      WHEN v_parent.id IS NOT NULL
        THEN COALESCE(v_operation_platform_spent, 0) + v_granted
      ELSE v_granted
    END;
  END IF;

  INSERT INTO public.agent_run_messages (
    id, run_id, created_by, content, mentions, content_encryption_version
  ) VALUES (
    p_message_id, p_run_id, p_actor_id, p_content, p_mentions,
    public.agent_queue_content_version(p_content)
  ) ON CONFLICT (id) DO NOTHING;
  GET DIAGNOSTICS v_inserted = ROW_COUNT;
  IF v_inserted = 0 AND NOT EXISTS (
    SELECT 1 FROM public.agent_run_messages
    WHERE id = p_message_id AND run_id = p_run_id
  ) THEN
    RETURN 'message_id_conflict';
  END IF;

  UPDATE public.agent_runs
  SET status = 'queued', not_before = p_not_before,
      managed_budget_usd = CASE
        WHEN v_key_mode IN ('platform','subscription') THEN v_stored_budget
        ELSE managed_budget_usd
      END
  WHERE id = p_run_id;
  IF v_key_mode IN ('platform','subscription') AND v_parent.id IS NOT NULL THEN
    UPDATE public.numo_assistant_turns
    SET managed_budget_usd = v_stored_budget
    WHERE id = v_parent.id;
  END IF;
  RETURN CASE WHEN v_inserted = 1 THEN 'queued' ELSE 'already' END;
END;
$$;

CREATE OR REPLACE FUNCTION public.begin_numo_turn_with_budget(p_conversation_id uuid, p_user_id uuid, p_request_id uuid, p_run_id uuid, p_intent jsonb, p_model text, p_reasoning_level text, p_message_id uuid, p_user_payload_version integer, p_content text, p_context jsonb, p_metadata jsonb, p_usage_since timestamp with time zone, p_budget_cap numeric, p_requested_budget numeric)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_turn public.numo_assistant_turns%ROWTYPE;
  v_spent numeric;
  v_reserved numeric;
  v_granted numeric;
BEGIN
  IF p_conversation_id IS NULL OR p_user_id IS NULL OR p_request_id IS NULL
     OR p_run_id IS NULL OR p_usage_since IS NULL
     OR p_budget_cap IS NULL OR p_budget_cap < 0
     OR p_requested_budget IS NULL OR p_requested_budget <= 0 THEN
    RAISE EXCEPTION 'numo_turn_budget_invalid' USING ERRCODE = '22023';
  END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('numo-conversation:' || p_conversation_id::text, 516)
  );
  IF NOT EXISTS (
    SELECT 1 FROM public.conversations
    WHERE id = p_conversation_id AND user_id = p_user_id
  ) THEN
    RAISE EXCEPTION 'conversation_not_found' USING ERRCODE = 'P0002';
  END IF;

  SELECT * INTO v_turn FROM public.numo_assistant_turns
  WHERE conversation_id = p_conversation_id AND request_id = p_request_id;
  IF v_turn.id IS NOT NULL THEN
    RETURN pg_catalog.jsonb_build_object('turn', pg_catalog.to_jsonb(v_turn));
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.numo_assistant_turns
    WHERE conversation_id = p_conversation_id
      AND status IN (
        'queued', 'running', 'waiting_work', 'stopping', 'retryable', 'reconciling'
      )
  ) THEN
    RAISE EXCEPTION 'conversation_busy' USING ERRCODE = '55000';
  END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(p_user_id::text, 460)
  );
  SELECT COALESCE(SUM(cost), 0) INTO v_spent
  FROM public.ai_usage
  WHERE user_id = p_user_id
    AND created_at >= p_usage_since
    AND key_mode = 'platform';

  SELECT
    COALESCE((
      SELECT SUM(GREATEST(
        run.managed_budget_usd - COALESCE(usage.spent, 0), 0
      ))
      FROM public.agent_runs AS run
      LEFT JOIN LATERAL (
        SELECT SUM(cost) AS spent FROM public.ai_usage
        WHERE run_id = run.run_id AND key_mode = 'platform'
      ) AS usage ON true
      WHERE run.created_by = p_user_id
        AND run.key_mode IN ('platform','subscription')
        AND run.parent_numo_turn_id IS NULL
        AND run.status IN ('queued', 'running')
        AND run.managed_budget_usd IS NOT NULL
    ), 0)
    + COALESCE((
      SELECT SUM(GREATEST(
        turn.managed_budget_usd - COALESCE(usage.spent, 0), 0
      ))
      FROM public.numo_assistant_turns AS turn
      LEFT JOIN LATERAL (
        SELECT SUM(cost) AS spent FROM public.ai_usage
        WHERE numo_turn_id = turn.id AND key_mode = 'platform'
      ) AS usage ON true
      WHERE turn.user_id = p_user_id
        AND turn.status IN (
          'queued', 'running', 'waiting_work', 'stopping', 'retryable', 'reconciling'
        )
        AND turn.managed_budget_usd IS NOT NULL
    ), 0)
  INTO v_reserved;

  v_granted := LEAST(
    p_requested_budget,
    GREATEST(p_budget_cap - v_spent - v_reserved, 0)
  );
  IF v_granted <= 0 THEN
    RETURN pg_catalog.jsonb_build_object(
      'turn', NULL,
      'granted_budget_usd', 0,
      'spent_usd', v_spent,
      'reserved_usd', v_reserved
    );
  END IF;

  INSERT INTO public.numo_assistant_turns (
    conversation_id, user_id, request_id, run_id, intent, model,
    reasoning_level, managed_budget_usd
  ) VALUES (
    p_conversation_id, p_user_id, p_request_id, p_run_id,
    COALESCE(p_intent, '{}'::jsonb), p_model, p_reasoning_level, v_granted
  ) RETURNING * INTO v_turn;
  INSERT INTO public.assistant_messages (
    id, conversation_id, turn_id, role, content, context, metadata, user_payload_version
  ) VALUES (
    p_message_id, p_conversation_id, v_turn.id, 'user', p_content, p_context,
    COALESCE(p_metadata, '{}'::jsonb), p_user_payload_version
  );
  UPDATE public.conversations
  SET status = 'generating', error_message = NULL, updated_at = now()
  WHERE id = p_conversation_id;

  RETURN pg_catalog.jsonb_build_object(
    'turn', pg_catalog.to_jsonb(v_turn),
    'granted_budget_usd', v_granted,
    'spent_usd', v_spent,
    'reserved_usd', v_reserved
  );
END;
$function$;
COMMIT;
