\set ON_ERROR_STOP on
BEGIN;
DO $$ BEGIN
  IF current_database() NOT LIKE 'minddy_min591_%' THEN
    RAISE EXCEPTION 'Use an isolated minddy_min591_* database';
  END IF;
END $$;
DO $test$
DECLARE actor uuid := gen_random_uuid(); project uuid := gen_random_uuid();
  conversation uuid := gen_random_uuid(); v_run_id uuid := gen_random_uuid();
  archived_turn uuid := gen_random_uuid(); turn_id uuid;
  cipher_outcome text := 'mdys3:1:eyJmb3JtYXQiOjMsImtleVZlcnNpb24iOjF9';
  cipher_error text := 'mdys3:2:eyJmb3JtYXQiOjMsImtleVZlcnNpb24iOjJ9';
  rejected boolean;
BEGIN
  INSERT INTO auth.users(id) VALUES(actor);
  INSERT INTO public.projects(id,owner_id,name,key)
    VALUES(project,actor,'Summary fixture','SUM');
  INSERT INTO public.agent_conversations(id,project_id,owner_id)
    VALUES(conversation,project,actor);
  INSERT INTO public.agent_runs(id,project_id,conversation_id,created_by,
    outcome,error_message)
    VALUES(v_run_id,project,conversation,actor,'Private run outcome','Private run error');
  SELECT id INTO turn_id FROM public.agent_turns WHERE run_id=v_run_id;
  IF turn_id IS NULL THEN RAISE EXCEPTION 'Turn copy missing'; END IF;
  IF NOT public.migrate_agent_run_summary(v_run_id,project,
      'Private run outcome','Private run error',cipher_outcome,cipher_error,true) THEN
    RAISE EXCEPTION 'Run summary compare-and-swap failed';
  END IF;
  IF EXISTS (SELECT 1 FROM public.agent_runs WHERE id=v_run_id AND
      (outcome LIKE '%Private run%' OR error_message LIKE '%Private run%')) OR
     EXISTS (SELECT 1 FROM public.agent_turns WHERE id=turn_id AND
      (outcome LIKE '%Private run%' OR error_message LIKE '%Private run%')) OR
     EXISTS (SELECT 1 FROM public.numo_turns WHERE id=turn_id AND
      (outcome LIKE '%Private run%' OR error_message LIKE '%Private run%')) THEN
    RAISE EXCEPTION 'Run, turn or Numo projection still contains clear text';
  END IF;
  IF public.migrate_agent_run_summary(v_run_id,project,
      'Private run outcome','Private run error',cipher_outcome,cipher_error,true) THEN
    RAISE EXCEPTION 'Stale summary compare-and-swap accepted';
  END IF;
  rejected := false;
  BEGIN
    UPDATE public.agent_runs SET outcome='Stale clear writer' WHERE id=v_run_id;
  EXCEPTION WHEN check_violation THEN rejected := true; END;
  IF NOT rejected THEN RAISE EXCEPTION 'Obsolete run writer accepted'; END IF;
  rejected := false;
  BEGIN
    UPDATE public.agent_turns SET error_message='Stale clear writer' WHERE id=turn_id;
  EXCEPTION WHEN check_violation THEN rejected := true; END;
  IF NOT rejected THEN RAISE EXCEPTION 'Obsolete turn writer accepted'; END IF;
  INSERT INTO public.agent_turns(id,conversation_id,run_id,status,outcome)
    VALUES(archived_turn,conversation,NULL,'completed',cipher_outcome);
  IF NOT EXISTS (SELECT 1 FROM public.agent_turns WHERE id=archived_turn
      AND run_id IS NULL AND outcome=cipher_outcome) THEN
    RAISE EXCEPTION 'Imported archived turn was not retained';
  END IF;
  rejected := false;
  BEGIN
    INSERT INTO public.agent_turns(conversation_id,run_id,status,outcome)
      VALUES(conversation,NULL,'completed','Plain archived outcome');
  EXCEPTION WHEN check_violation THEN rejected := true; END;
  IF NOT rejected THEN RAISE EXCEPTION 'Obsolete archived turn writer accepted'; END IF;
  IF has_function_privilege('authenticated',
      'public.migrate_agent_run_summary(uuid,uuid,text,text,text,text,boolean)',
      'EXECUTE') OR has_function_privilege('authenticated',
      'public.migrate_agent_turn_summary(uuid,uuid,text,text,text,text,boolean)',
      'EXECUTE') THEN
    RAISE EXCEPTION 'Summary migration has client execute privilege';
  END IF;
END;
$test$;
ROLLBACK;
