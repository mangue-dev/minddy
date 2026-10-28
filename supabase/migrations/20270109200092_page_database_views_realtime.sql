-- Live saved views of a page database (MIN-764 follow-up).
--
-- A view created or changed by Numo, the MCP, a teammate or another tab only
-- appeared after a reload. Every write now wakes the project topic, like the
-- routines do: the event carries identifiers only, never the name or the
-- configuration (both may be sealed), and the client refetches the views of
-- that database through the API, which checks membership again.
--
-- Nothing changes for the table itself: it stays service-role only, and the
-- private `project:{id}` topic is authorized for project members alone by the
-- Realtime policies, so only they receive the event.

CREATE OR REPLACE FUNCTION public.broadcast_page_database_view_row()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  pid uuid := COALESCE(NEW.project_id, OLD.project_id);
  rec jsonb := NULL;
  old_rec jsonb := NULL;
BEGIN
  IF TG_OP <> 'DELETE' THEN
    rec := pg_catalog.jsonb_build_object(
      'id', NEW.id,
      'page_id', NEW.page_id,
      'project_id', NEW.project_id
    );
  END IF;
  IF TG_OP <> 'INSERT' THEN
    old_rec := pg_catalog.jsonb_build_object(
      'id', OLD.id,
      'page_id', OLD.page_id,
      'project_id', OLD.project_id
    );
  END IF;

  IF pid IS NOT NULL THEN
    PERFORM realtime.send(
      pg_catalog.jsonb_build_object(
        'operation', TG_OP,
        'table', TG_TABLE_NAME,
        'schema', TG_TABLE_SCHEMA,
        'record', rec,
        'old_record', old_rec
      ),
      TG_OP,
      'project:' || pid,
      true
    );
  END IF;
  RETURN NULL;
EXCEPTION WHEN OTHERS THEN
  -- Realtime is a freshness aid and must never make the view write fail.
  RETURN NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.broadcast_page_database_view_row()
  FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS page_database_views_broadcast ON public.page_database_views;
CREATE TRIGGER page_database_views_broadcast
AFTER INSERT OR UPDATE OR DELETE ON public.page_database_views
FOR EACH ROW
EXECUTE FUNCTION public.broadcast_page_database_view_row();
