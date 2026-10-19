-- MIN-725: drop the command palette's saved views.
--
-- The command palette no longer offers personal saved views: the bookmarks
-- (a name and an in-app link per user) are gone from the application, its API
-- and account export. This migration removes their table, the encryption
-- activation marker and the SQL functions that served them, and rewrites the
-- two live encryption maintenance functions without their `saved_views`
-- branch.
--
-- Kept: board views (`views`, `view_shares`) and their encryption, which the
-- application still calls saved views in places.
--
-- Destructive: retained bookmarks are deleted with the table. Apply it only
-- after the application release that stops reading them is deployed.

-- 1. The bookmark table, with its triggers, indexes and policies.
DROP TABLE public.saved_views;

-- 2. Its encryption activation marker and functions.
DROP TABLE public.saved_view_bookmark_encryption_scope;
DROP FUNCTION public.activate_saved_view_bookmarks();
DROP FUNCTION public.guard_saved_view_bookmark();

-- 3. Live maintenance functions, without the `saved_views` branch. Each body
-- is its latest definition (20270109200025 and 20270109200011) less that
-- branch.

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

CREATE OR REPLACE FUNCTION public.migrate_verified_content_backfill(
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
