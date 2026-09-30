-- Keep queued steering content and its SQL transcript copy in one project scope.
BEGIN;

ALTER TABLE public.agent_run_messages
  ADD COLUMN content_encryption_version integer NOT NULL DEFAULT 0,
  ADD COLUMN encryption_checked_at timestamptz,
  ADD CONSTRAINT agent_run_messages_encryption_state CHECK (
    content_encryption_version = 0 OR
    (content_encryption_version > 0 AND mentions IS NULL
      AND COALESCE((content::jsonb ->> 'format')::integer = 3, false)
      AND COALESCE((content::jsonb ->> 'keyVersion')::integer = content_encryption_version, false))
  ) NOT VALID;
CREATE INDEX agent_run_messages_encryption_queue
  ON public.agent_run_messages (encryption_checked_at NULLS FIRST, id);
REVOKE INSERT, UPDATE, DELETE ON public.agent_run_messages FROM anon, authenticated;

CREATE FUNCTION public.agent_queue_content_version(p_content text)
RETURNS integer LANGUAGE plpgsql IMMUTABLE SET search_path = '' AS $$
DECLARE parsed jsonb; version integer;
BEGIN
  parsed := p_content::jsonb;
  IF (parsed ->> 'format')::integer IS DISTINCT FROM 3 THEN RETURN 0; END IF;
  version := (parsed ->> 'keyVersion')::integer;
  IF version IS NULL OR version < 1 THEN RETURN 0; END IF;
  RETURN version;
EXCEPTION WHEN invalid_text_representation OR numeric_value_out_of_range THEN
  RETURN 0;
END;
$$;
REVOKE ALL ON FUNCTION public.agent_queue_content_version(text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.agent_queue_content_version(text) TO service_role;

CREATE FUNCTION public.guard_agent_queue_message()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE project uuid;
BEGIN
  SELECT r.project_id INTO project FROM public.agent_runs r
    WHERE r.id = NEW.run_id FOR SHARE;
  IF project IS NULL THEN
    RAISE EXCEPTION 'agent_queue_run_missing' USING ERRCODE = '23503';
  END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(project::text, 59116));
  IF TG_OP = 'UPDATE' AND (
    NEW.id IS DISTINCT FROM OLD.id OR NEW.run_id IS DISTINCT FROM OLD.run_id OR
    NEW.content IS DISTINCT FROM OLD.content OR
    NEW.mentions IS DISTINCT FROM OLD.mentions OR
    NEW.content_encryption_version IS DISTINCT FROM OLD.content_encryption_version
  ) AND current_setting('minddy.encryption_maintenance', true) IS DISTINCT FROM 'on' THEN
    RAISE EXCEPTION 'agent_queue_content_is_immutable' USING ERRCODE = '23514';
  END IF;
  IF TG_OP = 'UPDATE' AND NEW.content_encryption_version < OLD.content_encryption_version THEN
    RAISE EXCEPTION 'agent_queue_version_rollback' USING ERRCODE = '23514';
  END IF;
  IF NEW.content_encryption_version > 0 THEN
    INSERT INTO public.agent_launch_encryption_scopes(project_id)
      VALUES (project) ON CONFLICT DO NOTHING;
  ELSIF EXISTS (SELECT 1 FROM public.agent_launch_encryption_scopes
      WHERE project_id = project) AND (
        TG_OP = 'INSERT' OR NEW.content IS DISTINCT FROM OLD.content OR
        NEW.mentions IS DISTINCT FROM OLD.mentions OR
        NEW.content_encryption_version IS DISTINCT FROM OLD.content_encryption_version
      ) THEN
    RAISE EXCEPTION 'agent_queue_requires_encryption' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER agent_queue_message_guard
  BEFORE INSERT OR UPDATE ON public.agent_run_messages
  FOR EACH ROW EXECUTE FUNCTION public.guard_agent_queue_message();
REVOKE ALL ON FUNCTION public.guard_agent_queue_message()
  FROM PUBLIC, anon, authenticated;

CREATE FUNCTION public.guard_agent_queue_copy()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE source public.agent_run_messages; project uuid;
BEGIN
  IF NEW.legacy_queue_message_id IS NULL AND
      (TG_OP = 'INSERT' OR OLD.legacy_queue_message_id IS NULL) THEN RETURN NEW; END IF;
  IF TG_OP = 'UPDATE' AND (
    NEW.content IS DISTINCT FROM OLD.content OR
    NEW.content_encryption_version IS DISTINCT FROM OLD.content_encryption_version OR
    NEW.legacy_queue_message_id IS DISTINCT FROM OLD.legacy_queue_message_id OR
    NEW.conversation_id IS DISTINCT FROM OLD.conversation_id OR
    NEW.run_id IS DISTINCT FROM OLD.run_id OR NEW.source IS DISTINCT FROM OLD.source
  ) AND current_setting('minddy.encryption_maintenance', true) IS DISTINCT FROM 'on' THEN
    RAISE EXCEPTION 'agent_queue_copy_is_immutable' USING ERRCODE = '23514';
  END IF;
  SELECT * INTO source FROM public.agent_run_messages
    WHERE id = NEW.legacy_queue_message_id;
  SELECT r.project_id INTO project FROM public.agent_runs r
    WHERE r.id = source.run_id;
  IF source.id IS NULL OR project IS NULL OR
      NEW.run_id IS DISTINCT FROM source.run_id OR NEW.source <> 'steering' OR
      NEW.content IS DISTINCT FROM source.content OR
      NEW.content_encryption_version IS DISTINCT FROM source.content_encryption_version OR
      NOT EXISTS (SELECT 1 FROM public.agent_conversations c
        WHERE c.id = NEW.conversation_id AND c.project_id = project) THEN
    RAISE EXCEPTION 'agent_queue_copy_mismatch' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER agent_queue_copy_guard
  BEFORE INSERT OR UPDATE ON public.agent_messages
  FOR EACH ROW EXECUTE FUNCTION public.guard_agent_queue_copy();
REVOKE ALL ON FUNCTION public.guard_agent_queue_copy()
  FROM PUBLIC, anon, authenticated;

CREATE FUNCTION public.guard_agent_queue_parent_scope()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF NEW.project_id IS DISTINCT FROM OLD.project_id AND EXISTS (
    SELECT 1 FROM public.agent_run_messages q WHERE q.run_id = OLD.id
  ) AND (EXISTS (
    SELECT 1 FROM public.agent_launch_encryption_scopes
      WHERE project_id IN (OLD.project_id, NEW.project_id)
  ) OR EXISTS (
    SELECT 1 FROM public.agent_run_messages q
      WHERE q.run_id = OLD.id AND q.content_encryption_version > 0
  )) THEN
    RAISE EXCEPTION 'agent_queue_project_is_immutable' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER agent_run_queue_scope_guard
  BEFORE UPDATE OF project_id ON public.agent_runs
  FOR EACH ROW EXECUTE FUNCTION public.guard_agent_queue_parent_scope();
REVOKE ALL ON FUNCTION public.guard_agent_queue_parent_scope()
  FROM PUBLIC, anon, authenticated;

CREATE FUNCTION public.migrate_agent_queue_message(
  p_id uuid, p_run_id uuid, p_project_id uuid,
  p_old_content text, p_old_mentions jsonb, p_old_version integer,
  p_content text DEFAULT NULL, p_version integer DEFAULT NULL
) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE source public.agent_run_messages; copy_count integer;
  prior text := current_setting('minddy.encryption_maintenance', true);
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.agent_runs
      WHERE id = p_run_id AND project_id = p_project_id FOR SHARE) THEN
    RETURN false;
  END IF;
  SELECT * INTO source FROM public.agent_run_messages q
    WHERE q.id = p_id AND q.run_id = p_run_id FOR UPDATE;
  IF NOT FOUND OR source.content IS DISTINCT FROM p_old_content OR
      source.mentions IS DISTINCT FROM p_old_mentions OR
      source.content_encryption_version IS DISTINCT FROM p_old_version THEN
    RETURN false;
  END IF;
  SELECT count(*) INTO copy_count FROM public.agent_messages m
    WHERE m.legacy_queue_message_id = p_id AND m.run_id = p_run_id
      AND m.content = source.content
      AND m.content_encryption_version = source.content_encryption_version;
  IF copy_count <> 1 THEN RETURN false; END IF;
  IF p_content IS NULL AND p_version IS NULL THEN
    UPDATE public.agent_run_messages SET encryption_checked_at = clock_timestamp()
      WHERE id = p_id;
    RETURN true;
  END IF;
  IF p_content IS NULL OR p_version IS NULL OR p_version < 1 OR
      public.agent_queue_content_version(p_content) IS DISTINCT FROM p_version THEN
    RAISE EXCEPTION 'agent_queue_migration_invalid' USING ERRCODE = '22023';
  END IF;
  PERFORM set_config('minddy.encryption_maintenance', 'on', true);
  UPDATE public.agent_run_messages SET content = p_content, mentions = NULL,
    content_encryption_version = p_version,
    encryption_checked_at = clock_timestamp() WHERE id = p_id;
  UPDATE public.agent_messages SET content = p_content,
    content_encryption_version = p_version WHERE legacy_queue_message_id = p_id;
  PERFORM set_config('minddy.encryption_maintenance', COALESCE(prior, ''), true);
  RETURN true;
END;
$$;
REVOKE ALL ON FUNCTION public.migrate_agent_queue_message(
  uuid,uuid,uuid,text,jsonb,integer,text,integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.migrate_agent_queue_message(
  uuid,uuid,uuid,text,jsonb,integer,text,integer) TO service_role;


CREATE OR REPLACE FUNCTION public.capture_agent_queue_message()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE r public.agent_runs; turn_id uuid;
BEGIN
  SELECT * INTO r FROM public.agent_runs WHERE id = NEW.run_id;
  SELECT t.id INTO turn_id FROM public.agent_turns t
    WHERE t.run_id = NEW.run_id ORDER BY t.created_at DESC, t.id DESC LIMIT 1;
  INSERT INTO public.agent_messages (
    conversation_id, turn_id, run_id, role, content, created_by, source,
    legacy_queue_message_id, created_at, content_encryption_version
  ) VALUES (
    r.conversation_id, turn_id, NEW.run_id, 'user', NEW.content,
    NEW.created_by, 'steering', NEW.id, NEW.created_at, NEW.content_encryption_version
  ) ON CONFLICT (legacy_queue_message_id) WHERE legacy_queue_message_id IS NOT NULL DO NOTHING;
  UPDATE public.agent_conversations
    SET updated_at = greatest(updated_at, NEW.created_at)
    WHERE id = r.conversation_id;
  RETURN NULL;
END;
$$;

CREATE OR REPLACE FUNCTION public.insert_latest_agent_run_message(
  p_run_id uuid,
  p_message_id uuid,
  p_user_id uuid,
  p_content text,
  p_mentions jsonb DEFAULT NULL
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_run public.agent_runs%ROWTYPE;
  v_conversation public.agent_conversations%ROWTYPE;
  v_latest_id uuid;
  v_anchor text;
  v_owner_id uuid;
  v_project_id uuid;
  v_conversation_id uuid;
  v_access text;
  v_inserted integer;
BEGIN
  IF p_run_id IS NULL OR p_message_id IS NULL OR p_user_id IS NULL
     OR p_content IS NULL THEN
    RAISE EXCEPTION 'agent_run_message_invalid' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_run
  FROM public.agent_runs
  WHERE id = p_run_id;
  IF v_run.id IS NULL OR v_run.created_by IS NULL THEN
    RETURN 'conflict';
  END IF;
  v_owner_id := v_run.created_by;
  v_project_id := v_run.project_id;
  v_conversation_id := v_run.conversation_id;
  v_anchor := CASE
    WHEN v_run.issue_id IS NOT NULL THEN 'issue:' || v_run.issue_id::text
    WHEN v_run.pull_request_id IS NOT NULL
      THEN 'pr:' || v_run.pull_request_id::text
    WHEN v_run.routine_id IS NOT NULL THEN 'routine:' || v_run.routine_id::text
    ELSE 'conversation:' || v_run.conversation_id::text
  END;

  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('agent-run:' || v_anchor, 459)
  );
  v_access := public.lock_live_agent_run_project_access(
    v_project_id, v_owner_id, p_user_id
  );
  IF v_access IS DISTINCT FROM 'ok' THEN
    RETURN v_access;
  END IF;

  SELECT * INTO v_run
  FROM public.agent_runs
  WHERE id = p_run_id
  FOR UPDATE;
  IF v_run.id IS NULL
     OR v_run.created_by IS DISTINCT FROM v_owner_id
     OR v_run.status NOT IN ('queued', 'running')
     OR v_run.project_id IS DISTINCT FROM v_project_id
     OR v_run.conversation_id IS DISTINCT FROM v_conversation_id
     OR v_anchor IS DISTINCT FROM (CASE
       WHEN v_run.issue_id IS NOT NULL THEN 'issue:' || v_run.issue_id::text
       WHEN v_run.pull_request_id IS NOT NULL
         THEN 'pr:' || v_run.pull_request_id::text
       WHEN v_run.routine_id IS NOT NULL
         THEN 'routine:' || v_run.routine_id::text
       ELSE 'conversation:' || v_run.conversation_id::text
     END) THEN
    RETURN 'conflict';
  END IF;

  SELECT * INTO v_conversation
  FROM public.agent_conversations
  WHERE id = v_conversation_id
    AND project_id = v_project_id
  FOR UPDATE;
  IF v_conversation.id IS NULL
     OR (
       v_conversation.visibility IS DISTINCT FROM 'project'
       AND v_conversation.owner_id IS DISTINCT FROM p_user_id
     ) THEN
    RETURN 'forbidden';
  END IF;

  SELECT id INTO v_latest_id
  FROM public.agent_runs
  WHERE CASE
    WHEN v_run.issue_id IS NOT NULL THEN issue_id = v_run.issue_id
    WHEN v_run.pull_request_id IS NOT NULL
      THEN pull_request_id = v_run.pull_request_id
    WHEN v_run.routine_id IS NOT NULL THEN routine_id = v_run.routine_id
    ELSE conversation_id = v_run.conversation_id
  END
  ORDER BY created_at DESC, id DESC
  LIMIT 1;
  IF v_latest_id IS DISTINCT FROM p_run_id THEN
    RETURN 'superseded';
  END IF;
  IF NOT public.agent_run_repository_binding_is_current(
    v_run.project_id,
    v_run.repo_link_id,
    v_run.connection_id,
    v_run.repo_provider,
    v_run.repo_external_id
  ) THEN
    RETURN 'conflict';
  END IF;

  INSERT INTO public.agent_run_messages (
    id, run_id, created_by, content, mentions, content_encryption_version
  ) VALUES (
    p_message_id, p_run_id, p_user_id, p_content, p_mentions,
    public.agent_queue_content_version(p_content)
  ) ON CONFLICT (id) DO NOTHING;
  GET DIAGNOSTICS v_inserted = ROW_COUNT;
  IF v_inserted = 1 THEN
    RETURN 'inserted';
  END IF;
  IF EXISTS (
    SELECT 1
    FROM public.agent_run_messages
    WHERE id = p_message_id AND run_id = p_run_id
  ) THEN
    RETURN 'already';
  END IF;
  RETURN 'message_id_conflict';
END;
$$;

CREATE OR REPLACE FUNCTION public.resume_latest_agent_run_with_message(
  p_run_id uuid,
  p_owner_id uuid,
  p_actor_id uuid,
  p_message_id uuid,
  p_content text,
  p_mentions jsonb,
  p_not_before timestamptz,
  p_usage_since timestamptz DEFAULT NULL,
  p_budget_cap numeric DEFAULT NULL,
  p_requested_budget numeric DEFAULT NULL
) RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_run public.agent_runs%ROWTYPE;
  v_parent public.numo_assistant_turns%ROWTYPE;
  v_conversation public.agent_conversations%ROWTYPE;
  v_latest_id uuid;
  v_anchor text;
  v_key_mode text;
  v_project_id uuid;
  v_conversation_id uuid;
  v_access text;
  v_spent numeric;
  v_reserved numeric;
  v_operation_platform_spent numeric;
  v_operation_total_spent numeric;
  v_granted numeric;
  v_stored_budget numeric;
  v_inserted integer;
BEGIN
  IF p_run_id IS NULL OR p_owner_id IS NULL OR p_actor_id IS NULL
     OR p_message_id IS NULL OR p_content IS NULL OR p_not_before IS NULL THEN
    RAISE EXCEPTION 'agent_resume_message_invalid' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_run FROM public.agent_runs WHERE id = p_run_id;
  IF v_run.id IS NULL OR v_run.created_by IS DISTINCT FROM p_owner_id THEN
    RETURN 'conflict';
  END IF;
  v_key_mode := v_run.key_mode;
  v_project_id := v_run.project_id;
  v_conversation_id := v_run.conversation_id;

  IF v_key_mode = 'platform' THEN
    IF p_usage_since IS NULL OR p_budget_cap IS NULL OR p_budget_cap < 0
       OR p_requested_budget IS NULL OR p_requested_budget <= 0 THEN
      RAISE EXCEPTION 'agent_resume_budget_invalid' USING ERRCODE = '22023';
    END IF;
    PERFORM pg_catalog.pg_advisory_xact_lock(
      pg_catalog.hashtextextended(p_owner_id::text, 460)
    );
  END IF;

  v_anchor := CASE
    WHEN v_run.issue_id IS NOT NULL THEN 'issue:' || v_run.issue_id::text
    WHEN v_run.pull_request_id IS NOT NULL THEN 'pr:' || v_run.pull_request_id::text
    WHEN v_run.routine_id IS NOT NULL THEN 'routine:' || v_run.routine_id::text
    ELSE 'conversation:' || v_run.conversation_id::text
  END;
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('agent-run:' || v_anchor, 459)
  );

  v_access := public.lock_live_agent_run_project_access(
    v_project_id, p_owner_id, p_actor_id
  );
  IF v_access IS DISTINCT FROM 'ok' THEN RETURN v_access; END IF;

  SELECT * INTO v_run FROM public.agent_runs WHERE id = p_run_id FOR UPDATE;
  IF v_run.id IS NULL
     OR v_run.created_by IS DISTINCT FROM p_owner_id
     OR v_run.status NOT IN ('completed', 'failed', 'canceled')
     OR (v_run.status = 'failed' AND (v_run.checkpoint IS NULL AND v_run.checkpoint_ciphertext IS NULL))
     OR v_run.sandbox_reap_claim IS NOT NULL
     OR v_run.key_mode IS DISTINCT FROM v_key_mode
     OR v_run.project_id IS DISTINCT FROM v_project_id
     OR v_run.conversation_id IS DISTINCT FROM v_conversation_id THEN
    RETURN 'conflict';
  END IF;

  SELECT * INTO v_conversation FROM public.agent_conversations
  WHERE id = v_conversation_id AND project_id = v_project_id
  FOR UPDATE;
  IF v_conversation.id IS NULL OR (
    v_conversation.visibility IS DISTINCT FROM 'project'
    AND v_conversation.owner_id IS DISTINCT FROM p_actor_id
  ) THEN
    RETURN 'forbidden';
  END IF;
  IF v_anchor IS DISTINCT FROM (CASE
    WHEN v_run.issue_id IS NOT NULL THEN 'issue:' || v_run.issue_id::text
    WHEN v_run.pull_request_id IS NOT NULL THEN 'pr:' || v_run.pull_request_id::text
    WHEN v_run.routine_id IS NOT NULL THEN 'routine:' || v_run.routine_id::text
    ELSE 'conversation:' || v_run.conversation_id::text
  END) THEN
    RETURN 'conflict';
  END IF;

  SELECT id INTO v_latest_id FROM public.agent_runs
  WHERE CASE
    WHEN v_run.issue_id IS NOT NULL THEN issue_id = v_run.issue_id
    WHEN v_run.pull_request_id IS NOT NULL THEN pull_request_id = v_run.pull_request_id
    WHEN v_run.routine_id IS NOT NULL THEN routine_id = v_run.routine_id
    ELSE conversation_id = v_run.conversation_id
  END
  ORDER BY created_at DESC, id DESC LIMIT 1;
  IF v_latest_id IS DISTINCT FROM p_run_id THEN RETURN 'superseded'; END IF;
  IF NOT public.agent_run_repository_binding_is_current(
    v_run.project_id, v_run.repo_link_id, v_run.connection_id,
    v_run.repo_provider, v_run.repo_external_id
  ) THEN
    RETURN 'conflict';
  END IF;

  IF v_run.parent_numo_turn_id IS NOT NULL THEN
    SELECT * INTO v_parent FROM public.numo_assistant_turns
    WHERE id = v_run.parent_numo_turn_id
      AND conversation_id = v_run.parent_numo_conversation_id
      AND user_id = p_owner_id
      AND status IN ('running', 'waiting_input', 'waiting_work')
    FOR UPDATE;
    IF v_parent.id IS NULL THEN RETURN 'conflict'; END IF;
  END IF;

  IF v_key_mode = 'platform' THEN
    SELECT COALESCE(SUM(cost), 0) INTO v_spent
    FROM public.ai_usage
    WHERE user_id = p_owner_id
      AND created_at >= p_usage_since
      AND key_mode = 'platform';
    SELECT
      COALESCE((
        SELECT SUM(GREATEST(
          run.managed_budget_usd - COALESCE(usage.spent, 0), 0
        ))
        FROM public.agent_runs AS run
        LEFT JOIN LATERAL (
          SELECT SUM(cost) AS spent FROM public.ai_usage
          WHERE run_id = run.run_id AND key_mode = 'platform'
        ) AS usage ON true
        WHERE run.created_by = p_owner_id AND run.key_mode = 'platform'
          AND run.parent_numo_turn_id IS NULL
          AND run.status IN ('queued', 'running')
          AND run.managed_budget_usd IS NOT NULL
      ), 0)
      + COALESCE((
        SELECT SUM(GREATEST(
          turn.managed_budget_usd - COALESCE(usage.spent, 0), 0
        ))
        FROM public.numo_assistant_turns AS turn
        LEFT JOIN LATERAL (
          SELECT SUM(cost) AS spent FROM public.ai_usage
          WHERE numo_turn_id = turn.id AND key_mode = 'platform'
        ) AS usage ON true
        WHERE turn.user_id = p_owner_id
          AND turn.id IS DISTINCT FROM v_run.parent_numo_turn_id
          AND turn.status IN (
            'queued', 'running', 'waiting_work', 'stopping', 'retryable', 'reconciling'
          )
          AND turn.managed_budget_usd IS NOT NULL
      ), 0)
    INTO v_reserved;

    IF v_parent.id IS NOT NULL THEN
      SELECT COALESCE(SUM(cost), 0) INTO v_operation_platform_spent
      FROM public.ai_usage
      WHERE numo_turn_id = v_parent.id AND key_mode = 'platform';
      SELECT COALESCE(SUM(cost), 0) INTO v_operation_total_spent
      FROM public.ai_usage WHERE numo_turn_id = v_parent.id;
    END IF;
    v_granted := LEAST(
      p_requested_budget,
      GREATEST(p_budget_cap - v_spent - v_reserved, 0),
      CASE
        WHEN v_parent.id IS NOT NULL AND v_run.budget_usd IS NOT NULL
          THEN GREATEST(v_run.budget_usd - v_operation_total_spent, 0)
        ELSE p_requested_budget
      END
    );
    IF v_granted <= 0 THEN RETURN 'no_budget'; END IF;
    v_stored_budget := CASE
      WHEN v_parent.id IS NOT NULL
        THEN COALESCE(v_operation_platform_spent, 0) + v_granted
      ELSE v_granted
    END;
  END IF;

  INSERT INTO public.agent_run_messages (
    id, run_id, created_by, content, mentions, content_encryption_version
  ) VALUES (
    p_message_id, p_run_id, p_actor_id, p_content, p_mentions,
    public.agent_queue_content_version(p_content)
  ) ON CONFLICT (id) DO NOTHING;
  GET DIAGNOSTICS v_inserted = ROW_COUNT;
  IF v_inserted = 0 AND NOT EXISTS (
    SELECT 1 FROM public.agent_run_messages
    WHERE id = p_message_id AND run_id = p_run_id
  ) THEN
    RETURN 'message_id_conflict';
  END IF;

  UPDATE public.agent_runs
  SET status = 'queued', not_before = p_not_before,
      managed_budget_usd = CASE
        WHEN v_key_mode = 'platform' THEN v_stored_budget
        ELSE managed_budget_usd
      END
  WHERE id = p_run_id;
  IF v_key_mode = 'platform' AND v_parent.id IS NOT NULL THEN
    UPDATE public.numo_assistant_turns
    SET managed_budget_usd = v_stored_budget
    WHERE id = v_parent.id;
  END IF;
  RETURN CASE WHEN v_inserted = 1 THEN 'queued' ELSE 'already' END;
END;
$$;

COMMIT;
