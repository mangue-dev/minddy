\set ON_ERROR_STOP on
BEGIN;
DO $$ BEGIN
  IF current_database() NOT LIKE 'minddy_min591_%' THEN
    RAISE EXCEPTION 'Use an isolated minddy_min591_* database';
  END IF;
END $$;
DO $test$
DECLARE actor uuid:=gen_random_uuid(); member uuid:=gen_random_uuid();
  project uuid:=gen_random_uuid(); old_revision bigint; changed integer;
  cipher text:='{"format":3,"keyVersion":1,"data":"opaque"}';
  rejected boolean;
BEGIN
  INSERT INTO auth.users(id) VALUES(actor),(member);
  INSERT INTO public.projects(id,owner_id,name,key,automations,smart_assign_rules)
    VALUES(project,actor,'Private project','PRX',
      '[{"prompt":"private automation"}]','{"member":"private rule"}');
  INSERT INTO public.project_members(project_id,user_id) VALUES(project,member);
  IF public.activate_project_content() THEN
    RAISE EXCEPTION 'Legacy project activated';
  END IF;
  SELECT content_revision INTO old_revision FROM public.projects WHERE id=project;
  UPDATE public.projects SET name=NULL,automations=NULL,
    smart_assign_rules=NULL,encrypted_content=cipher,encryption_version=1
    WHERE id=project AND content_revision=old_revision;
  GET DIAGNOSTICS changed=ROW_COUNT;
  IF changed<>1 THEN RAISE EXCEPTION 'Project CAS failed'; END IF;
  UPDATE public.projects SET encrypted_content=cipher
    WHERE id=project AND content_revision=old_revision;
  GET DIAGNOSTICS changed=ROW_COUNT;
  IF changed<>0 THEN RAISE EXCEPTION 'Stale project CAS won'; END IF;
  IF EXISTS(SELECT 1 FROM public.projects p JOIN public.project_members m
      ON m.project_id=p.id WHERE p.id=project AND
      (p.name IS NOT NULL OR p.automations IS NOT NULL OR
       p.smart_assign_rules IS NOT NULL)) THEN
    RAISE EXCEPTION 'Project source or member projection retains clear content';
  END IF;
  IF public.activate_project_content() THEN
    RAISE EXCEPTION 'Project content activated before icon objects';
  END IF;
  INSERT INTO public.project_icon_encryption_scope(id) VALUES(true);
  IF NOT public.activate_project_content() THEN
    RAISE EXCEPTION 'Verified project refused activation';
  END IF;
  UPDATE public.projects SET color='#ffffff' WHERE id=project;
  rejected:=false;
  BEGIN
    UPDATE public.projects SET name='Obsolete writer' WHERE id=project;
  EXCEPTION WHEN check_violation THEN rejected:=true; END;
  IF NOT rejected THEN RAISE EXCEPTION 'Old update accepted'; END IF;
  rejected:=false;
  BEGIN
    INSERT INTO public.projects(id,owner_id,name,key)
      VALUES(gen_random_uuid(),actor,'Old insert','OLD');
  EXCEPTION WHEN check_violation THEN rejected:=true; END;
  IF NOT rejected THEN RAISE EXCEPTION 'Old insert accepted'; END IF;
  rejected:=false;
  BEGIN
    UPDATE public.projects SET owner_id=member WHERE id=project;
  EXCEPTION WHEN check_violation THEN rejected:=true; END;
  IF NOT rejected THEN RAISE EXCEPTION 'Cipher owner changed'; END IF;
  rejected:=false;
  BEGIN
    UPDATE public.projects SET icon_url='https://external.test/private.png'
      WHERE id=project;
  EXCEPTION WHEN check_violation THEN rejected:=true; END;
  IF NOT rejected THEN RAISE EXCEPTION 'External icon projection accepted'; END IF;
  IF has_function_privilege('authenticated',
      'public.activate_project_content()','EXECUTE') THEN
    RAISE EXCEPTION 'Client can activate project content';
  END IF;
  IF pg_get_functiondef('public.get_user_stats(text,timestamptz)'::regprocedure)
      LIKE '%select id, name, color%' OR
     pg_get_functiondef('public.get_user_usage_history(uuid,timestamptz,text[],integer,integer)'::regprocedure)
      LIKE '%''project_name'', p.name%' THEN
    RAISE EXCEPTION 'SQL statistics still project clear names';
  END IF;
END;
$test$;
ROLLBACK;
