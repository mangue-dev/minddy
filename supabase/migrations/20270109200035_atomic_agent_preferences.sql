-- Preserve selected native engines when unrelated account preferences change.
BEGIN;
CREATE FUNCTION public.upsert_agent_preferences_partial(p_user_id uuid,p_values jsonb)
RETURNS public.user_agent_preferences LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE saved public.user_agent_preferences;
BEGIN
  IF p_user_id IS NULL OR p_values IS NULL OR pg_catalog.jsonb_typeof(p_values)<>'object'
    OR EXISTS(SELECT 1 FROM pg_catalog.jsonb_object_keys(p_values) AS k(key)
      WHERE k.key NOT IN ('branch_prefix','default_engine','default_model','default_model_provider',
        'default_reasoning_level','sandbox_region','sandbox_size'))
    OR (p_values ? 'branch_prefix' AND (pg_catalog.jsonb_typeof(p_values->'branch_prefix')<>'string'
      OR left(p_values->>'branch_prefix',6)='mdye3:')) THEN
    RAISE EXCEPTION 'agent_preferences_partial_invalid' USING ERRCODE='22023';
  END IF;
  -- The trigger also fences concurrent activation after this check.
  IF EXISTS(SELECT 1 FROM public.agent_branch_prefix_scope) THEN
    RAISE EXCEPTION 'agent_branch_prefix_requires_encryption' USING ERRCODE='23514';
  END IF;
  INSERT INTO public.user_agent_preferences(user_id,branch_prefix,default_engine,default_model,
    default_model_provider,default_reasoning_level,sandbox_region,sandbox_size)
  VALUES(p_user_id,COALESCE(p_values->>'branch_prefix','numo/'),
    COALESCE(p_values->>'default_engine','opencode'),p_values->>'default_model',
    p_values->>'default_model_provider',p_values->>'default_reasoning_level',
    COALESCE(p_values->>'sandbox_region','eu'),COALESCE(p_values->>'sandbox_size','standard'))
  ON CONFLICT(user_id) DO UPDATE SET
    branch_prefix=CASE WHEN p_values ? 'branch_prefix' THEN EXCLUDED.branch_prefix ELSE user_agent_preferences.branch_prefix END,
    default_engine=CASE WHEN p_values ? 'default_engine' THEN EXCLUDED.default_engine ELSE user_agent_preferences.default_engine END,
    default_model=CASE WHEN p_values ? 'default_model' THEN EXCLUDED.default_model ELSE user_agent_preferences.default_model END,
    default_model_provider=CASE WHEN p_values ? 'default_model_provider' THEN EXCLUDED.default_model_provider ELSE user_agent_preferences.default_model_provider END,
    default_reasoning_level=CASE WHEN p_values ? 'default_reasoning_level' THEN EXCLUDED.default_reasoning_level ELSE user_agent_preferences.default_reasoning_level END,
    sandbox_region=CASE WHEN p_values ? 'sandbox_region' THEN EXCLUDED.sandbox_region ELSE user_agent_preferences.sandbox_region END,
    sandbox_size=CASE WHEN p_values ? 'sandbox_size' THEN EXCLUDED.sandbox_size ELSE user_agent_preferences.sandbox_size END,
    updated_at=pg_catalog.clock_timestamp()
  RETURNING * INTO saved;
  RETURN saved;
END; $$;
REVOKE ALL ON FUNCTION public.upsert_agent_preferences_partial(uuid,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.upsert_agent_preferences_partial(uuid,jsonb) TO service_role;
COMMIT;
