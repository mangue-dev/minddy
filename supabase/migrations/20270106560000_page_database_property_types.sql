-- Extend page properties without rewriting existing schemas or entry values.
CREATE OR REPLACE FUNCTION public.validate_page_database() RETURNS trigger
LANGUAGE plpgsql SET search_path = '' AS $$
DECLARE
  prop jsonb;
  choice jsonb;
  option_ids text[];
  option_names text[];
  previous_prop jsonb;
  parent_schema jsonb;
  parent_project uuid;
  parent_deleted timestamptz;
  entry record;
  person text;
  seen text[] := '{}';
BEGIN
  IF NEW.database_title_name IS NOT NULL AND (NEW.database_schema IS NULL OR length(btrim(NEW.database_title_name)) = 0 OR length(NEW.database_title_name) > 80) THEN
    RAISE EXCEPTION 'Invalid title column name' USING ERRCODE = '22023';
  END IF;
  IF TG_OP = 'INSERT' THEN
    NEW.database_revision := 0;
  ELSIF NEW.database_schema IS NOT DISTINCT FROM OLD.database_schema AND NEW.database_title_name IS NOT DISTINCT FROM OLD.database_title_name THEN
    NEW.database_revision := OLD.database_revision;
  END IF;
  IF TG_OP = 'UPDATE' AND (NEW.database_schema IS DISTINCT FROM OLD.database_schema OR NEW.database_title_name IS DISTINCT FROM OLD.database_title_name) THEN
    IF (NEW.database_schema IS NULL) <> (OLD.database_schema IS NULL) THEN
      RAISE EXCEPTION 'Page kind cannot change' USING ERRCODE = '22023';
    END IF;
    NEW.database_revision := OLD.database_revision + 1;
  END IF;
  IF NEW.database_schema IS NOT NULL THEN
    IF jsonb_array_length(NEW.database_schema) > 30 THEN
      RAISE EXCEPTION 'Too many properties' USING ERRCODE = '22023';
    END IF;
    FOR prop IN SELECT value FROM jsonb_array_elements(NEW.database_schema) LOOP
      IF jsonb_typeof(prop) <> 'object' OR
         coalesce(prop->>'id', '') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' OR
         jsonb_typeof(prop->'name') IS DISTINCT FROM 'string' OR
         length(btrim(prop->>'name')) = 0 OR length(prop->>'name') > 80 OR
         coalesce(prop->>'type', '') NOT IN ('text', 'number', 'select', 'multi_select', 'created_at', 'date', 'people', 'checkbox') OR
         prop->>'id' = ANY(seen) THEN
        RAISE EXCEPTION 'Invalid property schema' USING ERRCODE = '22023';
      END IF;
      IF prop ? 'options' THEN
        IF prop->>'type' NOT IN ('select', 'multi_select') OR jsonb_typeof(prop->'options') IS DISTINCT FROM 'array' THEN
          RAISE EXCEPTION 'Invalid options' USING ERRCODE = '22023'; END IF;
        IF jsonb_array_length(prop->'options') > 100 THEN
          RAISE EXCEPTION 'Too many options' USING ERRCODE = '22023'; END IF;
        option_ids := '{}'; option_names := '{}';
        FOR choice IN SELECT value FROM jsonb_array_elements(prop->'options') LOOP
          IF jsonb_typeof(choice) <> 'object' OR
             coalesce(choice->>'id', '') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' OR
             jsonb_typeof(choice->'name') IS DISTINCT FROM 'string' OR
             length(btrim(choice->>'name')) = 0 OR length(choice->>'name') > 80 OR
             coalesce(choice->>'color', '') !~* '^#[0-9a-f]{6}$' OR
             choice->>'id' = ANY(option_ids) OR lower(btrim(choice->>'name')) = ANY(option_names) THEN
            RAISE EXCEPTION 'Invalid option' USING ERRCODE = '22023'; END IF;
          option_ids := array_append(option_ids, choice->>'id');
          option_names := array_append(option_names, lower(btrim(choice->>'name')));
        END LOOP;
      END IF;
      seen := array_append(seen, prop->>'id');
      IF TG_OP = 'UPDATE' THEN
        SELECT value INTO previous_prop FROM jsonb_array_elements(OLD.database_schema)
          WHERE value->>'id' = prop->>'id';
        IF previous_prop IS NOT NULL AND previous_prop->>'type' <> prop->>'type' THEN
          RAISE EXCEPTION 'Property types cannot change' USING ERRCODE = '22023';
        END IF;
      END IF;
    END LOOP;
  END IF;

  IF NEW.parent_id IS NOT NULL THEN
    SELECT database_schema, project_id, deleted_at INTO parent_schema, parent_project, parent_deleted
      FROM public.pages WHERE id = NEW.parent_id;
    IF parent_project IS DISTINCT FROM NEW.project_id THEN
      RAISE EXCEPTION 'Parent belongs to another project' USING ERRCODE = '22023';
    END IF;
    IF NEW.database_schema IS NOT NULL AND parent_schema IS NOT NULL THEN
      RAISE EXCEPTION 'Database entries must be documents' USING ERRCODE = '22023';
    END IF;
  END IF;

  -- Unchanged values may refer to removed properties or former project members.
  IF TG_OP = 'INSERT' OR NEW.property_values IS DISTINCT FROM OLD.property_values OR
     (NEW.parent_id IS DISTINCT FROM OLD.parent_id AND parent_schema IS NOT NULL) THEN
    IF NEW.property_values <> '{}'::jsonb AND (parent_schema IS NULL OR parent_deleted IS NOT NULL) THEN
      RAISE EXCEPTION 'Values require a live database' USING ERRCODE = '22023';
    END IF;
    FOR entry IN SELECT key, value FROM jsonb_each(NEW.property_values) LOOP
      IF TG_OP = 'UPDATE' AND NEW.parent_id IS NOT DISTINCT FROM OLD.parent_id AND
         entry.value IS NOT DISTINCT FROM OLD.property_values->entry.key THEN CONTINUE; END IF;
      SELECT value INTO prop FROM jsonb_array_elements(parent_schema) WHERE value->>'id' = entry.key;
      IF prop IS NULL THEN RAISE EXCEPTION 'Unknown property' USING ERRCODE = '22023'; END IF;
      IF prop->>'type' = 'created_at' THEN
        RAISE EXCEPTION 'Creation time is read-only' USING ERRCODE = '22023'; END IF;
      IF entry.value = 'null'::jsonb THEN CONTINUE; END IF;
      CASE prop->>'type'
        WHEN 'number' THEN
          IF jsonb_typeof(entry.value) <> 'number' OR abs((entry.value #>> '{}')::numeric) > 1.7976931348623157e308 THEN
            RAISE EXCEPTION 'Invalid number' USING ERRCODE = '22023'; END IF;
        WHEN 'select' THEN
          IF jsonb_typeof(entry.value) <> 'string' OR NOT EXISTS (
            SELECT 1 FROM jsonb_array_elements(prop->'options') o WHERE o->>'id' = entry.value #>> '{}'
          ) THEN RAISE EXCEPTION 'Invalid selection' USING ERRCODE = '22023'; END IF;
        WHEN 'multi_select' THEN
          IF jsonb_typeof(entry.value) <> 'array' THEN
            RAISE EXCEPTION 'Invalid selections' USING ERRCODE = '22023'; END IF;
          IF jsonb_array_length(entry.value) > 100 OR
             (SELECT count(*) <> count(DISTINCT x) FROM jsonb_array_elements(entry.value) x) OR
             EXISTS (SELECT 1 FROM jsonb_array_elements(entry.value) x WHERE jsonb_typeof(x) <> 'string' OR NOT EXISTS (
               SELECT 1 FROM jsonb_array_elements(prop->'options') o WHERE o->>'id' = x #>> '{}'
             )) THEN RAISE EXCEPTION 'Invalid selections' USING ERRCODE = '22023'; END IF;
        WHEN 'text' THEN
          IF jsonb_typeof(entry.value) <> 'string' OR length(entry.value #>> '{}') > 2000 THEN
            RAISE EXCEPTION 'Invalid text' USING ERRCODE = '22023'; END IF;
        WHEN 'checkbox' THEN
          IF jsonb_typeof(entry.value) <> 'boolean' THEN
            RAISE EXCEPTION 'Invalid checkbox' USING ERRCODE = '22023'; END IF;
        WHEN 'date' THEN
          IF jsonb_typeof(entry.value) <> 'string' OR (entry.value #>> '{}') !~ '^\d{4}-\d{2}-\d{2}$' THEN
            RAISE EXCEPTION 'Invalid date' USING ERRCODE = '22023'; END IF;
          PERFORM (entry.value #>> '{}')::date;
        WHEN 'people' THEN
          IF jsonb_typeof(entry.value) <> 'array' OR jsonb_array_length(entry.value) > 100 THEN
            RAISE EXCEPTION 'Invalid people' USING ERRCODE = '22023'; END IF;
          IF EXISTS (SELECT 1 FROM jsonb_array_elements(entry.value) x WHERE jsonb_typeof(x) <> 'string') OR
             (SELECT count(*) <> count(DISTINCT x) FROM jsonb_array_elements_text(entry.value) x) THEN
            RAISE EXCEPTION 'Invalid people' USING ERRCODE = '22023'; END IF;
      END CASE;
      IF prop->>'type' = 'people' THEN
        FOR person IN SELECT value FROM jsonb_array_elements_text(
          entry.value
        ) LOOP
          IF NOT EXISTS (SELECT 1 FROM public.projects WHERE id = NEW.project_id AND owner_id = person::uuid) AND
             NOT EXISTS (SELECT 1 FROM public.project_members WHERE project_id = NEW.project_id AND user_id = person::uuid) THEN
            RAISE EXCEPTION 'Person is not a project member' USING ERRCODE = '22023';
          END IF;
        END LOOP;
      END IF;
    END LOOP;
  END IF;
  RETURN NEW;
END;
$$;
CREATE OR REPLACE FUNCTION public.update_page_database_guarded(
  p_project_id uuid, p_page_id uuid, p_actor_id uuid, p_input jsonb
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  target public.pages%ROWTYPE;
  container public.pages%ROWTYPE;
  parent uuid;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.projects p WHERE p.id = p_project_id AND p.deleted_at IS NULL AND
      (p.owner_id = p_actor_id OR EXISTS (
        SELECT 1 FROM public.project_members m WHERE m.project_id = p.id AND m.user_id = p_actor_id
      ))
  ) THEN RETURN jsonb_build_object('status', 'not_found'); END IF;
  SELECT parent_id INTO parent FROM public.pages WHERE id = p_page_id AND project_id = p_project_id AND deleted_at IS NULL;
  IF p_input->>'operation' = 'value' THEN
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
      updated_kind = CASE WHEN p_input->>'kind' = 'agent' THEN 'agent' ELSE 'human' END, updated_api_key_id = NULL WHERE id = p_page_id;
  ELSIF p_input->>'operation' = 'value' THEN
    IF target.parent_id IS DISTINCT FROM container.id OR NOT EXISTS (
      SELECT 1 FROM jsonb_array_elements(container.database_schema) p WHERE p->>'id' = p_input->>'propertyId' AND p->>'type' <> 'created_at'
    ) THEN RETURN jsonb_build_object('status', 'conflict'); END IF;
    IF coalesce(target.property_values->(p_input->>'propertyId'), 'null'::jsonb) IS DISTINCT FROM p_input->'expected' THEN
      RETURN jsonb_build_object('status', 'conflict'); END IF;
    UPDATE public.pages SET property_values = property_values || jsonb_build_object(p_input->>'propertyId', p_input->'value'),
      updated_by = p_actor_id, updated_kind = CASE WHEN p_input->>'kind' = 'agent' THEN 'agent' ELSE 'human' END, updated_api_key_id = NULL WHERE id = p_page_id;
  ELSE RAISE EXCEPTION 'Unknown operation' USING ERRCODE = '22023'; END IF;
  RETURN jsonb_build_object('status', 'updated');
END;
$$;

-- Remove deleted option references as part of the schema transaction, including trash.
CREATE OR REPLACE FUNCTION public.remove_deleted_database_properties() RETURNS trigger
LANGUAGE plpgsql SET search_path = '' AS $$
DECLARE
  removed text[];
  prop jsonb;
  old_prop jsonb;
  removed_options text[];
BEGIN
  SELECT array_agg(p->>'id') INTO removed FROM jsonb_array_elements(OLD.database_schema) p
    WHERE NOT EXISTS (SELECT 1 FROM jsonb_array_elements(NEW.database_schema) n WHERE n->>'id' = p->>'id');
  IF removed IS NOT NULL THEN
    UPDATE public.pages SET property_values = property_values - removed,
      updated_by = NEW.updated_by, updated_kind = NEW.updated_kind
      WHERE parent_id = NEW.id AND property_values ?| removed;
  END IF;
  FOR prop IN SELECT value FROM jsonb_array_elements(NEW.database_schema) WHERE value->>'type' IN ('select', 'multi_select') LOOP
    SELECT value INTO old_prop FROM jsonb_array_elements(OLD.database_schema) WHERE value->>'id' = prop->>'id';
    SELECT array_agg(o->>'id') INTO removed_options FROM jsonb_array_elements(old_prop->'options') o
      WHERE NOT EXISTS (SELECT 1 FROM jsonb_array_elements(prop->'options') n WHERE n->>'id' = o->>'id');
    IF removed_options IS NULL THEN CONTINUE; END IF;
    IF prop->>'type' = 'select' THEN
      UPDATE public.pages SET property_values = property_values - (prop->>'id'),
        updated_by = NEW.updated_by, updated_kind = NEW.updated_kind
        WHERE parent_id = NEW.id AND property_values->>(prop->>'id') = ANY(removed_options);
    ELSE
      UPDATE public.pages SET property_values = jsonb_set(property_values, ARRAY[prop->>'id'],
        coalesce((SELECT jsonb_agg(v) FROM jsonb_array_elements(property_values->(prop->>'id')) v
          WHERE NOT (v #>> '{}') = ANY(removed_options)), '[]'::jsonb)),
        updated_by = NEW.updated_by, updated_kind = NEW.updated_kind
        WHERE parent_id = NEW.id AND property_values->(prop->>'id') ?| removed_options;
    END IF;
  END LOOP;
  RETURN NEW;
END;
$$;
