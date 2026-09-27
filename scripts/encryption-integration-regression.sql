\set ON_ERROR_STOP on
BEGIN;
DO $$ BEGIN
  IF current_database() NOT LIKE 'minddy_min591_%' THEN
    RAISE EXCEPTION 'Use an isolated minddy_min591_* database';
  END IF;
END $$;
DO $$
DECLARE actor uuid:=gen_random_uuid(); project uuid:=gen_random_uuid();
  integration uuid:=gen_random_uuid(); legacy_integration uuid:=gen_random_uuid();
  cipher text:='mdye3:{"format":3,"keyVersion":2,"salt":"YWJj","iv":"YWJj","tag":"YWJj","data":"YWJj"}';
  rejected boolean;
BEGIN
  INSERT INTO auth.users(id) VALUES(actor);
  INSERT INTO public.projects(id,owner_id,name,key)
    VALUES(project,actor,'Project','ITG');
  INSERT INTO public.integrations(id,project_id,name,key_hash,key_prefix,
    webhook_url,kind) VALUES(integration,project,'Private integration',
    md5(integration::text)||md5(project::text),'mdy',
    'https://private.example/hook','issues');
  IF public.activate_integration_content() THEN
    RAISE EXCEPTION 'Integration activation accepted plaintext';
  END IF;
  UPDATE public.integrations SET name=cipher,webhook_url=cipher
    WHERE id=integration;
  UPDATE public.integrations SET webhook_url=NULL WHERE id=integration;
  IF NOT (SELECT webhook_url_protected FROM public.integrations
      WHERE id=integration) THEN
    RAISE EXCEPTION 'Clearing webhook lost its protection state';
  END IF;
  rejected:=false;
  BEGIN
    UPDATE public.integrations SET webhook_url_protected=false
      WHERE id=integration;
  EXCEPTION WHEN check_violation THEN rejected:=true; END;
  IF NOT rejected THEN RAISE EXCEPTION 'Webhook marker was reset'; END IF;
  rejected:=false;
  BEGIN
    UPDATE public.integrations SET webhook_url='https://clear.example/hook'
      WHERE id=integration;
  EXCEPTION WHEN check_violation THEN rejected:=true; END;
  IF NOT rejected THEN
    RAISE EXCEPTION 'Paused writer restored clear webhook';
  END IF;
  INSERT INTO public.integrations(id,project_id,name,key_hash,key_prefix,
    webhook_url,kind) VALUES(legacy_integration,project,'Other legacy tenant',
    md5(legacy_integration::text)||md5(project::text),'mdy',
    'https://legacy.example/hook','issues');
  IF (SELECT webhook_url_protected FROM public.integrations
      WHERE id=legacy_integration) THEN
    RAISE EXCEPTION 'Legacy integration was marked protected';
  END IF;
  DELETE FROM public.integrations WHERE id=legacy_integration;
  UPDATE public.integrations SET webhook_url=cipher WHERE id=integration;
  IF EXISTS(SELECT 1 FROM public.integrations WHERE id=integration AND
      (name LIKE '%Private%' OR webhook_url LIKE '%private.example%' OR
        content_revision<>3 OR name_encryption_checked_at IS NULL OR
        webhook_encryption_checked_at IS NULL)) THEN
    RAISE EXCEPTION 'Integration source retained clear content';
  END IF;
  IF NOT public.activate_integration_content() THEN
    RAISE EXCEPTION 'Integration activation refused sealed rows';
  END IF;
  BEGIN
    INSERT INTO public.integrations(project_id,name,key_hash,key_prefix)
      VALUES(project,'Old writer',repeat('b',64),'mdy');
    RAISE EXCEPTION 'obsolete integration insert accepted';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
  BEGIN
    UPDATE public.integrations SET name='Clear again' WHERE id=integration;
    RAISE EXCEPTION 'obsolete integration update accepted';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
  BEGIN
    UPDATE public.integrations SET project_id=gen_random_uuid()
      WHERE id=integration;
    RAISE EXCEPTION 'integration scope move accepted';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
  UPDATE public.integrations SET webhook_last_status='ok'
    WHERE id=integration;
  IF (SELECT content_revision FROM public.integrations WHERE id=integration)<>3
    THEN RAISE EXCEPTION 'metadata update changed content revision'; END IF;
  UPDATE public.integrations SET webhook_url=NULL WHERE id=integration;
  IF (SELECT webhook_url FROM public.integrations WHERE id=integration)
      IS NOT NULL THEN RAISE EXCEPTION 'webhook disable failed'; END IF;
END;
$$;
ROLLBACK;
