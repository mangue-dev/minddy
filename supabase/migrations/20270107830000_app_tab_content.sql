-- MIN-591: seal personal tab destinations and labels, including RPC results.
BEGIN;

CREATE FUNCTION public.app_tab_content_version(p_value text)
RETURNS integer LANGUAGE plpgsql IMMUTABLE STRICT SET search_path='' AS $$
DECLARE parsed jsonb; format_number integer; key_version integer;
BEGIN
  IF left(p_value,6)<>'mdye3:' THEN RETURN 0; END IF;
  parsed:=substring(p_value FROM 7)::jsonb;
  format_number:=COALESCE((parsed->>'format')::integer,0);
  key_version:=COALESCE((parsed->>'keyVersion')::integer,0);
  IF format_number=3 AND key_version>0 THEN RETURN key_version; END IF;
  RETURN 0;
EXCEPTION WHEN others THEN RETURN 0;
END;
$$;
REVOKE ALL ON FUNCTION public.app_tab_content_version(text)
  FROM PUBLIC,anon,authenticated;

ALTER TABLE public.app_tabs
  DROP CONSTRAINT app_tabs_href_check,
  DROP CONSTRAINT app_tabs_custom_name_check,
  ADD COLUMN href_encryption_checked_at timestamptz,
  ADD COLUMN custom_name_encryption_checked_at timestamptz,
  ADD COLUMN encryption_attempted_at timestamptz,
  ADD CONSTRAINT app_tabs_href_shape CHECK (
    public.app_tab_content_version(href)>0 OR (
      length(href) BETWEEN 1 AND 2000 AND
      href ~ '^/(home|all|inbox|numo|agents|routines|pull-requests|statistics|trash|settings|billing|admin|projects/[a-zA-Z0-9_-]+(/(feedback|objectives|settings|triage|pages(/[a-zA-Z0-9_-]+)?))?)([?#].*)?$' AND
      href !~ '[[:space:][:cntrl:]\\]')),
  ADD CONSTRAINT app_tabs_custom_name_shape CHECK (
    custom_name IS NULL OR public.app_tab_content_version(custom_name)>0 OR
    (length(custom_name) BETWEEN 1 AND 200 AND custom_name !~ '[[:cntrl:]]'));
CREATE INDEX app_tabs_encryption_queue ON
  public.app_tabs(encryption_attempted_at NULLS FIRST,id);

CREATE TABLE public.app_tab_content_scope(
  id boolean PRIMARY KEY DEFAULT true CHECK(id),
  activated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.app_tab_content_scope ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.app_tab_content_scope FROM PUBLIC,anon,authenticated;
GRANT ALL ON public.app_tab_content_scope TO service_role;

CREATE FUNCTION public.guard_app_tab_content()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE href_version integer; name_version integer; old_href_version integer:=0;
  old_name_version integer:=0;
BEGIN
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('app-tab-content',591));
  href_version:=public.app_tab_content_version(NEW.href);
  name_version:=public.app_tab_content_version(NEW.custom_name);
  IF (left(NEW.href,6)='mdye3:' AND href_version=0) OR
      (left(NEW.custom_name,6)='mdye3:' AND name_version=0) THEN
    RAISE EXCEPTION 'app_tab_invalid_envelope' USING ERRCODE='23514';
  END IF;
  IF TG_OP='UPDATE' THEN
    old_href_version:=public.app_tab_content_version(OLD.href);
    old_name_version:=public.app_tab_content_version(OLD.custom_name);
    IF NEW.id IS DISTINCT FROM OLD.id OR NEW.user_id IS DISTINCT FROM OLD.user_id OR
        (old_href_version>0 AND href_version<old_href_version) OR
        (OLD.custom_name IS NOT NULL AND old_name_version>0 AND
          NEW.custom_name IS NOT NULL AND name_version<old_name_version) THEN
      RAISE EXCEPTION 'app_tab_scope_change' USING ERRCODE='23514';
    END IF;
  END IF;
  IF EXISTS(SELECT 1 FROM public.app_tab_content_scope) AND
      (href_version=0 OR (NEW.custom_name IS NOT NULL AND name_version=0)) THEN
    RAISE EXCEPTION 'app_tab_requires_encryption' USING ERRCODE='23514';
  END IF;
  IF TG_OP='INSERT' OR NEW.href IS DISTINCT FROM OLD.href THEN
    NEW.href_encryption_checked_at:=CASE WHEN href_version>0
      THEN pg_catalog.clock_timestamp() ELSE NULL END;
  END IF;
  IF TG_OP='INSERT' OR NEW.custom_name IS DISTINCT FROM OLD.custom_name THEN
    NEW.custom_name_encryption_checked_at:=CASE WHEN name_version>0
      THEN pg_catalog.clock_timestamp() ELSE NULL END;
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER app_tabs_content_guard BEFORE INSERT OR UPDATE ON public.app_tabs
  FOR EACH ROW EXECUTE FUNCTION public.guard_app_tab_content();
REVOKE ALL ON FUNCTION public.guard_app_tab_content()
  FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION public.mutate_app_tab(
  p_operation text,p_id uuid DEFAULT NULL,p_revision bigint DEFAULT NULL,
  p_patch jsonb DEFAULT '{}'::jsonb
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE actor uuid:=auth.uid(); tab public.app_tabs; next_position bigint;
BEGIN
  IF actor IS NULL THEN RAISE insufficient_privilege USING MESSAGE='Authentication required'; END IF;
  IF p_operation NOT IN ('ensure','create','update','close') OR p_operation IS NULL THEN
    RETURN jsonb_build_object('code','invalid');
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('app-tabs:' || actor::text,0));
  IF p_operation='ensure' THEN
    SELECT * INTO tab FROM public.app_tabs WHERE user_id=actor
      ORDER BY pinned DESC,position,id LIMIT 1;
    IF FOUND THEN RETURN jsonb_build_object('tab',to_jsonb(tab)); END IF;
  END IF;
  IF p_operation IN ('ensure','create') THEN
    IF p_id IS NOT NULL THEN
      SELECT * INTO tab FROM public.app_tabs WHERE id=p_id;
      IF FOUND THEN
        IF tab.user_id<>actor THEN RETURN jsonb_build_object('code','invalid'); END IF;
        RETURN jsonb_build_object('tab',to_jsonb(tab));
      END IF;
    END IF;
    IF pg_catalog.jsonb_typeof(p_patch) IS DISTINCT FROM 'object' OR
        p_patch - ARRAY['href'] <> '{}'::jsonb OR
        (p_patch ? 'href' AND pg_catalog.jsonb_typeof(p_patch->'href') IS DISTINCT FROM 'string') THEN
      RETURN jsonb_build_object('code','invalid');
    END IF;
    SELECT COALESCE(max(position),-1)+1 INTO next_position
      FROM public.app_tabs WHERE user_id=actor;
    INSERT INTO public.app_tabs(id,user_id,href,position)
      VALUES(COALESCE(p_id,gen_random_uuid()),actor,
        COALESCE(p_patch->>'href','/home'),next_position) RETURNING * INTO tab;
    RETURN jsonb_build_object('tab',to_jsonb(tab));
  END IF;
  SELECT * INTO tab FROM public.app_tabs WHERE id=p_id AND user_id=actor;
  IF NOT FOUND THEN RETURN jsonb_build_object('code','not_found'); END IF;
  IF p_revision IS NULL OR p_revision<>tab.revision THEN
    RETURN jsonb_build_object('code','conflict','tab',to_jsonb(tab));
  END IF;
  IF p_operation='close' THEN
    IF (SELECT count(*) FROM public.app_tabs WHERE user_id=actor)<=1 THEN
      RETURN jsonb_build_object('code','last_tab','tab',to_jsonb(tab));
    END IF;
    DELETE FROM public.app_tabs WHERE id=tab.id;
    RETURN jsonb_build_object('tab',to_jsonb(tab));
  END IF;
  IF jsonb_typeof(p_patch) IS DISTINCT FROM 'object' OR p_patch='{}'::jsonb OR
     p_patch - ARRAY['href','custom_name','pinned'] <> '{}'::jsonb OR
     (p_patch ? 'href' AND jsonb_typeof(p_patch->'href') IS DISTINCT FROM 'string') OR
     (p_patch ? 'pinned' AND jsonb_typeof(p_patch->'pinned') IS DISTINCT FROM 'boolean') OR
     (p_patch ? 'custom_name' AND jsonb_typeof(p_patch->'custom_name') NOT IN ('string','null')) THEN
    RETURN jsonb_build_object('code','invalid');
  END IF;
  UPDATE public.app_tabs SET
    href=CASE WHEN p_patch ? 'href' THEN p_patch->>'href' ELSE href END,
    custom_name=CASE WHEN p_patch ? 'custom_name'
      THEN NULLIF(btrim(p_patch->>'custom_name'),'') ELSE custom_name END,
    pinned=CASE WHEN p_patch ? 'pinned'
      THEN (p_patch->>'pinned')::boolean ELSE pinned END,
    revision=revision+1,updated_at=now()
  WHERE id=tab.id RETURNING * INTO tab;
  RETURN jsonb_build_object('tab',to_jsonb(tab));
END;
$$;

CREATE FUNCTION public.activate_app_tab_content()
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('app-tab-content',591));
  IF EXISTS(SELECT 1 FROM public.app_tabs WHERE
      public.app_tab_content_version(href)=0 OR
      href_encryption_checked_at IS NULL OR
      (custom_name IS NOT NULL AND
        (public.app_tab_content_version(custom_name)=0 OR
          custom_name_encryption_checked_at IS NULL))) THEN RETURN false; END IF;
  INSERT INTO public.app_tab_content_scope(id) VALUES(true) ON CONFLICT DO NOTHING;
  RETURN true;
END;
$$;
REVOKE ALL ON FUNCTION public.activate_app_tab_content()
  FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.activate_app_tab_content() TO service_role;
COMMIT;
