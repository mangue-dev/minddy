-- Return the guarded conversion projection so clients can show the confirmed intent immediately.
CREATE OR REPLACE FUNCTION public.convert_page_database_guarded(
  p_project_id uuid, p_page_id uuid, p_actor_id uuid, p_input jsonb
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  target public.pages%ROWTYPE;
  source jsonb;
  replacement jsonb;
  target_type text := p_input->>'targetType';
  column_id text := p_input->>'propertyId';
  column_name text;
  snapshot jsonb;
  token text;
  item record;
  converted jsonb;
  converted_cells jsonb := '{}';
  choices jsonb := '[]';
  choice_id text;
  bad_count integer := 0;
  total_count integer := 0;
  previous_guard text;
BEGIN
  IF NOT public.lock_live_project_actor_access(p_project_id, p_actor_id) THEN
    RETURN jsonb_build_object('status', 'not_found');
  END IF;
  SELECT * INTO target FROM public.pages WHERE id = p_page_id AND project_id = p_project_id AND deleted_at IS NULL FOR UPDATE;
  IF target.database_schema IS NULL THEN RETURN jsonb_build_object('status', 'not_found'); END IF;
  IF target.database_revision IS DISTINCT FROM (p_input->>'revision')::integer THEN RETURN jsonb_build_object('status', 'conflict'); END IF;
  SELECT p INTO source FROM jsonb_array_elements(target.database_schema) p WHERE p->>'id' = column_id;
  column_name := btrim(coalesce(p_input->>'name', source->>'name'));
  IF source IS NULL OR target_type IS NULL OR target_type NOT IN ('text','number','select','multi_select','date','checkbox','people','created_at') OR
     length(column_name) NOT BETWEEN 1 AND 80 OR jsonb_typeof(p_input->'preview') IS DISTINCT FROM 'boolean' THEN
    RAISE EXCEPTION 'Invalid column conversion' USING ERRCODE = '22023';
  END IF;
  -- Value edits use the same parent lock. Child locks also serialize direct writes.
  PERFORM id FROM public.pages WHERE parent_id = p_page_id ORDER BY id FOR UPDATE;
  SELECT coalesce(jsonb_agg(jsonb_build_array(id, property_values->column_id, created_at) ORDER BY id), '[]') INTO snapshot
    FROM public.pages WHERE parent_id = p_page_id;
  token := md5(jsonb_build_array(p_page_id, target.database_revision, column_id, target_type, column_name, snapshot)::text);
  IF NOT (p_input->>'preview')::boolean AND token IS DISTINCT FROM p_input->>'token' THEN RETURN jsonb_build_object('status', 'conflict'); END IF;
  IF source->>'type' IN ('select','multi_select') AND target_type IN ('select','multi_select') THEN choices := coalesce(source->'options', '[]'); END IF;
  FOR item IN SELECT id, CASE WHEN source->>'type' = 'created_at' THEN to_jsonb(to_char(created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')) ELSE property_values->column_id END AS cell FROM public.pages WHERE parent_id = p_page_id ORDER BY id LOOP
    total_count := total_count + 1;
    converted := public.convert_database_cell(source, target_type, item.cell);
    IF target_type IN ('select','multi_select') AND source->>'type' NOT IN ('select','multi_select') AND converted IS NOT NULL AND converted <> 'null'::jsonb THEN
      SELECT o->>'id' INTO choice_id FROM jsonb_array_elements(choices) o WHERE lower(o->>'name') = lower(converted #>> '{}');
      IF choice_id IS NULL THEN
        IF jsonb_array_length(choices) >= 100 THEN converted := NULL;
        ELSE
          -- Stable IDs let edits queued after the preview reference the committed options.
          choice_id := md5(token || ':' || lower(converted #>> '{}'))::uuid::text;
          choices := choices || jsonb_build_array(jsonb_build_object('id',choice_id,'name',converted #>> '{}','color','#3b82f6'));
        END IF;
      END IF;
      IF converted IS NOT NULL THEN converted := CASE WHEN target_type = 'select' THEN to_jsonb(choice_id) ELSE jsonb_build_array(choice_id) END; END IF;
    END IF;
    IF converted IS NULL THEN bad_count := bad_count + 1; END IF;
    converted_cells := converted_cells || jsonb_build_object(item.id::text, converted);
  END LOOP;
  replacement := (source - 'options') || jsonb_build_object('name',column_name,'type',target_type);
  IF target_type IN ('select','multi_select') THEN replacement := replacement || jsonb_build_object('options',choices); END IF;
  IF (p_input->>'preview')::boolean OR (bad_count > 0 AND coalesce(p_input->>'confirmLoss','false') <> 'true') THEN
    RETURN jsonb_build_object('status','preview','totalCount',total_count,'incompatibleCount',bad_count,'token',token,'column',replacement,'values',converted_cells);
  END IF;
  IF source->>'type' = target_type THEN
    UPDATE public.pages SET database_schema = (SELECT jsonb_agg(CASE WHEN p->>'id' = column_id THEN replacement ELSE p END ORDER BY ordinal) FROM jsonb_array_elements(database_schema) WITH ORDINALITY a(p,ordinal)),
      updated_by = p_actor_id, updated_kind = CASE WHEN p_input->>'kind' = 'agent' THEN 'agent' ELSE 'human' END,
      updated_api_key_id = CASE WHEN p_input->>'kind' = 'agent' THEN (p_input->>'mcpKeyId')::uuid ELSE NULL END WHERE id = p_page_id;
    RETURN jsonb_build_object('status','updated','values',converted_cells);
  END IF;
  -- Remove the old representation before installing the new schema, in one transaction.
  UPDATE public.pages SET property_values = property_values - column_id,
    updated_by = p_actor_id, updated_kind = CASE WHEN p_input->>'kind' = 'agent' THEN 'agent' ELSE 'human' END,
    updated_api_key_id = CASE WHEN p_input->>'kind' = 'agent' THEN (p_input->>'mcpKeyId')::uuid ELSE NULL END WHERE parent_id = p_page_id AND property_values ? column_id;
  previous_guard := current_setting('minddy.database_conversion', true);
  PERFORM set_config('minddy.database_conversion',p_page_id::text || ':' || column_id,true);
  UPDATE public.pages SET database_schema = (SELECT jsonb_agg(CASE WHEN p->>'id' = column_id THEN replacement ELSE p END ORDER BY ordinal) FROM jsonb_array_elements(database_schema) WITH ORDINALITY a(p,ordinal)),
    updated_by = p_actor_id, updated_kind = CASE WHEN p_input->>'kind' = 'agent' THEN 'agent' ELSE 'human' END,
    updated_api_key_id = CASE WHEN p_input->>'kind' = 'agent' THEN (p_input->>'mcpKeyId')::uuid ELSE NULL END WHERE id = p_page_id;
  PERFORM set_config('minddy.database_conversion',coalesce(previous_guard,''),true);
  IF target_type <> 'created_at' THEN
    UPDATE public.pages SET property_values = property_values || jsonb_build_object(column_id, converted_cells->id::text),
      updated_by = p_actor_id, updated_kind = CASE WHEN p_input->>'kind' = 'agent' THEN 'agent' ELSE 'human' END,
      updated_api_key_id = CASE WHEN p_input->>'kind' = 'agent' THEN (p_input->>'mcpKeyId')::uuid ELSE NULL END WHERE parent_id = p_page_id AND converted_cells->id::text <> 'null'::jsonb;
  END IF;
  RETURN jsonb_build_object('status','updated','values',converted_cells);
END;
$$;
REVOKE ALL ON FUNCTION public.convert_page_database_guarded(uuid,uuid,uuid,jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.convert_page_database_guarded(uuid,uuid,uuid,jsonb) TO service_role;
