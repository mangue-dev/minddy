-- Run only on an isolated database after the OAuth client content migration.
BEGIN;
DO $$
DECLARE plain_id text:='oauth-legacy-test'; sealed_id text:='oauth-sealed-test';
  cipher text:='{"format":3,"keyVersion":2,"salt":"YWJj","iv":"YWJj","tag":"YWJj","data":"YWJj"}';
  old_revision bigint;
BEGIN
  INSERT INTO public.oauth_clients(client_id,client_name,redirect_uris)
    VALUES(plain_id,'private client',ARRAY['https://private.example/callback']);
  IF public.activate_oauth_client_content() THEN
    RAISE EXCEPTION 'OAuth client activation accepted plaintext';
  END IF;
  SELECT content_revision INTO old_revision FROM public.oauth_clients
    WHERE client_id=plain_id;
  IF old_revision<>0 THEN RAISE EXCEPTION 'unexpected legacy revision'; END IF;
  UPDATE public.oauth_clients SET client_name=NULL,redirect_uris=NULL,
    encrypted_content=cipher,encryption_version=2 WHERE client_id=plain_id;
  IF EXISTS(SELECT 1 FROM public.oauth_clients WHERE client_id=plain_id AND
      (client_name IS NOT NULL OR redirect_uris IS NOT NULL OR
       encryption_version<>2 OR content_revision<>1)) THEN
    RAISE EXCEPTION 'client source retained clear content';
  END IF;
  INSERT INTO public.oauth_clients(client_id,client_name,redirect_uris,
    encrypted_content,encryption_version)
    VALUES(sealed_id,NULL,NULL,cipher,2);
  IF public.activate_oauth_client_content() THEN
    RAISE EXCEPTION 'Shape-only content acquired an authentication proof';
  END IF;
  -- Activate a synthetic scope only to test the legacy-writer SQL fence.
  INSERT INTO public.oauth_client_content_scope(id) VALUES(true);
  BEGIN
    INSERT INTO public.oauth_clients(client_id,client_name,redirect_uris)
      VALUES('oauth-old-writer','old writer',ARRAY['https://private.example']);
    RAISE EXCEPTION 'obsolete client insert accepted';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
  BEGIN
    UPDATE public.oauth_clients SET client_name='clear' WHERE client_id=sealed_id;
    RAISE EXCEPTION 'obsolete client update accepted';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
  BEGIN
    UPDATE public.oauth_clients SET encryption_version=1
      WHERE client_id=sealed_id;
    RAISE EXCEPTION 'key downgrade accepted';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
  UPDATE public.oauth_clients SET last_used_at=now() WHERE client_id=sealed_id;
  IF (SELECT content_revision FROM public.oauth_clients
      WHERE client_id=sealed_id)<>0 THEN
    RAISE EXCEPTION 'metadata update changed content revision';
  END IF;
  IF EXISTS(SELECT 1 FROM public.oauth_clients WHERE client_id=plain_id
      AND content_revision=old_revision) THEN
    RAISE EXCEPTION 'stale CAS matched';
  END IF;
END;
$$;
ROLLBACK;
