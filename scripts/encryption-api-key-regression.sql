-- Run only on an isolated database after the API-key content migration.
BEGIN;
DO $$
DECLARE actor uuid:=gen_random_uuid(); key_id uuid:=gen_random_uuid();
  cipher text:='{"format":3,"keyVersion":2,"salt":"YWJj","iv":"YWJj","tag":"YWJj","data":"YWJj"}';
BEGIN
  INSERT INTO auth.users(id) VALUES(actor);
  INSERT INTO public.api_keys(id,user_id,name,agent,key_hash,key_prefix)
    VALUES(key_id,actor,'Private OAuth client','private-agent',
      repeat('a',64),'oauth');
  IF public.activate_api_key_content() THEN
    RAISE EXCEPTION 'API-key activation accepted plaintext';
  END IF;
  UPDATE public.api_keys SET name=NULL,agent=NULL,
    encrypted_content=cipher,encryption_version=2 WHERE id=key_id;
  IF EXISTS(SELECT 1 FROM public.api_keys WHERE id=key_id AND
      (name IS NOT NULL OR agent IS NOT NULL OR content_revision<>1 OR
        encryption_checked_at IS NOT NULL)) THEN
    RAISE EXCEPTION 'API-key source retained clear attribution';
  END IF;
  IF public.activate_api_key_content() THEN
    RAISE EXCEPTION 'Shape-only content acquired an authentication proof';
  END IF;
  -- Activate a synthetic scope only to test the legacy-writer SQL fence.
  INSERT INTO public.api_key_content_scope(id) VALUES(true);
  BEGIN
    INSERT INTO public.api_keys(user_id,name,key_hash,key_prefix)
      VALUES(actor,'Old writer',repeat('b',64),'oauth');
    RAISE EXCEPTION 'obsolete API-key insert accepted';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
  BEGIN
    UPDATE public.api_keys SET name='Clear again' WHERE id=key_id;
    RAISE EXCEPTION 'obsolete API-key update accepted';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
  BEGIN
    UPDATE public.api_keys SET user_id=gen_random_uuid() WHERE id=key_id;
    RAISE EXCEPTION 'API-key owner move accepted';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
  UPDATE public.api_keys SET revoked_at=now() WHERE id=key_id;
  IF (SELECT content_revision FROM public.api_keys WHERE id=key_id)<>1 THEN
    RAISE EXCEPTION 'metadata update changed content revision';
  END IF;
END;
$$;
ROLLBACK;
