BEGIN;
SET LOCAL minddy.encryption_maintenance = 'on';

-- Attempts rotate independently of successful authentication checks.
ALTER TABLE public.agent_runs
  ADD COLUMN base_branch_encryption_attempted_at timestamptz,
  ADD COLUMN delegation_encryption_attempted_at timestamptz,
  ADD COLUMN delegation_result_encryption_attempted_at timestamptz,
  ADD COLUMN deployment_encryption_attempted_at timestamptz,
  ADD COLUMN launch_encryption_attempted_at timestamptz,
  ADD COLUMN pr_url_encryption_attempted_at timestamptz,
  ADD COLUMN summary_encryption_attempted_at timestamptz,
  ADD COLUMN title_encryption_attempted_at timestamptz,
  ADD COLUMN verdict_encryption_attempted_at timestamptz,
  ADD COLUMN work_branch_encryption_attempted_at timestamptz;
ALTER TABLE public.agent_runtime_sessions
  ADD COLUMN base_branch_encryption_attempted_at timestamptz,
  ADD COLUMN work_branch_encryption_attempted_at timestamptz;
ALTER TABLE public.agent_artifacts
  ADD COLUMN ref_encryption_attempted_at timestamptz,
  ADD COLUMN url_encryption_attempted_at timestamptz;
ALTER TABLE public.agent_run_events
  ADD COLUMN encryption_attempted_at timestamptz;
ALTER TABLE public.agent_conversation_contexts
  ADD COLUMN snapshot_encryption_attempted_at timestamptz;
ALTER TABLE public.agent_run_messages
  ADD COLUMN encryption_attempted_at timestamptz;
ALTER TABLE public.agent_messages
  ADD COLUMN standalone_encryption_attempted_at timestamptz;
ALTER TABLE public.agent_turns
  ADD COLUMN summary_encryption_attempted_at timestamptz;
ALTER TABLE public.agent_conversations
  ADD COLUMN title_encryption_attempted_at timestamptz;
ALTER TABLE public.agent_routines
  ADD COLUMN encryption_attempted_at timestamptz;
ALTER TABLE public.agent_chains
  ADD COLUMN codes_attempted_at timestamptz;

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

DO $migration$
DECLARE definition text; rewritten text;
BEGIN
  SELECT pg_catalog.pg_get_functiondef('public.guard_agent_routine_content()'::regprocedure)
    INTO definition;
  rewritten := pg_catalog.replace(definition,
    'NEW.content_revision:=OLD.content_revision+1;',
    'IF current_setting(''minddy.encryption_maintenance'', true) = ''on'' AND '
    || '(to_jsonb(NEW) - ''encryption_attempted_at'' - ''content_revision'') '
    || 'IS NOT DISTINCT FROM '
    || '(to_jsonb(OLD) - ''encryption_attempted_at'' - ''content_revision'') THEN '
    || 'NEW.content_revision:=OLD.content_revision; ELSE '
    || 'NEW.content_revision:=OLD.content_revision+1; END IF;');
  IF rewritten = definition THEN
    RAISE EXCEPTION 'Cannot preserve routine revision during a metadata attempt';
  END IF;
  EXECUTE rewritten;
END
$migration$;

CREATE OR REPLACE FUNCTION public.broadcast_agent_routine_row()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  pid uuid := COALESCE(NEW.project_id, OLD.project_id);
  rec jsonb := NULL;
  old_rec jsonb := NULL;
BEGIN
  IF TG_OP = 'UPDATE' AND
      current_setting('minddy.encryption_maintenance', true) = 'on' AND
      (to_jsonb(NEW) - 'encryption_attempted_at') IS NOT DISTINCT FROM
      (to_jsonb(OLD) - 'encryption_attempted_at') THEN
    RETURN NULL;
  END IF;
  IF TG_OP <> 'DELETE' THEN
    rec := jsonb_build_object('id', NEW.id, 'project_id', NEW.project_id);
  END IF;
  IF TG_OP <> 'INSERT' THEN
    old_rec := jsonb_build_object('id', OLD.id, 'project_id', OLD.project_id);
  END IF;
  IF pid IS NOT NULL THEN
    PERFORM realtime.send(jsonb_build_object(
      'operation', TG_OP, 'table', TG_TABLE_NAME, 'schema', TG_TABLE_SCHEMA,
      'record', rec, 'old_record', old_rec
    ), TG_OP, 'project:' || pid, true);
  END IF;
  RETURN NULL;
EXCEPTION WHEN OTHERS THEN
  RETURN NULL;
END;
$$;

-- Previous workers could mark current-format ciphertext checked before authentication.
UPDATE public.agent_runs SET
  launch_encryption_checked_at = NULL,
  pr_url_encryption_checked_at = NULL,
  summary_encryption_checked_at = NULL
WHERE launch_encryption_checked_at IS NOT NULL
   OR pr_url_encryption_checked_at IS NOT NULL
   OR summary_encryption_checked_at IS NOT NULL;
UPDATE public.agent_artifacts SET url_encryption_checked_at = NULL
  WHERE url_encryption_checked_at IS NOT NULL;
UPDATE public.agent_run_events SET encryption_checked_at = NULL
  WHERE encryption_checked_at IS NOT NULL;
UPDATE public.agent_conversation_contexts SET snapshot_encryption_checked_at = NULL
  WHERE snapshot_encryption_checked_at IS NOT NULL;
UPDATE public.agent_run_messages SET encryption_checked_at = NULL
  WHERE encryption_checked_at IS NOT NULL;
UPDATE public.agent_messages SET standalone_encryption_checked_at = NULL
  WHERE standalone_encryption_checked_at IS NOT NULL;
UPDATE public.agent_turns SET summary_encryption_checked_at = NULL
  WHERE summary_encryption_checked_at IS NOT NULL;

CREATE FUNCTION public.mark_agent_backfill_attempt(
  p_table text, p_id_column text, p_id uuid,
  p_checked_column text, p_expected jsonb
) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_attempt_column text := replace(p_checked_column, '_checked_at', '_attempted_at');
  v_prior_maintenance text := current_setting('minddy.encryption_maintenance', true);
  v_row jsonb;
  v_key text;
  v_value jsonb;
  v_required_key text;
  v_conflicted boolean := false;
  v_affected integer;
BEGIN
  IF p_expected IS NULL OR jsonb_typeof(p_expected) <> 'object' OR
      p_expected = '{}'::jsonb OR
      p_expected ->> p_id_column IS DISTINCT FROM p_id::text THEN
    RAISE EXCEPTION 'agent_backfill_attempt_invalid' USING ERRCODE = '22023';
  END IF;
  SELECT required_key INTO v_required_key FROM (VALUES
    ('agent_runs', 'id', 'base_branch_encryption_checked_at', 'base_branch'),
    ('agent_runs', 'id', 'delegation_encryption_checked_at', 'delegation_brief'),
    ('agent_runs', 'id', 'delegation_result_encryption_checked_at', 'delegation_result_ciphertext'),
    ('agent_runs', 'id', 'deployment_encryption_checked_at', 'deployment_url'),
    ('agent_runs', 'id', 'launch_encryption_checked_at', 'encrypted_launch_content'),
    ('agent_runs', 'id', 'pr_url_encryption_checked_at', 'pr_url'),
    ('agent_runs', 'id', 'summary_encryption_checked_at', 'outcome'),
    ('agent_runs', 'id', 'title_encryption_checked_at', 'title_ciphertext'),
    ('agent_runs', 'id', 'verdict_encryption_checked_at', 'verdict_ciphertext'),
    ('agent_runs', 'id', 'work_branch_encryption_checked_at', 'branch_name'),
    ('agent_runtime_sessions', 'conversation_id', 'base_branch_encryption_checked_at', 'base_branch'),
    ('agent_runtime_sessions', 'conversation_id', 'work_branch_encryption_checked_at', 'work_branch'),
    ('agent_artifacts', 'id', 'ref_encryption_checked_at', 'ref_ciphertext'),
    ('agent_artifacts', 'id', 'url_encryption_checked_at', 'url'),
    ('agent_run_events', 'id', 'encryption_checked_at', 'encrypted_content'),
    ('agent_conversation_contexts', 'id', 'snapshot_encryption_checked_at', 'snapshot_ciphertext'),
    ('agent_run_messages', 'id', 'encryption_checked_at', 'content'),
    ('agent_messages', 'id', 'standalone_encryption_checked_at', 'content'),
    ('agent_turns', 'id', 'summary_encryption_checked_at', 'outcome'),
    ('agent_conversations', 'id', 'title_encryption_checked_at', 'title_ciphertext'),
    ('agent_routines', 'id', 'encryption_checked_at', 'encrypted_content'),
    ('agent_chains', 'id', 'codes_checked_at', 'pending_event'),
    ('user_agent_preferences', 'user_id', 'branch_prefix_encryption_checked_at', 'branch_prefix')
  ) AS allowed(table_name, id_column, checked_column, required_key)
  WHERE allowed.table_name = p_table AND allowed.id_column = p_id_column
    AND allowed.checked_column = p_checked_column;
  IF v_required_key IS NULL OR NOT p_expected ? v_required_key THEN
    RAISE EXCEPTION 'agent_backfill_attempt_invalid' USING ERRCODE = '22023';
  END IF;
  EXECUTE format('SELECT to_jsonb(t) FROM public.%I AS t WHERE %I = $1 FOR UPDATE',
    p_table, p_id_column) INTO v_row USING p_id;
  IF v_row IS NULL THEN RETURN false; END IF;
  FOR v_key, v_value IN SELECT key, value FROM jsonb_each(p_expected) LOOP
    IF NOT v_row ? v_key OR v_row -> v_key IS DISTINCT FROM v_value THEN
      v_conflicted := true;
      EXIT;
    END IF;
  END LOOP;
  PERFORM set_config('minddy.encryption_maintenance', 'on', true);
  EXECUTE format('UPDATE public.%I AS t SET %I = clock_timestamp() '
    || 'WHERE t.%I = $1 AND to_jsonb(t) = $2',
    p_table, v_attempt_column, p_id_column) USING p_id, v_row;
  GET DIAGNOSTICS v_affected = ROW_COUNT;
  PERFORM set_config('minddy.encryption_maintenance', COALESCE(v_prior_maintenance, ''), true);
  RETURN v_affected = 1 AND NOT v_conflicted;
END;
$$;
REVOKE ALL ON FUNCTION public.mark_agent_backfill_attempt(text,text,uuid,text,jsonb)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.mark_agent_backfill_attempt(text,text,uuid,text,jsonb)
  TO service_role;

COMMIT;
