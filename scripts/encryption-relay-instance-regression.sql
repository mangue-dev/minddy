\set ON_ERROR_STOP on
BEGIN;
DO $$ BEGIN
  IF current_database() NOT LIKE 'minddy_min591_%' THEN
    RAISE EXCEPTION 'Use an isolated minddy_min591_* database';
  END IF;
END $$;
DO $test$
DECLARE instance uuid:=gen_random_uuid(); new_instance uuid:=gen_random_uuid();
  cipher text:='{"format":3,"keyVersion":1,"data":"opaque"}';
  revision bigint; rejected boolean;
BEGIN
  INSERT INTO public.forge_relay_instances(id,name,public_key,webhook_url,
    webhook_secret_encrypted) VALUES(instance,'private instance','legacy-key',
    'https://private.example/webhook','{"iv":"legacy"}');
  IF public.activate_forge_relay_instance_content() THEN
    RAISE EXCEPTION 'Legacy relay instance activated';
  END IF;
  SELECT content_revision INTO revision FROM public.forge_relay_instances
    WHERE id=instance;
  UPDATE public.forge_relay_instances SET name=NULL,webhook_url=NULL,
    webhook_secret_encrypted=NULL,encrypted_content=cipher,
    encryption_version=1,encryption_attempted_at=now()
    WHERE id=instance AND content_revision=revision;
  IF NOT public.activate_forge_relay_instance_content() THEN
    RAISE EXCEPTION 'Verified relay instance refused activation';
  END IF;
  INSERT INTO public.forge_relay_instances(id,name,public_key,
    encrypted_content,encryption_version)
    VALUES(new_instance,NULL,'new-key',cipher,1);
  IF EXISTS(SELECT 1 FROM public.forge_relay_instances WHERE
      id IN (instance,new_instance) AND
      (name IS NOT NULL OR webhook_url IS NOT NULL OR
       webhook_secret_encrypted IS NOT NULL OR encrypted_content IS NULL)) THEN
    RAISE EXCEPTION 'Relay instance retained clear source or copy';
  END IF;
  rejected:=false;
  BEGIN
    UPDATE public.forge_relay_instances SET webhook_url='https://old.example'
      WHERE id=instance;
  EXCEPTION WHEN check_violation THEN rejected:=true; END;
  IF NOT rejected THEN RAISE EXCEPTION 'Old relay writer accepted'; END IF;
  rejected:=false;
  BEGIN
    INSERT INTO public.forge_relay_instances(name,public_key)
      VALUES('old plaintext','old-key');
  EXCEPTION WHEN check_violation THEN rejected:=true; END;
  IF NOT rejected THEN RAISE EXCEPTION 'Old relay insert accepted'; END IF;
  UPDATE public.forge_relay_instances SET status='revoked' WHERE id=instance;
  IF NOT EXISTS(SELECT 1 FROM public.forge_relay_instances WHERE id=instance
      AND status='revoked' AND name IS NULL AND webhook_url IS NULL) THEN
    RAISE EXCEPTION 'Relay metadata update broke encrypted content';
  END IF;
  IF has_function_privilege('authenticated',
      'public.activate_forge_relay_instance_content()','EXECUTE') THEN
    RAISE EXCEPTION 'Client can activate relay content';
  END IF;
END;
$test$;
ROLLBACK;
