\set ON_ERROR_STOP on
BEGIN;
DO $$ BEGIN
  IF current_database() NOT LIKE 'minddy_min591_%' THEN
    RAISE EXCEPTION 'Use an isolated minddy_min591_* database';
  END IF;
END $$;
DO $test$
DECLARE instance uuid:=gen_random_uuid(); delivery uuid:=gen_random_uuid();
  rejected boolean;
BEGIN
  INSERT INTO public.forge_relay_instances(id,name,public_key)
    VALUES(instance,'Fixture relay','public-key');
  INSERT INTO public.forge_relay_user_deliveries(id,instance_id,user_id,
    provider_account_id,access_token_encrypted,refresh_token_encrypted)
    VALUES(delivery,instance,'user','42','old-access','old-refresh');
  IF public.activate_forge_relay_user_deliveries() THEN
    RAISE EXCEPTION 'Legacy OAuth delivery activated';
  END IF;
  UPDATE public.forge_relay_user_deliveries SET
    access_token_encrypted=NULL,refresh_token_encrypted=NULL,
    encrypted_content='{"format":3,"keyVersion":2,"data":"opaque"}',
    encryption_version=2 WHERE id=delivery;
  IF EXISTS(SELECT 1 FROM public.forge_relay_user_deliveries WHERE
      id=delivery AND (access_token_encrypted IS NOT NULL OR
        refresh_token_encrypted IS NOT NULL OR encryption_checked_at IS NULL))
  THEN RAISE EXCEPTION 'OAuth delivery retained legacy token copies'; END IF;
  IF NOT public.activate_forge_relay_user_deliveries() THEN
    RAISE EXCEPTION 'Sealed OAuth delivery refused activation';
  END IF;
  rejected:=false;
  BEGIN
    INSERT INTO public.forge_relay_user_deliveries(instance_id,user_id,
      provider_account_id,access_token_encrypted)
      VALUES(instance,'user','43','old-access');
  EXCEPTION WHEN check_violation THEN rejected:=true; END;
  IF NOT rejected THEN RAISE EXCEPTION 'Old OAuth delivery insert accepted'; END IF;
  rejected:=false;
  BEGIN
    UPDATE public.forge_relay_user_deliveries SET
      access_token_encrypted='old-access', encrypted_content=NULL,
      encryption_version=0 WHERE id=delivery;
  EXCEPTION WHEN check_violation THEN rejected:=true; END;
  IF NOT rejected THEN RAISE EXCEPTION 'Old OAuth delivery update accepted'; END IF;
  rejected:=false;
  BEGIN
    UPDATE public.forge_relay_user_deliveries SET instance_id=gen_random_uuid()
      WHERE id=delivery;
  EXCEPTION WHEN check_violation THEN rejected:=true; END;
  IF NOT rejected THEN RAISE EXCEPTION 'Delivery scope move accepted'; END IF;
  UPDATE public.forge_relay_user_deliveries SET status='delivered'
    WHERE id=delivery;
  IF NOT EXISTS(SELECT 1 FROM public.forge_relay_user_deliveries WHERE
      id=delivery AND status='delivered' AND content_revision=1) THEN
    RAISE EXCEPTION 'Idempotent delivery status update changed token content';
  END IF;
  IF has_function_privilege('authenticated',
      'public.activate_forge_relay_user_deliveries()','EXECUTE') THEN
    RAISE EXCEPTION 'Client can activate relay OAuth deliveries';
  END IF;
END;
$test$;
ROLLBACK;
