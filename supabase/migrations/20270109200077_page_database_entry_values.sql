-- MIN-784: write several cells of one database entry in a single call.
--
-- `values` carries the new cells and `expected` their previous values, keyed by
-- property id. The whole set is checked under the same parent and entry locks
-- as a single-cell `value` edit, and one stale cell refuses the entire write.
-- Encrypted pages take the application batch writer instead; this function
-- still refuses them.

CREATE OR REPLACE FUNCTION public.update_page_database_guarded(p_project_id uuid, p_page_id uuid, p_actor_id uuid, p_input jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  target public.pages%ROWTYPE;
  container public.pages%ROWTYPE;
  parent uuid;
BEGIN
  IF NOT public.lock_live_project_actor_access(p_project_id, p_actor_id) THEN
    RETURN jsonb_build_object('status', 'not_found');
  END IF;
  IF EXISTS(SELECT 1 FROM public.pages WHERE id=p_page_id AND encryption_version>0) THEN
    RAISE EXCEPTION 'page_content_legacy_writer_refused' USING ERRCODE='23514';
  END IF;
  SELECT parent_id INTO parent FROM public.pages WHERE id = p_page_id AND project_id = p_project_id AND deleted_at IS NULL;
  IF p_input->>'operation' IN ('value', 'values') THEN
    SELECT * INTO container FROM public.pages WHERE id = parent AND deleted_at IS NULL FOR UPDATE;
    IF container.database_schema IS NULL THEN RETURN jsonb_build_object('status', 'not_found'); END IF;
  END IF;
  SELECT * INTO target FROM public.pages WHERE id = p_page_id AND project_id = p_project_id AND deleted_at IS NULL FOR UPDATE;
  IF target.id IS NULL THEN RETURN jsonb_build_object('status', 'not_found'); END IF;
  IF p_input->>'operation' = 'schema' THEN
    IF target.database_schema IS NULL THEN RETURN jsonb_build_object('status', 'not_found'); END IF;
    IF target.database_revision <> (p_input->>'revision')::integer THEN
      RETURN jsonb_build_object('status', 'conflict'); END IF;
    UPDATE public.pages SET database_schema = p_input->'schema',
      database_title_name = CASE WHEN p_input ? 'titleName' THEN p_input->>'titleName' ELSE database_title_name END,
      updated_by = p_actor_id,
      updated_kind = CASE WHEN p_input->>'kind' = 'agent' THEN 'agent' ELSE 'human' END, updated_api_key_id = CASE WHEN p_input->>'kind' = 'agent' THEN (p_input->>'mcpKeyId')::uuid ELSE NULL END WHERE id = p_page_id;
  ELSIF p_input->>'operation' = 'value' THEN
    IF target.parent_id IS DISTINCT FROM container.id OR NOT EXISTS (
      SELECT 1 FROM jsonb_array_elements(container.database_schema) p WHERE p->>'id' = p_input->>'propertyId' AND p->>'type' <> 'created_at'
    ) THEN RETURN jsonb_build_object('status', 'conflict'); END IF;
    IF coalesce(target.property_values->(p_input->>'propertyId'), 'null'::jsonb) IS DISTINCT FROM p_input->'expected' THEN
      RETURN jsonb_build_object('status', 'conflict'); END IF;
    UPDATE public.pages SET property_values = property_values || jsonb_build_object(p_input->>'propertyId', p_input->'value'),
      updated_by = p_actor_id, updated_kind = CASE WHEN p_input->>'kind' = 'agent' THEN 'agent' ELSE 'human' END, updated_api_key_id = CASE WHEN p_input->>'kind' = 'agent' THEN (p_input->>'mcpKeyId')::uuid ELSE NULL END WHERE id = p_page_id;
  ELSIF p_input->>'operation' = 'values' THEN
    IF jsonb_typeof(p_input->'values') IS DISTINCT FROM 'object' OR jsonb_typeof(p_input->'expected') IS DISTINCT FROM 'object'
       OR p_input->'values' = '{}'::jsonb THEN
      RAISE EXCEPTION 'Invalid entry values' USING ERRCODE = '22023';
    END IF;
    IF target.parent_id IS DISTINCT FROM container.id OR EXISTS (
      SELECT 1 FROM jsonb_object_keys(p_input->'values') k WHERE NOT EXISTS (
        SELECT 1 FROM jsonb_array_elements(container.database_schema) p WHERE p->>'id' = k AND p->>'type' <> 'created_at')
    ) THEN RETURN jsonb_build_object('status', 'conflict'); END IF;
    IF EXISTS (
      SELECT 1 FROM jsonb_object_keys(p_input->'values') k
      WHERE NOT (p_input->'expected' ? k)
        OR coalesce(target.property_values->k, 'null'::jsonb) IS DISTINCT FROM p_input->'expected'->k
    ) THEN RETURN jsonb_build_object('status', 'conflict'); END IF;
    UPDATE public.pages SET property_values = property_values || p_input->'values',
      updated_by = p_actor_id, updated_kind = CASE WHEN p_input->>'kind' = 'agent' THEN 'agent' ELSE 'human' END, updated_api_key_id = CASE WHEN p_input->>'kind' = 'agent' THEN (p_input->>'mcpKeyId')::uuid ELSE NULL END WHERE id = p_page_id;
  ELSE RAISE EXCEPTION 'Unknown operation' USING ERRCODE = '22023'; END IF;
  RETURN jsonb_build_object('status', 'updated');
END;
$function$;
