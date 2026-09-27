-- Backfill attempts and authenticated verification are separate facts.
BEGIN;

CREATE OR REPLACE FUNCTION public.guard_oauth_client_content()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE parsed jsonb;
BEGIN
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('oauth-client-content',591));
  IF TG_OP='UPDATE' THEN
    IF NEW.client_id IS DISTINCT FROM OLD.client_id OR
       NEW.encryption_version<OLD.encryption_version THEN
      RAISE EXCEPTION 'oauth_client_scope_change' USING ERRCODE='23514';
    END IF;
    IF NEW.encrypted_content IS DISTINCT FROM OLD.encrypted_content OR
       NEW.client_name IS DISTINCT FROM OLD.client_name OR
       NEW.redirect_uris IS DISTINCT FROM OLD.redirect_uris OR
       NEW.logo_uri IS DISTINCT FROM OLD.logo_uri OR
       NEW.client_uri IS DISTINCT FROM OLD.client_uri THEN
      NEW.content_revision:=OLD.content_revision+1;
    ELSIF NEW.content_revision IS DISTINCT FROM OLD.content_revision THEN
      RAISE EXCEPTION 'oauth_client_revision_change' USING ERRCODE='23514';
    END IF;
  END IF;
  IF NEW.encrypted_content IS NOT NULL THEN
    BEGIN parsed:=NEW.encrypted_content::jsonb;
    EXCEPTION WHEN others THEN
      RAISE EXCEPTION 'oauth_client_invalid_envelope' USING ERRCODE='23514';
    END;
    IF COALESCE((parsed->>'format')::integer,0)<>3 OR
       COALESCE((parsed->>'keyVersion')::integer,0)<>NEW.encryption_version THEN
      RAISE EXCEPTION 'oauth_client_invalid_envelope' USING ERRCODE='23514';
    END IF;
    IF TG_OP='INSERT' OR NEW.encrypted_content IS DISTINCT FROM OLD.encrypted_content THEN
      NEW.encryption_checked_at:=NULL;
    END IF;
  END IF;
  IF EXISTS(SELECT 1 FROM public.oauth_client_content_scope) AND
     NEW.encrypted_content IS NULL THEN
    RAISE EXCEPTION 'oauth_client_requires_encryption' USING ERRCODE='23514';
  END IF;
  IF TG_OP='UPDATE' AND
      NEW.encryption_checked_at IS DISTINCT FROM OLD.encryption_checked_at AND NEW.encryption_checked_at IS NOT NULL AND
      pg_catalog.current_setting('minddy.encryption_verification',true)
        IS DISTINCT FROM 'on' THEN
    RAISE EXCEPTION 'encryption_proof_requires_verification' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.guard_oauth_code_content()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE parsed jsonb;
BEGIN
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('oauth-code-content',591));
  IF TG_OP='UPDATE' THEN
    IF NEW.code_hash IS DISTINCT FROM OLD.code_hash OR
       NEW.user_id IS DISTINCT FROM OLD.user_id OR
       NEW.client_id IS DISTINCT FROM OLD.client_id OR
       NEW.grant_id IS DISTINCT FROM OLD.grant_id OR
       NEW.code_challenge IS DISTINCT FROM OLD.code_challenge OR
       NEW.encryption_version<OLD.encryption_version THEN
      RAISE EXCEPTION 'oauth_code_scope_change' USING ERRCODE='23514';
    END IF;
    IF NEW.encrypted_content IS DISTINCT FROM OLD.encrypted_content OR
       NEW.redirect_uri IS DISTINCT FROM OLD.redirect_uri OR
       NEW.resource IS DISTINCT FROM OLD.resource THEN
      NEW.content_revision:=OLD.content_revision+1;
    ELSIF NEW.content_revision IS DISTINCT FROM OLD.content_revision THEN
      RAISE EXCEPTION 'oauth_code_revision_change' USING ERRCODE='23514';
    END IF;
  END IF;
  IF NEW.encrypted_content IS NOT NULL THEN
    BEGIN parsed:=NEW.encrypted_content::jsonb;
    EXCEPTION WHEN others THEN
      RAISE EXCEPTION 'oauth_code_invalid_envelope' USING ERRCODE='23514';
    END;
    IF COALESCE((parsed->>'format')::integer,0)<>3 OR
       COALESCE((parsed->>'keyVersion')::integer,0)<>NEW.encryption_version THEN
      RAISE EXCEPTION 'oauth_code_invalid_envelope' USING ERRCODE='23514';
    END IF;
    IF TG_OP='INSERT' OR NEW.encrypted_content IS DISTINCT FROM OLD.encrypted_content THEN
      NEW.encryption_checked_at:=NULL;
    END IF;
  END IF;
  IF EXISTS(SELECT 1 FROM public.oauth_code_content_scope) AND
     NEW.encrypted_content IS NULL THEN
    RAISE EXCEPTION 'oauth_code_requires_encryption' USING ERRCODE='23514';
  END IF;
  IF TG_OP='UPDATE' AND
      NEW.encryption_checked_at IS DISTINCT FROM OLD.encryption_checked_at AND NEW.encryption_checked_at IS NOT NULL AND
      pg_catalog.current_setting('minddy.encryption_verification',true)
        IS DISTINCT FROM 'on' THEN
    RAISE EXCEPTION 'encryption_proof_requires_verification' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.guard_api_key_content()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE parsed jsonb;
BEGIN
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('api-key-content',591));
  IF TG_OP='UPDATE' THEN
    IF NEW.id IS DISTINCT FROM OLD.id OR
       NEW.user_id IS DISTINCT FROM OLD.user_id OR
       NEW.encryption_version<OLD.encryption_version THEN
      RAISE EXCEPTION 'api_key_scope_change' USING ERRCODE='23514';
    END IF;
    IF NEW.encrypted_content IS DISTINCT FROM OLD.encrypted_content OR
       NEW.name IS DISTINCT FROM OLD.name OR NEW.agent IS DISTINCT FROM OLD.agent THEN
      NEW.content_revision:=OLD.content_revision+1;
    ELSIF NEW.content_revision IS DISTINCT FROM OLD.content_revision THEN
      RAISE EXCEPTION 'api_key_revision_change' USING ERRCODE='23514';
    END IF;
  END IF;
  IF NEW.encrypted_content IS NOT NULL THEN
    BEGIN parsed:=NEW.encrypted_content::jsonb;
    EXCEPTION WHEN others THEN
      RAISE EXCEPTION 'api_key_invalid_envelope' USING ERRCODE='23514';
    END;
    IF COALESCE((parsed->>'format')::integer,0)<>3 OR
       COALESCE((parsed->>'keyVersion')::integer,0)<>NEW.encryption_version THEN
      RAISE EXCEPTION 'api_key_invalid_envelope' USING ERRCODE='23514';
    END IF;
    IF TG_OP='INSERT' OR NEW.encrypted_content IS DISTINCT FROM OLD.encrypted_content THEN
      NEW.encryption_checked_at:=NULL;
    END IF;
  END IF;
  IF EXISTS(SELECT 1 FROM public.api_key_content_scope) AND
     NEW.encrypted_content IS NULL THEN
    RAISE EXCEPTION 'api_key_requires_encryption' USING ERRCODE='23514';
  END IF;
  IF TG_OP='UPDATE' AND
      NEW.encryption_checked_at IS DISTINCT FROM OLD.encryption_checked_at AND NEW.encryption_checked_at IS NOT NULL AND
      pg_catalog.current_setting('minddy.encryption_verification',true)
        IS DISTINCT FROM 'on' THEN
    RAISE EXCEPTION 'encryption_proof_requires_verification' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.guard_integration_content()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE name_version integer; webhook_version integer; old_name_version integer:=0;
  old_webhook_version integer:=0;
BEGIN
  IF current_setting('transaction_isolation') <> 'read committed' THEN
    RAISE EXCEPTION 'integration_write_requires_read_committed'
      USING ERRCODE='25001';
  END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('integration-content',591));
  name_version:=public.integration_content_version(NEW.name);
  webhook_version:=public.integration_content_version(NEW.webhook_url);
  IF (left(NEW.name,6)='mdye3:' AND name_version=0) OR
      (left(NEW.webhook_url,6)='mdye3:' AND webhook_version=0) THEN
    RAISE EXCEPTION 'integration_invalid_envelope' USING ERRCODE='23514';
  END IF;
  IF TG_OP='UPDATE' THEN
    old_name_version:=public.integration_content_version(OLD.name);
    old_webhook_version:=public.integration_content_version(OLD.webhook_url);
    IF NEW.id IS DISTINCT FROM OLD.id OR
       NEW.project_id IS DISTINCT FROM OLD.project_id OR
       name_version<old_name_version OR
       (NEW.webhook_url IS NOT NULL AND
         webhook_version<old_webhook_version) OR
       (OLD.webhook_url_protected AND NOT NEW.webhook_url_protected) THEN
      RAISE EXCEPTION 'integration_scope_change' USING ERRCODE='23514';
    END IF;
    IF NEW.name IS DISTINCT FROM OLD.name OR
       NEW.webhook_url IS DISTINCT FROM OLD.webhook_url THEN
      NEW.content_revision:=OLD.content_revision+1;
    ELSIF NEW.content_revision IS DISTINCT FROM OLD.content_revision THEN
      RAISE EXCEPTION 'integration_revision_change' USING ERRCODE='23514';
    END IF;
  END IF;
  NEW.webhook_url_protected:=NEW.webhook_url_protected OR
    COALESCE(webhook_version>0,false);
  IF NEW.webhook_url IS NOT NULL AND webhook_version=0 AND
      (NEW.webhook_url_protected OR
        EXISTS(SELECT 1 FROM public.integration_content_scope)) OR
      EXISTS(SELECT 1 FROM public.integration_content_scope) AND name_version=0
      THEN
    RAISE EXCEPTION 'integration_requires_encryption' USING ERRCODE='23514';
  END IF;
  IF TG_OP='INSERT' OR NEW.name IS DISTINCT FROM OLD.name THEN
    NEW.name_encryption_checked_at:=NULL;
  END IF;
  IF TG_OP='INSERT' OR NEW.webhook_url IS DISTINCT FROM OLD.webhook_url THEN
    NEW.webhook_encryption_checked_at:=NULL;
  END IF;
  IF TG_OP='UPDATE' AND
      ((NEW.name_encryption_checked_at IS DISTINCT FROM OLD.name_encryption_checked_at AND NEW.name_encryption_checked_at IS NOT NULL) OR
      (NEW.webhook_encryption_checked_at IS DISTINCT FROM OLD.webhook_encryption_checked_at AND NEW.webhook_encryption_checked_at IS NOT NULL)) AND
      pg_catalog.current_setting('minddy.encryption_verification',true)
        IS DISTINCT FROM 'on' THEN
    RAISE EXCEPTION 'encryption_proof_requires_verification' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END;
$$;

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
    NEW.encryption_checked_at:=NULL;
  END IF;
  IF TG_OP='UPDATE' AND
      ((NEW.encryption_checked_at IS DISTINCT FROM OLD.encryption_checked_at AND NEW.encryption_checked_at IS NOT NULL)) AND
      pg_catalog.current_setting('minddy.encryption_verification',true)
        IS DISTINCT FROM 'on' THEN
    RAISE EXCEPTION 'encryption_proof_requires_verification' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.guard_billing_identity()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE email_version integer; note_version integer;
  old_email_version integer:=0; old_note_version integer:=0;
BEGIN
  IF current_setting('transaction_isolation') <> 'read committed' THEN
    RAISE EXCEPTION 'billing_identity_write_requires_read_committed'
      USING ERRCODE='25001';
  END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('billing-identity',591));
  email_version:=public.billing_identity_version(NEW.email);
  note_version:=public.billing_identity_version(NEW.admin_override_note);
  IF (left(NEW.email,6)='mdye3:' AND email_version=0) OR
      (left(NEW.admin_override_note,6)='mdye3:' AND note_version=0) THEN
    RAISE EXCEPTION 'billing_identity_invalid_envelope'
      USING ERRCODE='23514';
  END IF;
  IF TG_OP='UPDATE' THEN
    IF NEW.email IS DISTINCT FROM OLD.email OR
        NEW.admin_override_note IS DISTINCT FROM OLD.admin_override_note THEN
      NEW.content_revision:=OLD.content_revision+1;
    ELSIF NEW.content_revision IS DISTINCT FROM OLD.content_revision THEN
      RAISE EXCEPTION 'billing_identity_revision_change' USING ERRCODE='23514';
    END IF;
    old_email_version:=public.billing_identity_version(OLD.email);
    old_note_version:=public.billing_identity_version(OLD.admin_override_note);
    IF NEW.user_id IS DISTINCT FROM OLD.user_id OR
        (NEW.email IS NOT NULL AND old_email_version>email_version) OR
        (NEW.admin_override_note IS NOT NULL AND old_note_version>note_version) OR
        (OLD.email_protected AND NOT NEW.email_protected) OR
        (OLD.admin_override_note_protected AND
          NOT NEW.admin_override_note_protected) THEN
      RAISE EXCEPTION 'billing_identity_scope_change'
        USING ERRCODE='23514';
    END IF;
  END IF;
  NEW.email_protected:=NEW.email_protected OR COALESCE(email_version>0,false);
  NEW.admin_override_note_protected:=
    NEW.admin_override_note_protected OR COALESCE(note_version>0,false);
  IF (NEW.email IS NOT NULL AND email_version=0 AND
        (NEW.email_protected OR
          EXISTS(SELECT 1 FROM public.billing_identity_scope))) OR
      (NEW.admin_override_note IS NOT NULL AND note_version=0 AND
        (NEW.admin_override_note_protected OR
          EXISTS(SELECT 1 FROM public.billing_identity_scope))) THEN
    RAISE EXCEPTION 'billing_identity_requires_encryption'
      USING ERRCODE='23514';
  END IF;
  IF TG_OP='INSERT' OR NEW.email IS DISTINCT FROM OLD.email THEN
    NEW.email_encryption_checked_at:=NULL;
  END IF;
  IF TG_OP='INSERT' OR NEW.admin_override_note IS DISTINCT FROM
      OLD.admin_override_note THEN
    NEW.admin_override_note_encryption_checked_at:=NULL;
  END IF;
  IF TG_OP='UPDATE' AND
      ((NEW.email_encryption_checked_at IS DISTINCT FROM OLD.email_encryption_checked_at AND NEW.email_encryption_checked_at IS NOT NULL) OR
      (NEW.admin_override_note_encryption_checked_at IS DISTINCT FROM OLD.admin_override_note_encryption_checked_at AND NEW.admin_override_note_encryption_checked_at IS NOT NULL)) AND
      pg_catalog.current_setting('minddy.encryption_verification',true)
        IS DISTINCT FROM 'on' THEN
    RAISE EXCEPTION 'encryption_proof_requires_verification' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END;
$$;

CREATE FUNCTION public.confirm_encrypted_content(
  p_family text,p_id text,p_revision bigint,p_first text,
  p_second text DEFAULT NULL
) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE affected integer:=0;
  prior text:=pg_catalog.current_setting('minddy.encryption_verification',true);
BEGIN
  IF p_revision IS NULL OR p_revision<0 OR p_id IS NULL OR
      (p_first IS NULL AND p_family<>'billing_identity') THEN
    RETURN false;
  END IF;
  PERFORM pg_catalog.set_config('minddy.encryption_verification','on',true);
  CASE p_family
    WHEN 'oauth_client' THEN
      UPDATE public.oauth_clients SET
        encryption_checked_at=pg_catalog.clock_timestamp()
        WHERE client_id=p_id AND content_revision=p_revision
          AND encrypted_content=p_first AND encryption_version>0
          AND client_name IS NULL AND redirect_uris IS NULL
          AND logo_uri IS NULL AND client_uri IS NULL;
    WHEN 'oauth_code' THEN
      UPDATE public.oauth_authorization_codes SET
        encryption_checked_at=pg_catalog.clock_timestamp()
        WHERE code_hash=p_id AND content_revision=p_revision
          AND encrypted_content=p_first AND encryption_version>0
          AND redirect_uri IS NULL AND resource IS NULL;
    WHEN 'api_key' THEN
      UPDATE public.api_keys SET
        encryption_checked_at=pg_catalog.clock_timestamp()
        WHERE id=p_id::uuid AND content_revision=p_revision
          AND encrypted_content=p_first AND encryption_version>0
          AND name IS NULL AND agent IS NULL;
    WHEN 'integration' THEN
      UPDATE public.integrations SET
        name_encryption_checked_at=pg_catalog.clock_timestamp(),
        webhook_encryption_checked_at=CASE WHEN webhook_url IS NULL
          THEN NULL ELSE pg_catalog.clock_timestamp() END
        WHERE id=p_id::uuid AND content_revision=p_revision
          AND name=p_first AND webhook_url IS NOT DISTINCT FROM p_second
          AND public.integration_content_version(name)>0
          AND (webhook_url IS NULL OR
            public.integration_content_version(webhook_url)>0);
    WHEN 'push' THEN
      UPDATE public.push_subscriptions SET
        encryption_checked_at=pg_catalog.clock_timestamp()
        WHERE id=p_id::uuid AND content_revision=p_revision
          AND encrypted_content=p_first
          AND public.push_content_version(encrypted_content)>0
          AND endpoint IS NULL AND p256dh IS NULL AND auth IS NULL
          AND native_installation_id IS NULL AND device_label IS NULL
          AND user_agent IS NULL;
    WHEN 'billing_identity' THEN
      UPDATE public.billing_accounts SET
        email_encryption_checked_at=CASE WHEN email IS NULL
          THEN NULL ELSE pg_catalog.clock_timestamp() END,
        admin_override_note_encryption_checked_at=
          CASE WHEN admin_override_note IS NULL
            THEN NULL ELSE pg_catalog.clock_timestamp() END
        WHERE user_id=p_id::uuid AND content_revision=p_revision
          AND email IS NOT DISTINCT FROM p_first
          AND admin_override_note IS NOT DISTINCT FROM p_second
          AND (email IS NULL OR public.billing_identity_version(email)>0)
          AND (admin_override_note IS NULL OR
            public.billing_identity_version(admin_override_note)>0);
    ELSE
      RAISE EXCEPTION 'unknown_encryption_family' USING ERRCODE='22023';
  END CASE;
  GET DIAGNOSTICS affected=ROW_COUNT;
  PERFORM pg_catalog.set_config('minddy.encryption_verification',COALESCE(prior,''),true);
  RETURN affected=1;
END;
$$;
REVOKE ALL ON FUNCTION public.confirm_encrypted_content(text,text,bigint,text,text)
  FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.confirm_encrypted_content(text,text,bigint,text,text)
  TO service_role;

-- Shape-only checks in the original migrations cannot attest decryption.
UPDATE public.oauth_clients SET encryption_checked_at=NULL
  WHERE encryption_checked_at IS NOT NULL;
UPDATE public.oauth_authorization_codes SET encryption_checked_at=NULL
  WHERE encryption_checked_at IS NOT NULL;
UPDATE public.api_keys SET encryption_checked_at=NULL
  WHERE encryption_checked_at IS NOT NULL;
UPDATE public.integrations SET name_encryption_checked_at=NULL,
  webhook_encryption_checked_at=NULL
  WHERE name_encryption_checked_at IS NOT NULL OR
    webhook_encryption_checked_at IS NOT NULL;
UPDATE public.push_subscriptions SET encryption_checked_at=NULL
  WHERE encryption_checked_at IS NOT NULL;
UPDATE public.billing_accounts SET email_encryption_checked_at=NULL,
  admin_override_note_encryption_checked_at=NULL
  WHERE email_encryption_checked_at IS NOT NULL OR
    admin_override_note_encryption_checked_at IS NOT NULL;
COMMIT;
