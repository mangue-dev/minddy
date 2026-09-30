-- MIN-591: protect billing email and administrative note copies.
BEGIN;
ALTER TABLE public.billing_accounts
  ADD COLUMN content_revision bigint NOT NULL DEFAULT 0,
  ADD COLUMN email_encryption_checked_at timestamptz,
  ADD COLUMN admin_override_note_encryption_checked_at timestamptz,
  ADD COLUMN encryption_attempted_at timestamptz;
CREATE INDEX billing_accounts_identity_queue ON public.billing_accounts
  (encryption_attempted_at NULLS FIRST,user_id)
  WHERE email IS NOT NULL OR admin_override_note IS NOT NULL;

CREATE TABLE public.billing_identity_scope(
  id boolean PRIMARY KEY DEFAULT true CHECK(id),
  activated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.billing_identity_scope ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.billing_identity_scope FROM PUBLIC,anon,authenticated;
GRANT ALL ON public.billing_identity_scope TO service_role;

CREATE FUNCTION public.billing_identity_version(p_value text)
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
REVOKE ALL ON FUNCTION public.billing_identity_version(text)
  FROM PUBLIC,anon,authenticated;

CREATE FUNCTION public.guard_billing_identity()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE email_version integer; note_version integer;
  old_email_version integer:=0; old_note_version integer:=0;
BEGIN
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
        (NEW.admin_override_note IS NOT NULL AND old_note_version>note_version) THEN
      RAISE EXCEPTION 'billing_identity_scope_change'
        USING ERRCODE='23514';
    END IF;
  END IF;
  IF EXISTS(SELECT 1 FROM public.billing_identity_scope) AND
      (NEW.email IS NOT NULL AND email_version=0 OR
        NEW.admin_override_note IS NOT NULL AND note_version=0) THEN
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
CREATE TRIGGER billing_accounts_identity_guard BEFORE INSERT OR UPDATE
  ON public.billing_accounts FOR EACH ROW
  EXECUTE FUNCTION public.guard_billing_identity();
REVOKE ALL ON FUNCTION public.guard_billing_identity()
  FROM PUBLIC,anon,authenticated;

CREATE FUNCTION public.activate_billing_identity()
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
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
REVOKE ALL ON FUNCTION public.activate_billing_identity()
  FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.activate_billing_identity()
  TO service_role;

-- Preserve absent billing fields during concurrent Stripe and admin updates.
CREATE FUNCTION public.upsert_billing_account_patch(
  p_user_id uuid,p_patch jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE patch_row public.billing_accounts%rowtype;
  saved public.billing_accounts%rowtype;
  unsupported text[];
BEGIN
  IF p_user_id IS NULL OR p_patch IS NULL OR
      pg_catalog.jsonb_typeof(p_patch)<>'object' THEN
    RAISE EXCEPTION 'Invalid billing patch' USING ERRCODE='22023';
  END IF;
  SELECT pg_catalog.array_agg(key ORDER BY key) INTO unsupported
    FROM pg_catalog.jsonb_object_keys(p_patch) AS patch_key(key)
    WHERE key <> ALL(ARRAY['email','admin_override_plan_id',
      'admin_override_note','admin_override_expires_at',
      'stripe_customer_id','stripe_subscription_id','stripe_price_id',
      'stripe_plan_id','stripe_subscription_status',
      'stripe_current_period_start','stripe_current_period_end',
      'stripe_cancel_at_period_end','stripe_checkout_session_id']::text[]);
  IF unsupported IS NOT NULL THEN
    RAISE EXCEPTION 'Unsupported billing patch keys: %',unsupported
      USING ERRCODE='22023';
  END IF;
  patch_row:=pg_catalog.jsonb_populate_record(
    NULL::public.billing_accounts,p_patch);
  INSERT INTO public.billing_accounts(user_id,email,admin_override_plan_id,
    admin_override_note,admin_override_expires_at,stripe_customer_id,
    stripe_subscription_id,stripe_price_id,stripe_plan_id,
    stripe_subscription_status,stripe_current_period_start,
    stripe_current_period_end,stripe_cancel_at_period_end,
    stripe_checkout_session_id)
  VALUES(p_user_id,patch_row.email,patch_row.admin_override_plan_id,
    patch_row.admin_override_note,patch_row.admin_override_expires_at,
    patch_row.stripe_customer_id,patch_row.stripe_subscription_id,
    patch_row.stripe_price_id,patch_row.stripe_plan_id,
    patch_row.stripe_subscription_status,
    patch_row.stripe_current_period_start,
    patch_row.stripe_current_period_end,
    COALESCE(patch_row.stripe_cancel_at_period_end,false),
    patch_row.stripe_checkout_session_id)
  ON CONFLICT(user_id) DO UPDATE SET
    email=CASE WHEN p_patch ? 'email' THEN excluded.email
      ELSE billing_accounts.email END,
    admin_override_plan_id=CASE WHEN p_patch ? 'admin_override_plan_id'
      THEN excluded.admin_override_plan_id
      ELSE billing_accounts.admin_override_plan_id END,
    admin_override_note=CASE WHEN p_patch ? 'admin_override_note'
      THEN excluded.admin_override_note
      ELSE billing_accounts.admin_override_note END,
    admin_override_expires_at=CASE WHEN p_patch ? 'admin_override_expires_at'
      THEN excluded.admin_override_expires_at
      ELSE billing_accounts.admin_override_expires_at END,
    stripe_customer_id=CASE WHEN p_patch ? 'stripe_customer_id'
      THEN excluded.stripe_customer_id
      ELSE billing_accounts.stripe_customer_id END,
    stripe_subscription_id=CASE WHEN p_patch ? 'stripe_subscription_id'
      THEN excluded.stripe_subscription_id
      ELSE billing_accounts.stripe_subscription_id END,
    stripe_price_id=CASE WHEN p_patch ? 'stripe_price_id'
      THEN excluded.stripe_price_id ELSE billing_accounts.stripe_price_id END,
    stripe_plan_id=CASE WHEN p_patch ? 'stripe_plan_id'
      THEN excluded.stripe_plan_id ELSE billing_accounts.stripe_plan_id END,
    stripe_subscription_status=CASE WHEN p_patch ? 'stripe_subscription_status'
      THEN excluded.stripe_subscription_status
      ELSE billing_accounts.stripe_subscription_status END,
    stripe_current_period_start=CASE WHEN p_patch ? 'stripe_current_period_start'
      THEN excluded.stripe_current_period_start
      ELSE billing_accounts.stripe_current_period_start END,
    stripe_current_period_end=CASE WHEN p_patch ? 'stripe_current_period_end'
      THEN excluded.stripe_current_period_end
      ELSE billing_accounts.stripe_current_period_end END,
    stripe_cancel_at_period_end=CASE WHEN p_patch ? 'stripe_cancel_at_period_end'
      THEN excluded.stripe_cancel_at_period_end
      ELSE billing_accounts.stripe_cancel_at_period_end END,
    stripe_checkout_session_id=CASE WHEN p_patch ? 'stripe_checkout_session_id'
      THEN excluded.stripe_checkout_session_id
      ELSE billing_accounts.stripe_checkout_session_id END,
    updated_at=pg_catalog.now()
  RETURNING * INTO saved;
  RETURN pg_catalog.to_jsonb(saved);
END;
$$;
REVOKE ALL ON FUNCTION public.upsert_billing_account_patch(uuid,jsonb)
  FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.upsert_billing_account_patch(uuid,jsonb)
  TO service_role;
COMMIT;
