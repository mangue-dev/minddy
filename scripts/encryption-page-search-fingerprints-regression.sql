-- Ciphertext-cache identities remain fresh, bounded and subject to caller RLS.
\set ON_ERROR_STOP on
BEGIN;
DO $$ BEGIN
  IF current_database() NOT LIKE 'minddy_min591_%' THEN
    RAISE EXCEPTION 'Use an isolated minddy_min591_* database';
  END IF;
END $$;
DO $test$
DECLARE actor uuid:=gen_random_uuid(); outsider uuid:=gen_random_uuid();
  project uuid:=gen_random_uuid(); foreign_project uuid:=gen_random_uuid();
  own_page uuid:=gen_random_uuid(); foreign_page uuid:=gen_random_uuid(); found jsonb;
BEGIN
  INSERT INTO auth.users(id) VALUES(actor),(outsider);
  INSERT INTO public.projects(id,owner_id,name,key) VALUES
    (project,actor,'Search fingerprint fixture','PCF'),
    (foreign_project,outsider,'Foreign fixture','PCX');
  INSERT INTO public.pages(id,project_id,title,content,property_values,position,created_by)
    VALUES(own_page,project,'Private title','{"type":"doc","content":[]}','{}','a',actor),
      (foreign_page,foreign_project,'Foreign title','{"type":"doc","content":[]}','{}','a',outsider);
  PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',actor,'role','authenticated')::text,true);
  PERFORM set_config('request.jwt.claim.sub',actor::text,true);
  SET LOCAL ROLE authenticated;
  SELECT jsonb_agg(to_jsonb(p)) INTO found FROM public.page_search_cipher_fingerprints(NULL,0,200) p;
  IF jsonb_array_length(found)<>1 OR found->0->>'id'<>own_page::text OR
      found->0 ?| ARRAY['content','title','encrypted_content','search_text'] OR
      found->0->'cipher_digest'<>'null'::jsonb OR found->0->>'protected_fields_clear'<>'true' THEN
    RAISE EXCEPTION 'Fingerprint projection exposed foreign or content fields';
  END IF;
  IF EXISTS(SELECT 1 FROM public.page_search_cipher_fingerprints(foreign_project,0,200)) THEN
    RAISE EXCEPTION 'Fingerprint projection bypassed caller RLS';
  END IF;
  BEGIN
    PERFORM public.page_search_cipher_fingerprints(project,0,NULL);
    RAISE EXCEPTION 'Unbounded fingerprint batch accepted';
  EXCEPTION WHEN invalid_parameter_value THEN NULL; END;
  SET LOCAL ROLE supabase_admin;
  IF has_function_privilege('anon','public.page_search_cipher_fingerprints(uuid,integer,integer)','EXECUTE') OR
      (SELECT prosecdef FROM pg_proc WHERE oid='public.page_search_cipher_fingerprints(uuid,integer,integer)'::regprocedure) THEN
    RAISE EXCEPTION 'Fingerprint projection has privileged or anonymous execution';
  END IF;
END;
$test$;
ROLLBACK;
