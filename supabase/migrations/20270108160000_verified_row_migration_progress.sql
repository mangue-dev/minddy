-- Preserve verification as proof of successful decoding, and rotate failed attempts fairly.
BEGIN;

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger LANGUAGE plpgsql SET search_path = '' AS $function$
BEGIN
  IF current_setting('minddy.encryption_maintenance', true) = 'on' THEN
    NEW.updated_at := OLD.updated_at;
  ELSE
    NEW.updated_at := pg_catalog.now();
  END IF;
  RETURN NEW;
END;
$function$;

-- Progress updates run under encryption_maintenance. Suppress their existing
-- row broadcasts before resetting old, untrusted checked_at markers.
DO $migration$
DECLARE function_name text; definition text; rewritten text;
BEGIN
  FOREACH function_name IN ARRAY ARRAY[
    'broadcast_project_scoped', 'broadcast_feedback_post',
    'broadcast_event_scoped', 'broadcast_page_row',
    'broadcast_projects_row', 'broadcast_pull_request_row',
    'broadcast_scratchpad_row', 'broadcast_views_row'
  ] LOOP
    SELECT pg_catalog.pg_get_functiondef(p.oid) INTO definition
      FROM pg_catalog.pg_proc p JOIN pg_catalog.pg_namespace n
        ON n.oid = p.pronamespace
      WHERE n.nspname = 'public' AND p.proname = function_name
        AND p.pronargs = 0;
    IF definition IS NULL THEN
      RAISE EXCEPTION 'Missing metadata broadcast %', function_name;
    END IF;
    rewritten := pg_catalog.regexp_replace(definition, '\mBEGIN\M',
      E'BEGIN\n  IF TG_OP = ''UPDATE'' AND current_setting(''minddy.encryption_maintenance'', true) = ''on'' THEN\n    RETURN NULL;\n  END IF;', 'i');
    IF rewritten = definition THEN
      RAISE EXCEPTION 'Cannot update metadata broadcast %', function_name;
    END IF;
    EXECUTE rewritten;
  END LOOP;
END
$migration$;

-- A legacy worker's timestamp-only write is reclassified as an attempt below.
-- It must not generate a second user-facing activity invalidation.
DO $migration$
DECLARE definition text; rewritten text;
BEGIN
  SELECT pg_catalog.pg_get_functiondef('public.broadcast_event_scoped()'::regprocedure)
    INTO definition;
  rewritten := pg_catalog.regexp_replace(definition, '\mBEGIN\M',
    E'BEGIN\n  IF TG_OP = ''UPDATE'' AND '
    || '(to_jsonb(NEW) - ''encryption_checked_at'' - ''encryption_attempted_at'') '
    || 'IS NOT DISTINCT FROM '
    || '(to_jsonb(OLD) - ''encryption_checked_at'' - ''encryption_attempted_at'') '
    || 'THEN RETURN NULL; END IF;', 'i');
  IF rewritten = definition THEN
    RAISE EXCEPTION 'Cannot suppress progress-only event broadcast';
  END IF;
  EXECUTE rewritten;
END
$migration$;

DO $migration$
DECLARE target text;
BEGIN
  PERFORM pg_catalog.set_config('minddy.encryption_maintenance', 'on', true);
  FOREACH target IN ARRAY ARRAY[
    'feedback_posts', 'objectives', 'categories', 'comments', 'page_comments',
    'issues', 'project_drafts', 'issue_events', 'page_versions',
    'stat_events', 'user_scratchpad'
  ] LOOP
    EXECUTE format('ALTER TABLE public.%I ADD COLUMN encryption_attempted_at timestamptz', target);
    EXECUTE format('UPDATE public.%I SET encryption_checked_at = NULL WHERE encryption_checked_at IS NOT NULL', target);
    EXECUTE format('CREATE INDEX %I ON public.%I (encryption_attempted_at NULLS FIRST)',
      target || '_encryption_attempt_queue', target);
  END LOOP;
END
$migration$;

CREATE OR REPLACE FUNCTION public.broadcast_issue_content()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $function$
DECLARE pid uuid := COALESCE(NEW.project_id, OLD.project_id);
BEGIN
  IF TG_OP = 'UPDATE' AND
      current_setting('minddy.encryption_maintenance', true) = 'on' THEN
    RETURN NULL;
  END IF;
  PERFORM realtime.send(pg_catalog.jsonb_build_object(
    'operation', TG_OP, 'table', TG_TABLE_NAME, 'schema', TG_TABLE_SCHEMA,
    'record', CASE WHEN TG_OP = 'DELETE' THEN NULL ELSE
      pg_catalog.jsonb_build_object('id', NEW.id, 'project_id', NEW.project_id) END,
    'old_record', CASE WHEN TG_OP = 'INSERT' THEN NULL ELSE
      pg_catalog.jsonb_build_object('id', OLD.id, 'project_id', OLD.project_id) END
  ), TG_OP, 'project:' || pid, true);
  RETURN NULL;
EXCEPTION WHEN OTHERS THEN RETURN NULL;
END;
$function$;

-- Existing revision guards compare row JSON. Exclude the new progress field
-- from those comparisons so a retry never looks like a user edit.
DO $migration$
DECLARE function_name text; definition text; rewritten text;
BEGIN
  FOREACH function_name IN ARRAY ARRAY[
    'guard_feedback_post_encryption', 'guard_objective_encryption',
    'guard_category_encryption', 'guard_comment_encryption',
    'guard_issue_encryption', 'guard_project_draft_encryption',
    'guard_history_encryption'
  ] LOOP
    SELECT pg_catalog.pg_get_functiondef(p.oid) INTO definition
      FROM pg_catalog.pg_proc p JOIN pg_catalog.pg_namespace n
        ON n.oid = p.pronamespace
      WHERE n.nspname = 'public' AND p.proname = function_name
        AND p.pronargs = 0;
    IF definition IS NULL THEN
      RAISE EXCEPTION 'Missing encryption guard %', function_name;
    END IF;
    rewritten := pg_catalog.replace(definition,
      '''encryption_checked_at'',''encryption_revision''',
      '''encryption_checked_at'',''encryption_attempted_at'',''encryption_revision''');
    IF rewritten = definition THEN
      RAISE EXCEPTION 'Cannot update encryption guard %', function_name;
    END IF;
    EXECUTE rewritten;
  END LOOP;
END
$migration$;

-- Retired scan calls on older app instances must not create false proofs.
CREATE FUNCTION public.reclassify_unverified_row_check()
RETURNS trigger LANGUAGE plpgsql SET search_path = '' AS $function$
BEGIN
  IF current_setting('minddy.encryption_backfill_verified', true) IS DISTINCT FROM 'on'
      AND NEW.encryption_checked_at IS DISTINCT FROM OLD.encryption_checked_at
      AND NEW.encrypted_content IS NOT DISTINCT FROM OLD.encrypted_content
      AND NEW.encryption_version IS NOT DISTINCT FROM OLD.encryption_version
      AND to_jsonb(NEW)->TG_ARGV[0] IS NOT DISTINCT FROM to_jsonb(OLD)->TG_ARGV[0] THEN
    NEW.encryption_attempted_at := NEW.encryption_checked_at;
    NEW.encryption_checked_at := OLD.encryption_checked_at;
  END IF;
  RETURN NEW;
END;
$function$;
REVOKE ALL ON FUNCTION public.reclassify_unverified_row_check()
  FROM PUBLIC, anon, authenticated;

DO $migration$
DECLARE target text;
BEGIN
  FOREACH target IN ARRAY ARRAY[
    'feedback_posts', 'objectives', 'categories', 'comments', 'page_comments',
    'issues', 'project_drafts', 'issue_events', 'page_versions',
    'stat_events', 'user_scratchpad'
  ] LOOP
    EXECUTE format('CREATE TRIGGER a_reclassify_unverified_check BEFORE UPDATE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.reclassify_unverified_row_check(%L)',
      target, CASE WHEN target = 'user_scratchpad' THEN 'rev'
        ELSE 'encryption_revision' END);
  END LOOP;
END
$migration$;

-- A successful checked_at write also rotates the scan cursor. A failed attempt
-- updates only attempted_at, so checked_at remains a verification proof.
CREATE FUNCTION public.rotate_encryption_backfill_attempt()
RETURNS trigger LANGUAGE plpgsql SET search_path = '' AS $function$
BEGIN
  IF to_jsonb(NEW)->TG_ARGV[0] IS DISTINCT FROM to_jsonb(OLD)->TG_ARGV[0] THEN
    NEW := pg_catalog.jsonb_populate_record(NEW,
      pg_catalog.jsonb_build_object(TG_ARGV[1], to_jsonb(NEW)->TG_ARGV[0]));
  END IF;
  RETURN NEW;
END;
$function$;
REVOKE ALL ON FUNCTION public.rotate_encryption_backfill_attempt()
  FROM PUBLIC, anon, authenticated;

DO $migration$
DECLARE spec record;
BEGIN
  PERFORM pg_catalog.set_config('minddy.encryption_maintenance', 'on', true);
  FOR spec IN SELECT * FROM (VALUES
    ('github_issue_comment_syncs', 'html_url_encryption_checked_at', 'html_url_encryption_attempted_at'),
    ('views', 'encryption_checked_at', 'encryption_attempted_at'),
    ('project_git_links', 'default_branch_checked_at', 'default_branch_attempted_at'),
    ('attachments', 'content_encryption_checked_at', 'content_encryption_attempted_at'),
    ('page_files', 'content_encryption_checked_at', 'content_encryption_attempted_at'),
    ('forge_relay_audit', 'detail_checked_at', 'detail_attempted_at'),
    ('project_git_links', 'repo_name_checked_at', 'repo_name_attempted_at'),
    ('pull_requests', 'repo_name_checked_at', 'repo_name_attempted_at'),
    ('pull_request_syncs', 'repo_name_checked_at', 'repo_name_attempted_at'),
    ('pr_comment_edits', 'repo_name_checked_at', 'repo_name_attempted_at'),
    ('forge_relay_link_mirror', 'repo_name_checked_at', 'repo_name_attempted_at'),
    ('forge_relay_claims', 'repo_name_checked_at', 'repo_name_attempted_at'),
    ('forge_repository_names', 'encryption_checked_at', 'encryption_attempted_at'),
    ('projects', 'encryption_checked_at', 'encryption_attempted_at'),
    ('pages', 'encryption_checked_at', 'encryption_attempted_at'),
    ('saved_views', 'encryption_checked_at', 'encryption_attempted_at'),
    ('projects', 'icon_checked_at', 'icon_attempted_at'),
    ('forge_relay_deliveries', 'content_encryption_checked_at', 'content_encryption_attempted_at'),
    ('view_shares', 'content_encryption_checked_at', 'content_encryption_attempted_at'),
    ('github_issue_sync_metadata', 'content_encryption_checked_at', 'content_encryption_attempted_at'),
    ('pr_comment_edits', 'body_encryption_checked_at', 'body_encryption_attempted_at'),
    ('app_config', 'encryption_checked_at', 'encryption_attempted_at')
  ) AS values_list(table_name, checked_column, attempted_column) LOOP
    EXECUTE format('ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS %I timestamptz',
      spec.table_name, spec.attempted_column);
    EXECUTE format('UPDATE public.%I SET %I = NULL WHERE %I IS NOT NULL',
      spec.table_name, spec.checked_column, spec.checked_column);
    EXECUTE format('CREATE INDEX %I ON public.%I (%I NULLS FIRST)',
      spec.table_name || '_' || spec.attempted_column || '_queue',
      spec.table_name, spec.attempted_column);
    EXECUTE format('CREATE TRIGGER %I BEFORE UPDATE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.rotate_encryption_backfill_attempt(%L, %L)',
      spec.table_name || '_' || spec.checked_column || '_attempt',
      spec.table_name, spec.checked_column, spec.attempted_column);
  END LOOP;
END
$migration$;

CREATE OR REPLACE FUNCTION public.mark_app_config_attempt(
  p_key text, p_old_value text, p_old_cipher text, p_old_version integer
) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $function$
DECLARE current_row public.app_config%ROWTYPE;
BEGIN
  SELECT * INTO current_row FROM public.app_config WHERE key = p_key FOR UPDATE;
  IF NOT FOUND OR current_row.value IS DISTINCT FROM p_old_value OR
      current_row.encrypted_content IS DISTINCT FROM p_old_cipher OR
      current_row.encryption_version IS DISTINCT FROM p_old_version THEN
    RETURN false;
  END IF;
  UPDATE public.app_config SET encryption_attempted_at = pg_catalog.clock_timestamp()
    WHERE key = p_key;
  RETURN true;
END;
$function$;
REVOKE ALL ON FUNCTION public.mark_app_config_attempt(text,text,text,integer)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.mark_app_config_attempt(text,text,text,integer)
  TO service_role;

-- The worker supplies the original projected fields. Every field is compared
-- exactly before changing progress; the unique identity fields are mandatory.
CREATE FUNCTION public.record_encryption_backfill_progress(
  p_table text, p_attempt_column text, p_expected jsonb,
  p_verified boolean DEFAULT false
) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $function$
DECLARE required_keys text[]; checked_column text; key_name text; field record;
  predicate text := ''; identity_predicate text := '';
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
    identity_predicate := identity_predicate ||
      format(' AND to_jsonb(t)->%L IS NOT DISTINCT FROM %L::jsonb',
        key_name, (p_expected->key_name)::text);
  END LOOP;
  FOR field IN SELECT key, value FROM pg_catalog.jsonb_each(p_expected) LOOP
    predicate := predicate || format(' AND to_jsonb(t)->%L IS NOT DISTINCT FROM %L::jsonb',
      field.key, field.value::text);
  END LOOP;
  -- Lock the current identity first. A stale snapshot still advances its retry
  -- cursor, but it can never establish a checked_at verification proof.
  EXECUTE format('SELECT (true %s) FROM public.%I t WHERE true %s FOR UPDATE',
    predicate, p_table, identity_predicate) INTO matches;
  IF matches IS NULL THEN RETURN false; END IF;
  PERFORM pg_catalog.set_config('minddy.encryption_maintenance', 'on', true);
  IF p_verified AND matches THEN
    PERFORM pg_catalog.set_config('minddy.encryption_backfill_verified', 'on', true);
    EXECUTE format('UPDATE public.%I t SET %I = pg_catalog.clock_timestamp(), %I = pg_catalog.clock_timestamp() WHERE true %s',
      p_table, p_attempt_column, checked_column, identity_predicate);
  ELSE
    EXECUTE format('UPDATE public.%I t SET %I = pg_catalog.clock_timestamp() WHERE true %s',
      p_table, p_attempt_column, identity_predicate);
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
