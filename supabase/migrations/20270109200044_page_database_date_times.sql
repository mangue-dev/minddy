-- Allow optional times without changing stored calendar dates or encryption guards.
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
          IF jsonb_typeof(entry.value) <> 'string' OR (entry.value #>> '{}') !~ '^\d{4}-\d{2}-\d{2}(T([01]\d|2[0-3]):[0-5]\d:[0-5]\d(\.\d{1,3})?(Z|[+-](0\d|1[0-5]):[0-5]\d))?$' THEN
            RAISE EXCEPTION 'Invalid date' USING ERRCODE = '22023'; END IF;
          PERFORM substring(entry.value #>> '{}' FROM 1 FOR 10)::date;
          IF length(entry.value #>> '{}') > 10 THEN
            PERFORM (entry.value #>> '{}')::timestamptz;
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

CREATE OR REPLACE FUNCTION public.convert_database_cell(source jsonb, target_type text, cell jsonb)
RETURNS jsonb LANGUAGE plpgsql IMMUTABLE SET search_path = '' AS $$
DECLARE
  source_type text := source->>'type';
  label text;
BEGIN
  IF source_type = target_type THEN RETURN coalesce(cell, 'null'::jsonb); END IF;
  IF cell IS NULL OR cell IN ('null'::jsonb, '""'::jsonb, '[]'::jsonb) THEN RETURN 'null'::jsonb; END IF;
  IF target_type IN ('people', 'created_at') OR source_type = 'people' THEN RETURN NULL; END IF;
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
    IF source_type = 'created_at' THEN label := substring(label FROM 1 FOR 10); END IF;
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
