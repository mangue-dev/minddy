-- Keep routine screens current when Numo, MCP, a teammate, or another tab
-- changes a routine. Only identifiers are broadcast: the instruction can be
-- 20,000 characters and the client refetches the authoritative list anyway.

CREATE OR REPLACE FUNCTION public.broadcast_agent_routine_row()
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
    rec := jsonb_build_object(
      'id', NEW.id,
      'project_id', NEW.project_id
    );
  END IF;
  IF TG_OP <> 'INSERT' THEN
    old_rec := jsonb_build_object(
      'id', OLD.id,
      'project_id', OLD.project_id
    );
  END IF;

  IF pid IS NOT NULL THEN
    PERFORM realtime.send(
      jsonb_build_object(
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
  -- Realtime is a freshness aid and must never make the routine write fail.
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS agent_routines_broadcast ON public.agent_routines;
CREATE TRIGGER agent_routines_broadcast
AFTER INSERT OR UPDATE OR DELETE ON public.agent_routines
FOR EACH ROW
EXECUTE FUNCTION public.broadcast_agent_routine_row();
