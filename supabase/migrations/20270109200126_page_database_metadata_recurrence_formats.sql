-- MIN-990: more database properties.
--
-- * Three more read-only metadata properties next to `created_at`:
--   `updated_at`, `created_by` and `updated_by`, read from the entry's row.
-- * A date value may recur: an ISO 8601 repeating interval around a plain
--   date, `R/<date>/P1D|P1W|P1M|P1Y`. Readers compute the next occurrence;
--   nothing rewrites the stored value when a day passes.
-- * A number property may carry a display format (`number_format`, and
--   `currency` for a currency). Stored values stay plain numbers.
--
-- Every function keeps accepting what the previous release writes.
BEGIN;

CREATE OR REPLACE FUNCTION public.validate_page_database()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
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
  plain_date text;
BEGIN
  IF NEW.encryption_version > 0 THEN RETURN NEW; END IF;
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
         coalesce(prop->>'type', '') NOT IN ('text', 'number', 'select', 'multi_select', 'created_at', 'updated_at', 'created_by', 'updated_by', 'date', 'people', 'checkbox') OR
         prop->>'id' = ANY(seen) THEN
        RAISE EXCEPTION 'Invalid property schema' USING ERRCODE = '22023';
      END IF;
      IF prop ? 'number_format' OR prop ? 'currency' THEN
        IF prop->>'type' <> 'number' OR
           coalesce(prop->>'number_format', '') NOT IN ('number', 'percent', 'currency') OR
           (prop->>'number_format' = 'currency') <> (prop ? 'currency') OR
           (prop ? 'currency' AND (jsonb_typeof(prop->'currency') IS DISTINCT FROM 'string' OR prop->>'currency' !~ '^[A-Z]{3}$')) THEN
          RAISE EXCEPTION 'Invalid number format' USING ERRCODE = '22023'; END IF;
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
        IF previous_prop IS NOT NULL AND previous_prop->>'type' <> prop->>'type' AND NOT (
          current_user = 'postgres' AND
          coalesce(current_setting('minddy.database_conversion', true), '') = NEW.id::text || ':' || (prop->>'id')
        ) THEN
          RAISE EXCEPTION 'Property types cannot change' USING ERRCODE = '22023';
        END IF;
      END IF;
    END LOOP;
  END IF;

  IF NEW.parent_id IS NOT NULL THEN
    -- Inserts need a SHARE lock so a conversion cannot miss their new row.
    -- Updates already hold the child row and must not reverse the converter's
    -- parent-to-child order by locking the parent from this row trigger.
    IF TG_OP = 'INSERT' THEN
      SELECT database_schema, project_id, deleted_at
        INTO parent_schema, parent_project, parent_deleted
        FROM public.pages
        WHERE id = NEW.parent_id
        FOR SHARE;
    ELSE
      SELECT database_schema, project_id, deleted_at
        INTO parent_schema, parent_project, parent_deleted
        FROM public.pages
        WHERE id = NEW.parent_id;
    END IF;
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
      IF prop->>'type' IN ('created_at', 'updated_at', 'created_by', 'updated_by') THEN
        RAISE EXCEPTION 'Entry metadata is read-only' USING ERRCODE = '22023'; END IF;
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
          IF jsonb_typeof(entry.value) <> 'string' THEN
            RAISE EXCEPTION 'Invalid date' USING ERRCODE = '22023'; END IF;
          -- A recurring date is an ISO 8601 repeating interval around a plain date.
          plain_date := coalesce(substring(entry.value #>> '{}' FROM '^R/([^/]+)/P1[DWMY]$'), entry.value #>> '{}');
          IF plain_date !~ '^\d{4}-\d{2}-\d{2}(T([01]\d|2[0-3]):[0-5]\d:[0-5]\d(\.\d{1,3})?(Z|[+-](0\d|1[0-5]):[0-5]\d))?$' THEN
            RAISE EXCEPTION 'Invalid date' USING ERRCODE = '22023'; END IF;
          PERFORM substring(plain_date FROM 1 FOR 10)::date;
          IF length(plain_date) > 10 THEN
            PERFORM plain_date::timestamptz;
          END IF;
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
$function$;

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
      SELECT 1 FROM jsonb_array_elements(container.database_schema) p WHERE p->>'id' = p_input->>'propertyId' AND p->>'type' NOT IN ('created_at', 'updated_at', 'created_by', 'updated_by')
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
        SELECT 1 FROM jsonb_array_elements(container.database_schema) p WHERE p->>'id' = k AND p->>'type' NOT IN ('created_at', 'updated_at', 'created_by', 'updated_by'))
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

CREATE OR REPLACE FUNCTION public.convert_page_database_guarded(p_project_id uuid, p_page_id uuid, p_actor_id uuid, p_input jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
  IF EXISTS(SELECT 1 FROM public.pages WHERE id=p_page_id AND encryption_version>0) THEN
    RAISE EXCEPTION 'page_content_legacy_writer_refused' USING ERRCODE='23514';
  END IF;
  SELECT * INTO target FROM public.pages WHERE id = p_page_id AND project_id = p_project_id AND deleted_at IS NULL FOR UPDATE;
  IF target.database_schema IS NULL THEN RETURN jsonb_build_object('status', 'not_found'); END IF;
  IF target.database_revision IS DISTINCT FROM (p_input->>'revision')::integer THEN RETURN jsonb_build_object('status', 'conflict'); END IF;
  SELECT p INTO source FROM jsonb_array_elements(target.database_schema) p WHERE p->>'id' = column_id;
  column_name := btrim(coalesce(p_input->>'name', source->>'name'));
  IF source IS NULL OR target_type IS NULL OR target_type NOT IN ('text','number','select','multi_select','date','checkbox','people','created_at','updated_at','created_by','updated_by') OR
     length(column_name) NOT BETWEEN 1 AND 80 OR jsonb_typeof(p_input->'preview') IS DISTINCT FROM 'boolean' THEN
    RAISE EXCEPTION 'Invalid column conversion' USING ERRCODE = '22023';
  END IF;
  -- Value edits use the same parent lock. Child locks also serialize direct writes.
  PERFORM id FROM public.pages WHERE parent_id = p_page_id ORDER BY id FOR UPDATE;
  SELECT coalesce(jsonb_agg(jsonb_build_array(id, property_values->column_id, created_at) || CASE WHEN source->>'type' = 'updated_at' THEN jsonb_build_array(updated_at) ELSE '[]'::jsonb END ORDER BY id), '[]') INTO snapshot
    FROM public.pages WHERE parent_id = p_page_id;
  token := md5(jsonb_build_array(p_page_id, target.database_revision, column_id, target_type, column_name, snapshot)::text);
  IF NOT (p_input->>'preview')::boolean AND token IS DISTINCT FROM p_input->>'token' THEN RETURN jsonb_build_object('status', 'conflict'); END IF;
  IF source->>'type' IN ('select','multi_select') AND target_type IN ('select','multi_select') THEN choices := coalesce(source->'options', '[]'); END IF;
  FOR item IN SELECT id, CASE WHEN source->>'type' = 'created_at' THEN to_jsonb(to_char(created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')) WHEN source->>'type' = 'updated_at' THEN to_jsonb(to_char(updated_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')) WHEN source->>'type' IN ('created_by', 'updated_by') THEN NULL ELSE property_values->column_id END AS cell FROM public.pages WHERE parent_id = p_page_id ORDER BY id LOOP
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
  replacement := (CASE WHEN target_type = 'number' THEN source - 'options' ELSE source - 'options' - 'number_format' - 'currency' END) || jsonb_build_object('name',column_name,'type',target_type);
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
  IF target_type NOT IN ('created_at', 'updated_at', 'created_by', 'updated_by') THEN
    UPDATE public.pages SET property_values = property_values || jsonb_build_object(column_id, converted_cells->id::text),
      updated_by = p_actor_id, updated_kind = CASE WHEN p_input->>'kind' = 'agent' THEN 'agent' ELSE 'human' END,
      updated_api_key_id = CASE WHEN p_input->>'kind' = 'agent' THEN (p_input->>'mcpKeyId')::uuid ELSE NULL END WHERE parent_id = p_page_id AND converted_cells->id::text <> 'null'::jsonb;
  END IF;
  RETURN jsonb_build_object('status','updated','values',converted_cells);
END;
$function$;

CREATE OR REPLACE FUNCTION public.convert_database_cell(source jsonb, target_type text, cell jsonb)
RETURNS jsonb LANGUAGE plpgsql IMMUTABLE SET search_path = '' AS $$
DECLARE
  source_type text := source->>'type';
  label text;
BEGIN
  IF source_type = target_type THEN RETURN coalesce(cell, 'null'::jsonb); END IF;
  IF cell IS NULL OR cell IN ('null'::jsonb, '""'::jsonb, '[]'::jsonb) THEN RETURN 'null'::jsonb; END IF;
  IF target_type IN ('people', 'created_at', 'updated_at', 'created_by', 'updated_by') OR source_type IN ('people', 'created_by', 'updated_by') THEN RETURN NULL; END IF;
  IF source_type IN ('select', 'multi_select') THEN
    -- Legacy references must not silently disappear when converting their labels.
    IF source_type = 'select' THEN
      IF jsonb_typeof(cell) <> 'string' OR NOT EXISTS (
        SELECT 1 FROM jsonb_array_elements(source->'options') o WHERE o->>'id' = cell #>> '{}'
      ) THEN RETURN NULL; END IF;
    ELSE
      IF jsonb_typeof(cell) <> 'array' THEN RETURN NULL; END IF;
      IF (SELECT count(*) <> count(DISTINCT v) FROM jsonb_array_elements(cell) v) OR EXISTS (
        SELECT 1 FROM jsonb_array_elements(cell) v WHERE jsonb_typeof(v) <> 'string' OR NOT EXISTS (
          SELECT 1 FROM jsonb_array_elements(source->'options') o WHERE o->>'id' = v #>> '{}'
        )
      ) THEN RETURN NULL; END IF;
    END IF;
    IF target_type IN ('select', 'multi_select') THEN
      IF target_type = 'multi_select' THEN RETURN jsonb_build_array(cell); END IF;
      IF jsonb_array_length(cell) = 1 THEN RETURN cell->0; END IF;
      RETURN NULL;
    END IF;
    IF source_type = 'multi_select' THEN
      IF target_type <> 'text' AND jsonb_array_length(cell) <> 1 THEN RETURN NULL; END IF;
      SELECT string_agg(o->>'name', ', ' ORDER BY v.ordinality) INTO label
        FROM jsonb_array_elements_text(cell) WITH ORDINALITY v(id, ordinality)
        JOIN jsonb_array_elements(source->'options') o ON o->>'id' = v.id;
    ELSE
      SELECT o->>'name' INTO label FROM jsonb_array_elements(source->'options') o WHERE o->>'id' = cell #>> '{}';
    END IF;
    IF label IS NULL THEN RETURN NULL; END IF;
  ELSE label := cell #>> '{}'; END IF;
  -- A recurring date converts as the date its rhythm starts from.
  IF source_type = 'date' THEN label := coalesce(substring(label FROM '^R/([^/]+)/P1[DWMY]$'), label); END IF;
  IF target_type = 'text' THEN
    IF length(label) <= 2000 THEN RETURN to_jsonb(label); END IF;
  ELSIF target_type IN ('select', 'multi_select') THEN
    IF length(btrim(label)) BETWEEN 1 AND 80 THEN RETURN to_jsonb(btrim(label)); END IF;
  ELSIF target_type = 'number' THEN
    label := replace(label, ',', '.');
    IF source_type = 'checkbox' THEN RETURN CASE WHEN cell = 'true'::jsonb THEN '1'::jsonb ELSE '0'::jsonb END; END IF;
    IF btrim(label) ~ '^[+-]?([0-9]+([.][0-9]*)?|[.][0-9]+)([eE][+-]?[0-9]+)?$' AND abs(btrim(label)::numeric) <= 1.7976931348623157e308 THEN
      RETURN to_jsonb(btrim(label)::numeric);
    END IF;
  ELSIF target_type = 'checkbox' THEN
    IF lower(btrim(label)) IN ('true', 'false') THEN RETURN to_jsonb(lower(btrim(label))::boolean); END IF;
    IF source_type = 'number' AND cell IN ('0'::jsonb, '1'::jsonb) THEN RETURN to_jsonb(cell = '1'::jsonb); END IF;
  ELSIF target_type = 'date' THEN
    IF source_type IN ('created_at', 'updated_at') THEN label := substring(label FROM 1 FOR 10); END IF;
    IF label ~ '^\d{4}-\d{2}-\d{2}(T([01]\d|2[0-3]):[0-5]\d:[0-5]\d(\.\d{1,3})?(Z|[+-](0\d|1[0-5]):[0-5]\d))?$' THEN
      PERFORM substring(label FROM 1 FOR 10)::date;
      IF length(label) > 10 THEN PERFORM label::timestamptz; END IF;
      RETURN to_jsonb(label);
    END IF;
  END IF;
  RETURN NULL;
EXCEPTION WHEN invalid_text_representation OR datetime_field_overflow OR invalid_datetime_format OR numeric_value_out_of_range THEN
  RETURN NULL;
END;
$$;

COMMIT;
