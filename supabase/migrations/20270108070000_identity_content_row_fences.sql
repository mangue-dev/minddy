-- Keep encrypted identity fields protected after their value is cleared.
BEGIN;

ALTER TABLE public.integrations
  ADD COLUMN webhook_url_protected boolean NOT NULL DEFAULT false;
UPDATE public.integrations SET webhook_url_protected=true
  WHERE COALESCE(public.integration_content_version(webhook_url)>0,false);

ALTER TABLE public.billing_accounts
  ADD COLUMN email_protected boolean NOT NULL DEFAULT false,
  ADD COLUMN admin_override_note_protected boolean NOT NULL DEFAULT false;
UPDATE public.billing_accounts SET
  email_protected=COALESCE(public.billing_identity_version(email)>0,false),
  admin_override_note_protected=
    COALESCE(public.billing_identity_version(admin_override_note)>0,false);

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
    NEW.name_encryption_checked_at:=CASE WHEN name_version>0 THEN
      pg_catalog.clock_timestamp() ELSE NULL END;
  END IF;
  IF TG_OP='INSERT' OR NEW.webhook_url IS DISTINCT FROM OLD.webhook_url THEN
    NEW.webhook_encryption_checked_at:=CASE WHEN webhook_version>0 THEN
      pg_catalog.clock_timestamp() ELSE NULL END;
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
    NEW.content_revision:=OLD.content_revision+1;
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
    NEW.email_encryption_checked_at:=CASE WHEN email_version>0
      THEN pg_catalog.clock_timestamp() ELSE NULL END;
  END IF;
  IF TG_OP='INSERT' OR NEW.admin_override_note IS DISTINCT FROM
      OLD.admin_override_note THEN
    NEW.admin_override_note_encryption_checked_at:=CASE WHEN note_version>0
      THEN pg_catalog.clock_timestamp() ELSE NULL END;
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.activate_integration_content()
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
  IF current_setting('transaction_isolation') <> 'read committed' THEN
    RAISE EXCEPTION 'integration_activation_requires_read_committed'
      USING ERRCODE='25001';
  END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('integration-content',591));
  IF EXISTS(SELECT 1 FROM public.integrations WHERE
      public.integration_content_version(name)=0 OR
      name_encryption_checked_at IS NULL OR
      (webhook_url IS NOT NULL AND
        (public.integration_content_version(webhook_url)=0 OR
          webhook_encryption_checked_at IS NULL))) THEN RETURN false; END IF;
  INSERT INTO public.integration_content_scope(id) VALUES(true)
    ON CONFLICT DO NOTHING;
  RETURN true;
END;
$$;

CREATE OR REPLACE FUNCTION public.activate_billing_identity()
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
  IF current_setting('transaction_isolation') <> 'read committed' THEN
    RAISE EXCEPTION 'billing_identity_activation_requires_read_committed'
      USING ERRCODE='25001';
  END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('billing-identity',591));
  IF EXISTS(SELECT 1 FROM public.billing_accounts WHERE
      email IS NOT NULL AND
        (public.billing_identity_version(email)=0 OR
          email_encryption_checked_at IS NULL) OR
      admin_override_note IS NOT NULL AND
        (public.billing_identity_version(admin_override_note)=0 OR
          admin_override_note_encryption_checked_at IS NULL)) THEN
    RETURN false;
  END IF;
  INSERT INTO public.billing_identity_scope(id) VALUES(true)
    ON CONFLICT DO NOTHING;
  RETURN true;
END;
$$;
COMMIT;
