\set ON_ERROR_STOP on
BEGIN;
DO $$ BEGIN
  IF current_database() NOT LIKE 'minddy_min591_%' THEN
    RAISE EXCEPTION 'Use an isolated minddy_min591_* database';
  END IF;
END $$;
DO $test$
DECLARE owner uuid:=gen_random_uuid(); connection uuid:=gen_random_uuid();
  identity uuid:=gen_random_uuid(); claim uuid:=gen_random_uuid();
  connection_cipher text:='{"format":3,"keyVersion":2,"data":"sealed-connection"}';
  identity_cipher text:='{"format":3,"keyVersion":1,"data":"sealed-identity"}';
  rejected boolean;
BEGIN
  INSERT INTO auth.users(id) VALUES(owner);
  INSERT INTO public.git_connections(id,user_id,provider,
    provider_account_id,access_token_encrypted,refresh_token_encrypted)
    VALUES(connection,owner,'gitlab','42','legacy-access','legacy-refresh');
  INSERT INTO public.git_user_identities(id,user_id,provider,
    provider_account_id,access_token_encrypted,refresh_token_encrypted)
    VALUES(identity,owner,'github','7','legacy-access','legacy-refresh');
  IF public.activate_forge_oauth_tokens() THEN
    RAISE EXCEPTION 'Legacy forge OAuth credentials activated';
  END IF;
  UPDATE public.git_connections SET access_token_encrypted=NULL,
    refresh_token_encrypted=NULL,encrypted_content=connection_cipher,
    encryption_version=2 WHERE id=connection;
  UPDATE public.git_user_identities SET access_token_encrypted=NULL,
    refresh_token_encrypted=NULL,encrypted_content=identity_cipher,
    encryption_version=1 WHERE id=identity;
  IF EXISTS(SELECT 1 FROM public.git_connections WHERE id=connection AND
      (access_token_encrypted IS NOT NULL OR
       refresh_token_encrypted IS NOT NULL OR encryption_checked_at IS NULL)) OR
     EXISTS(SELECT 1 FROM public.git_user_identities WHERE id=identity AND
      (access_token_encrypted IS NOT NULL OR
       refresh_token_encrypted IS NOT NULL OR encryption_checked_at IS NULL))
  THEN RAISE EXCEPTION 'Forge OAuth source retained legacy token copies'; END IF;
  IF NOT public.activate_forge_oauth_tokens() THEN
    RAISE EXCEPTION 'Sealed forge OAuth credentials refused activation';
  END IF;
  rejected:=false;
  BEGIN
    PERFORM public.upsert_gitlab_connection_atomic(owner,'42','login',
      'local','old-access','old-refresh',now(),NULL);
  EXCEPTION WHEN check_violation THEN rejected:=true; END;
  IF NOT rejected THEN RAISE EXCEPTION 'Old GitLab RPC accepted'; END IF;
  rejected:=false;
  BEGIN
    UPDATE public.git_user_identities SET access_token_encrypted='old',
      refresh_token_encrypted='old',encrypted_content=NULL,
      encryption_version=0 WHERE id=identity;
  EXCEPTION WHEN check_violation THEN rejected:=true; END;
  IF NOT rejected THEN RAISE EXCEPTION 'Old identity writer accepted'; END IF;
  rejected:=false;
  BEGIN
    UPDATE public.git_connections SET provider_account_id='different'
      WHERE id=connection;
  EXCEPTION WHEN check_violation THEN rejected:=true; END;
  IF NOT rejected THEN RAISE EXCEPTION 'Connection scope move accepted'; END IF;
  IF NOT public.claim_forge_oauth_refresh('connection',connection,NULL,
      connection_cipher,claim) THEN
    RAISE EXCEPTION 'Protected refresh claim failed';
  END IF;
  IF public.claim_forge_oauth_refresh('connection',connection,NULL,
      'wrong-cipher',gen_random_uuid()) THEN
    RAISE EXCEPTION 'Mismatched refresh claim succeeded';
  END IF;
  UPDATE public.git_connections SET oauth_refresh_claim=NULL,
    oauth_refresh_claimed_at=NULL WHERE id=connection;
  IF public.upsert_gitlab_connection_protected_atomic(owner,'42','login',
      'local',NULL,NULL,connection_cipher,2,NULL,NULL)<>connection THEN
    RAISE EXCEPTION 'Protected GitLab upsert changed connection identity';
  END IF;
  UPDATE public.git_user_identities SET account_login='renamed'
    WHERE id=identity;
  IF NOT EXISTS(SELECT 1 FROM public.git_user_identities WHERE id=identity
      AND account_login='renamed' AND encrypted_content=identity_cipher) THEN
    RAISE EXCEPTION 'Metadata update changed protected identity';
  END IF;
  IF has_function_privilege('authenticated',
      'public.activate_forge_oauth_tokens()','EXECUTE') THEN
    RAISE EXCEPTION 'Client can activate forge OAuth credentials';
  END IF;
END;
$test$;
ROLLBACK;
