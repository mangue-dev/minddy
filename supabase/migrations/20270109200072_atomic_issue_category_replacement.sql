-- MIN-698: replaces an issue's category set in one transaction. The former
-- writer deleted every link, then inserted the new ones in a second request,
-- so a failed insert left the issue without categories and two concurrent
-- replacements could leave the union of both requests.
--
-- The function locks the issue row, which serializes replacements of the same
-- issue: the last one to commit wins and leaves exactly the set it asked for.
-- Only the difference is written, so an unchanged link is never deleted and
-- reinserted (no spurious realtime or routine events). Requested ids that do
-- not belong to the issue's project are ignored, as before. Any failure,
-- including a category deleted concurrently, rolls the whole replacement back.
--
-- The caller (lib/server/set-issue-categories.ts) has already checked project
-- access; the actor check is repeated here because the function runs with
-- service-role rights. It does not lock the project row (unlike
-- guard_project_actor) so category edits do not serialize a whole project.
BEGIN;

CREATE FUNCTION public.replace_issue_categories(
  p_issue_id uuid, p_actor_id uuid, p_category_ids uuid[])
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_project_id uuid;
  v_owner_id uuid;
  wanted uuid[];
  current_ids uuid[];
  added uuid[];
  removed uuid[];
BEGIN
  SELECT i.project_id INTO v_project_id
    FROM public.issues i
    WHERE i.id = p_issue_id AND i.deleted_at IS NULL
    FOR NO KEY UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('code', 'not_found');
  END IF;

  SELECT p.owner_id INTO v_owner_id
    FROM public.projects p
    WHERE p.id = v_project_id AND p.deleted_at IS NULL;
  IF NOT FOUND OR (v_owner_id <> p_actor_id AND NOT EXISTS (
      SELECT 1 FROM public.project_members m
      WHERE m.project_id = v_project_id AND m.user_id = p_actor_id
        AND m.role = 'member')) THEN
    RAISE EXCEPTION 'tenant_guard_forbidden' USING ERRCODE = '42501';
  END IF;

  -- Requested order, first occurrence wins, restricted to the project.
  SELECT COALESCE(array_agg(req.id ORDER BY req.ord), '{}'::uuid[]) INTO wanted
    FROM (
      SELECT r.id, min(r.ord) AS ord
      FROM unnest(COALESCE(p_category_ids, '{}'::uuid[])) WITH ORDINALITY AS r(id, ord)
      GROUP BY r.id
    ) AS req
    WHERE EXISTS (SELECT 1 FROM public.categories c
      WHERE c.id = req.id AND c.project_id = v_project_id);

  SELECT COALESCE(array_agg(ic.category_id ORDER BY ic.category_id), '{}'::uuid[])
    INTO current_ids
    FROM public.issue_categories ic
    WHERE ic.issue_id = p_issue_id;

  SELECT COALESCE(array_agg(w.id ORDER BY w.ord), '{}'::uuid[]) INTO added
    FROM unnest(wanted) WITH ORDINALITY AS w(id, ord)
    WHERE NOT (w.id = ANY (current_ids));
  SELECT COALESCE(array_agg(c.id ORDER BY c.id), '{}'::uuid[]) INTO removed
    FROM unnest(current_ids) AS c(id)
    WHERE NOT (c.id = ANY (wanted));

  DELETE FROM public.issue_categories ic
    WHERE ic.issue_id = p_issue_id AND ic.category_id = ANY (removed);
  INSERT INTO public.issue_categories (issue_id, category_id)
    SELECT p_issue_id, a.id FROM unnest(added) AS a(id)
    ON CONFLICT (issue_id, category_id) DO NOTHING;

  RETURN jsonb_build_object(
    'category_ids', to_jsonb(wanted),
    'added', to_jsonb(added),
    'removed', to_jsonb(removed));
END;
$$;
REVOKE ALL ON FUNCTION public.replace_issue_categories(uuid, uuid, uuid[])
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.replace_issue_categories(uuid, uuid, uuid[]) TO service_role;

COMMIT;
