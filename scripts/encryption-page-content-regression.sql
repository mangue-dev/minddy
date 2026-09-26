\set ON_ERROR_STOP on
BEGIN;
DO $$ BEGIN
  IF current_database() NOT LIKE 'minddy_min591_%' THEN
    RAISE EXCEPTION 'Use an isolated minddy_min591_* database';
  END IF;
END $$;
DO $test$
DECLARE actor uuid:=gen_random_uuid(); project uuid:=gen_random_uuid();
  parent uuid:=gen_random_uuid(); child uuid:=gen_random_uuid();
  cipher text:='{"format":3,"keyVersion":1,"data":"opaque"}';
  original_revision bigint; changed integer; rejected boolean;
  result jsonb;
BEGIN
  INSERT INTO auth.users(id) VALUES(actor);
  INSERT INTO public.projects(id,owner_id,name,key)
    VALUES(project,actor,'Project','PGCE');
  INSERT INTO public.pages(id,project_id,title,content,database_schema,
    property_values,position,created_by)
    VALUES(parent,project,'Private database',
      '{"type":"doc","content":[]}',
      '[]','{}','a',actor);
  INSERT INTO public.pages(id,project_id,parent_id,title,content,
    property_values,position,created_by,search_text)
    VALUES(child,project,parent,'Private child',
      '{"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"Private body"}]}]}',
      '{}','a',actor,'Private body');
  IF public.activate_page_content() THEN
    RAISE EXCEPTION 'Legacy page activated';
  END IF;
  SELECT content_revision INTO original_revision FROM public.pages WHERE id=child;
  UPDATE public.pages SET title=NULL,icon=NULL,content=NULL,
    database_schema=NULL,database_title_name=NULL,property_values=NULL,
    search_text=NULL,encrypted_content=cipher,encryption_version=1,
    page_is_database=false,page_has_values=false,page_is_blank=false
    WHERE id=child AND content_revision=original_revision;
  GET DIAGNOSTICS changed=ROW_COUNT;
  IF changed<>1 THEN RAISE EXCEPTION 'Child CAS failed'; END IF;
  UPDATE public.pages SET encrypted_content=cipher WHERE id=child
    AND content_revision=original_revision;
  GET DIAGNOSTICS changed=ROW_COUNT;
  IF changed<>0 THEN RAISE EXCEPTION 'Stale child CAS won'; END IF;
  UPDATE public.pages SET title=NULL,icon=NULL,content=NULL,
    database_schema=NULL,database_title_name=NULL,property_values=NULL,
    search_text=NULL,encrypted_content=cipher,encryption_version=1,
    page_is_database=true,page_has_values=false,page_is_blank=false
    WHERE id=parent;
  IF EXISTS(SELECT 1 FROM public.pages WHERE id IN(parent,child) AND
      (title IS NOT NULL OR icon IS NOT NULL OR content IS NOT NULL OR
       database_schema IS NOT NULL OR database_title_name IS NOT NULL OR
       property_values IS NOT NULL OR search_text IS NOT NULL OR
       search_tsv IS DISTINCT FROM ''::tsvector)) THEN
    RAISE EXCEPTION 'Page source or search projection retains clear content';
  END IF;
  IF NOT public.activate_page_content() THEN
    RAISE EXCEPTION 'Verified pages refused activation';
  END IF;
  result:=public.commit_page_content_batch(project,actor,parent,
    jsonb_build_array(
      jsonb_build_object('id',parent,'revision',(SELECT content_revision
        FROM public.pages WHERE id=parent),'databaseRevision',0,
        'version',1,'parentId',NULL),
      jsonb_build_object('id',child,'revision',(SELECT content_revision
        FROM public.pages WHERE id=child),'databaseRevision',0,
        'version',1,'parentId',parent)),
    jsonb_build_array(jsonb_build_object('id',parent,'ciphertext',cipher,
      'keyVersion',1,'isDatabase',true,'hasValues',false,'isBlank',false,
      'databaseRevision',1)),ARRAY[child], 'human',NULL);
  IF result->>'status'<>'updated' THEN
    RAISE EXCEPTION 'Encrypted batch was not applied: %',result;
  END IF;
  rejected:=false;
  BEGIN
    UPDATE public.pages SET title='Old writer' WHERE id=child;
  EXCEPTION WHEN check_violation THEN rejected:=true; END;
  IF NOT rejected THEN RAISE EXCEPTION 'Plaintext update accepted'; END IF;
  rejected:=false;
  BEGIN
    INSERT INTO public.pages(id,project_id,title,position)
      VALUES(gen_random_uuid(),project,'Old insert','b');
  EXCEPTION WHEN check_violation THEN rejected:=true; END;
  IF NOT rejected THEN RAISE EXCEPTION 'Plaintext insert accepted'; END IF;
  rejected:=false;
  BEGIN
    PERFORM public.update_page_database_guarded(project,parent,actor,
      '{"operation":"schema","schema":[],"revision":1}');
  EXCEPTION WHEN check_violation THEN rejected:=true; END;
  IF NOT rejected THEN RAISE EXCEPTION 'Legacy database RPC accepted'; END IF;
  IF has_function_privilege('authenticated',
      'public.activate_page_content()','EXECUTE') OR
     has_function_privilege('authenticated',
      'public.commit_page_content_batch(uuid,uuid,uuid,jsonb,jsonb,uuid[],text,uuid)',
      'EXECUTE') THEN
    RAISE EXCEPTION 'Client can invoke page activation or batch';
  END IF;
  IF pg_get_functiondef('public.broadcast_page_row()'::regprocedure)
      NOT LIKE '%''encrypted_content''%' THEN
    RAISE EXCEPTION 'Realtime page payload does not exclude ciphertext';
  END IF;
END;
$test$;
ROLLBACK;
