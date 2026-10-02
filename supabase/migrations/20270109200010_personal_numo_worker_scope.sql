-- Personal Numo conversations can delegate into a project owned or joined by
-- their actor. Preserve run/turn bindings and reject a different actor's run.
BEGIN;
CREATE FUNCTION public.numo_worker_conversation_project(p_conversation_id uuid,p_run_id uuid)
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT r.project_id FROM public.conversations c JOIN public.agent_runs r ON r.id=p_run_id
  WHERE c.id=p_conversation_id AND (c.project_id=r.project_id OR
    (c.project_id IS NULL AND c.user_id=r.created_by));
$$;
REVOKE ALL ON FUNCTION public.numo_worker_conversation_project(uuid,uuid)
  FROM PUBLIC,anon,authenticated,service_role;

DO $migration$
DECLARE definition text; rewritten text; signature text;
BEGIN
  FOREACH signature IN ARRAY ARRAY[
    'public.register_numo_worker_legacy_binding(text,uuid,uuid,text)',
    'public.guard_numo_worker_event_payload()',
    'public.numo_worker_payload_verified(jsonb,text,uuid)'
  ] LOOP
    definition := pg_catalog.pg_get_functiondef(signature::regprocedure);
    IF signature LIKE '%register_numo_worker_legacy_binding%' THEN
      rewritten := pg_catalog.replace(definition,
        E'SELECT project_id INTO v_project FROM public.conversations\n    WHERE id=v_turn.conversation_id;',
        'SELECT public.numo_worker_conversation_project(v_turn.conversation_id,p_run_id) INTO v_project;');
    ELSIF signature LIKE '%guard_numo_worker_event_payload%' THEN
      rewritten := pg_catalog.replace(definition,
        E'SELECT c.project_id INTO v_project FROM public.conversations c\n    WHERE c.id = v_turn.conversation_id;',
        'SELECT public.numo_worker_conversation_project(v_turn.conversation_id,v_run_id) INTO v_project;');
    ELSE
      rewritten := pg_catalog.replace(definition,
        E'SELECT project_id INTO v_project FROM public.conversations\n    WHERE id=v_turn.conversation_id;',
        E'v_run_id:=(p_payload->>''run_id'')::uuid;\n  SELECT public.numo_worker_conversation_project(v_turn.conversation_id,v_run_id) INTO v_project;');
    END IF;
    IF rewritten=definition THEN RAISE EXCEPTION 'Cannot reconcile personal worker scope: %',signature; END IF;
    EXECUTE rewritten;
  END LOOP;

  definition := pg_catalog.pg_get_functiondef('public.guard_numo_worker_checkpoint()'::regprocedure);
  rewritten := pg_catalog.replace(definition,
    E'  SELECT c.project_id INTO project FROM public.conversations c\n    WHERE c.id = NEW.conversation_id;\n  IF project IS NULL THEN\n    RAISE EXCEPTION ''numo_worker_checkpoint_run_missing'' USING ERRCODE = ''23503'';\n  END IF;\n  payload := NEW.checkpoint #> ''{worker_event,payload}'';\n  IF payload IS NULL OR payload = ''{}''::jsonb THEN RETURN NEW; END IF;',
    $replacement$  payload := NEW.checkpoint #> '{worker_event,payload}';
  IF payload IS NULL OR payload = '{}'::jsonb THEN RETURN NEW; END IF;
  SELECT c.project_id INTO project FROM public.conversations c WHERE c.id=NEW.conversation_id;
  IF project IS NULL AND payload->>'run_id' ~* '^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$' THEN
    SELECT public.numo_worker_conversation_project(NEW.conversation_id,(payload->>'run_id')::uuid) INTO project;
  END IF;
  IF project IS NULL THEN
    RAISE EXCEPTION 'numo_worker_checkpoint_run_missing' USING ERRCODE = '23503';
  END IF;$replacement$);
  IF rewritten=definition THEN RAISE EXCEPTION 'Cannot reconcile personal worker checkpoint'; END IF;
  EXECUTE rewritten;
END;
$migration$;
COMMIT;
