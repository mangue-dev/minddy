\set ON_ERROR_STOP on
BEGIN;
DO $$ BEGIN
  IF current_database() NOT LIKE 'minddy_min591_%' THEN
    RAISE EXCEPTION 'Use an isolated minddy_min591_* database';
  END IF;
END $$;
DO $test$
DECLARE actor uuid:=gen_random_uuid(); key_id uuid:=gen_random_uuid();
  new_id uuid:=gen_random_uuid(); cipher text:=
    '{"format":3,"keyVersion":1,"data":"opaque"}';
  revision bigint; rejected boolean; saved public.user_ai_keys%ROWTYPE;
BEGIN
  INSERT INTO auth.users(id) VALUES(actor);
  INSERT INTO public.user_ai_keys(id,user_id,provider,key_encrypted,
    base_url,feature_models) VALUES(key_id,actor,'openrouter',
    '{"iv":"legacy"}','https://private.example','{"chat":"private"}');
  IF public.activate_user_ai_key_content() THEN
    RAISE EXCEPTION 'Legacy BYOK activated';
  END IF;
  SELECT k.content_revision INTO revision FROM public.user_ai_keys k
    WHERE k.id=key_id;
  UPDATE public.user_ai_keys SET key_encrypted=NULL,base_url=NULL,
    feature_models=NULL,encrypted_content=cipher,encryption_version=1
    WHERE user_id=actor AND content_revision=revision;
  IF NOT public.activate_user_ai_key_content() THEN
    RAISE EXCEPTION 'Verified BYOK row refused activation';
  END IF;
  SELECT * INTO saved FROM public.upsert_user_ai_key_protected(actor,
    'openai',new_id,0,cipher,1,'sk-abc',now());
  IF saved.id<>new_id OR saved.key_encrypted IS NOT NULL OR
      saved.base_url IS NOT NULL OR saved.feature_models IS NOT NULL OR
      saved.encryption_version<>1 THEN
    RAISE EXCEPTION 'Protected BYOK source retained clear values';
  END IF;
  SELECT * INTO saved FROM public.update_user_ai_key_preferences_protected(
    actor,new_id,saved.content_revision,cipher,1,ARRAY['agent']::text[]);
  IF saved.enabled_surfaces<>ARRAY['agent']::text[] THEN
    RAISE EXCEPTION 'Protected preferences were not updated';
  END IF;
  rejected:=false;
  BEGIN
    UPDATE public.user_ai_keys SET base_url='https://old.example'
      WHERE user_id=actor AND id=new_id;
  EXCEPTION WHEN check_violation THEN rejected:=true; END;
  IF NOT rejected THEN RAISE EXCEPTION 'Old clear update accepted'; END IF;
  rejected:=false;
  BEGIN
    PERFORM * FROM public.upsert_user_ai_key(actor,'google',
      '{"iv":"legacy"}',NULL,NULL,NULL);
  EXCEPTION WHEN check_violation THEN rejected:=true; END;
  IF NOT rejected THEN RAISE EXCEPTION 'Old BYOK RPC accepted'; END IF;
  rejected:=false;
  BEGIN
    PERFORM * FROM public.update_user_ai_key_preferences(actor,new_id,
      NULL,'{"chat":"private"}'::jsonb);
  EXCEPTION WHEN check_violation THEN rejected:=true; END;
  IF NOT rejected THEN RAISE EXCEPTION 'Old preferences RPC accepted'; END IF;
  IF has_function_privilege('authenticated',
      'public.activate_user_ai_key_content()','EXECUTE') OR
     has_function_privilege('authenticated',
      'public.upsert_user_ai_key_protected(uuid,text,uuid,bigint,text,integer,text,timestamptz)',
      'EXECUTE') THEN
    RAISE EXCEPTION 'Client can invoke protected BYOK functions';
  END IF;
END;
$test$;
ROLLBACK;
