-- Per-project marker fences stay shared unless their own writer creates the
-- marker (MIN-688 final review fix).
--
-- 20270109200059 made `guard_encryption_snapshot_write` EXCLUSIVE while the
-- row's project had no row in one of the three per-project marker tables, so
-- that the first marker insert never upgrades a shared fence. It applied that
-- rule to every fence on those markers, but `issues` carries three of them:
-- `issue_encryption_scopes`, which `guard_issue_encryption` inserts, and the
-- two GitHub markers, which only the parent-scope guards on `issues` read. A
-- project that never synced encrypted GitHub metadata or comment URLs never
-- gets those markers, so every issue write there took a global exclusive lock
-- for good: issue writes were serialized across the application again, and a
-- multi-project `UPDATE … WHERE id IN (…)` (cycle rollover and fill) could
-- hold the key shared for one row and ask for it exclusive for the next,
-- which deadlocks two such statements. `github_issue_sync_metadata` and
-- `github_issue_comment_syncs` carry no `project_id`, so their fences were
-- exclusive forever.
--
-- The fence is now EXCLUSIVE only when this row's own guard is about to insert
-- the marker for the first time:
--   issues                      → issue_encryption_scopes (encryption_version > 0)
--   github_issue_sync_metadata  → github_issue_metadata_encryption_scopes
--                                 (content_encryption_version > 0)
--   github_issue_comment_syncs  → github_issue_comment_url_encryption_scopes
--                                 (html_url_encryption_version > 0)
-- and the project's marker row does not exist yet (the GitHub tables resolve
-- the project through `issue_id`, as their guards do). Every other write takes
-- the fence SHARED, as in 20270109200055: a writer that does not insert the
-- marker never asks for the exclusive lock, so it cannot upgrade, and
-- activation still takes the key exclusive at trigger depth 1. Singleton
-- markers keep the 20270109200059 rule.

BEGIN;

CREATE OR REPLACE FUNCTION public.guard_encryption_snapshot_write()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE owner_id text;
  lock_name text := TG_ARGV[0];
  marker_project text;
  sealed boolean := false;
  exclusive boolean := false;
BEGIN
  PERFORM public.require_encryption_read_committed();
  IF TG_ARGV[1]='project' THEN
    owner_id:=to_jsonb(NEW)->>'project_id';
    IF owner_id IS NULL AND TG_TABLE_NAME='issue_events' THEN
      SELECT project_id::text INTO owner_id FROM public.issues
        WHERE id=NEW.issue_id;
    END IF;
    IF owner_id IS NULL AND TG_TABLE_NAME='comments' THEN
      SELECT COALESCE(
        (SELECT project_id::text FROM public.issues WHERE id=NEW.issue_id),
        (SELECT project_id::text FROM public.objectives WHERE id=NEW.objective_id),
        (SELECT project_id::text FROM public.feedback_posts
          WHERE id=NEW.feedback_post_id)) INTO owner_id;
    END IF;
    IF owner_id IS NULL THEN
      RAISE EXCEPTION 'encryption_project_scope_missing' USING ERRCODE='23514';
    END IF;
    PERFORM pg_catalog.pg_advisory_xact_lock_shared(
      pg_catalog.hashtextextended(
        'envelope-key:project:' || owner_id || ':content',0));
  ELSIF TG_ARGV[1]='user' THEN
    owner_id:=to_jsonb(NEW)->>'user_id';
    IF owner_id IS NULL THEN
      RAISE EXCEPTION 'encryption_user_scope_missing' USING ERRCODE='23514';
    END IF;
    PERFORM pg_catalog.pg_advisory_xact_lock_shared(
      pg_catalog.hashtextextended(
        'envelope-key:user:' || owner_id || ':content',0));
  ELSE
    -- Per-project markers: exclusive only for the first insert by the row's
    -- own guard, which happens on an encrypted write.
    IF lock_name='issue_encryption_scopes' AND TG_TABLE_NAME='issues' THEN
      sealed := COALESCE((to_jsonb(NEW)->>'encryption_version')::int, 0) > 0;
      marker_project := to_jsonb(NEW)->>'project_id';
    ELSIF lock_name='github_issue_metadata_encryption_scopes' AND
        TG_TABLE_NAME='github_issue_sync_metadata' THEN
      sealed := COALESCE((to_jsonb(NEW)->>'content_encryption_version')::int, 0) > 0;
      IF sealed THEN
        SELECT project_id::text INTO marker_project FROM public.issues
          WHERE id=(to_jsonb(NEW)->>'issue_id')::uuid;
      END IF;
    ELSIF lock_name='github_issue_comment_url_encryption_scopes' AND
        TG_TABLE_NAME='github_issue_comment_syncs' THEN
      sealed := COALESCE((to_jsonb(NEW)->>'html_url_encryption_version')::int, 0) > 0;
      IF sealed THEN
        SELECT project_id::text INTO marker_project FROM public.issues
          WHERE id=(to_jsonb(NEW)->>'issue_id')::uuid;
      END IF;
    END IF;
    IF lock_name IN ('issue_encryption_scopes',
        'github_issue_metadata_encryption_scopes',
        'github_issue_comment_url_encryption_scopes') THEN
      -- A row with no parent issue is refused by its guard; the lookup only
      -- needs the project of a row that will insert the marker.
      IF sealed AND marker_project IS NOT NULL THEN
        EXECUTE pg_catalog.format(
          'SELECT NOT EXISTS (SELECT 1 FROM public.%I WHERE project_id::text = $1)', lock_name)
          INTO exclusive USING marker_project;
      END IF;
    ELSIF lock_name IN ('app_config_encryption_scope',
        'attachment_metadata_encryption_scope', 'feedback_identity_encryption_scope',
        'feedback_sso_encryption_scope', 'forge_mention_key_encryption_scope',
        'forge_relay_delivery_encryption_scope', 'invitation_email_scope',
        'numo_conversation_title_scope', 'numo_error_encryption_scope',
        'numo_event_content_scope', 'numo_final_content_scope',
        'numo_surface_destination_encryption_scope', 'numo_tool_content_scope',
        'numo_turn_intent_scope', 'numo_user_message_scope',
        'pr_comment_edit_encryption_scope', 'provider_operation_resource_encryption_scope',
        'pull_request_content_encryption_scope', 'pull_request_url_encryption_scope',
        'push_content_write_scope', 'view_share_token_encryption_scope') THEN
      EXECUTE pg_catalog.format('SELECT NOT EXISTS (SELECT 1 FROM public.%I)', lock_name)
        INTO exclusive;
    END IF;
    IF exclusive THEN
      PERFORM pg_catalog.pg_advisory_xact_lock(
        pg_catalog.hashtextextended('encryption-marker:' || lock_name,591));
    ELSE
      PERFORM pg_catalog.pg_advisory_xact_lock_shared(
        pg_catalog.hashtextextended('encryption-marker:' || lock_name,591));
    END IF;
  END IF;
  RETURN NEW;
END;
$function$;

COMMIT;
