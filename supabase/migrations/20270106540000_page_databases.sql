-- Database containers and entries remain pages, inheriting project RLS and lifecycle.
ALTER TABLE public.pages
  ADD COLUMN database_schema jsonb DEFAULT NULL,
  ADD COLUMN database_revision integer NOT NULL DEFAULT 0,
  ADD COLUMN property_values jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD CONSTRAINT pages_property_values_object CHECK (jsonb_typeof(property_values) = 'object'),
  ADD CONSTRAINT pages_database_schema_array CHECK (
    database_schema IS NULL OR jsonb_typeof(database_schema) = 'array'
  );

CREATE FUNCTION public.validate_page_database() RETURNS trigger
LANGUAGE plpgsql SET search_path = '' AS $$
DECLARE
  prop jsonb;
  previous_prop jsonb;
  parent_schema jsonb;
  parent_project uuid;
  parent_deleted timestamptz;
  entry record;
  person text;
  seen text[] := '{}';
BEGIN
  IF TG_OP = 'INSERT' THEN
    NEW.database_revision := 0;
  ELSIF NEW.database_schema IS NOT DISTINCT FROM OLD.database_schema THEN
    NEW.database_revision := OLD.database_revision;
  END IF;
  IF TG_OP = 'UPDATE' AND NEW.database_schema IS DISTINCT FROM OLD.database_schema THEN
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
         coalesce(prop->>'type', '') NOT IN ('text', 'date', 'people', 'checkbox') OR
         prop->>'id' = ANY(seen) THEN
        RAISE EXCEPTION 'Invalid property schema' USING ERRCODE = '22023';
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
      IF entry.value = 'null'::jsonb THEN CONTINUE; END IF;
      CASE prop->>'type'
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
CREATE TRIGGER pages_validate_database BEFORE INSERT OR UPDATE ON public.pages
  FOR EACH ROW EXECUTE FUNCTION public.validate_page_database();

-- Deleting a property removes its values, including in trashed entries, atomically.
-- Reusing a deleted ID must never revive values under a different type.
CREATE FUNCTION public.remove_deleted_database_properties() RETURNS trigger
LANGUAGE plpgsql SET search_path = '' AS $$
DECLARE
  removed text[];
BEGIN
  SELECT array_agg(p->>'id') INTO removed FROM jsonb_array_elements(OLD.database_schema) p
    WHERE NOT EXISTS (SELECT 1 FROM jsonb_array_elements(NEW.database_schema) n WHERE n->>'id' = p->>'id');
  IF removed IS NOT NULL THEN
    UPDATE public.pages SET property_values = property_values - removed,
      updated_by = NEW.updated_by, updated_kind = NEW.updated_kind
      WHERE parent_id = NEW.id AND property_values ?| removed;
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER pages_remove_deleted_database_properties AFTER UPDATE OF database_schema ON public.pages
  FOR EACH ROW WHEN (OLD.database_schema IS DISTINCT FROM NEW.database_schema)
  EXECUTE FUNCTION public.remove_deleted_database_properties();

-- Hold the live project row while a privileged page RPC relies on membership.
-- Membership mutations take the same project lock after changing their row, so
-- an authorization decision cannot become stale before the caller commits.
CREATE FUNCTION public.lock_live_project_actor_access(
  p_project_id uuid, p_actor_id uuid
) RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  target_project public.projects%ROWTYPE;
BEGIN
  PERFORM account.id
  FROM auth.users AS account
  WHERE account.id = p_actor_id
  FOR SHARE;
  IF NOT FOUND THEN
    RETURN false;
  END IF;

  SELECT * INTO target_project
  FROM public.projects
  WHERE id = p_project_id
    AND deleted_at IS NULL
  FOR SHARE;

  IF target_project.id IS NULL THEN
    RETURN false;
  END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'project-authority:' || p_project_id::text,
      5400
    )
  );

  RETURN target_project.owner_id = p_actor_id OR EXISTS (
    SELECT 1
    FROM public.project_members AS member
    WHERE member.project_id = p_project_id
      AND member.user_id = p_actor_id
  );
END;
$$;

REVOKE ALL ON FUNCTION public.lock_live_project_actor_access(uuid, uuid)
  FROM PUBLIC, anon, authenticated, service_role;

-- PostgreSQL checks added_by, project_id, then user_id foreign keys. Lock both
-- Auth identities first so account deletion cannot hold Auth while this INSERT
-- holds the project and waits for the member account.
CREATE FUNCTION public.lock_project_member_auth_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  PERFORM account.id
  FROM auth.users AS account
  WHERE account.id IN (NEW.added_by, NEW.user_id)
  ORDER BY account.id
  FOR KEY SHARE;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.lock_project_member_auth_insert()
  FROM PUBLIC, anon, authenticated, service_role;

CREATE TRIGGER project_members_auth_insert_lock
BEFORE INSERT ON public.project_members
FOR EACH ROW EXECUTE FUNCTION public.lock_project_member_auth_insert();

-- The baseline checks the connection FK before the creator's Auth FK. Lock the
-- creator first so deleting a connection owner cannot deadlock link creation.
CREATE FUNCTION public.lock_project_git_link_parent_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NEW.created_by IS NOT NULL THEN
    PERFORM account.id
    FROM auth.users AS account
    WHERE account.id = NEW.created_by
    FOR KEY SHARE;
  END IF;
  PERFORM connection.id
  FROM public.git_connections AS connection
  WHERE connection.id = NEW.connection_id
  FOR KEY SHARE;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.lock_project_git_link_parent_insert()
  FROM PUBLIC, anon, authenticated, service_role;

CREATE TRIGGER project_git_links_parent_insert_lock
BEFORE INSERT ON public.project_git_links
FOR EACH ROW EXECUTE FUNCTION public.lock_project_git_link_parent_insert();

-- Publish membership and repository-binding mutations under the same project
-- authority lock used by privileged page and agent RPCs. Run after immediate
-- foreign-key checks, then take all affected project rows in UUID order before
-- Realtime generation triggers run.
CREATE FUNCTION public.lock_project_authority_mutation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  old_project_id uuid;
  new_project_id uuid;
  affected_project_id uuid;
BEGIN
  IF TG_OP <> 'INSERT' THEN
    old_project_id := OLD.project_id;
  END IF;
  IF TG_OP <> 'DELETE' THEN
    new_project_id := NEW.project_id;
  END IF;

  PERFORM project.id
  FROM public.projects AS project
  WHERE project.id IN (old_project_id, new_project_id)
  ORDER BY project.id
  FOR NO KEY UPDATE;

  FOR affected_project_id IN
    SELECT DISTINCT project_id
    FROM unnest(ARRAY[old_project_id, new_project_id])
      AS affected(project_id)
    WHERE project_id IS NOT NULL
    ORDER BY project_id
  LOOP
    PERFORM pg_catalog.pg_advisory_xact_lock(
      pg_catalog.hashtextextended(
        'project-authority:' || affected_project_id::text,
        5400
      )
    );
  END LOOP;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.lock_project_authority_mutation()
  FROM PUBLIC, anon, authenticated, service_role;

-- The later authority trigger supersedes the older project-row mutex. Keeping
-- both would upgrade NO KEY UPDATE after concurrent FK KEY SHARE locks.
DROP TRIGGER IF EXISTS project_members_lock_project_scope
  ON public.project_members;
DROP TRIGGER IF EXISTS project_members_authority_scope_lock
  ON public.project_members;

CREATE TRIGGER project_members_authority_lock
AFTER INSERT OR UPDATE OR DELETE ON public.project_members
FOR EACH ROW EXECUTE FUNCTION public.lock_project_authority_mutation();

CREATE TRIGGER project_git_links_authority_lock
AFTER INSERT OR UPDATE OR DELETE ON public.project_git_links
FOR EACH ROW EXECUTE FUNCTION public.lock_project_authority_mutation();

-- Serialize schema edits and validate a single cell against the schema under lock.
-- Independent cells merge; a stale edit to the same cell returns a conflict.
CREATE FUNCTION public.update_page_database_guarded(
  p_project_id uuid, p_page_id uuid, p_actor_id uuid, p_input jsonb
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  target public.pages%ROWTYPE;
  container public.pages%ROWTYPE;
  parent uuid;
BEGIN
  IF NOT public.lock_live_project_actor_access(p_project_id, p_actor_id) THEN
    RETURN jsonb_build_object('status', 'not_found');
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
    UPDATE public.pages SET database_schema = p_input->'schema', updated_by = p_actor_id,
      updated_kind = 'human' WHERE id = p_page_id;
  ELSIF p_input->>'operation' = 'value' THEN
    IF target.parent_id IS DISTINCT FROM container.id OR NOT EXISTS (
      SELECT 1 FROM jsonb_array_elements(container.database_schema) p WHERE p->>'id' = p_input->>'propertyId'
    ) THEN RETURN jsonb_build_object('status', 'conflict'); END IF;
    IF coalesce(target.property_values->(p_input->>'propertyId'), 'null'::jsonb) IS DISTINCT FROM p_input->'expected' THEN
      RETURN jsonb_build_object('status', 'conflict'); END IF;
    UPDATE public.pages SET property_values = property_values || jsonb_build_object(p_input->>'propertyId', p_input->'value'),
      updated_by = p_actor_id, updated_kind = 'human' WHERE id = p_page_id;
  ELSE RAISE EXCEPTION 'Unknown operation' USING ERRCODE = '22023'; END IF;
  RETURN jsonb_build_object('status', 'updated');
END;
$$;
REVOKE ALL ON FUNCTION public.update_page_database_guarded(uuid, uuid, uuid, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.update_page_database_guarded(uuid, uuid, uuid, jsonb) TO service_role;

-- Metadata changes must reach the existing project page cache in other sessions.
DROP TRIGGER IF EXISTS pages_broadcast_update ON public.pages;
CREATE TRIGGER pages_broadcast_update AFTER UPDATE ON public.pages FOR EACH ROW
WHEN (OLD.title IS DISTINCT FROM NEW.title OR OLD.icon IS DISTINCT FROM NEW.icon
  OR OLD.parent_id IS DISTINCT FROM NEW.parent_id OR OLD.position IS DISTINCT FROM NEW.position
  OR OLD.favorite IS DISTINCT FROM NEW.favorite OR OLD.deleted_at IS DISTINCT FROM NEW.deleted_at
  OR OLD.deleted_root_id IS DISTINCT FROM NEW.deleted_root_id
  OR OLD.parent_block_removed IS DISTINCT FROM NEW.parent_block_removed
  OR OLD.content IS DISTINCT FROM NEW.content OR OLD.database_schema IS DISTINCT FROM NEW.database_schema
  OR OLD.property_values IS DISTINCT FROM NEW.property_values)
EXECUTE FUNCTION public.broadcast_page_row();

-- Empty database entries are intentional records, never disposable drafts.
CREATE OR REPLACE FUNCTION public.discard_blank_page_guarded(
  p_page_id uuid
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
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
$$;

REVOKE ALL ON FUNCTION public.discard_blank_page_guarded(uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.discard_blank_page_guarded(uuid) TO service_role;
