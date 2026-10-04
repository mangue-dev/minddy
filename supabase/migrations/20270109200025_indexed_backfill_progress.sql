-- Locate maintenance rows through their typed identity indexes. Snapshot
-- verification and the verified-only write proof remain unchanged.

BEGIN;

CREATE OR REPLACE FUNCTION public.record_encryption_backfill_progress(
  p_table text, p_attempt_column text, p_expected jsonb,
  p_verified boolean DEFAULT false
) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $function$
DECLARE required_keys text[]; checked_column text; key_name text; field record;
  predicate text := ''; identity_predicate text := '';
  identity jsonb := '{}'::jsonb;
  matches boolean; affected integer;
  previous_setting text := current_setting('minddy.encryption_maintenance', true);
  previous_verified text := current_setting('minddy.encryption_backfill_verified', true);
BEGIN
  SELECT keys, checked INTO required_keys, checked_column FROM (VALUES
    ('feedback_posts','encryption_attempted_at','encryption_checked_at',ARRAY['id']::text[]),
    ('objectives','encryption_attempted_at','encryption_checked_at',ARRAY['id']::text[]),
    ('categories','encryption_attempted_at','encryption_checked_at',ARRAY['id']::text[]),
    ('comments','encryption_attempted_at','encryption_checked_at',ARRAY['id']::text[]),
    ('page_comments','encryption_attempted_at','encryption_checked_at',ARRAY['id']::text[]),
    ('issues','encryption_attempted_at','encryption_checked_at',ARRAY['id']::text[]),
    ('project_drafts','encryption_attempted_at','encryption_checked_at',ARRAY['id']::text[]),
    ('issue_events','encryption_attempted_at','encryption_checked_at',ARRAY['id']::text[]),
    ('page_versions','encryption_attempted_at','encryption_checked_at',ARRAY['id']::text[]),
    ('stat_events','encryption_attempted_at','encryption_checked_at',ARRAY['id']::text[]),
    ('user_scratchpad','encryption_attempted_at','encryption_checked_at',ARRAY['user_id']::text[]),
    ('github_issue_comment_syncs','html_url_encryption_attempted_at','html_url_encryption_checked_at',ARRAY['issue_id','remote_comment_id']::text[]),
    ('views','encryption_attempted_at','encryption_checked_at',ARRAY['id']::text[]),
    ('project_git_links','default_branch_attempted_at','default_branch_checked_at',ARRAY['project_id']::text[]),
    ('attachments','content_encryption_attempted_at','content_encryption_checked_at',ARRAY['id']::text[]),
    ('page_files','content_encryption_attempted_at','content_encryption_checked_at',ARRAY['id']::text[]),
    ('forge_relay_audit','detail_attempted_at','detail_checked_at',ARRAY['id']::text[]),
    ('project_git_links','repo_name_attempted_at','repo_name_checked_at',ARRAY['id']::text[]),
    ('pull_requests','repo_name_attempted_at','repo_name_checked_at',ARRAY['id']::text[]),
    ('pull_request_syncs','repo_name_attempted_at','repo_name_checked_at',ARRAY['provider','repo_full_name']::text[]),
    ('pr_comment_edits','repo_name_attempted_at','repo_name_checked_at',ARRAY['id']::text[]),
    ('forge_relay_link_mirror','repo_name_attempted_at','repo_name_checked_at',ARRAY['instance_id','provider','external_repo_id']::text[]),
    ('forge_relay_claims','repo_name_attempted_at','repo_name_checked_at',ARRAY['id']::text[]),
    ('forge_repository_names','encryption_attempted_at','encryption_checked_at',ARRAY['provider','token']::text[]),
    ('projects','encryption_attempted_at','encryption_checked_at',ARRAY['id']::text[]),
    ('pages','encryption_attempted_at','encryption_checked_at',ARRAY['id']::text[]),
    ('saved_views','encryption_attempted_at','encryption_checked_at',ARRAY['id']::text[]),
    ('projects','icon_attempted_at','icon_checked_at',ARRAY['id']::text[]),
    ('forge_relay_deliveries','content_encryption_attempted_at','content_encryption_checked_at',ARRAY['id']::text[]),
    ('view_shares','content_encryption_attempted_at','content_encryption_checked_at',ARRAY['id']::text[]),
    ('github_issue_sync_metadata','content_encryption_attempted_at','content_encryption_checked_at',ARRAY['issue_id']::text[]),
    ('pr_comment_edits','body_encryption_attempted_at','body_encryption_checked_at',ARRAY['id']::text[]),
    ('app_config','encryption_attempted_at','encryption_checked_at',ARRAY['key']::text[])
  ) AS allowed(table_name, attempted, checked, keys)
  WHERE table_name = p_table AND attempted = p_attempt_column;
  IF required_keys IS NULL OR pg_catalog.jsonb_typeof(p_expected) <> 'object'
      OR p_expected = '{}'::jsonb OR p_verified IS NULL THEN
    RAISE EXCEPTION 'invalid_backfill_progress' USING ERRCODE = '22023';
  END IF;
  FOREACH key_name IN ARRAY required_keys LOOP
    IF NOT p_expected ? key_name OR p_expected->key_name = 'null'::jsonb THEN
      RAISE EXCEPTION 'invalid_backfill_identity' USING ERRCODE = '22023';
    END IF;
    identity := identity || pg_catalog.jsonb_build_object(key_name, p_expected->key_name);
    identity_predicate := identity_predicate ||
      format(' AND t.%I = (pg_catalog.jsonb_populate_record(NULL::public.%I, $1)).%I',
        key_name, p_table, key_name);
  END LOOP;
  FOR field IN SELECT key, value FROM pg_catalog.jsonb_each(p_expected) LOOP
    predicate := predicate || format(' AND to_jsonb(t)->%L IS NOT DISTINCT FROM %L::jsonb',
      field.key, field.value::text);
  END LOOP;
  -- Typed equality uses identity indexes instead of serializing every table row.
  -- Lock the current identity first. A stale snapshot still advances its retry
  -- cursor, but it can never establish a checked_at verification proof.
  EXECUTE format('SELECT (true %s) FROM public.%I t WHERE true %s FOR UPDATE',
    predicate, p_table, identity_predicate) INTO matches USING identity;
  IF matches IS NULL THEN RETURN false; END IF;
  PERFORM pg_catalog.set_config('minddy.encryption_maintenance', 'on', true);
  IF p_verified AND matches THEN
    PERFORM pg_catalog.set_config('minddy.encryption_backfill_verified', 'on', true);
    EXECUTE format('UPDATE public.%I t SET %I = pg_catalog.clock_timestamp(), %I = pg_catalog.clock_timestamp() WHERE true %s',
      p_table, p_attempt_column, checked_column, identity_predicate) USING identity;
  ELSE
    EXECUTE format('UPDATE public.%I t SET %I = pg_catalog.clock_timestamp() WHERE true %s',
      p_table, p_attempt_column, identity_predicate) USING identity;
  END IF;
  GET DIAGNOSTICS affected = ROW_COUNT;
  PERFORM pg_catalog.set_config('minddy.encryption_maintenance',
    COALESCE(previous_setting, ''), true);
  IF p_verified AND matches THEN
    PERFORM pg_catalog.set_config('minddy.encryption_backfill_verified',
      COALESCE(previous_verified, ''), true);
  END IF;
  RETURN matches AND affected = 1;
END;
$function$;
REVOKE ALL ON FUNCTION public.record_encryption_backfill_progress(text,text,jsonb,boolean)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_encryption_backfill_progress(text,text,jsonb,boolean)
  TO service_role;

COMMIT;
