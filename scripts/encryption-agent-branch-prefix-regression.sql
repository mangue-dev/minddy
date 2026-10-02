\set ON_ERROR_STOP on
BEGIN;
DO $$ BEGIN
  IF current_database() NOT LIKE 'minddy_min591_%' THEN
    RAISE EXCEPTION 'Use an isolated minddy_min591_* database';
  END IF;
END $$;
DO $test$
DECLARE owner uuid:=gen_random_uuid(); other_user uuid:=gen_random_uuid(); cipher text:=
  'mdye3:{"format":3,"keyVersion":2,"data":"opaque"}';
  other text:='mdye3:{"format":3,"keyVersion":2,"data":"other"}';
  rejected boolean;
BEGIN
  INSERT INTO auth.users(id) VALUES(owner),(other_user);
  INSERT INTO public.user_agent_preferences(user_id,branch_prefix)
    VALUES(owner,'private/');
  IF public.activate_agent_branch_prefix() THEN
    RAISE EXCEPTION 'Legacy branch namespace activated';
  END IF;
  UPDATE public.user_agent_preferences SET branch_prefix=cipher
    WHERE user_id=owner;
  IF EXISTS(SELECT 1 FROM public.user_agent_preferences WHERE user_id=owner
      AND (branch_prefix='private/' OR
        branch_prefix_encryption_checked_at IS NULL)) THEN
    RAISE EXCEPTION 'Agent branch namespace retained clear source';
  END IF;
  IF NOT public.activate_agent_branch_prefix() THEN
    RAISE EXCEPTION 'Sealed branch namespaces refused activation';
  END IF;
  rejected:=false;
  BEGIN
    INSERT INTO public.user_agent_preferences(user_id)
      VALUES(other_user);
  EXCEPTION WHEN check_violation THEN rejected:=true; END;
  IF NOT rejected THEN RAISE EXCEPTION 'Old preference insert accepted'; END IF;
  rejected:=false;
  BEGIN
    UPDATE public.user_agent_preferences SET branch_prefix='old/'
      WHERE user_id=owner;
  EXCEPTION WHEN check_violation THEN rejected:=true; END;
  IF NOT rejected THEN RAISE EXCEPTION 'Old branch writer accepted'; END IF;
  PERFORM public.upsert_agent_preferences_protected(owner,
    '{"sandbox_size":"performance"}'::jsonb,other,false);
  IF NOT EXISTS(SELECT 1 FROM public.user_agent_preferences WHERE
      user_id=owner AND branch_prefix=cipher AND
      sandbox_size='performance') THEN
    RAISE EXCEPTION 'Metadata patch replaced branch namespace';
  END IF;
  PERFORM public.upsert_agent_preferences_protected(owner,'{}'::jsonb,
    other,true);
  IF NOT EXISTS(SELECT 1 FROM public.user_agent_preferences WHERE
      user_id=owner AND branch_prefix=other) THEN
    RAISE EXCEPTION 'Protected branch update failed';
  END IF;
  IF has_function_privilege('authenticated',
      'public.upsert_agent_preferences_protected(uuid,jsonb,text,boolean)',
      'EXECUTE') OR has_function_privilege('authenticated',
      'public.activate_agent_branch_prefix()','EXECUTE') THEN
    RAISE EXCEPTION 'Client can call protected preference control RPC';
  END IF;
END;
$test$;
ROLLBACK;
