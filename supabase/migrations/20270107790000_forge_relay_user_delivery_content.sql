-- MIN-591: seal brokered OAuth access/refresh tokens as one delivery.
BEGIN;
ALTER TABLE public.forge_relay_user_deliveries
  ALTER COLUMN access_token_encrypted DROP NOT NULL,
  ADD COLUMN encrypted_content text,
  ADD COLUMN encryption_version integer NOT NULL DEFAULT 0,
  ADD COLUMN content_revision bigint NOT NULL DEFAULT 0,
  ADD COLUMN encryption_checked_at timestamptz,
  ADD COLUMN encryption_attempted_at timestamptz,
  ADD CONSTRAINT forge_relay_user_delivery_content_shape CHECK (
    (encryption_version=0 AND encrypted_content IS NULL AND
      access_token_encrypted IS NOT NULL) OR
    (encryption_version>0 AND encrypted_content IS NOT NULL AND
      access_token_encrypted IS NULL AND refresh_token_encrypted IS NULL));
CREATE INDEX forge_relay_user_delivery_content_queue
  ON public.forge_relay_user_deliveries(
    encryption_attempted_at NULLS FIRST,id);

CREATE TABLE public.forge_relay_user_delivery_scope(
  id boolean PRIMARY KEY DEFAULT true CHECK(id),
  activated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.forge_relay_user_delivery_scope ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.forge_relay_user_delivery_scope
  FROM PUBLIC,anon,authenticated;
GRANT ALL ON public.forge_relay_user_delivery_scope TO service_role;

CREATE FUNCTION public.forge_relay_user_delivery_envelope_version(p_value text)
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
REVOKE ALL ON FUNCTION public.forge_relay_user_delivery_envelope_version(text)
  FROM PUBLIC,anon,authenticated;

CREATE FUNCTION public.guard_forge_relay_user_delivery_content()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE parsed_version integer:=0;
BEGIN
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('forge-relay-user-delivery-content',591));
  IF NEW.encrypted_content IS NOT NULL THEN
    parsed_version:=public.forge_relay_user_delivery_envelope_version(
      NEW.encrypted_content);
  END IF;
  IF NEW.encryption_version>0 AND parsed_version<>NEW.encryption_version THEN
    RAISE EXCEPTION 'forge_relay_user_delivery_invalid_envelope'
      USING ERRCODE='23514';
  END IF;
  IF EXISTS(SELECT 1 FROM public.forge_relay_user_delivery_scope) AND
      NEW.encryption_version=0 THEN
    RAISE EXCEPTION 'forge_relay_user_delivery_requires_encryption'
      USING ERRCODE='23514';
  END IF;
  IF TG_OP='UPDATE' THEN
    IF OLD.encryption_version>0 AND
        (NEW.encryption_version<OLD.encryption_version OR
         NEW.id IS DISTINCT FROM OLD.id OR
         NEW.instance_id IS DISTINCT FROM OLD.instance_id) THEN
      RAISE EXCEPTION 'forge_relay_user_delivery_downgrade'
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
CREATE TRIGGER forge_relay_user_delivery_content_guard
  BEFORE INSERT OR UPDATE ON public.forge_relay_user_deliveries
  FOR EACH ROW EXECUTE FUNCTION public.guard_forge_relay_user_delivery_content();
REVOKE ALL ON FUNCTION public.guard_forge_relay_user_delivery_content()
  FROM PUBLIC,anon,authenticated;

CREATE FUNCTION public.activate_forge_relay_user_deliveries()
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('forge-relay-user-delivery-content',591));
  IF EXISTS(SELECT 1 FROM public.forge_relay_user_deliveries WHERE
      encryption_version=0 OR encryption_checked_at IS NULL OR
      public.forge_relay_user_delivery_envelope_version(encrypted_content)
        <>encryption_version) THEN RETURN false; END IF;
  INSERT INTO public.forge_relay_user_delivery_scope(id) VALUES(true)
    ON CONFLICT DO NOTHING;
  RETURN true;
END;
$$;
REVOKE ALL ON FUNCTION public.activate_forge_relay_user_deliveries()
  FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.activate_forge_relay_user_deliveries()
  TO service_role;
COMMIT;
