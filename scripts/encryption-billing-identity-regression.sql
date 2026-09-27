\set ON_ERROR_STOP on
BEGIN;
DO $$ BEGIN
  IF current_database() NOT LIKE 'minddy_min591_%' THEN
    RAISE EXCEPTION 'Use an isolated minddy_min591_* database';
  END IF;
END $$;
DO $test$
DECLARE owner uuid:=gen_random_uuid(); other_user uuid:=gen_random_uuid();
  third_user uuid:=gen_random_uuid();
  email_cipher text:='mdye3:{"format":3,"keyVersion":2,"data":"email"}';
  note_cipher text:='mdye3:{"format":3,"keyVersion":2,"data":"note"}';
  rejected boolean; applied jsonb;
BEGIN
  INSERT INTO auth.users(id) VALUES(owner),(other_user),(third_user);
  INSERT INTO public.billing_accounts(user_id,email,admin_override_note)
    VALUES(owner,'private@example.test','Private admin rationale');
  IF public.activate_billing_identity() THEN
    RAISE EXCEPTION 'Legacy billing identity activated';
  END IF;
  UPDATE public.billing_accounts SET email=email_cipher,
    admin_override_note=note_cipher WHERE user_id=owner;
  UPDATE public.billing_accounts SET admin_override_note=NULL WHERE user_id=owner;
  IF NOT (SELECT admin_override_note_protected FROM public.billing_accounts
      WHERE user_id=owner) THEN
    RAISE EXCEPTION 'Clearing note lost its protection state';
  END IF;
  rejected:=false;
  BEGIN
    UPDATE public.billing_accounts SET admin_override_note_protected=false
      WHERE user_id=owner;
  EXCEPTION WHEN check_violation THEN rejected:=true; END;
  IF NOT rejected THEN RAISE EXCEPTION 'Billing marker was reset'; END IF;
  rejected:=false;
  BEGIN
    PERFORM public.upsert_billing_account_patch(owner,
      '{"admin_override_note":"clear replacement"}'::jsonb);
  EXCEPTION WHEN check_violation THEN rejected:=true; END;
  IF NOT rejected THEN
    RAISE EXCEPTION 'Paused patch accepted clear note replacement';
  END IF;
  INSERT INTO public.billing_accounts(user_id,email)
    VALUES(other_user,'mixed@example.test');
  IF (SELECT email_protected FROM public.billing_accounts
      WHERE user_id=other_user) THEN
    RAISE EXCEPTION 'Legacy tenant was marked protected';
  END IF;
  UPDATE public.billing_accounts SET email=email_cipher
    WHERE user_id=other_user;
  UPDATE public.billing_accounts SET admin_override_note=note_cipher
    WHERE user_id=owner;
  UPDATE public.billing_accounts SET email=NULL WHERE user_id=owner;
  rejected:=false;
  BEGIN
    UPDATE public.billing_accounts SET email='clear@example.test'
      WHERE user_id=owner;
  EXCEPTION WHEN check_violation THEN rejected:=true; END;
  IF NOT rejected THEN
    RAISE EXCEPTION 'Paused writer accepted clear email replacement';
  END IF;
  UPDATE public.billing_accounts SET email=email_cipher WHERE user_id=owner;
  IF EXISTS(SELECT 1 FROM public.billing_accounts WHERE user_id=owner
      AND (email LIKE '%private@example.test%' OR
        admin_override_note LIKE '%Private admin%' OR
        email_encryption_checked_at IS NOT NULL OR
        admin_override_note_encryption_checked_at IS NOT NULL)) THEN
    RAISE EXCEPTION 'Billing source retained clear identity';
  END IF;
  IF public.activate_billing_identity() THEN
    RAISE EXCEPTION 'Shape-only content acquired an authentication proof';
  END IF;
  -- Activate a synthetic scope only to test the legacy-writer SQL fence.
  INSERT INTO public.billing_identity_scope(id) VALUES(true);
  rejected:=false;
  BEGIN
    INSERT INTO public.billing_accounts(user_id,email)
      VALUES(third_user,'old@example.test');
  EXCEPTION WHEN check_violation THEN rejected:=true; END;
  IF NOT rejected THEN RAISE EXCEPTION 'Old billing insert accepted'; END IF;
  rejected:=false;
  BEGIN
    UPDATE public.billing_accounts SET admin_override_note='old note'
      WHERE user_id=owner;
  EXCEPTION WHEN check_violation THEN rejected:=true; END;
  IF NOT rejected THEN RAISE EXCEPTION 'Old billing update accepted'; END IF;
  applied:=public.apply_stripe_billing_event(owner,'evt_test',now(),
    '{"stripe_customer_id":"cus_test"}'::jsonb);
  IF applied->>'email'<>email_cipher OR
      applied->>'admin_override_note'<>note_cipher OR
      applied->>'stripe_customer_id'<>'cus_test' THEN
    RAISE EXCEPTION 'Stripe RPC damaged protected identity';
  END IF;
  applied:=public.upsert_billing_account_patch(owner,
    '{"stripe_checkout_session_id":"cs_test"}'::jsonb);
  IF applied->>'email'<>email_cipher OR
      applied->>'admin_override_note'<>note_cipher OR
      applied->>'stripe_customer_id'<>'cus_test' OR
      applied->>'stripe_checkout_session_id'<>'cs_test' THEN
    RAISE EXCEPTION 'Partial billing patch damaged protected identity';
  END IF;
  rejected:=false;
  BEGIN
    PERFORM public.upsert_billing_account_patch(owner,
      '{"email":"old@example.test"}'::jsonb);
  EXCEPTION WHEN check_violation THEN rejected:=true; END;
  IF NOT rejected THEN RAISE EXCEPTION 'Patch RPC accepted clear email'; END IF;
  IF has_function_privilege('authenticated',
      'public.activate_billing_identity()','EXECUTE') THEN
    RAISE EXCEPTION 'Client can activate billing identity';
  END IF;
  IF has_function_privilege('authenticated',
      'public.upsert_billing_account_patch(uuid,jsonb)','EXECUTE') THEN
    RAISE EXCEPTION 'Client can patch billing identity';
  END IF;
END;
$test$;
ROLLBACK;
