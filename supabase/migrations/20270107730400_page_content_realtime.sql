-- Realtime carries identity and invalidation, never page content or envelopes.
BEGIN;
CREATE OR REPLACE FUNCTION public.broadcast_page_row()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE rec jsonb:=NULL;
  old_rec jsonb:=NULL;
BEGIN
  IF TG_OP<>'DELETE' THEN
    rec:=to_jsonb(NEW)-'title'-'icon'-'content'-'database_schema'-
      'database_title_name'-'property_values'-'search_text'-'search_tsv'-
      'encrypted_content';
  END IF;
  IF TG_OP<>'INSERT' THEN
    old_rec:=to_jsonb(OLD)-'title'-'icon'-'content'-'database_schema'-
      'database_title_name'-'property_values'-'search_text'-'search_tsv'-
      'encrypted_content';
  END IF;
  PERFORM realtime.send(jsonb_build_object('operation',TG_OP,
    'table',TG_TABLE_NAME,'schema',TG_TABLE_SCHEMA,'record',rec,
    'old_record',old_rec),TG_OP,
    'project:'||coalesce(NEW.project_id,OLD.project_id),true);
  RETURN NULL;
EXCEPTION WHEN OTHERS THEN RETURN NULL;
END;
$$;
DROP TRIGGER IF EXISTS pages_broadcast_update ON public.pages;
CREATE TRIGGER pages_broadcast_update AFTER UPDATE ON public.pages
  FOR EACH ROW WHEN (OLD.encrypted_content IS DISTINCT FROM NEW.encrypted_content OR
    OLD.title IS DISTINCT FROM NEW.title OR
    OLD.icon IS DISTINCT FROM NEW.icon OR
    OLD.parent_id IS DISTINCT FROM NEW.parent_id OR
    OLD.position IS DISTINCT FROM NEW.position OR
    OLD.favorite IS DISTINCT FROM NEW.favorite OR
    OLD.deleted_at IS DISTINCT FROM NEW.deleted_at OR
    OLD.deleted_root_id IS DISTINCT FROM NEW.deleted_root_id OR
    OLD.parent_block_removed IS DISTINCT FROM NEW.parent_block_removed OR
    OLD.content IS DISTINCT FROM NEW.content OR
    OLD.database_schema IS DISTINCT FROM NEW.database_schema OR
    OLD.database_title_name IS DISTINCT FROM NEW.database_title_name OR
    OLD.property_values IS DISTINCT FROM NEW.property_values)
  EXECUTE FUNCTION public.broadcast_page_row();
COMMIT;
