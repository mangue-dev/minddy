\set ON_ERROR_STOP on
BEGIN;
DO $$ BEGIN
  IF current_database() NOT LIKE 'minddy_min591_%' THEN
    RAISE EXCEPTION 'Use an isolated minddy_min591_* database';
  END IF;
END $$;
DO $test$
DECLARE instance uuid := gen_random_uuid(); entry bigint;
  old_detail jsonb := '{"webhookUrl":"https://private.example/issue"}'::jsonb;
  rejected boolean;
BEGIN
  INSERT INTO public.forge_relay_instances(id,name,public_key)
    VALUES(instance,'audit test','test-public-key');
  -- A historical row may be loaded by a restore before the new guard exists.
  ALTER TABLE public.forge_relay_audit DISABLE TRIGGER forge_relay_audit_detail_guard;
  INSERT INTO public.forge_relay_audit(instance_id,action,detail)
    VALUES(instance,'webhook_secret_registered',old_detail) RETURNING id INTO entry;
  ALTER TABLE public.forge_relay_audit ENABLE TRIGGER forge_relay_audit_detail_guard;
  IF NOT public.scrub_forge_relay_audit_detail(entry,old_detail) OR
      public.scrub_forge_relay_audit_detail(entry,old_detail) THEN
    RAISE EXCEPTION 'Audit scrub CAS failed';
  END IF;
  IF EXISTS (SELECT 1 FROM public.forge_relay_audit WHERE id=entry AND
      detail::text LIKE '%private.example%') THEN
    RAISE EXCEPTION 'Audit detail remains clear';
  END IF;
  rejected := false;
  BEGIN
    INSERT INTO public.forge_relay_audit(instance_id,action,detail)
      VALUES(instance,'webhook_secret_registered',old_detail);
  EXCEPTION WHEN check_violation THEN rejected := true; END;
  IF NOT rejected THEN RAISE EXCEPTION 'Obsolete audit writer accepted'; END IF;
  INSERT INTO public.forge_relay_audit(instance_id,action,detail)
    VALUES(instance,'webhook_secret_registered','{}'::jsonb);
  INSERT INTO public.forge_relay_audit(instance_id,action,detail)
    VALUES(instance,'mint_installation_token','{"state":"reserved"}'::jsonb);
  IF has_function_privilege('authenticated',
      'public.scrub_forge_relay_audit_detail(bigint,jsonb)','EXECUTE') THEN
    RAISE EXCEPTION 'Audit scrub has client privilege';
  END IF;
END;
$test$;
ROLLBACK;
