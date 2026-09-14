BEGIN;

-- Use the same account lock as creation/closure so positions and revisions stay
-- consistent even when another device changes the collection during a drag.
CREATE FUNCTION public.move_app_tab(p_id uuid, p_revision bigint, p_before_id uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  actor uuid := auth.uid();
  moved public.app_tabs;
  anchor public.app_tabs;
  ordered uuid[];
  insertion integer;
BEGIN
  IF actor IS NULL THEN RAISE insufficient_privilege USING MESSAGE = 'Authentication required'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('app-tabs:' || actor::text, 0));
  SELECT * INTO moved FROM public.app_tabs WHERE id = p_id AND user_id = actor;
  IF NOT FOUND THEN RETURN jsonb_build_object('code', 'not_found'); END IF;
  IF p_revision IS NULL OR moved.revision <> p_revision THEN
    RETURN jsonb_build_object('code', 'conflict', 'tab', to_jsonb(moved));
  END IF;
  IF p_before_id IS NOT NULL THEN
    SELECT * INTO anchor FROM public.app_tabs WHERE id = p_before_id AND user_id = actor;
    IF NOT FOUND OR anchor.pinned <> moved.pinned OR p_before_id = p_id THEN
      RETURN jsonb_build_object('code', 'invalid');
    END IF;
  END IF;
  SELECT COALESCE(array_agg(id ORDER BY position, id), '{}'::uuid[]) INTO ordered
    FROM public.app_tabs WHERE user_id = actor AND pinned = moved.pinned AND id <> p_id;
  insertion := COALESCE(array_position(ordered, p_before_id), cardinality(ordered) + 1);
  ordered := ordered[1:insertion - 1] || ARRAY[p_id] || ordered[insertion:cardinality(ordered)];
  UPDATE public.app_tabs AS tab SET position = ranking.ordinality - 1,
    revision = tab.revision + 1, updated_at = now()
    FROM unnest(ordered) WITH ORDINALITY AS ranking(id, ordinality)
    WHERE tab.id = ranking.id AND tab.user_id = actor AND tab.position <> ranking.ordinality - 1;
  RETURN jsonb_build_object('tabs', (
    SELECT jsonb_agg(to_jsonb(tab) ORDER BY pinned DESC, position, id)
      FROM public.app_tabs AS tab WHERE user_id = actor
  ));
END;
$$;
REVOKE ALL ON FUNCTION public.move_app_tab(uuid, bigint, uuid) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.move_app_tab(uuid, bigint, uuid) TO authenticated;

COMMIT;
