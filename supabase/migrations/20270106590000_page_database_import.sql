-- Import one database atomically and make retries safe after a lost response.
CREATE TABLE public.page_database_imports (
  id uuid PRIMARY KEY,
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  page_id uuid NOT NULL REFERENCES public.pages(id) ON DELETE CASCADE,
  created_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  page_count integer NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.page_database_imports ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.page_database_imports FROM anon, authenticated;
GRANT ALL ON public.page_database_imports TO service_role;

CREATE FUNCTION public.import_page_database(
  p_project uuid, p_page uuid, p_actor uuid, p_request uuid,
  p_revision integer, p_pages jsonb, p_files jsonb
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  target public.pages;
  item jsonb;
  root jsonb;
  previous public.page_database_imports;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.projects WHERE id = p_project AND owner_id = p_actor)
     AND NOT EXISTS (SELECT 1 FROM public.project_members WHERE project_id = p_project AND user_id = p_actor) THEN
    RAISE EXCEPTION 'Project access required' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO target FROM public.pages WHERE id = p_page AND project_id = p_project AND deleted_at IS NULL FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Page not found' USING ERRCODE = 'P0002'; END IF;
  SELECT * INTO previous FROM public.page_database_imports WHERE id = p_request;
  IF FOUND THEN
    IF previous.page_id <> p_page OR previous.created_by <> p_actor THEN
      RAISE EXCEPTION 'Import request belongs to another target' USING ERRCODE = '42501';
    END IF;
    RETURN jsonb_build_object('count', previous.page_count, 'replayed', true);
  END IF;
  IF target.database_schema IS NULL OR target.database_schema <> '[]'::jsonb
     OR target.database_revision <> p_revision
     OR EXISTS (SELECT 1 FROM public.pages WHERE parent_id = p_page)
     OR jsonb_typeof(p_pages) IS DISTINCT FROM 'array' OR jsonb_array_length(p_pages) NOT BETWEEN 1 AND 1000
     OR jsonb_typeof(p_files) IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION 'Import requires an unchanged empty database' USING ERRCODE = '40001';
  END IF;
  root := p_pages->0;
  IF root->>'id' IS DISTINCT FROM p_page::text OR root->'database_schema' = 'null'::jsonb THEN
    RAISE EXCEPTION 'Invalid database root' USING ERRCODE = '22023';
  END IF;
  UPDATE public.pages SET
    title = CASE WHEN target.title = '' THEN root->>'title' ELSE target.title END,
    icon = coalesce(target.icon, root->>'icon'),
    content = coalesce(nullif(root->'content', 'null'::jsonb), '{"type":"doc","content":[]}'::jsonb),
    created_at = coalesce((root->>'created_at')::timestamptz, target.created_at),
    database_schema = root->'database_schema',
    database_title_name = root->>'database_title_name',
    updated_by = p_actor, updated_kind = 'human', updated_api_key_id = NULL
  WHERE id = p_page;
  FOR item IN SELECT value FROM jsonb_array_elements(p_pages) WITH ORDINALITY AS rows(value, n) WHERE n > 1 ORDER BY n LOOP
    -- Each parent must be the target or a page already created by this import.
    IF NOT EXISTS (SELECT 1 FROM jsonb_array_elements(p_pages) parent WHERE parent->>'id' = item->>'parent_id') THEN
      RAISE EXCEPTION 'Parent outside import' USING ERRCODE = '22023';
    END IF;
    INSERT INTO public.pages (id, project_id, parent_id, title, icon, content, database_schema, database_title_name, property_values, position, created_at, created_by, updated_by, updated_kind)
    VALUES ((item->>'id')::uuid, p_project, (item->>'parent_id')::uuid, item->>'title', item->>'icon', coalesce(nullif(item->'content', 'null'::jsonb), '{"type":"doc","content":[]}'::jsonb), nullif(item->'database_schema', 'null'::jsonb), item->>'database_title_name', item->'property_values', item->>'position', coalesce((item->>'created_at')::timestamptz, now()), p_actor, p_actor, 'human');
  END LOOP;
  FOR item IN SELECT value FROM jsonb_array_elements(p_files) LOOP
    IF NOT EXISTS (SELECT 1 FROM jsonb_array_elements(p_pages) page WHERE page->>'id' = item->>'page_id') THEN
      RAISE EXCEPTION 'File outside import' USING ERRCODE = '22023';
    END IF;
    INSERT INTO public.page_files (id, project_id, page_id, storage_path, file_name, mime_type, size_bytes, created_by)
    VALUES ((item->>'id')::uuid, p_project, (item->>'page_id')::uuid, item->>'storage_path', item->>'file_name', item->>'mime_type', (item->>'size_bytes')::bigint, p_actor);
  END LOOP;
  INSERT INTO public.page_database_imports (id, project_id, page_id, created_by, page_count)
  VALUES (p_request, p_project, p_page, p_actor, jsonb_array_length(p_pages) - 1);
  RETURN jsonb_build_object('count', jsonb_array_length(p_pages) - 1, 'replayed', false);
END;
$$;
REVOKE ALL ON FUNCTION public.import_page_database(uuid, uuid, uuid, uuid, integer, jsonb, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.import_page_database(uuid, uuid, uuid, uuid, integer, jsonb, jsonb) TO service_role;
