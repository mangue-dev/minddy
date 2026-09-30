-- Commit verified content migrations and progress under the maintenance context.
-- Keep edit timestamps and revision guards intact for projects, pages and views.
BEGIN;
CREATE FUNCTION public.migrate_verified_content_backfill(
  p_table text,p_expected jsonb,p_values jsonb
) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE allowed text[]; required text[]; current_row jsonb; field record;
  assignments text:=''; prior text:=current_setting('minddy.encryption_maintenance',true);
  prior_verified text:=current_setting('minddy.encryption_backfill_verified',true);
BEGIN
  required:=ARRAY['id','content_revision','encryption_version','encrypted_content'];
  CASE p_table
    WHEN 'projects' THEN allowed:=ARRAY['name','automations','smart_assign_rules']; required:=required || ARRAY['owner_id'];
    WHEN 'pages' THEN allowed:=ARRAY['title','icon','content','database_schema','database_title_name','property_values','search_text','page_is_database','page_has_values','page_is_blank']; required:=required || ARRAY['project_id'];
    WHEN 'views' THEN allowed:=ARRAY['name','filters','display']; required:=required || ARRAY['project_id','user_id'];
    WHEN 'saved_views' THEN allowed:=ARRAY['name','href','name_index']; required:=required || ARRAY['user_id'];
    ELSE RAISE EXCEPTION 'unsupported_content_backfill_table' USING ERRCODE='22023';
  END CASE;
  allowed:=allowed || ARRAY['encrypted_content','encryption_version'];
  IF jsonb_typeof(p_expected) IS DISTINCT FROM 'object' OR
      jsonb_typeof(p_values) IS DISTINCT FROM 'object' OR NOT p_expected ?& required OR
      p_expected->>'id' IS NULL THEN
    RAISE EXCEPTION 'invalid_content_backfill_identity' USING ERRCODE='22023';
  END IF;
  EXECUTE format('SELECT to_jsonb(t) FROM public.%I t WHERE id=$1 FOR UPDATE',p_table)
    INTO current_row USING (p_expected->>'id')::uuid;
  IF current_row IS NULL THEN RETURN false; END IF;
  FOR field IN SELECT key,value FROM jsonb_each(p_expected) LOOP
    IF current_row->field.key IS DISTINCT FROM field.value THEN RETURN false; END IF;
  END LOOP;
  IF p_values='{}'::jsonb THEN
    IF (current_row->>'encryption_version')::integer < 1 OR current_row->>'encrypted_content' IS NULL THEN
      RAISE EXCEPTION 'content_backfill_verification_requires_ciphertext' USING ERRCODE='23514';
    END IF;
  ELSE
    IF NOT p_values ?& ARRAY['encrypted_content','encryption_version'] OR
        p_values->>'encrypted_content' IS NULL OR (p_values->>'encryption_version')::integer < 1 THEN
      RAISE EXCEPTION 'content_backfill_requires_ciphertext' USING ERRCODE='23514';
    END IF;
    FOR field IN SELECT key,value FROM jsonb_each(p_values) LOOP
      IF NOT field.key=ANY(allowed) THEN
        RAISE EXCEPTION 'invalid_content_backfill_column' USING ERRCODE='22023';
      END IF;
      assignments:=assignments || format('%I=(jsonb_populate_record(NULL::public.%I,$1)).%I,',field.key,p_table,field.key);
    END LOOP;
  END IF;
  PERFORM set_config('minddy.encryption_maintenance','on',true);
  PERFORM set_config('minddy.encryption_backfill_verified','on',true);
  EXECUTE format('UPDATE public.%I SET %s encryption_checked_at=clock_timestamp(),encryption_attempted_at=clock_timestamp() WHERE id=$2',p_table,assignments)
    USING p_values,(p_expected->>'id')::uuid;
  PERFORM set_config('minddy.encryption_maintenance',COALESCE(prior,''),true);
  PERFORM set_config('minddy.encryption_backfill_verified',COALESCE(prior_verified,''),true);
  RETURN true;
END;
$$;
REVOKE ALL ON FUNCTION public.migrate_verified_content_backfill(text,jsonb,jsonb)
  FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.migrate_verified_content_backfill(text,jsonb,jsonb) TO service_role;
NOTIFY pgrst, 'reload schema';
COMMIT;
