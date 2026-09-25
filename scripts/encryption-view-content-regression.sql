\set ON_ERROR_STOP on
BEGIN;
DO $$ BEGIN
  IF current_database() NOT LIKE 'minddy_min591_%' THEN
    RAISE EXCEPTION 'Use an isolated minddy_min591_* database';
  END IF;
END $$;
DO $test$
DECLARE actor uuid:=gen_random_uuid(); project uuid:=gen_random_uuid();
  project_view uuid:=gen_random_uuid(); global_view uuid:=gen_random_uuid();
  share uuid:=gen_random_uuid(); old_revision bigint; changed integer;
  cipher text:='{"format":3,"keyVersion":1,"data":"opaque"}';
  rejected boolean;
BEGIN
  INSERT INTO auth.users(id) VALUES(actor);
  INSERT INTO public.projects(id,owner_id,name,key)
    VALUES(project,actor,'Project fixture','VCON');
  INSERT INTO public.views(id,project_id,user_id,kind,name,filters,display)
    VALUES(project_view,project,NULL,'custom','Private board',
      '{"category":["private-category"]}'::jsonb,
      '{"hideDone":true}'::jsonb);
  INSERT INTO public.views(id,project_id,user_id,kind,name,filters,display)
    VALUES(global_view,NULL,actor,'custom','Private global',
      '{"project":["private-project"]}'::jsonb,'{}'::jsonb);
  INSERT INTO public.view_shares(id,view_id,token,level)
    VALUES(share,project_view,'public-token','public');
  IF public.activate_view_content() THEN
    RAISE EXCEPTION 'Legacy views activated';
  END IF;
  SELECT content_revision INTO old_revision FROM public.views
    WHERE id=project_view;
  UPDATE public.views SET name=NULL,filters=NULL,display=NULL,
    encrypted_content=cipher,encryption_version=1
    WHERE id=project_view AND content_revision=old_revision;
  GET DIAGNOSTICS changed=ROW_COUNT;
  IF changed<>1 THEN RAISE EXCEPTION 'Project view CAS failed'; END IF;
  UPDATE public.views SET name=NULL,filters=NULL,display=NULL,
    encrypted_content=cipher,encryption_version=1
    WHERE id=project_view AND content_revision=old_revision;
  GET DIAGNOSTICS changed=ROW_COUNT;
  IF changed<>0 THEN RAISE EXCEPTION 'Stale view CAS won'; END IF;
  UPDATE public.views SET name=NULL,filters=NULL,display=NULL,
    encrypted_content=cipher,encryption_version=1 WHERE id=global_view;
  IF EXISTS(SELECT 1 FROM public.views WHERE id IN (project_view,global_view)
      AND (name IS NOT NULL OR filters IS NOT NULL OR display IS NOT NULL)) OR
     EXISTS(SELECT 1 FROM public.view_shares s JOIN public.views v
       ON v.id=s.view_id WHERE s.id=share AND v.name IS NOT NULL) THEN
    RAISE EXCEPTION 'View source or public projection retains clear content';
  END IF;
  IF NOT public.activate_view_content() THEN
    RAISE EXCEPTION 'Verified views refused activation';
  END IF;
  rejected:=false;
  BEGIN
    UPDATE public.views SET name='Obsolete writer' WHERE id=project_view;
  EXCEPTION WHEN check_violation THEN rejected:=true; END;
  IF NOT rejected THEN RAISE EXCEPTION 'Old update accepted'; END IF;
  rejected:=false;
  BEGIN
    INSERT INTO public.views(id,project_id,kind,name,filters,display)
      VALUES(gen_random_uuid(),project,'custom','Old insert','{}','{}');
  EXCEPTION WHEN check_violation THEN rejected:=true; END;
  IF NOT rejected THEN RAISE EXCEPTION 'Old insert accepted'; END IF;
  rejected:=false;
  BEGIN
    UPDATE public.views SET user_id=actor WHERE id=project_view;
  EXCEPTION WHEN check_violation THEN rejected:=true; END;
  IF NOT rejected THEN RAISE EXCEPTION 'Cipher scope changed'; END IF;
  IF has_function_privilege('authenticated',
      'public.activate_view_content()','EXECUTE') THEN
    RAISE EXCEPTION 'Client can activate view content';
  END IF;
END;
$test$;
ROLLBACK;
