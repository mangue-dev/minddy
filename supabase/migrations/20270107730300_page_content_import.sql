-- Atomic import of encrypted database pages and their file references.
BEGIN;
CREATE FUNCTION public.import_encrypted_page_database(
  p_project uuid, p_page uuid, p_actor uuid, p_request uuid,
  p_revision integer, p_content_revision bigint,
  p_pages jsonb, p_files jsonb
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE target public.pages%ROWTYPE;
  previous public.page_database_imports%ROWTYPE;
  item jsonb;
  root jsonb;
  seen uuid[] := '{}';
BEGIN
  IF NOT public.lock_live_project_actor_access(p_project,p_actor) THEN
    RAISE EXCEPTION 'Project access required' USING ERRCODE='42501';
  END IF;
  SELECT * INTO target FROM public.pages WHERE id=p_page AND
    project_id=p_project AND deleted_at IS NULL FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Page not found' USING ERRCODE='P0002'; END IF;
  SELECT * INTO previous FROM public.page_database_imports WHERE id=p_request;
  IF FOUND THEN
    IF previous.page_id<>p_page OR previous.created_by<>p_actor THEN
      RAISE EXCEPTION 'Import request belongs to another target' USING ERRCODE='42501';
    END IF;
    RETURN jsonb_build_object('count',previous.page_count,'replayed',true);
  END IF;
  IF target.encryption_version<1 OR NOT target.page_is_database OR
      target.database_revision<>p_revision OR
      target.content_revision<>p_content_revision OR
      EXISTS(SELECT 1 FROM public.pages WHERE parent_id=p_page) OR
      jsonb_typeof(p_pages) IS DISTINCT FROM 'array' OR
      jsonb_array_length(p_pages) NOT BETWEEN 1 AND 1000 OR
      jsonb_typeof(p_files) IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION 'Import requires an unchanged empty database' USING ERRCODE='40001';
  END IF;
  root:=p_pages->0;
  IF root->>'id' IS DISTINCT FROM p_page::text OR
      root->>'parent_id' IS NOT NULL OR
      (root->>'page_is_database')::boolean IS NOT TRUE THEN
    RAISE EXCEPTION 'Invalid database root' USING ERRCODE='22023';
  END IF;
  UPDATE public.pages SET
    encrypted_content=root->>'encrypted_content',
    encryption_version=(root->>'encryption_version')::integer,
    title=NULL, icon=NULL, content=NULL, database_schema=NULL,
    database_title_name=NULL, property_values=NULL, search_text=NULL,
    page_is_database=(root->>'page_is_database')::boolean,
    page_has_values=(root->>'page_has_values')::boolean,
    page_is_blank=(root->>'page_is_blank')::boolean,
    database_revision=target.database_revision+1,
    created_at=coalesce((root->>'created_at')::timestamptz,target.created_at),
    updated_by=p_actor, updated_kind='human', updated_api_key_id=NULL
  WHERE id=p_page;
  seen:=array_append(seen,p_page);
  FOR item IN SELECT value FROM jsonb_array_elements(p_pages)
    WITH ORDINALITY AS rows(value,n) WHERE n>1 ORDER BY n LOOP
    IF (item->>'parent_id')::uuid <> ALL(seen) OR
        (item->>'id')::uuid = ANY(seen) OR
        (item->>'encryption_version')::integer<1 OR
        item->>'encrypted_content' IS NULL THEN
      RAISE EXCEPTION 'Invalid encrypted import child' USING ERRCODE='22023';
    END IF;
    INSERT INTO public.pages(id,project_id,parent_id,title,icon,content,
      database_schema,database_title_name,property_values,position,created_at,
      created_by,updated_by,updated_kind,encrypted_content,encryption_version,
      page_is_database,page_has_values,page_is_blank,search_text)
    VALUES((item->>'id')::uuid,p_project,(item->>'parent_id')::uuid,
      NULL,NULL,NULL,NULL,NULL,NULL,item->>'position',
      coalesce((item->>'created_at')::timestamptz,now()),p_actor,p_actor,'human',
      item->>'encrypted_content',(item->>'encryption_version')::integer,
      (item->>'page_is_database')::boolean,
      (item->>'page_has_values')::boolean,
      (item->>'page_is_blank')::boolean,NULL);
    seen:=array_append(seen,(item->>'id')::uuid);
  END LOOP;
  FOR item IN SELECT value FROM jsonb_array_elements(p_files) LOOP
    IF (item->>'page_id')::uuid = ANY(seen) THEN
      INSERT INTO public.page_files(id,project_id,page_id,storage_path,
        file_name,mime_type,size_bytes,created_by)
      VALUES((item->>'id')::uuid,p_project,(item->>'page_id')::uuid,
        item->>'storage_path',item->>'file_name',item->>'mime_type',
        (item->>'size_bytes')::bigint,p_actor);
    ELSE
      RAISE EXCEPTION 'File outside import' USING ERRCODE='22023';
    END IF;
  END LOOP;
  INSERT INTO public.page_database_imports(id,project_id,page_id,created_by,page_count)
    VALUES(p_request,p_project,p_page,p_actor,jsonb_array_length(p_pages)-1);
  RETURN jsonb_build_object('count',jsonb_array_length(p_pages)-1,'replayed',false);
END;
$$;
REVOKE ALL ON FUNCTION public.import_encrypted_page_database(
  uuid,uuid,uuid,uuid,integer,bigint,jsonb,jsonb)
  FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.import_encrypted_page_database(
  uuid,uuid,uuid,uuid,integer,bigint,jsonb,jsonb) TO service_role;
COMMIT;
