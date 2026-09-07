-- Check the row being written, including cell edits committed after a move's preflight.
CREATE OR REPLACE FUNCTION public.guard_page_database_parent() RETURNS trigger
LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  IF NEW.parent_id IS DISTINCT FROM OLD.parent_id AND NEW.property_values <> '{}'::jsonb THEN
    -- A permanent parent deletion may detach the entry, but its typed values
    -- have no valid schema as a root document and must be cleared atomically.
    IF pg_trigger_depth() > 1 AND NEW.parent_id IS NULL AND OLD.parent_id IS NOT NULL AND
       NOT EXISTS (SELECT 1 FROM public.pages WHERE id = OLD.parent_id) THEN
      NEW.property_values := '{}'::jsonb;
      RETURN NEW;
    END IF;
    RAISE EXCEPTION 'Database entries with values cannot change parent'
      USING ERRCODE = '23514', CONSTRAINT = 'page_database_parent_values';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER pages_guard_database_parent BEFORE UPDATE OF parent_id ON public.pages
  FOR EACH ROW EXECUTE FUNCTION public.guard_page_database_parent();

-- Restore the root and its deletion family together. Lock the parent first, like
-- database value edits, so a concurrent parent deletion cannot detach the entry.
CREATE OR REPLACE FUNCTION public.restore_page_guarded(
  p_project_id uuid, p_page_id uuid, p_actor_id uuid, p_root_position text
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
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
  IF lift AND (parent.database_schema IS NOT NULL OR target.property_values <> '{}'::jsonb) THEN
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
$$;
REVOKE ALL ON FUNCTION public.restore_page_guarded(uuid,uuid,uuid,text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.restore_page_guarded(uuid,uuid,uuid,text) TO service_role;
