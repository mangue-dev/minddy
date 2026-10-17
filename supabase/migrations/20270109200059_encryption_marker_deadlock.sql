-- Encryption marker deadlock (MIN-688 review fix).
--
-- Migration 20270109200055 made the writer side of the encryption fences
-- SHARED. One writer path still asks for the same key EXCLUSIVE in the same
-- transaction: 24 content guards re-assert their family's marker on every
-- protected write (`INSERT INTO <scope> … ON CONFLICT DO NOTHING`, for
-- example `guard_issue_encryption` into `issue_encryption_scopes`), and the
-- marker table's `BEFORE INSERT` trigger `guard_encryption_marker_change`
-- fires even when the insert then conflicts. It takes
-- `encryption-marker:<scope>` EXCLUSIVE, which the row's fence
-- (`guard_encryption_snapshot_write`) already holds SHARED. One writer alone
-- upgrades its own lock; two concurrent writers each hold SHARED and wait for
-- EXCLUSIVE, and Postgres aborts one with 40P01. Production recorded such a
-- deadlock. The 20270109200055 header said writers no longer wait for one
-- another and nothing else changed; that was wrong for these families.
--
-- 1. `guard_encryption_marker_change`: a guard (trigger depth > 1) inserting a
--    marker whose row already exists changes nothing, so the row is skipped
--    (RETURN NULL, the same outcome as ON CONFLICT DO NOTHING) without taking
--    the lock. Direct marker writes (depth 1: activation functions, including
--    their ON CONFLICT DO UPDATE of `activated_at`) keep the exclusive lock.
-- 2. `guard_encryption_snapshot_write`: for the 24 marker tables a guard
--    inserts into, the fence is EXCLUSIVE while the row's marker does not exist
--    yet (the first protected write of a family, or of a project for the three
--    per-project markers; a per-project marker whose row carries no
--    `project_id` stays exclusive until it exists), and SHARED once it does.
--    The first marker insert therefore runs under an exclusive fence, as
--    before 20270109200055, and every later write shares it.
--
-- Unchanged: activation functions, marker changes at depth 1, the key
-- registry and every other fence keep their modes. A marker is immutable once
-- inserted, so a writer that saw it cannot race its creation.

BEGIN;

CREATE OR REPLACE FUNCTION public.guard_encryption_marker_change()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  key_column text;
  present boolean;
BEGIN
  IF TG_OP='DELETE' THEN
    IF pg_catalog.pg_trigger_depth()>1 THEN RETURN OLD; END IF;
    RAISE EXCEPTION 'encryption_marker_immutable' USING ERRCODE='23514';
  END IF;
  PERFORM public.require_encryption_read_committed();
  -- A guard re-asserting an existing marker: nothing changes, so nothing to
  -- fence. Taking the exclusive lock here would upgrade the shared fence the
  -- writer already holds, and deadlock two concurrent writers.
  IF TG_OP='INSERT' AND pg_catalog.pg_trigger_depth()>1 THEN
    key_column := CASE WHEN to_jsonb(NEW) ? 'project_id' THEN 'project_id' ELSE 'id' END;
    EXECUTE pg_catalog.format(
      'SELECT EXISTS (SELECT 1 FROM %I.%I WHERE %I::text = $1)',
      TG_TABLE_SCHEMA, TG_TABLE_NAME, key_column)
      INTO present USING to_jsonb(NEW)->>key_column;
    IF present THEN RETURN NULL; END IF;
  END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'encryption-marker:' || TG_TABLE_NAME,591));
  IF TG_OP='UPDATE' AND
      ((to_jsonb(NEW)-ARRAY['activated_at']) IS DISTINCT FROM
        (to_jsonb(OLD)-ARRAY['activated_at']) OR
       ((to_jsonb(OLD)->>'activated_at') IS NOT NULL AND
        (to_jsonb(NEW)->>'activated_at') IS DISTINCT FROM
          (to_jsonb(OLD)->>'activated_at'))) THEN
    RAISE EXCEPTION 'encryption_marker_immutable' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.guard_encryption_snapshot_write()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE owner_id text;
  lock_name text := TG_ARGV[0];
  marker_project text;
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
    -- Marker tables that a content guard inserts into on a protected write.
    -- Until the row's marker exists, its first insert must not run under a
    -- shared fence: two writers would each wait for the other's share.
    IF lock_name IN ('issue_encryption_scopes',
        'github_issue_metadata_encryption_scopes',
        'github_issue_comment_url_encryption_scopes') THEN
      marker_project := to_jsonb(NEW)->>'project_id';
      IF marker_project IS NULL THEN
        -- The row does not say which project's marker its guard inserts.
        exclusive := true;
      ELSE
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
