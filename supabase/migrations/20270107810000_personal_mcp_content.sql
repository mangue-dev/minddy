-- MIN-591: seal personal MCP endpoints, credentials and OAuth transactions.
BEGIN;
ALTER TABLE public.user_mcp_connections
  ALTER COLUMN name DROP NOT NULL,
  ALTER COLUMN url DROP NOT NULL,
  ADD COLUMN encrypted_content text,
  ADD COLUMN encryption_version integer NOT NULL DEFAULT 0,
  ADD COLUMN content_revision bigint NOT NULL DEFAULT 0,
  ADD COLUMN encryption_checked_at timestamptz,
  ADD COLUMN encryption_attempted_at timestamptz,
  ADD CONSTRAINT user_mcp_connections_content_shape CHECK (
    (encryption_version=0 AND encrypted_content IS NULL) OR
    (encryption_version>0 AND encrypted_content IS NOT NULL AND
      name IS NULL AND url IS NULL AND token_encrypted IS NULL AND
      headers_encrypted IS NULL AND oauth_encrypted IS NULL));
ALTER TABLE public.user_mcp_oauth_attempts
  ALTER COLUMN endpoint DROP NOT NULL,
  ALTER COLUMN payload_encrypted DROP NOT NULL,
  ADD COLUMN encrypted_content text,
  ADD COLUMN encryption_version integer NOT NULL DEFAULT 0,
  ADD COLUMN content_revision bigint NOT NULL DEFAULT 0,
  ADD COLUMN encryption_checked_at timestamptz,
  ADD COLUMN encryption_attempted_at timestamptz,
  ADD CONSTRAINT user_mcp_oauth_attempts_content_shape CHECK (
    (encryption_version=0 AND encrypted_content IS NULL) OR
    (encryption_version>0 AND encrypted_content IS NOT NULL AND
      endpoint IS NULL AND payload_encrypted IS NULL));
CREATE INDEX user_mcp_connections_content_queue ON
  public.user_mcp_connections(encryption_attempted_at NULLS FIRST,id);
CREATE INDEX user_mcp_oauth_attempts_content_queue ON
  public.user_mcp_oauth_attempts(encryption_attempted_at NULLS FIRST,state);

CREATE TABLE public.mcp_content_scope(
  id boolean PRIMARY KEY DEFAULT true CHECK(id),
  activated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.mcp_content_scope ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.mcp_content_scope FROM PUBLIC,anon,authenticated;
GRANT ALL ON public.mcp_content_scope TO service_role;

CREATE FUNCTION public.mcp_content_envelope_version(p_value text)
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
REVOKE ALL ON FUNCTION public.mcp_content_envelope_version(text)
  FROM PUBLIC,anon,authenticated;

CREATE FUNCTION public.guard_mcp_content()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE parsed_version integer:=0; changed boolean;
BEGIN
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('personal-mcp-content',591));
  IF NEW.encrypted_content IS NOT NULL THEN
    parsed_version:=public.mcp_content_envelope_version(NEW.encrypted_content);
  END IF;
  IF NEW.encryption_version>0 AND parsed_version<>NEW.encryption_version THEN
    RAISE EXCEPTION 'mcp_content_invalid_envelope' USING ERRCODE='23514';
  END IF;
  IF NEW.encryption_version=0 AND
      EXISTS(SELECT 1 FROM public.mcp_content_scope) THEN
    RAISE EXCEPTION 'mcp_content_requires_encryption' USING ERRCODE='23514';
  END IF;
  IF TG_OP='UPDATE' THEN
    IF OLD.encryption_version>0 AND
        (NEW.encryption_version<OLD.encryption_version OR
         NEW.user_id IS DISTINCT FROM OLD.user_id) THEN
      RAISE EXCEPTION 'mcp_content_scope_change' USING ERRCODE='23514';
    END IF;
    IF TG_TABLE_NAME='user_mcp_oauth_attempts' THEN
      IF OLD.encryption_version>0 AND
          NEW.connection_id IS DISTINCT FROM OLD.connection_id THEN
        RAISE EXCEPTION 'mcp_content_scope_change' USING ERRCODE='23514';
      END IF;
    END IF;
    IF TG_TABLE_NAME='user_mcp_connections' THEN
      changed:=NEW.encrypted_content IS DISTINCT FROM OLD.encrypted_content OR
        NEW.name IS DISTINCT FROM OLD.name OR NEW.url IS DISTINCT FROM OLD.url OR
        NEW.token_encrypted IS DISTINCT FROM OLD.token_encrypted OR
        NEW.headers_encrypted IS DISTINCT FROM OLD.headers_encrypted OR
        NEW.oauth_encrypted IS DISTINCT FROM OLD.oauth_encrypted;
    ELSE
      changed:=NEW.encrypted_content IS DISTINCT FROM OLD.encrypted_content OR
        NEW.endpoint IS DISTINCT FROM OLD.endpoint OR
        NEW.payload_encrypted IS DISTINCT FROM OLD.payload_encrypted;
    END IF;
    NEW.content_revision:=OLD.content_revision+CASE WHEN changed THEN 1 ELSE 0 END;
    IF changed THEN
      NEW.encryption_checked_at:=CASE WHEN NEW.encryption_version>0
        THEN pg_catalog.clock_timestamp() ELSE NULL END;
    END IF;
  ELSIF NEW.encryption_version>0 THEN
    NEW.encryption_checked_at:=pg_catalog.clock_timestamp();
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER user_mcp_connections_content_guard
  BEFORE INSERT OR UPDATE ON public.user_mcp_connections FOR EACH ROW
  EXECUTE FUNCTION public.guard_mcp_content();
CREATE TRIGGER user_mcp_oauth_attempts_content_guard
  BEFORE INSERT OR UPDATE ON public.user_mcp_oauth_attempts FOR EACH ROW
  EXECUTE FUNCTION public.guard_mcp_content();
REVOKE ALL ON FUNCTION public.guard_mcp_content()
  FROM PUBLIC,anon,authenticated;

CREATE FUNCTION public.activate_mcp_content()
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('personal-mcp-content',591));
  IF EXISTS(SELECT 1 FROM public.user_mcp_connections WHERE
      encryption_version=0 OR encryption_checked_at IS NULL OR
      public.mcp_content_envelope_version(encrypted_content)
        <>encryption_version) OR
     EXISTS(SELECT 1 FROM public.user_mcp_oauth_attempts WHERE
      encryption_version=0 OR encryption_checked_at IS NULL OR
      public.mcp_content_envelope_version(encrypted_content)
        <>encryption_version)
  THEN RETURN false; END IF;
  INSERT INTO public.mcp_content_scope(id) VALUES(true)
    ON CONFLICT DO NOTHING;
  RETURN true;
END;
$$;
REVOKE ALL ON FUNCTION public.activate_mcp_content()
  FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.activate_mcp_content()
  TO service_role;
COMMIT;
