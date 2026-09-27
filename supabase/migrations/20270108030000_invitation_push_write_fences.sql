-- Persist the first protected write so a paused rollout cannot revive clear writers.
BEGIN;

CREATE TABLE public.invitation_email_scope (
  id boolean PRIMARY KEY DEFAULT true CHECK (id),
  started_at timestamptz NOT NULL DEFAULT now(),
  activated_at timestamptz
);
ALTER TABLE public.invitation_email_scope ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.invitation_email_scope FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.invitation_email_scope TO service_role;
INSERT INTO public.invitation_email_scope(id)
  SELECT true WHERE EXISTS (
    SELECT 1 FROM public.project_invitations
    WHERE encryption_version > 0 AND invited_email_ciphertext IS NOT NULL
  );

CREATE FUNCTION public.guard_invitation_email_transition()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('invitation-email', 591));
  IF TG_OP = 'UPDATE' AND OLD.encryption_version > 0 AND
      (NEW.encryption_version < OLD.encryption_version OR
       NEW.invited_email IS NOT NULL) THEN
    RAISE EXCEPTION 'invitation_email_downgrade' USING ERRCODE = '23514';
  END IF;
  IF NEW.encryption_version > 0 AND
      NEW.invited_email_ciphertext IS NOT NULL THEN
    INSERT INTO public.invitation_email_scope(id) VALUES(true)
      ON CONFLICT DO NOTHING;
  ELSIF EXISTS(SELECT 1 FROM public.invitation_email_scope) AND
      (TG_OP = 'INSERT' OR
       (NEW.invited_email IS DISTINCT FROM OLD.invited_email AND
        NEW.invited_email IS NOT NULL)) THEN
    RAISE EXCEPTION 'invitation_email_requires_encryption'
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER invitation_email_transition_guard BEFORE INSERT OR UPDATE
  ON public.project_invitations FOR EACH ROW
  EXECUTE FUNCTION public.guard_invitation_email_transition();
REVOKE ALL ON FUNCTION public.guard_invitation_email_transition()
  FROM PUBLIC, anon, authenticated;

CREATE FUNCTION public.activate_invitation_email()
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('invitation-email', 591));
  IF EXISTS(SELECT 1 FROM public.project_invitations WHERE
      invited_email IS NOT NULL OR
      (status = 'pending' AND (encryption_version = 0 OR
        invited_email_ciphertext IS NULL OR invited_email_blind_index IS NULL)))
  THEN RETURN false; END IF;
  INSERT INTO public.invitation_email_scope(id, activated_at)
    VALUES(true, pg_catalog.clock_timestamp())
    ON CONFLICT(id) DO UPDATE SET activated_at =
      COALESCE(public.invitation_email_scope.activated_at, EXCLUDED.activated_at);
  RETURN true;
END;
$$;
REVOKE ALL ON FUNCTION public.activate_invitation_email()
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.activate_invitation_email() TO service_role;

CREATE TABLE public.push_content_write_scope (
  id boolean PRIMARY KEY DEFAULT true CHECK (id),
  started_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.push_content_write_scope ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.push_content_write_scope FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.push_content_write_scope TO service_role;
INSERT INTO public.push_content_write_scope(id)
  SELECT true WHERE EXISTS (
    SELECT 1 FROM public.push_subscriptions WHERE encrypted_content IS NOT NULL
  );

CREATE OR REPLACE FUNCTION public.guard_push_content()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
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
         (NEW.user_id IS DISTINCT FROM OLD.user_id AND
          (NEW.encrypted_content IS NOT DISTINCT FROM OLD.encrypted_content OR
           version=0)) OR
         (NEW.user_id IS NOT DISTINCT FROM OLD.user_id AND
          version<COALESCE(public.push_content_version(OLD.encrypted_content),0)))) THEN
      RAISE EXCEPTION 'push_identity_change' USING ERRCODE='23514';
    END IF;
    IF NEW.encrypted_content IS DISTINCT FROM OLD.encrypted_content OR
       NEW.user_id IS DISTINCT FROM OLD.user_id OR
       NEW.endpoint IS DISTINCT FROM OLD.endpoint OR
       NEW.p256dh IS DISTINCT FROM OLD.p256dh OR
       NEW.auth IS DISTINCT FROM OLD.auth OR
       NEW.native_installation_id IS DISTINCT FROM OLD.native_installation_id OR
       NEW.device_label IS DISTINCT FROM OLD.device_label OR
       NEW.user_agent IS DISTINCT FROM OLD.user_agent OR
       NEW.transport IS DISTINCT FROM OLD.transport THEN
      NEW.content_revision:=OLD.content_revision+1;
    ELSIF NEW.content_revision IS DISTINCT FROM OLD.content_revision THEN
      RAISE EXCEPTION 'push_revision_change' USING ERRCODE='23514';
    END IF;
  END IF;
  IF version>0 THEN
    INSERT INTO public.push_content_write_scope(id) VALUES(true)
      ON CONFLICT DO NOTHING;
  ELSIF EXISTS(SELECT 1 FROM public.push_content_write_scope) AND
      (TG_OP='INSERT' OR
       (NEW.endpoint IS DISTINCT FROM OLD.endpoint OR
        NEW.p256dh IS DISTINCT FROM OLD.p256dh OR
        NEW.auth IS DISTINCT FROM OLD.auth OR
        NEW.native_installation_id IS DISTINCT FROM OLD.native_installation_id OR
        NEW.device_label IS DISTINCT FROM OLD.device_label OR
        NEW.user_agent IS DISTINCT FROM OLD.user_agent OR
        NEW.user_id IS DISTINCT FROM OLD.user_id OR
        NEW.transport IS DISTINCT FROM OLD.transport)) THEN
    RAISE EXCEPTION 'push_requires_encryption' USING ERRCODE='23514';
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

-- Reconcile any mixed-format duplicate before the transaction returns.
CREATE OR REPLACE FUNCTION public.register_protected_push(
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
      p_locale IS NULL OR length(p_locale)>32 THEN
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
      locale=next_locale,enabled=next_enabled,last_seen_at=now(),failure_count=0
      WHERE id=prior.id RETURNING * INTO result;
  ELSE
    INSERT INTO public.push_subscriptions(user_id,endpoint_digest,
      installation_digest,encrypted_content,transport,locale,enabled)
      VALUES(p_user_id,p_endpoint_digest,p_installation_digest,
        p_encrypted_content,p_transport,next_locale,next_enabled)
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

COMMIT;
