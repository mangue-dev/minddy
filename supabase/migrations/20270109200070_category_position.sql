-- MIN-760: categories carry a project-defined order, shown by every picker.
-- A new category defaults to its insertion time in milliseconds (the scheme of
-- issues.position), so it lands after the ones already ordered by hand
-- without any writer having to compute a position. Existing rows keep the
-- order they had, which was by creation time.
BEGIN;

ALTER TABLE public.categories ADD COLUMN position bigint;
UPDATE public.categories
  SET position = (extract(epoch FROM created_at) * 1000)::bigint;
ALTER TABLE public.categories
  ALTER COLUMN position SET DEFAULT (extract(epoch FROM clock_timestamp()) * 1000)::bigint,
  ALTER COLUMN position SET NOT NULL;
COMMENT ON COLUMN public.categories.position IS
  'Display order within the project (ascending, ties by id).';
CREATE INDEX idx_categories_project_position ON public.categories(project_id, position, id);

-- Reorders a project's categories in one statement. The listed categories come
-- first, in that order; the others follow in their current order, so a caller
-- can move one category without sending the whole list. guard_project_actor
-- checks that the actor can write and locks the project row, which serializes
-- concurrent reorders of the same project.
CREATE FUNCTION public.reorder_categories(
  p_project_id uuid, p_actor_id uuid, p_category_ids uuid[])
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  listed uuid[] := COALESCE(p_category_ids, '{}'::uuid[]);
  ordered uuid[];
BEGIN
  PERFORM public.guard_project_actor(p_project_id, p_actor_id, false);
  IF cardinality(listed) <> (SELECT count(DISTINCT wanted.id) FROM unnest(listed) AS wanted(id)) THEN
    RETURN jsonb_build_object('code', 'duplicate');
  END IF;
  IF EXISTS (SELECT 1 FROM unnest(listed) AS wanted(id) WHERE NOT EXISTS (
      SELECT 1 FROM public.categories c
      WHERE c.id = wanted.id AND c.project_id = p_project_id)) THEN
    RETURN jsonb_build_object('code', 'not_found');
  END IF;
  SELECT listed || COALESCE(array_agg(c.id ORDER BY c.position, c.id), '{}'::uuid[])
    INTO ordered
    FROM public.categories c
    WHERE c.project_id = p_project_id AND NOT (c.id = ANY (listed));
  UPDATE public.categories AS c SET position = ranking.ordinality - 1
    FROM unnest(ordered) WITH ORDINALITY AS ranking(id, ordinality)
    WHERE c.id = ranking.id AND c.project_id = p_project_id
      AND c.position <> ranking.ordinality - 1;
  RETURN jsonb_build_object('category_ids', to_jsonb(ordered));
END;
$$;
REVOKE ALL ON FUNCTION public.reorder_categories(uuid, uuid, uuid[])
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reorder_categories(uuid, uuid, uuid[]) TO service_role;

COMMIT;
