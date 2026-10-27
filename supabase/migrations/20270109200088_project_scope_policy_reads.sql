-- MIN-825: the cross-project board (`GET /api/me/board`) reads every
-- category, objective and issue relation the user can see and lets RLS do the
-- scoping. The SELECT policies of these tables called
-- `can_access_project(project_id)` once per row, and that SQL definer was
-- re-planned on every call, with its two helpers. On production a single
-- unfiltered read cost 33 ms for 104 categories and 98 ms for 471 relations
-- before any load. The tables have the indexes they need; the cost was the
-- per-row call.
--
-- 1. These three policies compare `project_id` with the caller's project set,
--    computed once per statement: 98 ms → 0.8 ms for the relations read. The
--    set is exactly what `can_access_project` accepts: projects the caller
--    owns plus projects the caller belongs to. A NULL `project_id` matches
--    neither form.
-- 2. The per-row helpers behind the other policies become PL/pgSQL, which
--    keeps their plans for the connection (about 5× faster per row). Their
--    queries are copied unchanged, and `variable_conflict use_column` keeps
--    the SQL-function rule that a column name wins over a parameter name.

CREATE OR REPLACE FUNCTION public.accessible_project_ids()
RETURNS SETOF uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT project.id
  FROM public.projects AS project
  WHERE project.owner_id = (SELECT auth.uid())
  UNION
  SELECT member.project_id
  FROM public.project_members AS member
  WHERE member.user_id = (SELECT auth.uid())
$$;

-- A policy helper: RLS evaluates it as the querying role. It lists only the
-- caller's own projects.
REVOKE ALL ON FUNCTION public.accessible_project_ids()
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.accessible_project_ids()
  TO authenticated, service_role;

DROP POLICY IF EXISTS categories_select ON public.categories;
CREATE POLICY categories_select ON public.categories
  FOR SELECT TO authenticated
  USING (project_id IN (SELECT public.accessible_project_ids()));

DROP POLICY IF EXISTS issue_relations_select ON public.issue_relations;
CREATE POLICY issue_relations_select ON public.issue_relations
  FOR SELECT TO authenticated
  USING (project_id IN (SELECT public.accessible_project_ids()));

DROP POLICY IF EXISTS objectives_select ON public.objectives;
CREATE POLICY objectives_select ON public.objectives
  FOR SELECT TO authenticated
  USING (
    project_id IN (SELECT public.accessible_project_ids())
    AND deleted_at IS NULL
  );

CREATE OR REPLACE FUNCTION public.is_project_owner(project_uuid uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
#variable_conflict use_column
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.projects
    WHERE id = project_uuid AND owner_id = auth.uid()
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.is_project_member(project_uuid uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
#variable_conflict use_column
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.project_members
    WHERE project_id = project_uuid AND user_id = auth.uid()
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.can_access_project(project_uuid uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN public.is_project_owner(project_uuid)
      OR public.is_project_member(project_uuid);
END;
$$;

CREATE OR REPLACE FUNCTION public.can_write_project(project_uuid uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
#variable_conflict use_column
BEGIN
  RETURN public.is_project_owner(project_uuid) OR EXISTS (
    SELECT 1 FROM public.project_members AS m
    WHERE m.project_id = project_uuid
      AND m.user_id = (SELECT auth.uid())
      AND m.role = 'member'
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.can_comment_project(project_uuid uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
#variable_conflict use_column
BEGIN
  RETURN public.is_project_owner(project_uuid) OR EXISTS (
    SELECT 1 FROM public.project_members AS m
    WHERE m.project_id = project_uuid
      AND m.user_id = (SELECT auth.uid())
      AND (m.role = 'member' OR m.can_comment)
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.can_comment_on_parent(
  issue_uuid uuid,
  objective_uuid uuid,
  feedback_post_uuid uuid,
  is_public boolean
)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
#variable_conflict use_column
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.issues AS i
    WHERE i.id = issue_uuid AND public.can_comment_project(i.project_id)
  ) OR EXISTS (
    SELECT 1 FROM public.objectives AS o
    WHERE o.id = objective_uuid AND public.can_comment_project(o.project_id)
  ) OR EXISTS (
    SELECT 1 FROM public.feedback_posts AS f
    WHERE f.id = feedback_post_uuid AND CASE
      WHEN is_public THEN public.can_write_project(f.project_id)
      ELSE public.can_comment_project(f.project_id)
    END
  );
END;
$$;

-- CREATE OR REPLACE keeps the grants; restate them so this file shows them.
REVOKE ALL ON FUNCTION public.is_project_owner(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.is_project_member(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.can_access_project(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.can_write_project(uuid)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.can_comment_project(uuid)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.can_comment_on_parent(uuid, uuid, uuid, boolean)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.is_project_owner(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.is_project_member(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.can_access_project(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.can_write_project(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.can_comment_project(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.can_comment_on_parent(uuid, uuid, uuid, boolean)
  TO authenticated, service_role;
