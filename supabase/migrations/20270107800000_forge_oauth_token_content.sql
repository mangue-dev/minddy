-- MIN-591: protect persistent forge OAuth grants under each user's data key.
BEGIN;
ALTER TABLE public.git_connections
  ADD COLUMN encrypted_content text,
  ADD COLUMN encryption_version integer NOT NULL DEFAULT 0,
  ADD COLUMN content_revision bigint NOT NULL DEFAULT 0,
  ADD COLUMN encryption_checked_at timestamptz,
  ADD COLUMN encryption_attempted_at timestamptz,
  ADD CONSTRAINT git_connections_oauth_content_shape CHECK (
    (encryption_version=0 AND encrypted_content IS NULL) OR
    (encryption_version>0 AND encrypted_content IS NOT NULL AND
      access_token_encrypted IS NULL AND refresh_token_encrypted IS NULL));
ALTER TABLE public.git_user_identities
  ADD COLUMN encrypted_content text,
  ADD COLUMN encryption_version integer NOT NULL DEFAULT 0,
  ADD COLUMN content_revision bigint NOT NULL DEFAULT 0,
  ADD COLUMN encryption_checked_at timestamptz,
  ADD COLUMN encryption_attempted_at timestamptz,
  ADD CONSTRAINT git_user_identities_oauth_content_shape CHECK (
    (encryption_version=0 AND encrypted_content IS NULL) OR
    (encryption_version>0 AND encrypted_content IS NOT NULL AND
      access_token_encrypted IS NULL AND refresh_token_encrypted IS NULL));
CREATE INDEX git_connections_oauth_content_queue
  ON public.git_connections(encryption_attempted_at NULLS FIRST,id)
  WHERE provider='gitlab' OR access_token_encrypted IS NOT NULL OR
    encrypted_content IS NOT NULL;
CREATE INDEX git_user_identities_oauth_content_queue
  ON public.git_user_identities(encryption_attempted_at NULLS FIRST,id);

CREATE TABLE public.forge_oauth_token_scope(
  id boolean PRIMARY KEY DEFAULT true CHECK(id),
  activated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.forge_oauth_token_scope ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.forge_oauth_token_scope FROM PUBLIC,anon,authenticated;
GRANT ALL ON public.forge_oauth_token_scope TO service_role;

CREATE FUNCTION public.forge_oauth_token_envelope_version(p_value text)
RETURNS integer LANGUAGE plpgsql IMMUTABLE STRICT SET search_path='' AS $$
DECLARE format_number integer; key_version integer;
BEGIN
  format_number:=COALESCE((p_value::jsonb->>'format')::integer,0);
  key_version:=COALESCE((p_value::jsonb->>'keyVersion')::integer,0);
  IF format_number=3 AND key_version>0 THEN RETURN key_version; END IF;
  RETURN 0;
EXCEPTION WHEN others THEN RETURN 0;
END;
$$;
REVOKE ALL ON FUNCTION public.forge_oauth_token_envelope_version(text)
  FROM PUBLIC,anon,authenticated;

CREATE FUNCTION public.guard_forge_oauth_token_content()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE parsed_version integer:=0; needs_content boolean;
BEGIN
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('forge-oauth-token-content',591));
  IF NEW.encrypted_content IS NOT NULL THEN
    parsed_version:=public.forge_oauth_token_envelope_version(
      NEW.encrypted_content);
  END IF;
  IF NEW.encryption_version>0 AND parsed_version<>NEW.encryption_version THEN
    RAISE EXCEPTION 'forge_oauth_token_invalid_envelope'
      USING ERRCODE='23514';
  END IF;
  needs_content:=TG_TABLE_NAME='git_user_identities' OR
    NEW.provider='gitlab' OR NEW.access_token_encrypted IS NOT NULL OR
    NEW.refresh_token_encrypted IS NOT NULL OR NEW.encrypted_content IS NOT NULL;
  IF needs_content AND NEW.encryption_version=0 AND
      EXISTS(SELECT 1 FROM public.forge_oauth_token_scope) THEN
    RAISE EXCEPTION 'forge_oauth_token_requires_encryption'
      USING ERRCODE='23514';
  END IF;
  IF TG_OP='UPDATE' THEN
    IF OLD.encryption_version>0 AND
        (NEW.encryption_version<OLD.encryption_version OR
         NEW.user_id IS DISTINCT FROM OLD.user_id OR
         NEW.provider IS DISTINCT FROM OLD.provider OR
         (TG_TABLE_NAME='git_connections' AND
           NEW.provider_account_id IS DISTINCT FROM OLD.provider_account_id)) THEN
      RAISE EXCEPTION 'forge_oauth_token_scope_change'
        USING ERRCODE='23514';
    END IF;
    IF NEW.encrypted_content IS DISTINCT FROM OLD.encrypted_content OR
        NEW.access_token_encrypted IS DISTINCT FROM OLD.access_token_encrypted OR
        NEW.refresh_token_encrypted IS DISTINCT FROM OLD.refresh_token_encrypted
    THEN
      NEW.content_revision:=OLD.content_revision+1;
      NEW.encryption_checked_at:=CASE WHEN NEW.encryption_version>0
        THEN clock_timestamp() ELSE NULL END;
    ELSE
      NEW.content_revision:=OLD.content_revision;
    END IF;
  ELSIF NEW.encryption_version>0 THEN
    NEW.encryption_checked_at:=clock_timestamp();
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER git_connections_oauth_content_guard
  BEFORE INSERT OR UPDATE ON public.git_connections FOR EACH ROW
  EXECUTE FUNCTION public.guard_forge_oauth_token_content();
CREATE TRIGGER git_user_identities_oauth_content_guard
  BEFORE INSERT OR UPDATE ON public.git_user_identities FOR EACH ROW
  EXECUTE FUNCTION public.guard_forge_oauth_token_content();
REVOKE ALL ON FUNCTION public.guard_forge_oauth_token_content()
  FROM PUBLIC,anon,authenticated;

CREATE FUNCTION public.upsert_gitlab_connection_protected_atomic(
  p_user_id uuid,p_provider_account_id text,p_account_login text,p_source text,
  p_access_token_encrypted text,p_refresh_token_encrypted text,
  p_encrypted_content text,p_encryption_version integer,
  p_token_expires_at timestamptz,p_oauth_scopes text
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_id uuid;
BEGIN
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      p_user_id::text || ':gitlab:' || p_provider_account_id,456));
  SELECT id INTO v_id FROM public.git_connections
    WHERE user_id=p_user_id AND provider='gitlab' AND
      provider_account_id=p_provider_account_id FOR UPDATE;
  IF v_id IS NULL THEN
    INSERT INTO public.git_connections(user_id,provider,provider_account_id,
      account_login,source,access_token_encrypted,refresh_token_encrypted,
      encrypted_content,encryption_version,token_expires_at,oauth_scopes)
    VALUES(p_user_id,'gitlab',p_provider_account_id,p_account_login,p_source,
      p_access_token_encrypted,p_refresh_token_encrypted,p_encrypted_content,
      p_encryption_version,p_token_expires_at,p_oauth_scopes)
    RETURNING id INTO v_id;
  ELSE
    UPDATE public.git_connections SET account_login=p_account_login,
      source=p_source,access_token_encrypted=p_access_token_encrypted,
      refresh_token_encrypted=p_refresh_token_encrypted,
      encrypted_content=p_encrypted_content,
      encryption_version=p_encryption_version,
      token_expires_at=p_token_expires_at,oauth_scopes=p_oauth_scopes,
      oauth_refresh_claim=NULL,oauth_refresh_claimed_at=NULL,
      updated_at=pg_catalog.now() WHERE id=v_id;
  END IF;
  RETURN v_id;
END;
$$;
REVOKE ALL ON FUNCTION public.upsert_gitlab_connection_protected_atomic(
  uuid,text,text,text,text,text,text,integer,timestamptz,text)
  FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.upsert_gitlab_connection_protected_atomic(
  uuid,text,text,text,text,text,text,integer,timestamptz,text)
  TO service_role;

CREATE OR REPLACE FUNCTION public.claim_forge_oauth_refresh(
  p_kind text,p_row_id uuid,p_expected_expires_at timestamptz,
  p_expected_refresh_token_encrypted text,p_claim_id uuid
) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_count integer:=0; v_now timestamptz:=pg_catalog.clock_timestamp();
BEGIN
  IF p_kind NOT IN ('connection','identity') OR p_claim_id IS NULL THEN
    RAISE EXCEPTION 'forge_oauth_refresh_claim_invalid' USING ERRCODE='22023';
  END IF;
  IF p_kind='connection' THEN
    UPDATE public.git_connections SET oauth_refresh_claim=p_claim_id,
      oauth_refresh_claimed_at=v_now WHERE id=p_row_id AND
      token_expires_at IS NOT DISTINCT FROM p_expected_expires_at AND
      (CASE WHEN encryption_version>0 THEN encrypted_content
        ELSE refresh_token_encrypted END)
        IS NOT DISTINCT FROM p_expected_refresh_token_encrypted AND
      (oauth_refresh_claim IS NULL OR
        oauth_refresh_claimed_at<v_now-interval '2 minutes');
  ELSE
    UPDATE public.git_user_identities SET oauth_refresh_claim=p_claim_id,
      oauth_refresh_claimed_at=v_now WHERE id=p_row_id AND
      token_expires_at IS NOT DISTINCT FROM p_expected_expires_at AND
      (CASE WHEN encryption_version>0 THEN encrypted_content
        ELSE refresh_token_encrypted END)
        IS NOT DISTINCT FROM p_expected_refresh_token_encrypted AND
      (oauth_refresh_claim IS NULL OR
        oauth_refresh_claimed_at<v_now-interval '2 minutes');
  END IF;
  GET DIAGNOSTICS v_count=ROW_COUNT;
  RETURN v_count=1;
END;
$$;
REVOKE ALL ON FUNCTION public.claim_forge_oauth_refresh(
  text,uuid,timestamptz,text,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.claim_forge_oauth_refresh(
  text,uuid,timestamptz,text,uuid) TO service_role;

CREATE FUNCTION public.activate_forge_oauth_tokens()
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('forge-oauth-token-content',591));
  IF EXISTS(SELECT 1 FROM public.git_connections WHERE
      (provider='gitlab' OR access_token_encrypted IS NOT NULL OR
        refresh_token_encrypted IS NOT NULL OR encrypted_content IS NOT NULL)
      AND (encryption_version=0 OR encryption_checked_at IS NULL OR
        public.forge_oauth_token_envelope_version(encrypted_content)
          <>encryption_version)) OR
     EXISTS(SELECT 1 FROM public.git_user_identities WHERE
      encryption_version=0 OR encryption_checked_at IS NULL OR
      public.forge_oauth_token_envelope_version(encrypted_content)
        <>encryption_version)
  THEN RETURN false; END IF;
  INSERT INTO public.forge_oauth_token_scope(id) VALUES(true)
    ON CONFLICT DO NOTHING;
  RETURN true;
END;
$$;
REVOKE ALL ON FUNCTION public.activate_forge_oauth_tokens()
  FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.activate_forge_oauth_tokens()
  TO service_role;
COMMIT;
