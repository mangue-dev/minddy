\set ON_ERROR_STOP on
BEGIN;
DO $$ BEGIN
  IF current_database() NOT LIKE 'minddy_min591_%' THEN
    RAISE EXCEPTION 'Use an isolated minddy_min591_* database';
  END IF;
END $$;
DO $test$
DECLARE owner uuid:=gen_random_uuid(); other_user uuid:=gen_random_uuid();
  tab_id uuid:=gen_random_uuid(); other_id uuid:=gen_random_uuid();
  href_cipher text:='mdye3:{"format":3,"keyVersion":2,"data":"opaque-href"}';
  name_cipher text:='mdye3:{"format":3,"keyVersion":2,"data":"opaque-name"}';
  result jsonb; rejected boolean;
BEGIN
  INSERT INTO auth.users(id) VALUES(owner),(other_user);
  INSERT INTO public.app_tabs(id,user_id,href,custom_name,position)
    VALUES(tab_id,owner,'/all?private=issue','Private tab',0);
  IF public.activate_app_tab_content() THEN
    RAISE EXCEPTION 'Legacy tab source activated';
  END IF;
  UPDATE public.app_tabs SET href=href_cipher,custom_name=name_cipher
    WHERE id=tab_id;
  IF EXISTS(SELECT 1 FROM public.app_tabs WHERE id=tab_id AND
      (href LIKE '%private=issue%' OR custom_name LIKE '%Private tab%' OR
        href_encryption_checked_at IS NULL OR
        custom_name_encryption_checked_at IS NULL)) THEN
    RAISE EXCEPTION 'Application tab source retained clear content';
  END IF;
  IF NOT public.activate_app_tab_content() THEN
    RAISE EXCEPTION 'Protected tab source refused activation';
  END IF;
  rejected:=false;
  BEGIN
    UPDATE public.app_tabs SET href='/home' WHERE id=tab_id;
  EXCEPTION WHEN check_violation THEN rejected:=true; END;
  IF NOT rejected THEN RAISE EXCEPTION 'Old direct tab writer accepted'; END IF;
  rejected:=false;
  BEGIN
    UPDATE public.app_tabs SET custom_name='Private again' WHERE id=tab_id;
  EXCEPTION WHEN check_violation THEN rejected:=true; END;
  IF NOT rejected THEN RAISE EXCEPTION 'Old tab label writer accepted'; END IF;
  PERFORM set_config('request.jwt.claim.sub',owner::text,true);
  result:=public.mutate_app_tab('ensure',tab_id);
  IF result->'tab'->>'href'<>href_cipher OR
      result->'tab'->>'custom_name'<>name_cipher THEN
    RAISE EXCEPTION 'Tab RPC returned clear content';
  END IF;
  rejected:=false;
  BEGIN
    PERFORM public.mutate_app_tab('create',other_id);
  EXCEPTION WHEN check_violation THEN rejected:=true; END;
  IF NOT rejected THEN RAISE EXCEPTION 'Old tab creation RPC accepted'; END IF;
  result:=public.mutate_app_tab('create',other_id,NULL,
    jsonb_build_object('href',href_cipher));
  IF result->'tab'->>'href'<>href_cipher THEN
    RAISE EXCEPTION 'Protected tab creation failed';
  END IF;
  result:=public.mutate_app_tab('update',other_id,1,
    jsonb_build_object('custom_name',name_cipher));
  IF result->'tab'->>'custom_name'<>name_cipher THEN
    RAISE EXCEPTION 'Protected tab label update failed';
  END IF;
  rejected:=false;
  BEGIN
    PERFORM public.mutate_app_tab('update',other_id,2,
      '{"href":"/home"}'::jsonb);
  EXCEPTION WHEN check_violation THEN rejected:=true; END;
  IF NOT rejected THEN RAISE EXCEPTION 'Old tab update RPC accepted'; END IF;
  PERFORM set_config('request.jwt.claim.sub',other_user::text,true);
  IF public.mutate_app_tab('close',tab_id,1)->>'code'<>'not_found' THEN
    RAISE EXCEPTION 'Other user can close protected tab';
  END IF;
  IF has_function_privilege('authenticated',
      'public.activate_app_tab_content()','EXECUTE') THEN
    RAISE EXCEPTION 'Client can activate tab protection';
  END IF;
END;
$test$;
ROLLBACK;
