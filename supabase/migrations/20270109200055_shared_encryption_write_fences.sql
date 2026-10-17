-- Shared encryption write fences (MIN-688 follow-up).
--
-- Every protected-content writer took its encryption fence in EXCLUSIVE mode:
-- the global activation lock of its family (`page-content-activation`,
-- `project-content-activation`…), the global marker lock
-- (`encryption-marker:<scope>`) or the per-project/per-user envelope key lock.
-- The fence only has to separate writers from ACTIVATION — the activation
-- function, a marker change, a content key creation or rotation — so that an
-- activation sees every committed writer and every later writer sees the
-- marker. It never had to separate writers from each other: rows carry their
-- own locks. Measured on production, the exclusive form serialized every page
-- write of the whole application (about 35 to 185 commits per second in
-- total), which live collaboration reaches with a few dozen typists.
--
-- Writers now take these locks in SHARED mode; the activation side
-- (`activate_*`, `guard_encryption_marker_change`,
-- `guard_envelope_key_activation`, the key registry functions) keeps the
-- EXCLUSIVE mode it already uses. Writers no longer wait for one another and
-- still wait for — and are waited for by — an activation, exactly as before.
--
-- Left unchanged on purpose: the Numo content guards (their activation locks
-- have no activation-side function in this schema, so the exclusive form may
-- carry another meaning), and every per-entity lock (storage quotas, object
-- paths, OTP emails, project authority), which are real mutual exclusions.

BEGIN;

DO $migration$
DECLARE
  target record;
  definition text;
  rewritten text;
BEGIN
  -- Each content guard and the activation lock its writers share.
  FOR target IN SELECT * FROM (VALUES
    ('guard_agent_routine_content', 'agent-routine-content-activation'),
    ('guard_ai_decision_evaluation_content', 'ai-decision-evaluation-content'),
    ('guard_api_key_content', 'api-key-content'),
    ('guard_app_tab_content', 'app-tab-content'),
    ('guard_billing_identity', 'billing-identity'),
    ('guard_forge_attachment_object_path', 'forge-attachment-writer-fence'),
    ('guard_forge_default_branch', 'forge-default-branch-activation'),
    ('guard_forge_oauth_token_content', 'forge-oauth-token-content'),
    ('guard_forge_relay_instance_content', 'forge-relay-instance-content'),
    ('guard_forge_relay_provisioning_content', 'forge-relay-provisioning-content'),
    ('guard_forge_relay_user_delivery_content', 'forge-relay-user-delivery-content'),
    ('guard_forge_repository_identity', 'forge-repository-name-activation'),
    ('guard_integration_content', 'integration-content'),
    ('guard_invitation_email_transition', 'invitation-email'),
    ('guard_oauth_client_content', 'oauth-client-content'),
    ('guard_oauth_code_content', 'oauth-code-content'),
    ('guard_page_content', 'page-content-activation'),
    ('guard_mcp_content', 'personal-mcp-content'),
    ('guard_project_content', 'project-content-activation'),
    ('guard_project_git_webhook_secret', 'project-git-webhook-secret'),
    ('guard_private_project_icon_storage', 'project-icon-activation'),
    ('guard_project_icon_reference', 'project-icon-activation'),
    ('guard_push_content', 'push-content'),
    ('guard_saved_view_bookmark', 'saved-view-bookmark-activation'),
    ('guard_stripe_webhook_payload', 'stripe-webhook-payload'),
    ('guard_user_ai_key_content', 'user-ai-key-content-activation'),
    ('guard_view_content', 'view-content-activation')
  ) AS fence(function_name, lock_name)
  LOOP
    SELECT pg_catalog.pg_get_functiondef(p.oid) INTO STRICT definition
      FROM pg_catalog.pg_proc p
      JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public' AND p.proname = target.function_name AND p.pronargs = 0;
    rewritten := pg_catalog.regexp_replace(definition,
      'pg_advisory_xact_lock[(]([[:space:]]*pg_catalog[.]hashtextextended[(][[:space:]]*'''
        || target.lock_name || ''')',
      'pg_advisory_xact_lock_shared(\1', 'g');
    IF rewritten = definition THEN
      RAISE EXCEPTION 'Cannot share the writer fence of %', target.function_name;
    END IF;
    EXECUTE rewritten;
  END LOOP;

  -- The generic snapshot fence: all three of its locks are writer-side.
  SELECT pg_catalog.pg_get_functiondef(
    'public.guard_encryption_snapshot_write()'::pg_catalog.regprocedure) INTO STRICT definition;
  rewritten := pg_catalog.regexp_replace(definition,
    'pg_catalog[.]pg_advisory_xact_lock[(]', 'pg_catalog.pg_advisory_xact_lock_shared(', 'g');
  IF rewritten = definition THEN
    RAISE EXCEPTION 'Cannot share the generic snapshot write fence';
  END IF;
  EXECUTE rewritten;
END;
$migration$;

-- Attachment objects: an object write shares the marker lock; a change of
-- the marker table itself (activation) keeps it exclusive.
CREATE OR REPLACE FUNCTION public.guard_attachment_object_snapshot_write()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
  IF TG_TABLE_NAME='attachment_object_encryption_scope' THEN
    PERFORM public.require_encryption_read_committed();
    PERFORM pg_catalog.pg_advisory_xact_lock(
      pg_catalog.hashtextextended(
        'encryption-marker:attachment_object_encryption_scope',591));
  ELSIF TG_TABLE_NAME='objects' THEN
    IF NEW.bucket_id='attachments' THEN
      PERFORM public.require_encryption_read_committed();
      PERFORM pg_catalog.pg_advisory_xact_lock_shared(
        pg_catalog.hashtextextended(
          'encryption-marker:attachment_object_encryption_scope',591));
    ELSIF TG_OP='UPDATE' THEN
      IF OLD.bucket_id='attachments' THEN
        PERFORM public.require_encryption_read_committed();
        PERFORM pg_catalog.pg_advisory_xact_lock_shared(
          pg_catalog.hashtextextended(
            'encryption-marker:attachment_object_encryption_scope',591));
        RAISE EXCEPTION 'attachment_bucket_immutable' USING ERRCODE='23514';
      END IF;
    END IF;
    IF NEW.bucket_id='attachments' AND
        EXISTS(SELECT 1 FROM public.attachment_object_encryption_scope) AND
        NEW.user_metadata->>'minddy_logical_size' IS NULL THEN
      RAISE EXCEPTION 'attachment_object_requires_encryption'
        USING ERRCODE='23514';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

COMMIT;
