BEGIN;

CREATE TABLE public.app_tabs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  href text NOT NULL DEFAULT '/home' CHECK (
    length(href) BETWEEN 1 AND 2000 AND
    href ~ '^/(home|all|inbox|numo|agents|routines|pull-requests|statistics|trash|settings|billing|admin|projects/[a-zA-Z0-9_-]+(/(feedback|objectives|settings|triage|pages(/[a-zA-Z0-9_-]+)?))?)([?#].*)?$' AND
    href !~ '[[:space:][:cntrl:]\\]'
  ),
  custom_name text CHECK (custom_name IS NULL OR (length(custom_name) BETWEEN 1 AND 200 AND custom_name !~ '[[:cntrl:]]')),
  pinned boolean NOT NULL DEFAULT false,
  position bigint NOT NULL CHECK (position >= 0),
  revision bigint NOT NULL DEFAULT 1 CHECK (revision > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX app_tabs_owner_order ON public.app_tabs(user_id, pinned DESC, position, id);
ALTER TABLE public.app_tabs ENABLE ROW LEVEL SECURITY;
CREATE POLICY app_tabs_owner_select ON public.app_tabs FOR SELECT TO authenticated
  USING (user_id = (SELECT auth.uid()));
REVOKE ALL ON public.app_tabs FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.app_tabs TO authenticated;
GRANT ALL ON public.app_tabs TO service_role;

-- All browser mutations enter this serialized, owner-scoped operation. Direct
-- writes are not granted, so clients cannot bypass the final-tab invariant.
CREATE FUNCTION public.mutate_app_tab(
  p_operation text,
  p_id uuid DEFAULT NULL,
  p_revision bigint DEFAULT NULL,
  p_patch jsonb DEFAULT '{}'::jsonb
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  actor uuid := auth.uid();
  tab public.app_tabs;
  next_position bigint;
BEGIN
  IF actor IS NULL THEN RAISE insufficient_privilege USING MESSAGE = 'Authentication required'; END IF;
  IF p_operation NOT IN ('ensure', 'create', 'update', 'close') OR p_operation IS NULL THEN
    RETURN jsonb_build_object('code', 'invalid');
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('app-tabs:' || actor::text, 0));
  IF p_operation = 'ensure' THEN
    SELECT * INTO tab FROM public.app_tabs WHERE user_id = actor ORDER BY pinned DESC, position, id LIMIT 1;
    IF FOUND THEN RETURN jsonb_build_object('tab', to_jsonb(tab)); END IF;
  END IF;
  IF p_operation IN ('ensure', 'create') THEN
    IF p_id IS NOT NULL THEN
      SELECT * INTO tab FROM public.app_tabs WHERE id = p_id;
      IF FOUND THEN
        IF tab.user_id <> actor THEN RETURN jsonb_build_object('code', 'invalid'); END IF;
        RETURN jsonb_build_object('tab', to_jsonb(tab));
      END IF;
    END IF;
    SELECT COALESCE(max(position), -1) + 1 INTO next_position FROM public.app_tabs WHERE user_id = actor;
    INSERT INTO public.app_tabs(id, user_id, position)
      VALUES (COALESCE(p_id, gen_random_uuid()), actor, next_position) RETURNING * INTO tab;
    RETURN jsonb_build_object('tab', to_jsonb(tab));
  END IF;
  SELECT * INTO tab FROM public.app_tabs WHERE id = p_id AND user_id = actor;
  IF NOT FOUND THEN RETURN jsonb_build_object('code', 'not_found'); END IF;
  IF p_revision IS NULL OR p_revision <> tab.revision THEN
    RETURN jsonb_build_object('code', 'conflict', 'tab', to_jsonb(tab));
  END IF;
  IF p_operation = 'close' THEN
    IF (SELECT count(*) FROM public.app_tabs WHERE user_id = actor) <= 1 THEN
      RETURN jsonb_build_object('code', 'last_tab', 'tab', to_jsonb(tab));
    END IF;
    DELETE FROM public.app_tabs WHERE id = tab.id;
    RETURN jsonb_build_object('tab', to_jsonb(tab));
  END IF;
  IF jsonb_typeof(p_patch) IS DISTINCT FROM 'object' OR p_patch = '{}'::jsonb OR
     p_patch - ARRAY['href', 'custom_name', 'pinned'] <> '{}'::jsonb OR
     (p_patch ? 'href' AND jsonb_typeof(p_patch->'href') IS DISTINCT FROM 'string') OR
     (p_patch ? 'pinned' AND jsonb_typeof(p_patch->'pinned') IS DISTINCT FROM 'boolean') OR
     (p_patch ? 'custom_name' AND jsonb_typeof(p_patch->'custom_name') NOT IN ('string', 'null')) THEN
    RETURN jsonb_build_object('code', 'invalid');
  END IF;
  UPDATE public.app_tabs SET
    href = CASE WHEN p_patch ? 'href' THEN p_patch->>'href' ELSE href END,
    custom_name = CASE WHEN p_patch ? 'custom_name' THEN NULLIF(btrim(p_patch->>'custom_name'), '') ELSE custom_name END,
    pinned = CASE WHEN p_patch ? 'pinned' THEN (p_patch->>'pinned')::boolean ELSE pinned END,
    revision = revision + 1,
    updated_at = now()
  WHERE id = tab.id RETURNING * INTO tab;
  RETURN jsonb_build_object('tab', to_jsonb(tab));
END;
$$;
REVOKE ALL ON FUNCTION public.mutate_app_tab(text, uuid, bigint, jsonb) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.mutate_app_tab(text, uuid, bigint, jsonb) TO authenticated;

CREATE FUNCTION public.broadcast_app_tab() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  PERFORM public.broadcast_private_realtime(
    'user:' || COALESCE(NEW.user_id, OLD.user_id)::text,
    TG_OP,
    jsonb_build_object('operation', TG_OP, 'table', TG_TABLE_NAME, 'schema', TG_TABLE_SCHEMA,
      'record', jsonb_build_object('id', NEW.id), 'old_record', jsonb_build_object('id', OLD.id))
  );
  RETURN NULL;
EXCEPTION WHEN OTHERS THEN
  -- Reconnect catch-up recovers a missed broadcast without failing the write.
  RETURN NULL;
END;
$$;
REVOKE ALL ON FUNCTION public.broadcast_app_tab() FROM PUBLIC, anon, authenticated, service_role;
CREATE TRIGGER app_tabs_broadcast AFTER INSERT OR UPDATE OR DELETE ON public.app_tabs
  FOR EACH ROW EXECUTE FUNCTION public.broadcast_app_tab();

COMMIT;
