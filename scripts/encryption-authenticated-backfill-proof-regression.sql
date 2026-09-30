\set ON_ERROR_STOP on
BEGIN;
DO $$ BEGIN
  IF current_database() NOT LIKE 'minddy_min591_%' THEN
    RAISE EXCEPTION 'Use an isolated minddy_min591_* database';
  END IF;
  IF has_function_privilege('authenticated',
      'public.confirm_encrypted_content(text,text,bigint,text,text)',
      'EXECUTE') THEN
    RAISE EXCEPTION 'Authenticated users can assert ciphertext proofs';
  END IF;
END $$;
DO $test$
DECLARE actor uuid:=gen_random_uuid(); key_id uuid:=gen_random_uuid();
  grant_id uuid:=gen_random_uuid(); v_code_hash text:=repeat('c',64);
  client_key text:='client-'||gen_random_uuid()::text;
  healthy_id text:='healthy-'||gen_random_uuid()::text;
  minimal text:='{"format":3,"keyVersion":1}';
  rejected boolean;
BEGIN
  INSERT INTO auth.users(id) VALUES(actor);
  INSERT INTO public.oauth_clients(client_id,client_name,redirect_uris,
    encrypted_content,encryption_version,encryption_checked_at)
    VALUES(client_key,NULL,NULL,minimal,1,clock_timestamp());
  INSERT INTO public.oauth_clients(client_id,client_name,redirect_uris)
    VALUES(healthy_id,'Healthy',ARRAY['https://example.test/callback']);
  IF (SELECT encryption_checked_at IS NOT NULL FROM public.oauth_clients
      WHERE oauth_clients.client_id=client_key) OR
      public.activate_oauth_client_content() THEN
    RAISE EXCEPTION 'OAuth client shape acquired a false proof';
  END IF;
  rejected:=false;
  BEGIN
    UPDATE public.oauth_clients SET encryption_checked_at=clock_timestamp()
      WHERE oauth_clients.client_id=client_key;
  EXCEPTION WHEN check_violation THEN rejected:=true; END;
  IF NOT rejected THEN RAISE EXCEPTION 'Direct OAuth proof write accepted'; END IF;
  IF (SELECT public.confirm_encrypted_content('oauth_client',client_key,99,
      minimal)) THEN RAISE EXCEPTION 'Stale OAuth proof CAS accepted'; END IF;
  UPDATE public.oauth_clients SET
    encrypted_content='{"format":3,"keyVersion":1,"extra":1}',
    encryption_checked_at=clock_timestamp()
    WHERE oauth_clients.client_id=client_key;
  IF (SELECT encryption_checked_at IS NOT NULL FROM public.oauth_clients
      WHERE oauth_clients.client_id=client_key) THEN
    RAISE EXCEPTION 'Content rewrite retained false OAuth proof';
  END IF;
  IF (SELECT client_id FROM public.oauth_clients
      WHERE oauth_clients.client_id IN (client_key,healthy_id)
      ORDER BY encryption_attempted_at NULLS FIRST,oauth_clients.client_id
      LIMIT 1)<>client_key THEN
    RAISE EXCEPTION 'Unexpected OAuth queue head';
  END IF;
  UPDATE public.oauth_clients SET encryption_attempted_at=clock_timestamp()
    WHERE oauth_clients.client_id=client_key AND content_revision=99;
  IF (SELECT client_id FROM public.oauth_clients
      WHERE oauth_clients.client_id IN (client_key,healthy_id)
      ORDER BY encryption_attempted_at NULLS FIRST,oauth_clients.client_id
      LIMIT 1)<>client_key THEN
    RAISE EXCEPTION 'Stale CAS unexpectedly advanced OAuth attempt';
  END IF;
  UPDATE public.oauth_clients SET encryption_attempted_at=clock_timestamp()
    WHERE oauth_clients.client_id=client_key;
  IF (SELECT client_id FROM public.oauth_clients
      WHERE oauth_clients.client_id IN (client_key,healthy_id)
      ORDER BY encryption_attempted_at NULLS FIRST,oauth_clients.client_id
      LIMIT 1)<>healthy_id THEN
    RAISE EXCEPTION 'CAS conflict still starved healthy OAuth row';
  END IF;
  INSERT INTO public.api_keys(id,user_id,name,agent,key_hash,key_prefix,
    encrypted_content,encryption_version,encryption_checked_at)
    VALUES(key_id,actor,NULL,NULL,repeat('a',64),'proof',minimal,1,
      clock_timestamp());
  IF (SELECT encryption_checked_at IS NOT NULL FROM public.api_keys
      WHERE id=key_id) OR public.activate_api_key_content() THEN
    RAISE EXCEPTION 'API-key shape acquired a false proof';
  END IF;
  INSERT INTO public.oauth_grants(id,user_id,client_id,api_key_id)
    VALUES(grant_id,actor,client_key,key_id);
  INSERT INTO public.oauth_authorization_codes(code_hash,client_id,user_id,
    grant_id,redirect_uri,resource,code_challenge,expires_at,
    encrypted_content,encryption_version,encryption_checked_at)
    VALUES(v_code_hash,client_key,actor,grant_id,NULL,NULL,repeat('x',43),
      now()+interval '10 minutes',minimal,1,clock_timestamp());
  IF (SELECT encryption_checked_at IS NOT NULL FROM
      public.oauth_authorization_codes WHERE oauth_authorization_codes.code_hash=v_code_hash) OR
      public.activate_oauth_code_content() THEN
    RAISE EXCEPTION 'OAuth code shape acquired a false proof';
  END IF;
END;
$test$;
ROLLBACK;
