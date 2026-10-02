-- Icon verification is maintenance, so it must not invalidate project-content CAS.
BEGIN;
CREATE OR REPLACE FUNCTION public.verify_project_icon(p_id uuid,p_url text,p_path text)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE changed integer;
  prior text:=current_setting('minddy.encryption_maintenance',true);
BEGIN
  PERFORM set_config('minddy.encryption_maintenance','on',true);
  UPDATE public.projects SET icon_checked_at=clock_timestamp()
    WHERE id=p_id AND icon_url=p_url AND icon_storage_path=p_path;
  GET DIAGNOSTICS changed=ROW_COUNT;
  PERFORM set_config('minddy.encryption_maintenance',COALESCE(prior,''),true);
  RETURN changed=1;
END;
$$;
COMMIT;
