\set ON_ERROR_STOP on
BEGIN;
DO $$ BEGIN
  IF current_database() NOT LIKE 'minddy_min591_%' THEN
    RAISE EXCEPTION 'Use an isolated minddy_min591_* database';
  END IF;
END $$;
DO $test$
DECLARE actor uuid := gen_random_uuid(); project uuid := gen_random_uuid();
  conversation uuid := gen_random_uuid(); rejected boolean;
BEGIN
  INSERT INTO auth.users(id) VALUES(actor);
  INSERT INTO public.projects(id,owner_id,name,key)
    VALUES(project,actor,'Fixture project','APRF');
  INSERT INTO public.agent_conversations(id,project_id,owner_id)
    VALUES(conversation,project,actor);
  rejected := false;
  BEGIN
    INSERT INTO public.agent_artifacts(conversation_id,kind,ref)
      VALUES(conversation,'pull_request','Private issue content');
  EXCEPTION WHEN check_violation THEN rejected := true; END;
  IF NOT rejected THEN RAISE EXCEPTION 'Obsolete arbitrary PR ref accepted'; END IF;
  INSERT INTO public.agent_artifacts(conversation_id,kind,ref)
    VALUES(conversation,'pull_request','42');
  IF (SELECT count(*) FROM public.agent_artifacts WHERE conversation_id=conversation)
      <> 1 THEN RAISE EXCEPTION 'Numeric PR ref was not stored'; END IF;
END;
$test$;
ROLLBACK;
