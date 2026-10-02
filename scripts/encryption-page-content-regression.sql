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
  imported uuid:=gen_random_uuid(); imported_child uuid:=gen_random_uuid();
  request_id uuid:=gen_random_uuid();
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
  INSERT INTO public.pages(id,project_id,title,icon,content,database_schema,
    database_title_name,property_values,search_text,encrypted_content,
    encryption_version,page_is_database,page_has_values,page_is_blank,
    position,created_by)
    VALUES(imported,project,NULL,NULL,NULL,NULL,NULL,NULL,NULL,cipher,
      1,true,false,false,'b',actor);
  result:=public.import_encrypted_page_database(project,imported,actor,
    request_id,0,(SELECT content_revision FROM public.pages WHERE id=imported),
    jsonb_build_array(
      jsonb_build_object('id',imported,'parent_id',NULL,
        'encrypted_content',cipher,'encryption_version',1,
        'page_is_database',true,'page_has_values',false,
        'page_is_blank',false),
      jsonb_build_object('id',imported_child,'parent_id',imported,
        'position','a','encrypted_content',cipher,'encryption_version',1,
        'page_is_database',false,'page_has_values',true,
        'page_is_blank',false)), '[]'::jsonb);
  IF result->>'count'<>'1' OR result->>'replayed'<>'false' OR
      EXISTS(SELECT 1 FROM public.pages WHERE id=imported_child AND
        (title IS NOT NULL OR content IS NOT NULL OR
         property_values IS NOT NULL OR search_text IS NOT NULL)) THEN
    RAISE EXCEPTION 'Encrypted import retained clear content: %',result;
  END IF;
  result:=public.import_encrypted_page_database(project,imported,actor,
    request_id,0,0,'[]'::jsonb,'[]'::jsonb);
  IF result->>'replayed'<>'true' THEN
    RAISE EXCEPTION 'Encrypted import lost idempotence';
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
  UPDATE public.pages SET deleted_at=now() WHERE id=child;
  result:=public.commit_page_content_batch(project,actor,parent,
    jsonb_build_array(
      jsonb_build_object('id',parent,'revision',(SELECT content_revision
        FROM public.pages WHERE id=parent),'databaseRevision',1,
        'version',1,'parentId',NULL),
      jsonb_build_object('id',child,'revision',(SELECT content_revision
        FROM public.pages WHERE id=child),'databaseRevision',0,
        'version',1,'parentId',parent)),
    jsonb_build_array(jsonb_build_object('id',child,'ciphertext',cipher,
      'keyVersion',1,'isDatabase',false,'hasValues',false,'isBlank',false,
      'databaseRevision',0)),ARRAY[child], 'human',NULL);
  IF result->>'status'<>'updated' THEN
    RAISE EXCEPTION 'Trashed database entry missed schema cleanup: %',result;
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
  DELETE FROM public.pages WHERE id=parent;
  IF EXISTS(SELECT 1 FROM public.pages WHERE id=child) THEN
    RAISE EXCEPTION 'Encrypted child survived permanent parent deletion';
  END IF;
END;
$test$;
ROLLBACK;
