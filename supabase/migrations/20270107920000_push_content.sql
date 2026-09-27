-- Seal push destinations, credentials, and device labels while retaining equality routing.
BEGIN;

ALTER TABLE public.push_subscriptions
  DROP CONSTRAINT push_subscriptions_credentials_check,
  ALTER COLUMN endpoint DROP NOT NULL,
  ADD COLUMN endpoint_digest text UNIQUE,
  ADD COLUMN installation_digest text,
  ADD COLUMN encrypted_content text,
  ADD COLUMN content_revision bigint NOT NULL DEFAULT 0,
  ADD COLUMN encryption_checked_at timestamptz,
  ADD COLUMN encryption_attempted_at timestamptz;
CREATE INDEX push_installation_digest_idx ON public.push_subscriptions
  (user_id,installation_digest) WHERE installation_digest IS NOT NULL;
CREATE INDEX push_encryption_queue ON public.push_subscriptions
  (encryption_attempted_at NULLS FIRST,id);
ALTER TABLE public.push_subscriptions
  ADD CONSTRAINT push_subscriptions_credentials_check CHECK (
    (encrypted_content IS NOT NULL AND endpoint IS NULL AND p256dh IS NULL
      AND auth IS NULL AND native_installation_id IS NULL
      AND device_label IS NULL AND user_agent IS NULL
      AND endpoint_digest ~ '^[0-9a-f]{64}$'
      AND (transport='web' AND installation_digest IS NULL OR
        transport IN ('apns','wns') AND installation_digest ~ '^[0-9a-f]{64}$'))
    OR (encrypted_content IS NULL AND endpoint IS NOT NULL
      AND endpoint_digest IS NULL AND installation_digest IS NULL
      AND (transport='web' AND p256dh IS NOT NULL AND auth IS NOT NULL
        AND native_installation_id IS NULL OR transport IN ('apns','wns')
        AND p256dh IS NULL AND auth IS NULL
        AND native_installation_id IS NOT NULL)));

CREATE TABLE public.push_content_scope (
  id boolean PRIMARY KEY DEFAULT true CHECK(id),
  activated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.push_content_scope ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.push_content_scope FROM PUBLIC,anon,authenticated;
GRANT ALL ON public.push_content_scope TO service_role;

CREATE FUNCTION public.push_content_version(p_value text)
RETURNS integer LANGUAGE plpgsql IMMUTABLE STRICT SET search_path='' AS $$
DECLARE parsed jsonb;
BEGIN
  IF left(p_value,6)<>'mdye3:' THEN RETURN 0; END IF;
  parsed:=substring(p_value FROM 7)::jsonb;
  IF COALESCE((parsed->>'format')::integer,0)=3 AND
      COALESCE((parsed->>'keyVersion')::integer,0)>0 THEN
    RETURN (parsed->>'keyVersion')::integer;
  END IF;
  RETURN 0;
EXCEPTION WHEN others THEN RETURN 0;
END;
$$;
REVOKE ALL ON FUNCTION public.push_content_version(text)
  FROM PUBLIC,anon,authenticated;

CREATE FUNCTION public.guard_push_content()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE version integer;
BEGIN
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('push-content',591));
  version:=COALESCE(public.push_content_version(NEW.encrypted_content),0);
  IF NEW.encrypted_content IS NOT NULL AND version=0 THEN
    RAISE EXCEPTION 'push_invalid_envelope' USING ERRCODE='23514';
  END IF;
  IF TG_OP='UPDATE' THEN
    IF NEW.id IS DISTINCT FROM OLD.id OR
       (OLD.encrypted_content IS NOT NULL AND
        (NEW.endpoint_digest IS DISTINCT FROM OLD.endpoint_digest OR
         version<COALESCE(public.push_content_version(OLD.encrypted_content),0))) THEN
      RAISE EXCEPTION 'push_identity_change' USING ERRCODE='23514';
    END IF;
    IF NEW.encrypted_content IS DISTINCT FROM OLD.encrypted_content OR
       NEW.user_id IS DISTINCT FROM OLD.user_id THEN
      NEW.content_revision:=OLD.content_revision+1;
    ELSIF NEW.content_revision IS DISTINCT FROM OLD.content_revision THEN
      RAISE EXCEPTION 'push_revision_change' USING ERRCODE='23514';
    END IF;
  END IF;
  IF EXISTS(SELECT 1 FROM public.push_content_scope) AND version=0 THEN
    RAISE EXCEPTION 'push_requires_encryption' USING ERRCODE='23514';
  END IF;
  IF TG_OP='INSERT' OR NEW.encrypted_content IS DISTINCT FROM OLD.encrypted_content
      OR NEW.user_id IS DISTINCT FROM OLD.user_id THEN
    NEW.encryption_checked_at:=CASE WHEN version>0 THEN
      pg_catalog.clock_timestamp() ELSE NULL END;
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER push_content_guard BEFORE INSERT OR UPDATE
  ON public.push_subscriptions FOR EACH ROW
  EXECUTE FUNCTION public.guard_push_content();
REVOKE ALL ON FUNCTION public.guard_push_content()
  FROM PUBLIC,anon,authenticated;

CREATE FUNCTION public.activate_push_content()
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('push-content',591));
  IF EXISTS(SELECT 1 FROM public.push_subscriptions WHERE
      COALESCE(public.push_content_version(encrypted_content),0)=0 OR
      encryption_checked_at IS NULL) THEN RETURN false; END IF;
  INSERT INTO public.push_content_scope(id) VALUES(true)
    ON CONFLICT DO NOTHING;
  RETURN true;
END;
$$;
REVOKE ALL ON FUNCTION public.activate_push_content()
  FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.activate_push_content() TO service_role;

-- A single transaction serializes endpoint transfer, refresh state and stale-device cleanup.
CREATE FUNCTION public.register_protected_push(
  p_user_id uuid,p_endpoint_clear text,p_endpoint_digest text,
  p_old_endpoint_clear text,p_old_endpoint_digest text,
  p_installation_clear text,p_installation_digest text,p_encrypted_content text,
  p_transport text,p_locale text,p_refresh boolean)
RETURNS public.push_subscriptions LANGUAGE plpgsql SECURITY DEFINER
SET search_path='' AS $$
DECLARE prior public.push_subscriptions%ROWTYPE;
  result public.push_subscriptions%ROWTYPE;
  next_enabled boolean;
  next_locale text;
BEGIN
  IF p_user_id IS NULL OR p_endpoint_clear IS NULL OR
      p_endpoint_digest !~ '^[0-9a-f]{64}$' OR
      COALESCE(public.push_content_version(p_encrypted_content),0)=0 OR
      p_transport NOT IN ('web','apns','wns') OR
      (p_transport='web') IS DISTINCT FROM (p_installation_digest IS NULL) OR
      p_locale IS NULL OR length(p_locale)>32 THEN
    RAISE EXCEPTION 'invalid push registration' USING ERRCODE='23514';
  END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(p_endpoint_digest,591));
  SELECT * INTO prior FROM public.push_subscriptions
    WHERE endpoint_digest=p_endpoint_digest OR endpoint=p_endpoint_clear
    ORDER BY endpoint_digest NULLS LAST LIMIT 1 FOR UPDATE;
  IF prior.id IS NULL AND (p_old_endpoint_digest IS NOT NULL OR
      p_old_endpoint_clear IS NOT NULL) THEN
    SELECT * INTO prior FROM public.push_subscriptions
      WHERE user_id=p_user_id AND
        (endpoint_digest=p_old_endpoint_digest OR endpoint=p_old_endpoint_clear)
      ORDER BY created_at DESC LIMIT 1 FOR UPDATE;
  END IF;
  IF prior.id IS NULL AND p_installation_digest IS NOT NULL THEN
    SELECT * INTO prior FROM public.push_subscriptions
      WHERE user_id=p_user_id AND
        (installation_digest=p_installation_digest OR
          native_installation_id=p_installation_clear)
      ORDER BY created_at DESC LIMIT 1 FOR UPDATE;
  END IF;
  next_enabled:=CASE WHEN p_refresh AND prior.user_id=p_user_id
    THEN prior.enabled ELSE true END;
  next_locale:=COALESCE(NULLIF(p_locale,''),
    CASE WHEN prior.user_id=p_user_id THEN prior.locale END,'en');
  IF prior.id IS NOT NULL AND prior.encrypted_content IS NOT NULL AND
      prior.endpoint_digest<>p_endpoint_digest THEN
    DELETE FROM public.push_subscriptions WHERE id=prior.id;
    prior.id:=NULL;
  END IF;
  IF prior.id IS NOT NULL THEN
    UPDATE public.push_subscriptions SET user_id=p_user_id,
      endpoint=NULL,p256dh=NULL,auth=NULL,native_installation_id=NULL,
      device_label=NULL,user_agent=NULL,endpoint_digest=p_endpoint_digest,
      installation_digest=p_installation_digest,
      encrypted_content=p_encrypted_content,transport=p_transport,
      locale=next_locale,enabled=next_enabled,last_seen_at=now(),failure_count=0
      WHERE id=prior.id RETURNING * INTO result;
  ELSE
    INSERT INTO public.push_subscriptions(user_id,endpoint_digest,
      installation_digest,encrypted_content,transport,locale,enabled)
      VALUES(p_user_id,p_endpoint_digest,p_installation_digest,
        p_encrypted_content,p_transport,next_locale,next_enabled)
      RETURNING * INTO result;
  END IF;
  IF p_old_endpoint_digest IS NOT NULL OR p_old_endpoint_clear IS NOT NULL THEN
    DELETE FROM public.push_subscriptions WHERE user_id=p_user_id
      AND id<>result.id AND (endpoint_digest=p_old_endpoint_digest OR
        endpoint=p_old_endpoint_clear);
  END IF;
  IF p_installation_digest IS NOT NULL THEN
    DELETE FROM public.push_subscriptions WHERE user_id=p_user_id
      AND id<>result.id AND (installation_digest=p_installation_digest OR
        native_installation_id=p_installation_clear);
  END IF;
  RETURN result;
END;
$$;
REVOKE ALL ON FUNCTION public.register_protected_push(uuid,text,text,text,text,text,text,text,text,text,boolean)
  FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.register_protected_push(uuid,text,text,text,text,text,text,text,text,text,boolean)
  TO service_role;

-- All API access now projects through authenticated server routes.
REVOKE ALL ON public.push_subscriptions FROM anon,authenticated;
COMMIT;
