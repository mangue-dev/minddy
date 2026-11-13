-- MIN-907: APNs serves two apps (macOS and iOS), each with its own topic, and
-- two gateways (production and sandbox). Both are recorded with the device
-- token when it registers, never guessed when sending. NULL on an APNs row is
-- the macOS app in production, the only APNs client before this migration.
-- Additive: the RPC keeps its previous parameters, so the deployed release
-- still registers devices the same way.
BEGIN;
ALTER TABLE public.push_subscriptions
  ADD COLUMN apns_platform text,
  ADD COLUMN apns_environment text,
  ADD CONSTRAINT push_subscriptions_apns_platform_check
    CHECK (apns_platform IN ('ios','macos')),
  ADD CONSTRAINT push_subscriptions_apns_environment_check
    CHECK (apns_environment IN ('production','sandbox')),
  ADD CONSTRAINT push_subscriptions_apns_target_check
    CHECK (transport='apns' OR (apns_platform IS NULL AND apns_environment IS NULL));

DROP FUNCTION public.register_protected_push(uuid,text,text,text,text,text,text,text,text,text,boolean);
CREATE FUNCTION public.register_protected_push(
  p_user_id uuid,p_endpoint_clear text,p_endpoint_digest text,
  p_old_endpoint_clear text,p_old_endpoint_digest text,
  p_installation_clear text,p_installation_digest text,p_encrypted_content text,
  p_transport text,p_locale text,p_refresh boolean,
  p_apns_platform text DEFAULT NULL,p_apns_environment text DEFAULT NULL)
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
      p_locale IS NULL OR length(p_locale)>32 OR
      (p_transport<>'apns' AND (p_apns_platform IS NOT NULL OR
        p_apns_environment IS NOT NULL)) OR
      p_apns_platform NOT IN ('ios','macos') OR
      p_apns_environment NOT IN ('production','sandbox') THEN
    RAISE EXCEPTION 'invalid push registration' USING ERRCODE='23514';
  END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('push-content',591));
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
      locale=next_locale,enabled=next_enabled,last_seen_at=now(),failure_count=0,
      apns_platform=p_apns_platform,apns_environment=p_apns_environment
      WHERE id=prior.id RETURNING * INTO result;
  ELSE
    INSERT INTO public.push_subscriptions(user_id,endpoint_digest,
      installation_digest,encrypted_content,transport,locale,enabled,
      apns_platform,apns_environment)
      VALUES(p_user_id,p_endpoint_digest,p_installation_digest,
        p_encrypted_content,p_transport,next_locale,next_enabled,
        p_apns_platform,p_apns_environment)
      RETURNING * INTO result;
  END IF;
  DELETE FROM public.push_subscriptions WHERE id<>result.id
    AND endpoint=p_endpoint_clear;
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
REVOKE ALL ON FUNCTION public.register_protected_push(uuid,text,text,text,text,text,text,text,text,text,boolean,text,text)
  FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.register_protected_push(uuid,text,text,text,text,text,text,text,text,text,boolean,text,text)
  TO service_role;
COMMIT;
