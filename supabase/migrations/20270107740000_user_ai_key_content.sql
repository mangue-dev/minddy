-- MIN-591: bind BYOK credentials and private preferences to the user's DEK.
BEGIN;
ALTER TABLE public.user_ai_keys
  ALTER COLUMN key_encrypted DROP NOT NULL,
  ALTER COLUMN feature_models DROP NOT NULL,
  ADD COLUMN encrypted_content text,
  ADD COLUMN encryption_version integer NOT NULL DEFAULT 0,
  ADD COLUMN content_revision bigint NOT NULL DEFAULT 0,
  ADD COLUMN encryption_checked_at timestamptz,
  ADD COLUMN encryption_attempted_at timestamptz;
CREATE INDEX user_ai_keys_content_queue
  ON public.user_ai_keys(encryption_attempted_at NULLS FIRST,id);

CREATE TABLE public.user_ai_key_content_scope(
  id boolean PRIMARY KEY DEFAULT true CHECK(id),
  activated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.user_ai_key_content_scope ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.user_ai_key_content_scope FROM PUBLIC,anon,authenticated;
GRANT ALL ON public.user_ai_key_content_scope TO service_role;

CREATE FUNCTION public.guard_user_ai_key_content()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE sealed boolean := NEW.encryption_version>0 AND
  NEW.encrypted_content IS NOT NULL AND NEW.key_encrypted IS NULL AND
  NEW.base_url IS NULL AND NEW.feature_models IS NULL;
BEGIN
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('user-ai-key-content-activation',591));
  IF TG_OP='UPDATE' THEN
    NEW.content_revision:=OLD.content_revision+1;
    IF NEW.id IS DISTINCT FROM OLD.id OR NEW.user_id IS DISTINCT FROM OLD.user_id OR
        NEW.provider IS DISTINCT FROM OLD.provider THEN
      RAISE EXCEPTION 'user_ai_key_scope_immutable' USING ERRCODE='23514';
    END IF;
    IF NEW.encryption_version<OLD.encryption_version OR
        OLD.encryption_version>0 AND NOT sealed THEN
      RAISE EXCEPTION 'user_ai_key_downgrade' USING ERRCODE='23514';
    END IF;
  END IF;
  IF NEW.encryption_version<0 OR
      NEW.encryption_version=0 AND NEW.encrypted_content IS NOT NULL OR
      NEW.encryption_version>0 AND NOT sealed OR
      sealed AND COALESCE((NEW.encrypted_content::jsonb->>'keyVersion')::integer
        <>NEW.encryption_version,true) THEN
    RAISE EXCEPTION 'user_ai_key_content_invalid' USING ERRCODE='23514';
  END IF;
  IF NOT sealed AND EXISTS(SELECT 1 FROM public.user_ai_key_content_scope) THEN
    RAISE EXCEPTION 'user_ai_key_requires_encryption' USING ERRCODE='23514';
  END IF;
  IF EXISTS(SELECT 1 FROM public.user_ai_key_content_scope) AND
      coalesce(auth.role(),'') <> 'service_role' AND
      session_user NOT IN ('postgres','supabase_admin') THEN
    RAISE EXCEPTION 'user_ai_key_service_writer_required' USING ERRCODE='42501';
  END IF;
  IF sealed AND (TG_OP='INSERT' OR
      NEW.encrypted_content IS DISTINCT FROM OLD.encrypted_content) THEN
    NEW.encryption_checked_at:=clock_timestamp();
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER user_ai_keys_a_content_guard BEFORE INSERT OR UPDATE
  ON public.user_ai_keys FOR EACH ROW
  EXECUTE FUNCTION public.guard_user_ai_key_content();
REVOKE ALL ON FUNCTION public.guard_user_ai_key_content()
  FROM PUBLIC,anon,authenticated;

CREATE FUNCTION public.activate_user_ai_key_content()
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('user-ai-key-content-activation',591));
  IF EXISTS(SELECT 1 FROM public.user_ai_keys WHERE
      encryption_version<1 OR encrypted_content IS NULL OR
      key_encrypted IS NOT NULL OR base_url IS NOT NULL OR
      feature_models IS NOT NULL OR encryption_checked_at IS NULL) THEN
    RETURN false;
  END IF;
  INSERT INTO public.user_ai_key_content_scope(id) VALUES(true)
    ON CONFLICT DO NOTHING;
  RETURN true;
END;
$$;
REVOKE ALL ON FUNCTION public.activate_user_ai_key_content()
  FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.activate_user_ai_key_content()
  TO service_role;

CREATE FUNCTION public.upsert_user_ai_key_protected(
  p_user_id uuid,p_provider text,p_id uuid,p_revision bigint,
  p_encrypted_content text,p_encryption_version integer,
  p_key_prefix text,p_validated_at timestamptz
) RETURNS SETOF public.user_ai_keys LANGUAGE plpgsql SECURITY DEFINER
SET search_path='' AS $$
DECLARE saved public.user_ai_keys%ROWTYPE;
  supported text[];
BEGIN
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(p_user_id::text,0));
  SELECT * INTO saved FROM public.user_ai_keys
    WHERE user_id=p_user_id AND provider=p_provider FOR UPDATE;
  IF FOUND THEN
    IF saved.id<>p_id OR saved.content_revision<>p_revision THEN
      RAISE EXCEPTION 'BYOK revision conflict' USING ERRCODE='40001';
    END IF;
    RETURN QUERY UPDATE public.user_ai_keys SET
      key_encrypted=NULL,base_url=NULL,feature_models=NULL,
      encrypted_content=p_encrypted_content,
      encryption_version=p_encryption_version,
      key_prefix=p_key_prefix,validated_at=p_validated_at,updated_at=now()
      WHERE id=p_id RETURNING *;
    RETURN;
  END IF;
  IF p_revision<>0 THEN
    RAISE EXCEPTION 'BYOK revision conflict' USING ERRCODE='40001';
  END IF;
  INSERT INTO public.user_ai_keys(id,user_id,provider,key_encrypted,
    key_prefix,base_url,validated_at,enabled_surfaces,feature_models,
    encrypted_content,encryption_version)
    VALUES(p_id,p_user_id,p_provider,NULL,p_key_prefix,NULL,p_validated_at,
      CASE WHEN p_provider IN ('local_openai','ollama')
        THEN ARRAY['agent']::text[]
        ELSE ARRAY['agent','assistant','automations','voice','feedback']::text[]
      END,NULL,p_encrypted_content,p_encryption_version)
    RETURNING * INTO saved;
  supported:=CASE p_provider
    WHEN 'openrouter' THEN ARRAY['text','transcription','embedding']::text[]
    WHEN 'openai' THEN ARRAY['text','transcription','embedding']::text[]
    WHEN 'google' THEN ARRAY['text','embedding']::text[]
    ELSE ARRAY['text']::text[] END;
  INSERT INTO public.user_ai_capability_assignments(user_id,capability,ai_key_id)
    SELECT p_user_id,capability,saved.id FROM unnest(supported) capability
    ON CONFLICT(user_id,capability) DO NOTHING;
  RETURN NEXT saved;
END;
$$;
REVOKE ALL ON FUNCTION public.upsert_user_ai_key_protected(
  uuid,text,uuid,bigint,text,integer,text,timestamptz)
  FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.upsert_user_ai_key_protected(
  uuid,text,uuid,bigint,text,integer,text,timestamptz) TO service_role;

CREATE FUNCTION public.update_user_ai_key_preferences_protected(
  p_user_id uuid,p_key_id uuid,p_revision bigint,
  p_encrypted_content text,p_encryption_version integer,
  p_enabled_surfaces text[] DEFAULT NULL
) RETURNS SETOF public.user_ai_keys LANGUAGE plpgsql SECURITY DEFINER
SET search_path='' AS $$
DECLARE saved public.user_ai_keys%ROWTYPE;
BEGIN
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(p_user_id::text,0));
  SELECT * INTO saved FROM public.user_ai_keys
    WHERE id=p_key_id AND user_id=p_user_id FOR UPDATE;
  IF NOT FOUND THEN RETURN; END IF;
  IF saved.content_revision<>p_revision THEN
    RAISE EXCEPTION 'BYOK revision conflict' USING ERRCODE='40001';
  END IF;
  IF saved.provider IN ('local_openai','ollama') AND
      p_enabled_surfaces IS NOT NULL AND
      NOT (p_enabled_surfaces <@ ARRAY['agent']::text[]) THEN
    RAISE EXCEPTION 'Local BYOK providers are restricted to the agent surface'
      USING ERRCODE='23514';
  END IF;
  RETURN QUERY UPDATE public.user_ai_keys SET
    key_encrypted=NULL,base_url=NULL,feature_models=NULL,
    encrypted_content=p_encrypted_content,
    encryption_version=p_encryption_version,
    enabled_surfaces=coalesce(p_enabled_surfaces,enabled_surfaces),
    updated_at=now()
    WHERE id=p_key_id RETURNING *;
END;
$$;
REVOKE ALL ON FUNCTION public.update_user_ai_key_preferences_protected(
  uuid,uuid,bigint,text,integer,text[])
  FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.update_user_ai_key_preferences_protected(
  uuid,uuid,bigint,text,integer,text[]) TO service_role;
COMMIT;
