-- Run only on an isolated database after the OAuth code content migration.
BEGIN;
DO $$
DECLARE actor uuid:=gen_random_uuid(); actor_key uuid:=gen_random_uuid();
  grant_id uuid:=gen_random_uuid(); client text:='oauth-code-client-test';
  code text:=repeat('a',64);
  cipher text:='{"format":3,"keyVersion":2,"salt":"YWJj","iv":"YWJj","tag":"YWJj","data":"YWJj"}';
BEGIN
  INSERT INTO auth.users(id) VALUES(actor);
  INSERT INTO public.oauth_clients(client_id,client_name,redirect_uris)
    VALUES(client,'Test client',ARRAY['https://private.example/callback']);
  INSERT INTO public.api_keys(id,user_id,name,key_hash,key_prefix)
    VALUES(actor_key,actor,'Test actor',repeat('b',64),'oauth');
  INSERT INTO public.oauth_grants(id,user_id,client_id,api_key_id)
    VALUES(grant_id,actor,client,actor_key);
  INSERT INTO public.oauth_authorization_codes(code_hash,client_id,user_id,
    grant_id,redirect_uri,resource,code_challenge,expires_at)
    VALUES(code,client,actor,grant_id,'https://private.example/callback',
      'https://private.example/resource',repeat('c',43),now()+interval '10 minutes');
  IF public.activate_oauth_code_content() THEN
    RAISE EXCEPTION 'OAuth code activation accepted plaintext';
  END IF;
  UPDATE public.oauth_authorization_codes SET redirect_uri=NULL,resource=NULL,
    encrypted_content=cipher,encryption_version=2 WHERE code_hash=code;
  IF EXISTS(SELECT 1 FROM public.oauth_authorization_codes WHERE code_hash=code
      AND (redirect_uri IS NOT NULL OR resource IS NOT NULL OR
        content_revision<>1 OR encryption_checked_at IS NULL)) THEN
    RAISE EXCEPTION 'OAuth code source retained clear content';
  END IF;
  IF NOT public.activate_oauth_code_content() THEN
    RAISE EXCEPTION 'OAuth code activation refused sealed rows';
  END IF;
  BEGIN
    INSERT INTO public.oauth_authorization_codes(code_hash,client_id,user_id,
      grant_id,redirect_uri,code_challenge,expires_at)
      VALUES(repeat('d',64),client,actor,grant_id,
        'https://private.example/callback',repeat('c',43),now()+interval '10 minutes');
    RAISE EXCEPTION 'obsolete OAuth code insert accepted';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
  BEGIN
    UPDATE public.oauth_authorization_codes SET redirect_uri='https://clear.example'
      WHERE code_hash=code;
    RAISE EXCEPTION 'obsolete OAuth code update accepted';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
  BEGIN
    UPDATE public.oauth_authorization_codes SET user_id=gen_random_uuid()
      WHERE code_hash=code;
    RAISE EXCEPTION 'OAuth code scope move accepted';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
  UPDATE public.oauth_authorization_codes SET used_at=now() WHERE code_hash=code;
  IF (SELECT content_revision FROM public.oauth_authorization_codes
      WHERE code_hash=code)<>1 THEN
    RAISE EXCEPTION 'claim changed protected content revision';
  END IF;
END;
$$;
ROLLBACK;
