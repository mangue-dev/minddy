\set ON_ERROR_STOP on
BEGIN;
DO $$ BEGIN
  IF current_database() NOT LIKE 'minddy_min591_%' THEN
    RAISE EXCEPTION 'Use an isolated minddy_min591_* database';
  END IF;
END $$;
DO $test$
DECLARE owner uuid:=gen_random_uuid(); connection uuid:=gen_random_uuid();
  nonce text:=encode(gen_random_bytes(32),'hex'); rejected boolean;
  endpoint text:='https://private-mcp.example/mcp';
  connection_cipher text:='{"format":3,"keyVersion":2,"data":"sealed-connection"}';
  attempt_cipher text:='{"format":3,"keyVersion":1,"data":"sealed-attempt"}';
BEGIN
  INSERT INTO auth.users(id) VALUES(owner);
  INSERT INTO public.user_mcp_connections(id,user_id,name,url,
    token_encrypted,oauth_encrypted) VALUES(connection,owner,
    'Private tools',endpoint,'old-token','old-oauth');
  INSERT INTO public.user_mcp_oauth_attempts(state,user_id,connection_id,
    endpoint,payload_encrypted) VALUES(nonce,owner,connection,endpoint,'old-payload');
  IF public.activate_mcp_content() THEN
    RAISE EXCEPTION 'Legacy MCP content activated';
  END IF;
  UPDATE public.user_mcp_connections SET name=NULL,url=NULL,
    token_encrypted=NULL,headers_encrypted=NULL,oauth_encrypted=NULL,
    encrypted_content=connection_cipher,encryption_version=2
    WHERE id=connection;
  UPDATE public.user_mcp_oauth_attempts SET endpoint=NULL,
    payload_encrypted=NULL,encrypted_content=attempt_cipher,
    encryption_version=1 WHERE state=nonce;
  IF EXISTS(SELECT 1 FROM public.user_mcp_connections WHERE id=connection
      AND (name IS NOT NULL OR url IS NOT NULL OR token_encrypted IS NOT NULL
        OR headers_encrypted IS NOT NULL OR oauth_encrypted IS NOT NULL
        OR encryption_checked_at IS NULL)) OR
     EXISTS(SELECT 1 FROM public.user_mcp_oauth_attempts AS attempt
      WHERE attempt.state=nonce AND
        (attempt.endpoint IS NOT NULL OR attempt.payload_encrypted IS NOT NULL
        OR attempt.encryption_checked_at IS NULL)) THEN
    RAISE EXCEPTION 'MCP source or attempt retained a clear copy';
  END IF;
  IF NOT public.activate_mcp_content() THEN
    RAISE EXCEPTION 'Sealed MCP content refused activation';
  END IF;
  rejected:=false;
  BEGIN
    INSERT INTO public.user_mcp_connections(user_id,name,url)
      VALUES(owner,'Old writer',endpoint);
  EXCEPTION WHEN check_violation THEN rejected:=true; END;
  IF NOT rejected THEN RAISE EXCEPTION 'Old MCP insert accepted'; END IF;
  rejected:=false;
  BEGIN
    UPDATE public.user_mcp_connections SET enabled=false,name='Old writer'
      WHERE id=connection;
  EXCEPTION WHEN check_violation THEN rejected:=true; END;
  IF NOT rejected THEN RAISE EXCEPTION 'Old MCP update accepted'; END IF;
  rejected:=false;
  BEGIN
    INSERT INTO public.user_mcp_oauth_attempts(state,user_id,
      connection_id,endpoint,payload_encrypted)
      VALUES(encode(gen_random_bytes(32),'hex'),owner,connection,
        endpoint,'old-payload');
  EXCEPTION WHEN check_violation THEN rejected:=true; END;
  IF NOT rejected THEN RAISE EXCEPTION 'Old OAuth attempt accepted'; END IF;
  UPDATE public.user_mcp_connections SET enabled=false WHERE id=connection;
  IF NOT EXISTS(SELECT 1 FROM public.user_mcp_connections WHERE id=connection
      AND enabled=false AND content_revision=1 AND
      encrypted_content=connection_cipher) THEN
    RAISE EXCEPTION 'Metadata edit changed protected MCP content';
  END IF;
  IF has_function_privilege('authenticated',
      'public.activate_mcp_content()','EXECUTE') THEN
    RAISE EXCEPTION 'Client can activate MCP content';
  END IF;
END;
$test$;
ROLLBACK;
