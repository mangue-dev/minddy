-- Apply encrypted page database edits without exposing cells to SQL.
BEGIN;
CREATE FUNCTION public.commit_page_content_batch(
  p_project_id uuid, p_actor_id uuid, p_parent_id uuid,
  p_expected jsonb, p_updates jsonb, p_expected_children uuid[] DEFAULT NULL,
  p_kind text DEFAULT 'human', p_mcp_key_id uuid DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE expected jsonb;
  item jsonb;
  current_row public.pages%ROWTYPE;
  child_ids uuid[];
  expected_ids uuid[] := '{}';
BEGIN
  IF NOT public.lock_live_project_actor_access(p_project_id,p_actor_id) THEN
    RETURN jsonb_build_object('status','not_found');
  END IF;
  IF jsonb_typeof(p_expected) IS DISTINCT FROM 'array' OR
      jsonb_typeof(p_updates) IS DISTINCT FROM 'array' OR
      jsonb_array_length(p_expected) NOT BETWEEN 1 AND 1001 OR
      jsonb_array_length(p_updates) NOT BETWEEN 1 AND 1001 OR
      p_kind NOT IN ('human','agent') THEN
    RAISE EXCEPTION 'Invalid encrypted page batch' USING ERRCODE='22023';
  END IF;
  -- The parent lock serializes new entries with schema and type conversions.
  PERFORM id FROM public.pages WHERE id=p_parent_id AND
    project_id=p_project_id AND deleted_at IS NULL FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('status','not_found'); END IF;
  SELECT array_agg(id ORDER BY id) INTO child_ids FROM public.pages
    WHERE parent_id=p_parent_id AND project_id=p_project_id;
  IF p_expected_children IS NOT NULL AND
      coalesce(child_ids,'{}'::uuid[]) <> p_expected_children THEN
    RETURN jsonb_build_object('status','conflict');
  END IF;
  PERFORM id FROM public.pages WHERE id IN (
    SELECT (value->>'id')::uuid FROM jsonb_array_elements(p_expected))
    AND project_id=p_project_id ORDER BY id FOR UPDATE;
  FOR expected IN SELECT value FROM jsonb_array_elements(p_expected) LOOP
    IF (expected->>'id')::uuid = ANY(expected_ids) THEN
      RAISE EXCEPTION 'Duplicate expected page' USING ERRCODE='22023';
    END IF;
    expected_ids := array_append(expected_ids,(expected->>'id')::uuid);
    SELECT * INTO current_row FROM public.pages
      WHERE id=(expected->>'id')::uuid AND project_id=p_project_id;
    IF current_row.id IS NULL OR current_row.deleted_at IS NOT NULL OR
        current_row.encryption_version < 1 OR
        current_row.content_revision IS DISTINCT FROM (expected->>'revision')::bigint OR
        current_row.database_revision IS DISTINCT FROM (expected->>'databaseRevision')::integer OR
        current_row.version IS DISTINCT FROM (expected->>'version')::integer OR
        current_row.parent_id IS DISTINCT FROM (expected->>'parentId')::uuid THEN
      RETURN jsonb_build_object('status','conflict');
    END IF;
  END LOOP;
  FOR item IN SELECT value FROM jsonb_array_elements(p_updates) LOOP
    IF NOT (item->>'id')::uuid = ANY(expected_ids) OR
        jsonb_typeof(item->'ciphertext') IS DISTINCT FROM 'string' OR
        (item->>'keyVersion')::integer < 1 OR
        jsonb_typeof(item->'isDatabase') IS DISTINCT FROM 'boolean' OR
        jsonb_typeof(item->'hasValues') IS DISTINCT FROM 'boolean' OR
        jsonb_typeof(item->'isBlank') IS DISTINCT FROM 'boolean' THEN
      RAISE EXCEPTION 'Invalid encrypted page update' USING ERRCODE='22023';
    END IF;
    UPDATE public.pages SET
      encrypted_content=item->>'ciphertext',
      encryption_version=(item->>'keyVersion')::integer,
      title=NULL, icon=NULL, content=NULL, database_schema=NULL,
      database_title_name=NULL, property_values=NULL, search_text=NULL,
      page_is_database=(item->>'isDatabase')::boolean,
      page_has_values=(item->>'hasValues')::boolean,
      page_is_blank=(item->>'isBlank')::boolean,
      database_revision=(item->>'databaseRevision')::integer,
      updated_by=p_actor_id, updated_kind=p_kind,
      updated_api_key_id=CASE WHEN p_kind='agent' THEN p_mcp_key_id ELSE NULL END
    WHERE id=(item->>'id')::uuid;
  END LOOP;
  RETURN jsonb_build_object('status','updated');
END;
$$;
REVOKE ALL ON FUNCTION public.commit_page_content_batch(
  uuid,uuid,uuid,jsonb,jsonb,uuid[],text,uuid)
  FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.commit_page_content_batch(
  uuid,uuid,uuid,jsonb,jsonb,uuid[],text,uuid) TO service_role;
COMMIT;
