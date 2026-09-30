\set ON_ERROR_STOP on
BEGIN;
DO $$ BEGIN
  IF current_database() NOT LIKE 'minddy_min591_%' THEN
    RAISE EXCEPTION 'Use an isolated minddy_min591_* database';
  END IF;
END $$;
DO $test$
DECLARE
  actor uuid := gen_random_uuid();
  project uuid := gen_random_uuid();
  ordinary uuid := gen_random_uuid();
  database_page uuid := gen_random_uuid();
  entry uuid := gen_random_uuid();
  draft uuid := gen_random_uuid();
  tree_root uuid := gen_random_uuid();
  tree_child uuid := gen_random_uuid();
  cipher text := '{"format":3,"keyVersion":1,"data":"opaque-page-trash-fixture"}';
  expired timestamptz := '2026-07-01T00:00:00Z';
  result jsonb;
  removed integer;
BEGIN
  INSERT INTO auth.users(id) VALUES (actor);
  INSERT INTO public.projects(id, owner_id, name, key)
    VALUES (project, actor, 'Project', 'PGTR');

  INSERT INTO public.pages(id, project_id, title, content, database_schema,
    property_values, position, created_by)
  VALUES
    (ordinary, project, 'Ordinary', '{"type":"doc","content":[]}',
      NULL, '{}', 'a', actor),
    (database_page, project, 'Database', '{"type":"doc","content":[]}',
      '[]', '{}', 'b', actor),
    (draft, project, '', '{"type":"doc","content":[{"type":"paragraph"}]}',
      NULL, '{}', 'c', actor),
    (tree_root, project, '', '{"type":"doc","content":[]}',
      NULL, '{}', 'd', actor);
  INSERT INTO public.pages(id, project_id, parent_id, title, content,
    property_values, position, created_by)
  VALUES
    (entry, project, database_page, 'Entry', '{"type":"doc","content":[]}',
      '{}', 'a', actor),
    (tree_child, project, tree_root, 'Child', '{"type":"doc","content":[]}',
      '{}', 'a', actor);

  UPDATE public.pages SET title = NULL, icon = NULL, content = NULL,
    database_schema = NULL, database_title_name = NULL,
    property_values = NULL, search_text = NULL,
    encrypted_content = cipher, encryption_version = 1,
    page_is_database = (id = database_page),
    page_has_values = false,
    page_is_blank = (id = draft OR id = tree_root)
  WHERE project_id = project;
  IF EXISTS (SELECT 1 FROM public.pages WHERE project_id = project AND
      (title IS NOT NULL OR content IS NOT NULL OR property_values IS NOT NULL OR
       database_schema IS NOT NULL OR encrypted_content IS DISTINCT FROM cipher)) THEN
    RAISE EXCEPTION 'Protected trash fixture retains clear page content';
  END IF;

  UPDATE public.pages SET deleted_at = expired, deleted_by = actor,
    deleted_root_id = CASE WHEN id = tree_child THEN tree_root ELSE NULL END
    WHERE project_id = project;

  result := public.restore_page_guarded(project, tree_root, actor, 'z');
  IF result->>'status' <> 'restored' OR result->>'restored' <> '2' OR
      EXISTS (SELECT 1 FROM public.pages WHERE id IN (tree_root, tree_child) AND
        (deleted_at IS NOT NULL OR encrypted_content IS DISTINCT FROM cipher)) THEN
    RAISE EXCEPTION 'Protected tree restoration failed: %', result;
  END IF;
  result := public.restore_page_guarded(project, entry, actor, 'z');
  IF result->>'status' <> 'parent_required' THEN
    RAISE EXCEPTION 'Protected database entry escaped its deleted parent: %', result;
  END IF;
  result := public.restore_page_guarded(project, database_page, actor, 'z');
  IF result->>'status' <> 'restored' OR result->>'restored' <> '1' THEN
    RAISE EXCEPTION 'Protected database restoration failed: %', result;
  END IF;
  result := public.restore_page_guarded(project, entry, actor, 'z');
  IF result->>'status' <> 'restored' OR result->>'restored' <> '1' THEN
    RAISE EXCEPTION 'Protected entry restoration failed: %', result;
  END IF;
  FOREACH ordinary IN ARRAY ARRAY[ordinary, draft] LOOP
    result := public.restore_page_guarded(project, ordinary, actor, 'z');
    IF result->>'status' <> 'restored' THEN
      RAISE EXCEPTION 'Protected document restoration failed: %', result;
    END IF;
  END LOOP;

  UPDATE public.pages SET deleted_at = expired, deleted_by = actor,
    deleted_root_id = CASE WHEN id = tree_child THEN tree_root ELSE NULL END
    WHERE project_id = project;
  DELETE FROM public.pages WHERE project_id = project AND deleted_at < now() - interval '30 days'
    AND deleted_root_id IS NOT NULL;
  GET DIAGNOSTICS removed = ROW_COUNT;
  IF removed <> 1 THEN RAISE EXCEPTION 'Retention did not remove the protected descendant first'; END IF;
  DELETE FROM public.pages WHERE project_id = project AND deleted_at < now() - interval '30 days'
    AND deleted_root_id IS NULL;
  GET DIAGNOSTICS removed = ROW_COUNT;
  IF removed <> 5 OR EXISTS (SELECT 1 FROM public.pages WHERE project_id = project) THEN
    RAISE EXCEPTION 'Retention left a protected page or orphan: %', removed;
  END IF;
END;
$test$;
ROLLBACK;
