\set ON_ERROR_STOP on
BEGIN;
DO $$ BEGIN
  IF current_database() NOT LIKE 'minddy_min591_%' THEN
    RAISE EXCEPTION 'Use an isolated minddy_min591_* database';
  END IF;
END $$;
DO $test$
DECLARE instance uuid := gen_random_uuid(); delivery uuid := gen_random_uuid();
  clear_payload text := '{"issue":{"body":"Private issue content"}}';
  clear_error text := 'Private repository failure';
  cipher text := 'mdyd3:1:eyJmb3JtYXQiOjMsImtleVZlcnNpb24iOjF9';
  rejected boolean;
BEGIN
  INSERT INTO public.forge_relay_instances(id,name,public_key)
    VALUES(instance,'encryption test','test-public-key');
  INSERT INTO public.forge_relay_deliveries(id,instance_id,provider,
    delivery_guid,payload,last_error)
    VALUES(delivery,instance,'github','delivery-1',clear_payload,clear_error);
  IF NOT public.migrate_forge_relay_delivery_content(delivery,clear_payload,
      clear_error,cipher,cipher) OR
      public.migrate_forge_relay_delivery_content(delivery,clear_payload,
      clear_error,cipher,cipher) THEN
    RAISE EXCEPTION 'Relay delivery CAS failed';
  END IF;
  IF EXISTS (SELECT 1 FROM public.forge_relay_deliveries WHERE id=delivery AND
    (payload LIKE '%Private issue%' OR last_error LIKE '%Private repository%')) THEN
    RAISE EXCEPTION 'Relay delivery source remains clear';
  END IF;
  rejected := false;
  BEGIN
    INSERT INTO public.forge_relay_deliveries(instance_id,provider,
      delivery_guid,payload) VALUES(instance,'github','delivery-2',clear_payload);
  EXCEPTION WHEN check_violation THEN rejected := true; END;
  IF NOT rejected THEN RAISE EXCEPTION 'Obsolete relay delivery insert accepted'; END IF;
  rejected := false;
  BEGIN
    UPDATE public.forge_relay_deliveries SET last_error=clear_error
      WHERE id=delivery;
  EXCEPTION WHEN check_violation THEN rejected := true; END;
  IF NOT rejected THEN RAISE EXCEPTION 'Obsolete relay diagnostic writer accepted'; END IF;
  INSERT INTO public.forge_relay_deliveries(instance_id,provider,
    delivery_guid,payload) VALUES(instance,'github','delivery-2',cipher);
  INSERT INTO public.forge_relay_deliveries(instance_id,provider,
    delivery_guid,payload) VALUES(instance,'github','delivery-2',cipher)
    ON CONFLICT (instance_id,provider,delivery_guid) DO NOTHING;
  IF (SELECT count(*) FROM public.forge_relay_deliveries WHERE instance_id=instance)
      <> 2 THEN RAISE EXCEPTION 'Relay delivery idempotence failed'; END IF;
  IF has_function_privilege('authenticated',
      'public.migrate_forge_relay_delivery_content(uuid,text,text,text,text)',
      'EXECUTE') THEN
    RAISE EXCEPTION 'Relay delivery migration has client privilege';
  END IF;
END;
$test$;
ROLLBACK;
