\set ON_ERROR_STOP on
BEGIN;
DO $$ BEGIN
  IF current_database() NOT LIKE 'minddy_min591_%' THEN
    RAISE EXCEPTION 'Use an isolated minddy_min591_* database';
  END IF;
END $$;
DO $test$
DECLARE instance uuid:=gen_random_uuid(); rejected boolean;
BEGIN
  INSERT INTO public.forge_relay_provisioning(id,relay_url,instance_id,
    signing_key_encrypted,webhook_secret_encrypted)
  VALUES(true,'https://private-relay.example',instance,
    'legacy-private-key','legacy-webhook-secret');
  IF public.activate_forge_relay_provisioning_content() THEN
    RAISE EXCEPTION 'Legacy provisioning row activated';
  END IF;
  UPDATE public.forge_relay_provisioning SET relay_url=NULL,
    signing_key_encrypted=NULL,webhook_secret_encrypted=NULL,
    encrypted_content='{"format":3,"keyVersion":2,"data":"opaque"}',
    encryption_version=2 WHERE id=true;
  IF EXISTS(SELECT 1 FROM public.forge_relay_provisioning WHERE id=true AND
      (relay_url IS NOT NULL OR signing_key_encrypted IS NOT NULL OR
       webhook_secret_encrypted IS NOT NULL OR encryption_checked_at IS NULL)) THEN
    RAISE EXCEPTION 'Provisioning source retained plaintext';
  END IF;
  IF NOT public.activate_forge_relay_provisioning_content() THEN
    RAISE EXCEPTION 'Sealed provisioning row refused activation';
  END IF;
  rejected:=false;
  BEGIN
    UPDATE public.forge_relay_provisioning SET
      relay_url='https://old-writer.example',
      signing_key_encrypted='legacy-key',
      webhook_secret_encrypted='legacy-secret',
      encrypted_content=NULL,encryption_version=0 WHERE id=true;
  EXCEPTION WHEN check_violation THEN rejected:=true; END;
  IF NOT rejected THEN RAISE EXCEPTION 'Old provisioning writer accepted'; END IF;
  rejected:=false;
  BEGIN
    INSERT INTO public.forge_relay_provisioning(id,relay_url,instance_id,
      signing_key_encrypted,webhook_secret_encrypted)
    VALUES(true,'https://old-writer.example',instance,'key','secret')
    ON CONFLICT(id) DO UPDATE SET relay_url=EXCLUDED.relay_url,
      signing_key_encrypted=EXCLUDED.signing_key_encrypted,
      webhook_secret_encrypted=EXCLUDED.webhook_secret_encrypted,
      encrypted_content=NULL,encryption_version=0;
  EXCEPTION WHEN check_violation THEN rejected:=true; END;
  IF NOT rejected THEN RAISE EXCEPTION 'Old provisioning upsert accepted'; END IF;
  UPDATE public.forge_relay_provisioning SET registered_at=now() WHERE id=true;
  IF NOT EXISTS(SELECT 1 FROM public.forge_relay_provisioning WHERE id=true
      AND encryption_version=2 AND content_revision=1) THEN
    RAISE EXCEPTION 'Metadata update changed provisioning content';
  END IF;
  IF has_function_privilege('authenticated',
      'public.activate_forge_relay_provisioning_content()','EXECUTE') THEN
    RAISE EXCEPTION 'Client can activate relay provisioning';
  END IF;
END;
$test$;
ROLLBACK;
