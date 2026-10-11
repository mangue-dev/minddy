-- Keep native model preferences separate from API model preferences and freeze worker choices.
BEGIN;
CREATE FUNCTION public.valid_native_model_preferences(p_values jsonb)
RETURNS boolean LANGUAGE plpgsql IMMUTABLE SET search_path='' AS $$
DECLARE engine text; item jsonb;
BEGIN
  IF p_values IS NULL OR pg_catalog.jsonb_typeof(p_values)<>'object' THEN RETURN false; END IF;
  FOR engine,item IN SELECT * FROM pg_catalog.jsonb_each(p_values) LOOP
    IF engine NOT IN ('codex','claude_code') OR pg_catalog.jsonb_typeof(item)<>'object'
      OR NOT item ? 'model' OR NOT item ? 'reasoningEffort'
      OR (SELECT count(*) FROM pg_catalog.jsonb_object_keys(item))<>2
      OR (item->'model'<>'null'::jsonb AND (pg_catalog.jsonb_typeof(item->'model')<>'string'
        OR item->>'model' !~ '^[A-Za-z0-9][A-Za-z0-9._:@/-]{0,199}$' OR item->>'model'='default'))
      OR (item->'reasoningEffort'<>'null'::jsonb AND (pg_catalog.jsonb_typeof(item->'reasoningEffort')<>'string'
        OR (engine='codex' AND item->>'reasoningEffort' NOT IN ('none','minimal','low','medium','high','xhigh','max','ultra'))
        OR (engine='claude_code' AND item->>'reasoningEffort' NOT IN ('low','medium','high','xhigh','max'))))
      THEN RETURN false; END IF;
  END LOOP;
  RETURN true;
END; $$;
ALTER TABLE public.user_agent_preferences ADD COLUMN native_model_preferences jsonb NOT NULL DEFAULT '{}'::jsonb
  CHECK(public.valid_native_model_preferences(native_model_preferences));
ALTER TABLE public.agent_runs ADD COLUMN native_reasoning_effort text;
ALTER TABLE public.agent_runs DROP CONSTRAINT agent_runs_native_subscription_shape,
  ADD CONSTRAINT agent_runs_native_subscription_shape CHECK(COALESCE((
    (agent_engine IN ('codex','claude_code') AND key_mode='subscription' AND NOT local_exec
      AND loop_in_vm AND native_connection_id IS NOT NULL AND native_connection_generation>0
      AND worker_model_source='account'
      AND ((agent_engine='codex' AND model ~ '^codex/[A-Za-z0-9][A-Za-z0-9._:@/-]{0,199}$' AND worker_model_provider='openai'
        AND (native_reasoning_effort IS NULL OR native_reasoning_effort IN ('none','minimal','low','medium','high','xhigh','max','ultra')))
        OR (agent_engine='claude_code' AND model ~ '^claude_code/[A-Za-z0-9][A-Za-z0-9._:@/-]{0,199}$' AND worker_model_provider='anthropic'
        AND (native_reasoning_effort IS NULL OR native_reasoning_effort IN ('low','medium','high','xhigh','max')))))
    OR (agent_engine IN ('loop','opencode') AND key_mode IN ('platform','byok')
      AND native_connection_id IS NULL AND native_connection_generation IS NULL AND native_reasoning_effort IS NULL)),false));
CREATE OR REPLACE FUNCTION public.guard_native_worker_run_contract()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
  IF TG_OP='UPDATE' AND (OLD.agent_engine IN ('codex','claude_code') OR NEW.agent_engine IN ('codex','claude_code'))
    AND ROW(NEW.created_by,NEW.agent_engine,NEW.key_mode,NEW.model,NEW.native_reasoning_effort,NEW.worker_model_source,
      NEW.worker_model_provider,NEW.native_connection_id,NEW.native_connection_generation,NEW.local_exec,NEW.loop_in_vm)
    IS DISTINCT FROM ROW(OLD.created_by,OLD.agent_engine,OLD.key_mode,OLD.model,OLD.native_reasoning_effort,OLD.worker_model_source,
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
CREATE OR REPLACE FUNCTION public.upsert_agent_preferences_partial(p_user_id uuid,p_values jsonb)
RETURNS public.user_agent_preferences LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE saved public.user_agent_preferences;
BEGIN
  IF p_user_id IS NULL OR p_values IS NULL OR pg_catalog.jsonb_typeof(p_values)<>'object'
    OR EXISTS(SELECT 1 FROM pg_catalog.jsonb_object_keys(p_values) AS k(key)
      WHERE k.key NOT IN ('branch_prefix','default_engine','default_model','default_model_provider',
        'default_reasoning_level','sandbox_region','sandbox_size','native_model_preferences'))
    OR (p_values ? 'branch_prefix' AND (pg_catalog.jsonb_typeof(p_values->'branch_prefix')<>'string'
      OR left(p_values->>'branch_prefix',6)='mdye3:')) THEN
    RAISE EXCEPTION 'agent_preferences_partial_invalid' USING ERRCODE='22023';
  END IF;
  -- The trigger also fences concurrent activation after this check.
  IF EXISTS(SELECT 1 FROM public.agent_branch_prefix_scope) THEN
    RAISE EXCEPTION 'agent_branch_prefix_requires_encryption' USING ERRCODE='23514';
  END IF;
  INSERT INTO public.user_agent_preferences(user_id,branch_prefix,default_engine,default_model,
    default_model_provider,default_reasoning_level,sandbox_region,sandbox_size,native_model_preferences)
  VALUES(p_user_id,COALESCE(p_values->>'branch_prefix','numo/'),
    COALESCE(p_values->>'default_engine','opencode'),p_values->>'default_model',
    p_values->>'default_model_provider',p_values->>'default_reasoning_level',
    COALESCE(p_values->>'sandbox_region','eu'),COALESCE(p_values->>'sandbox_size','standard'),COALESCE(p_values->'native_model_preferences','{}'::jsonb))
  ON CONFLICT(user_id) DO UPDATE SET
    branch_prefix=CASE WHEN p_values ? 'branch_prefix' THEN EXCLUDED.branch_prefix ELSE user_agent_preferences.branch_prefix END,
    default_engine=CASE WHEN p_values ? 'default_engine' THEN EXCLUDED.default_engine ELSE user_agent_preferences.default_engine END,
    default_model=CASE WHEN p_values ? 'default_model' THEN EXCLUDED.default_model ELSE user_agent_preferences.default_model END,
    default_model_provider=CASE WHEN p_values ? 'default_model_provider' THEN EXCLUDED.default_model_provider ELSE user_agent_preferences.default_model_provider END,
    default_reasoning_level=CASE WHEN p_values ? 'default_reasoning_level' THEN EXCLUDED.default_reasoning_level ELSE user_agent_preferences.default_reasoning_level END,
    sandbox_region=CASE WHEN p_values ? 'sandbox_region' THEN EXCLUDED.sandbox_region ELSE user_agent_preferences.sandbox_region END,
    sandbox_size=CASE WHEN p_values ? 'sandbox_size' THEN EXCLUDED.sandbox_size ELSE user_agent_preferences.sandbox_size END,
    native_model_preferences=user_agent_preferences.native_model_preferences || EXCLUDED.native_model_preferences,
    updated_at=pg_catalog.clock_timestamp()
  RETURNING * INTO saved;
  RETURN saved;
END; $$;
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
          'default_reasoning_level','sandbox_region','sandbox_size','native_model_preferences')) THEN
    RAISE EXCEPTION 'agent_preferences_protected_invalid'
      USING ERRCODE='22023';
  END IF;
  INSERT INTO public.user_agent_preferences(user_id,branch_prefix,
    default_engine,default_model,default_model_provider,default_reasoning_level,
    sandbox_region,sandbox_size,native_model_preferences)
  VALUES(p_user_id,p_branch_cipher,COALESCE(p_values->>'default_engine','opencode'),p_values->>'default_model',
    p_values->>'default_model_provider',p_values->>'default_reasoning_level',
    COALESCE(p_values->>'sandbox_region','eu'),
    COALESCE(p_values->>'sandbox_size','standard'),COALESCE(p_values->'native_model_preferences','{}'::jsonb))
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
    native_model_preferences=user_agent_preferences.native_model_preferences || EXCLUDED.native_model_preferences,
    updated_at=pg_catalog.clock_timestamp()
  RETURNING * INTO saved;
  RETURN saved;
END;
$$;

-- Model metadata is not a credential. Only the service may publish a discovery result.
CREATE TABLE public.native_agent_model_catalogs (
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  engine text NOT NULL CHECK(engine='codex'),
  connection_id uuid NOT NULL,
  connection_generation bigint NOT NULL CHECK(connection_generation>0),
  models jsonb NOT NULL CHECK(pg_catalog.jsonb_typeof(models)='array' AND pg_catalog.jsonb_array_length(models)<=200 AND pg_catalog.octet_length(models::text)<=65536),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY(user_id,engine)
);
ALTER TABLE public.native_agent_model_catalogs ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.native_agent_model_catalogs FROM anon,authenticated;
GRANT ALL ON public.native_agent_model_catalogs TO service_role;
CREATE FUNCTION public.commit_native_catalog_profile(p_id uuid,p_user_id uuid,p_engine text,
  p_generation bigint,p_lease_id uuid,p_revision bigint,p_profile_ciphertext text,p_runtime_ciphertext text,p_models jsonb)
RETURNS SETOF public.native_agent_connections LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v public.native_agent_connections;
BEGIN
  IF p_profile_ciphertext IS NULL OR p_runtime_ciphertext IS NULL OR p_engine IS DISTINCT FROM 'codex' OR p_models IS NULL THEN
    RAISE EXCEPTION 'native_connection_invalid_request';
  END IF;
  v:=public.check_native_agent_lease(p_id,p_user_id,p_engine,p_generation,p_lease_id,p_revision,false);
  IF v.lease_kind IS DISTINCT FROM 'test' OR v.worker_run_id IS NOT NULL OR v.worker_allocation_id IS NOT NULL THEN
    RAISE EXCEPTION 'native_connection_invalid_request';
  END IF;
  INSERT INTO public.native_agent_model_catalogs(user_id,engine,connection_id,connection_generation,models)
    VALUES(p_user_id,p_engine,p_id,p_generation,p_models)
    ON CONFLICT(user_id,engine) DO UPDATE SET connection_id=EXCLUDED.connection_id,
      connection_generation=EXCLUDED.connection_generation,models=EXCLUDED.models,updated_at=clock_timestamp();
  UPDATE public.native_agent_connections SET profile_ciphertext=p_profile_ciphertext,
    runtime_ciphertext=p_runtime_ciphertext,status='connected',revision=revision+1,
    updated_at=clock_timestamp() WHERE id=v.id RETURNING * INTO v;
  v.profile_ciphertext:=NULL; v.runtime_ciphertext:=NULL;
  RETURN NEXT v;
END; $$;
REVOKE ALL ON FUNCTION public.commit_native_catalog_profile(uuid,uuid,text,bigint,uuid,bigint,text,text,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.commit_native_catalog_profile(uuid,uuid,text,bigint,uuid,bigint,text,text,jsonb) TO service_role;
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
       'worker_model_provider', 'native_connection_id', 'native_connection_generation', 'native_reasoning_effort', 'base_branch', 'branch_name', 'pr_number',
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
    worker_model_provider, native_connection_id, native_connection_generation, native_reasoning_effort, base_branch, branch_name, pr_number, pr_url, pr_state,
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
    p_values->>'native_reasoning_effort',
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
COMMIT;
