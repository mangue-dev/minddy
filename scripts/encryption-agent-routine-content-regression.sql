\set ON_ERROR_STOP on
BEGIN;
DO $$ BEGIN
  IF current_database() NOT LIKE 'minddy_min591_%' THEN
    RAISE EXCEPTION 'Use an isolated minddy_min591_* database';
  END IF;
END $$;
DO $test$
DECLARE actor uuid:=gen_random_uuid(); project uuid:=gen_random_uuid();
  routine uuid:=gen_random_uuid(); old_revision bigint; changed integer;
  cipher text:='{"format":3,"keyVersion":1,"data":"opaque"}';
  rejected boolean;
BEGIN
  INSERT INTO auth.users(id) VALUES(actor);
  INSERT INTO public.projects(id,owner_id,name,key)
    VALUES(project,actor,'Routine parent','RCON');
  INSERT INTO public.agent_routines(id,project_id,owner_id,title,prompt,
    prompt_mentions,base_branch,frequency,hour,timezone,last_error)
    VALUES(routine,project,actor,'Private title','Private prompt',
      '[{"label":"private label"}]','private-branch','weekly',9,'UTC',
      'legacy private failure');
  IF public.activate_agent_routine_content() THEN
    RAISE EXCEPTION 'Legacy routine activated';
  END IF;
  SELECT content_revision INTO old_revision FROM public.agent_routines
    WHERE id=routine;
  UPDATE public.agent_routines SET title=NULL,prompt=NULL,
    prompt_mentions=NULL,base_branch=NULL,last_error='launchFailed',
    encrypted_content=cipher,encryption_version=1
    WHERE id=routine AND content_revision=old_revision;
  GET DIAGNOSTICS changed=ROW_COUNT;
  IF changed<>1 THEN RAISE EXCEPTION 'Routine CAS failed'; END IF;
  UPDATE public.agent_routines SET title=NULL,prompt=NULL,
    prompt_mentions=NULL,base_branch=NULL,
    encrypted_content=cipher,encryption_version=1
    WHERE id=routine AND content_revision=old_revision;
  GET DIAGNOSTICS changed=ROW_COUNT;
  IF changed<>0 THEN RAISE EXCEPTION 'Stale routine CAS won'; END IF;
  IF EXISTS(SELECT 1 FROM public.agent_routines WHERE id=routine AND
      (title IS NOT NULL OR prompt IS NOT NULL OR
       prompt_mentions IS NOT NULL OR base_branch IS NOT NULL)) THEN
    RAISE EXCEPTION 'Routine source or Realtime row retains clear content';
  END IF;
  IF NOT public.activate_agent_routine_content() THEN
    RAISE EXCEPTION 'Verified routines refused activation';
  END IF;
  UPDATE public.agent_routines SET last_run_at=now(),last_error='quota'
    WHERE id=routine;
  rejected:=false;
  BEGIN
    UPDATE public.agent_routines SET prompt='Obsolete writer' WHERE id=routine;
  EXCEPTION WHEN check_violation THEN rejected:=true; END;
  IF NOT rejected THEN RAISE EXCEPTION 'Old update accepted'; END IF;
  rejected:=false;
  BEGIN
    INSERT INTO public.agent_routines(project_id,owner_id,title,prompt,
      frequency,hour,timezone) VALUES(project,actor,'Old','Old clear','weekly',9,'UTC');
  EXCEPTION WHEN check_violation THEN rejected:=true; END;
  IF NOT rejected THEN RAISE EXCEPTION 'Old insert accepted'; END IF;
  rejected:=false;
  BEGIN
    UPDATE public.agent_routines SET last_error='private stack trace'
      WHERE id=routine;
  EXCEPTION WHEN check_violation THEN rejected:=true; END;
  IF NOT rejected THEN RAISE EXCEPTION 'Free routine error accepted'; END IF;
  rejected:=false;
  BEGIN
    UPDATE public.agent_routines SET project_id=gen_random_uuid()
      WHERE id=routine;
  EXCEPTION WHEN check_violation THEN rejected:=true; END;
  IF NOT rejected THEN RAISE EXCEPTION 'Cipher project changed'; END IF;
  IF has_function_privilege('authenticated',
      'public.activate_agent_routine_content()','EXECUTE') THEN
    RAISE EXCEPTION 'Client can activate routine content';
  END IF;
END;
$test$;
ROLLBACK;
