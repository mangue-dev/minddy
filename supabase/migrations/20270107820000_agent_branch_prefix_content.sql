-- MIN-591: seal personal agent branch namespaces while preserving partial writes.
BEGIN;
ALTER TABLE public.user_agent_preferences
  DROP CONSTRAINT user_agent_preferences_branch_prefix_check,
  ADD COLUMN branch_prefix_encryption_checked_at timestamptz,
  ADD COLUMN branch_prefix_encryption_attempted_at timestamptz,
  ADD CONSTRAINT user_agent_preferences_branch_prefix_shape CHECK (
    branch_prefix LIKE 'mdye3:{%' OR (
      branch_prefix=btrim(branch_prefix) AND
      char_length(branch_prefix) BETWEEN 2 AND 128 AND
      right(branch_prefix,1)='/' AND
      branch_prefix NOT LIKE '/%' AND branch_prefix NOT LIKE '-%' AND
      branch_prefix NOT LIKE '%//%' AND branch_prefix NOT LIKE '%..%' AND
      branch_prefix NOT LIKE '%@{%' AND branch_prefix !~ '(^|/)\.' AND
      branch_prefix !~ '\.lock/' AND
      branch_prefix !~ '[[:cntrl:][:space:]~^:?*]' AND
      position('[' IN branch_prefix)=0 AND
      position(chr(92) IN branch_prefix)=0));
CREATE INDEX user_agent_preferences_branch_prefix_queue ON
  public.user_agent_preferences(branch_prefix_encryption_attempted_at NULLS FIRST,user_id);

CREATE TABLE public.agent_branch_prefix_scope(
  id boolean PRIMARY KEY DEFAULT true CHECK(id),
  activated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.agent_branch_prefix_scope ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.agent_branch_prefix_scope FROM PUBLIC,anon,authenticated;
GRANT ALL ON public.agent_branch_prefix_scope TO service_role;

CREATE FUNCTION public.agent_branch_prefix_version(p_value text)
RETURNS integer LANGUAGE plpgsql IMMUTABLE STRICT SET search_path='' AS $$
DECLARE parsed jsonb; format_number integer; key_version integer;
BEGIN
  IF left(p_value,6)<>'mdye3:' THEN RETURN 0; END IF;
  parsed:=substring(p_value FROM 7)::jsonb;
  format_number:=COALESCE((parsed->>'format')::integer,0);
  key_version:=COALESCE((parsed->>'keyVersion')::integer,0);
  IF format_number=3 AND key_version>0 THEN RETURN key_version; END IF;
  RETURN 0;
EXCEPTION WHEN others THEN RETURN 0;
END;
$$;
REVOKE ALL ON FUNCTION public.agent_branch_prefix_version(text)
  FROM PUBLIC,anon,authenticated;

CREATE FUNCTION public.guard_agent_branch_prefix()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE old_version integer:=0; new_version integer;
BEGIN
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('agent-branch-prefix',591));
  new_version:=public.agent_branch_prefix_version(NEW.branch_prefix);
  IF left(NEW.branch_prefix,6)='mdye3:' AND new_version=0 THEN
    RAISE EXCEPTION 'agent_branch_prefix_invalid_envelope' USING ERRCODE='23514';
  END IF;
  IF TG_OP='UPDATE' THEN
    old_version:=public.agent_branch_prefix_version(OLD.branch_prefix);
    IF NEW.user_id IS DISTINCT FROM OLD.user_id OR
        old_version>0 AND new_version<old_version THEN
      RAISE EXCEPTION 'agent_branch_prefix_scope_change' USING ERRCODE='23514';
    END IF;
  END IF;
  IF new_version=0 AND EXISTS(SELECT 1 FROM public.agent_branch_prefix_scope) THEN
    RAISE EXCEPTION 'agent_branch_prefix_requires_encryption'
      USING ERRCODE='23514';
  END IF;
  IF TG_OP='INSERT' OR NEW.branch_prefix IS DISTINCT FROM OLD.branch_prefix THEN
    NEW.branch_prefix_encryption_checked_at:=CASE WHEN new_version>0
      THEN pg_catalog.clock_timestamp() ELSE NULL END;
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER user_agent_preferences_branch_prefix_guard
  BEFORE INSERT OR UPDATE ON public.user_agent_preferences FOR EACH ROW
  EXECUTE FUNCTION public.guard_agent_branch_prefix();
REVOKE ALL ON FUNCTION public.guard_agent_branch_prefix()
  FROM PUBLIC,anon,authenticated;

CREATE FUNCTION public.upsert_agent_preferences_protected(
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
        WHERE k.key NOT IN ('default_model','default_model_provider',
          'default_reasoning_level','sandbox_region','sandbox_size')) THEN
    RAISE EXCEPTION 'agent_preferences_protected_invalid'
      USING ERRCODE='22023';
  END IF;
  INSERT INTO public.user_agent_preferences(user_id,branch_prefix,
    default_model,default_model_provider,default_reasoning_level,
    sandbox_region,sandbox_size)
  VALUES(p_user_id,p_branch_cipher,p_values->>'default_model',
    p_values->>'default_model_provider',p_values->>'default_reasoning_level',
    COALESCE(p_values->>'sandbox_region','eu'),
    COALESCE(p_values->>'sandbox_size','standard'))
  ON CONFLICT(user_id) DO UPDATE SET
    branch_prefix=CASE WHEN p_replace_branch THEN EXCLUDED.branch_prefix
      ELSE user_agent_preferences.branch_prefix END,
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

CREATE FUNCTION public.activate_agent_branch_prefix()
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('agent-branch-prefix',591));
  IF EXISTS(SELECT 1 FROM public.user_agent_preferences WHERE
      public.agent_branch_prefix_version(branch_prefix)=0 OR
      branch_prefix_encryption_checked_at IS NULL) THEN RETURN false; END IF;
  INSERT INTO public.agent_branch_prefix_scope(id) VALUES(true)
    ON CONFLICT DO NOTHING;
  RETURN true;
END;
$$;
REVOKE ALL ON FUNCTION public.activate_agent_branch_prefix()
  FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.activate_agent_branch_prefix()
  TO service_role;
COMMIT;
