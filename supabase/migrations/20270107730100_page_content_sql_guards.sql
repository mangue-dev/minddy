-- Keep legacy SQL transactions operational until each page is sealed.

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
$function$;

CREATE OR REPLACE FUNCTION public.guard_page_database_parent()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
BEGIN
  IF NEW.parent_id IS DISTINCT FROM OLD.parent_id AND NEW.page_has_values THEN
    -- A permanent parent deletion may detach the entry, but its typed values
    -- have no valid schema as a root document and must be cleared atomically.
    IF pg_trigger_depth() > 1 AND NEW.parent_id IS NULL AND OLD.parent_id IS NOT NULL AND
       NOT EXISTS (SELECT 1 FROM public.pages WHERE id = OLD.parent_id) THEN
      IF NEW.encryption_version > 0 THEN
        RAISE EXCEPTION 'Encrypted database entry requires explicit parent cleanup'
          USING ERRCODE = '23514';
      END IF;
      NEW.property_values := CASE WHEN NEW.encryption_version > 0 THEN NULL ELSE '{}'::jsonb END;
      NEW.page_has_values := false;
      RETURN NEW;
    END IF;
    RAISE EXCEPTION 'Database entries with values cannot change parent'
      USING ERRCODE = '23514', CONSTRAINT = 'page_database_parent_values';
  END IF;
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.remove_deleted_database_properties()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
DECLARE
  removed text[];
  prop jsonb;
  old_prop jsonb;
  removed_options text[];
BEGIN
  IF NEW.encryption_version > 0 THEN RETURN NEW; END IF;
  SELECT array_agg(p->>'id') INTO removed FROM jsonb_array_elements(OLD.database_schema) p
    WHERE NOT EXISTS (SELECT 1 FROM jsonb_array_elements(NEW.database_schema) n WHERE n->>'id' = p->>'id');
  IF removed IS NOT NULL THEN
    UPDATE public.pages SET property_values = property_values - removed,
      updated_by = NEW.updated_by, updated_kind = NEW.updated_kind, updated_api_key_id = NEW.updated_api_key_id
      WHERE parent_id = NEW.id AND property_values ?| removed;
  END IF;
  FOR prop IN SELECT value FROM jsonb_array_elements(NEW.database_schema) WHERE value->>'type' IN ('select', 'multi_select') LOOP
    SELECT value INTO old_prop FROM jsonb_array_elements(OLD.database_schema) WHERE value->>'id' = prop->>'id';
    SELECT array_agg(o->>'id') INTO removed_options FROM jsonb_array_elements(old_prop->'options') o
      WHERE NOT EXISTS (SELECT 1 FROM jsonb_array_elements(prop->'options') n WHERE n->>'id' = o->>'id');
    IF removed_options IS NULL THEN CONTINUE; END IF;
    IF prop->>'type' = 'select' THEN
      UPDATE public.pages SET property_values = property_values - (prop->>'id'),
        updated_by = NEW.updated_by, updated_kind = NEW.updated_kind, updated_api_key_id = NEW.updated_api_key_id
        WHERE parent_id = NEW.id AND property_values->>(prop->>'id') = ANY(removed_options);
    ELSE
      UPDATE public.pages SET property_values = jsonb_set(property_values, ARRAY[prop->>'id'],
        coalesce((SELECT jsonb_agg(v) FROM jsonb_array_elements(property_values->(prop->>'id')) v
          WHERE NOT (v #>> '{}') = ANY(removed_options)), '[]'::jsonb)),
        updated_by = NEW.updated_by, updated_kind = NEW.updated_kind, updated_api_key_id = NEW.updated_api_key_id
        WHERE parent_id = NEW.id AND property_values->(prop->>'id') ?| removed_options;
    END IF;
  END LOOP;
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
      updated_kind = CASE WHEN p_input->>'kind' = 'agent' THEN 'agent' ELSE 'human' END, updated_api_key_id = CASE WHEN p_input->>'kind' = 'agent' THEN (p_input->>'mcpKeyId')::uuid ELSE NULL END WHERE id = p_page_id;
  ELSIF p_input->>'operation' = 'value' THEN
    IF target.parent_id IS DISTINCT FROM container.id OR NOT EXISTS (
      SELECT 1 FROM jsonb_array_elements(container.database_schema) p WHERE p->>'id' = p_input->>'propertyId' AND p->>'type' <> 'created_at'
    ) THEN RETURN jsonb_build_object('status', 'conflict'); END IF;
    IF coalesce(target.property_values->(p_input->>'propertyId'), 'null'::jsonb) IS DISTINCT FROM p_input->'expected' THEN
      RETURN jsonb_build_object('status', 'conflict'); END IF;
    UPDATE public.pages SET property_values = property_values || jsonb_build_object(p_input->>'propertyId', p_input->'value'),
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
$function$;

CREATE OR REPLACE FUNCTION public.import_page_database(p_project uuid, p_page uuid, p_actor uuid, p_request uuid, p_revision integer, p_pages jsonb, p_files jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  target public.pages;
  item jsonb;
  root jsonb;
  previous public.page_database_imports;
BEGIN
  IF NOT public.lock_live_project_actor_access(p_project, p_actor) THEN
    RAISE EXCEPTION 'Project access required' USING ERRCODE = '42501';
  END IF;
  IF EXISTS(SELECT 1 FROM public.pages WHERE id=p_page AND encryption_version>0) THEN
    RAISE EXCEPTION 'page_content_legacy_writer_refused' USING ERRCODE='23514';
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
$function$;

CREATE OR REPLACE FUNCTION public.discard_blank_page_guarded(p_page_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_page public.pages%ROWTYPE;
  v_blocks jsonb;
  v_blank boolean;
BEGIN
  SELECT * INTO v_page
  FROM public.pages
  WHERE id = p_page_id
    AND deleted_at IS NULL
  FOR UPDATE;

  IF v_page.id IS NULL THEN
    RETURN pg_catalog.jsonb_build_object('status', 'not_found');
  END IF;

  IF v_page.encryption_version > 0 THEN
    IF NOT v_page.page_is_blank OR
       EXISTS(SELECT 1 FROM public.pages WHERE id=v_page.parent_id AND page_is_database) OR
       EXISTS(SELECT 1 FROM public.pages WHERE parent_id=v_page.id AND deleted_at IS NULL) THEN
      RETURN pg_catalog.jsonb_build_object('status','not_empty');
    END IF;
    DELETE FROM public.pages WHERE id=v_page.id;
    RETURN pg_catalog.jsonb_build_object('status','discarded','parent_id',v_page.parent_id);
  END IF;
  v_blocks := v_page.content->'content';
  v_blank := CASE
    WHEN v_blocks IS NULL THEN true
    WHEN pg_catalog.jsonb_typeof(v_blocks) <> 'array' THEN true
    WHEN pg_catalog.jsonb_array_length(v_blocks) = 0 THEN true
    WHEN pg_catalog.jsonb_array_length(v_blocks) <> 1 THEN false
    WHEN v_blocks->0->>'type' <> 'paragraph' THEN false
    WHEN v_blocks->0->'content' IS NULL THEN true
    WHEN pg_catalog.jsonb_typeof(v_blocks->0->'content') <> 'array' THEN true
    ELSE pg_catalog.jsonb_array_length(v_blocks->0->'content') = 0
  END;
  IF v_page.database_schema IS NOT NULL
     OR v_page.property_values <> '{}'::jsonb
     OR EXISTS (SELECT 1 FROM public.pages WHERE id = v_page.parent_id AND database_schema IS NOT NULL)
     OR pg_catalog.btrim(v_page.title) <> ''
     OR NULLIF(v_page.icon, '') IS NOT NULL
     OR NOT v_blank
     OR EXISTS (
       SELECT 1
       FROM public.pages AS child
       WHERE child.parent_id = v_page.id
         AND child.deleted_at IS NULL
     ) THEN
    RETURN pg_catalog.jsonb_build_object('status', 'not_empty');
  END IF;

  DELETE FROM public.pages WHERE id = v_page.id;
  RETURN pg_catalog.jsonb_build_object(
    'status', 'discarded',
    'parent_id', v_page.parent_id
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.restore_page_guarded(p_project_id uuid, p_page_id uuid, p_actor_id uuid, p_root_position text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  target public.pages%ROWTYPE;
  parent public.pages%ROWTYPE;
  expected_parent uuid;
  restored_count integer;
  lift boolean;
BEGIN
  IF NOT public.lock_live_project_actor_access(p_project_id, p_actor_id) THEN
    RETURN jsonb_build_object('status', 'not_found');
  END IF;

  SELECT parent_id INTO expected_parent FROM public.pages WHERE id = p_page_id AND project_id = p_project_id;
  IF expected_parent IS NOT NULL THEN
    SELECT * INTO parent FROM public.pages WHERE id = expected_parent AND project_id = p_project_id FOR UPDATE;
  END IF;
  SELECT * INTO target FROM public.pages WHERE id = p_page_id AND project_id = p_project_id FOR UPDATE;
  IF target.id IS NULL OR target.deleted_at IS NULL THEN
    RETURN jsonb_build_object('status', 'not_found');
  END IF;
  IF target.parent_id IS DISTINCT FROM expected_parent THEN
    RETURN jsonb_build_object('status', 'conflict');
  END IF;

  lift := target.parent_id IS NOT NULL AND (parent.id IS NULL OR parent.deleted_at IS NOT NULL);
  IF lift AND (parent.page_is_database OR target.page_has_values) THEN
    RETURN jsonb_build_object('status', 'parent_required');
  END IF;

  PERFORM id FROM public.pages WHERE project_id = p_project_id AND deleted_root_id = p_page_id ORDER BY id FOR UPDATE;
  UPDATE public.pages SET
    deleted_at = NULL, deleted_by = NULL, deleted_root_id = NULL,
    parent_id = CASE WHEN id = p_page_id AND lift THEN NULL ELSE parent_id END,
    position = CASE WHEN id = p_page_id AND lift THEN p_root_position ELSE position END,
    parent_block_removed = CASE WHEN id = p_page_id THEN false ELSE parent_block_removed END
  WHERE project_id = p_project_id AND (id = p_page_id OR deleted_root_id = p_page_id);
  GET DIAGNOSTICS restored_count = ROW_COUNT;
  RETURN jsonb_build_object(
    'status', 'restored', 'restored', restored_count,
    'parent_id', CASE WHEN lift THEN NULL ELSE parent.id END,
    'parent_block_removed', target.parent_block_removed
  );
END;
$function$;

COMMIT;
