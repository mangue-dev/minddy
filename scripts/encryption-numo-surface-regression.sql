\set ON_ERROR_STOP on
BEGIN;
DO $$ BEGIN
  IF current_database() NOT LIKE 'minddy_min591_%' THEN
    RAISE EXCEPTION 'Use an isolated minddy_min591_* database';
  END IF;
END $$;
DO $test$
DECLARE actor uuid := gen_random_uuid(); project uuid := gen_random_uuid();
  conversation uuid := gen_random_uuid(); thread uuid := gen_random_uuid();
  event_id uuid := gen_random_uuid(); old jsonb;
  cipher jsonb := jsonb_build_object('ciphertext',
    'mdyn3:1:eyJmb3JtYXQiOjMsImtleVZlcnNpb24iOjF9');
  rejected boolean := false;
BEGIN
  INSERT INTO auth.users(id) VALUES(actor);
  INSERT INTO public.projects(id,owner_id,name,key)
    VALUES(project,actor,'Surface fixture','SURF');
  INSERT INTO public.conversations(id,user_id,title)
    VALUES(conversation,actor,'Surface conversation');
  INSERT INTO public.numo_surface_threads(id,surface,source_thread_id,
    actor_id,project_id,conversation_id) VALUES(thread,'issue_comment',
    'fixture-thread',actor,project,conversation);
  old := jsonb_build_object('kind','comment','table','comments',
    'locale','en','private','unbounded issue text');
  INSERT INTO public.numo_surface_events(id,thread_id,source_event_id,
    actor_id,destination) VALUES(event_id,thread,'source-one',actor,old);
  IF NOT public.migrate_numo_surface_destination(event_id,old,cipher) OR
     public.migrate_numo_surface_destination(event_id,old,cipher) THEN
    RAISE EXCEPTION 'Surface destination CAS failed';
  END IF;
  IF EXISTS(SELECT 1 FROM public.numo_surface_events WHERE id=event_id AND
      destination::text LIKE '%unbounded issue text%') THEN
    RAISE EXCEPTION 'Surface destination remains clear';
  END IF;
  BEGIN
    INSERT INTO public.numo_surface_events(thread_id,source_event_id,
      actor_id,destination) VALUES(thread,'source-two',actor,old);
  EXCEPTION WHEN check_violation THEN rejected := true; END;
  IF NOT rejected THEN RAISE EXCEPTION 'Old surface writer accepted'; END IF;
  rejected := false;
  BEGIN
    INSERT INTO public.numo_surface_events(thread_id,source_event_id,
      actor_id,destination) VALUES(thread,'source-three',actor,
      '{"ciphertext":null}'::jsonb);
  EXCEPTION WHEN check_violation THEN rejected := true; END;
  IF NOT rejected THEN RAISE EXCEPTION 'Null ciphertext accepted'; END IF;
  IF has_function_privilege('authenticated',
      'public.migrate_numo_surface_destination(uuid,jsonb,jsonb)',
      'EXECUTE') THEN
    RAISE EXCEPTION 'Surface migration has client privilege';
  END IF;
END;
$test$;
ROLLBACK;
