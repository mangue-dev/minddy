-- Preserve legacy content during progress writes without resolving vector
-- equality operators through a security-definer function's empty search path.
BEGIN;
DO $migration$
DECLARE definition text; rewritten text;
BEGIN
  definition := pg_catalog.pg_get_functiondef('public.guard_feedback_post_encryption()'::regprocedure);
  rewritten := pg_catalog.replace(pg_catalog.replace(definition,
    'NEW.embedding)', 'NEW.embedding::text)'), 'OLD.embedding)', 'OLD.embedding::text)');
  IF rewritten = definition THEN
    RAISE EXCEPTION 'Cannot reconcile feedback vector comparison';
  END IF;
  EXECUTE rewritten;
END;
$migration$;

-- ON CONFLICT runs INSERT guards before detecting an existing runtime row.
-- During maintenance, update only the current copy. Historical conversion must
-- not create a runtime or republish unrelated legacy artifacts after activation.
DO $migration$
DECLARE definition text; rewritten text; start_position integer; end_position integer;
BEGIN
  definition := pg_catalog.pg_get_functiondef('public.sync_agent_runtime_from_run()'::regprocedure);
  start_position := pg_catalog.strpos(definition, '  INSERT INTO public.agent_runtime_sessions (');
  end_position := pg_catalog.strpos(definition, '  IF NEW.branch_name IS NOT NULL THEN');
  IF start_position = 0 OR end_position <= start_position THEN
    RAISE EXCEPTION 'Cannot reconcile runtime maintenance synchronization';
  END IF;
  rewritten := pg_catalog.substr(definition, 1, start_position - 1) || $replacement$
  IF current_setting('minddy.encryption_maintenance', true) = 'on' THEN
    UPDATE public.agent_runtime_sessions SET
      base_branch = NEW.base_branch, work_branch = NEW.branch_name,
      checkpoint = NEW.checkpoint, checkpoint_ciphertext = NEW.checkpoint_ciphertext,
      checkpoint_encryption_version = NEW.checkpoint_encryption_version
    WHERE conversation_id = NEW.conversation_id AND current_run_id = NEW.id;
  ELSE
$replacement$ || pg_catalog.substr(definition, start_position, end_position - start_position)
    || E'  END IF;\n' || pg_catalog.substr(definition, end_position);
  rewritten := pg_catalog.replace(rewritten, 'IF NEW.branch_name IS NOT NULL THEN',
    'IF NEW.branch_name IS NOT NULL AND (current_setting(''minddy.encryption_maintenance'', true) IS DISTINCT FROM ''on'' OR TG_OP = ''INSERT'' OR NEW.branch_name IS DISTINCT FROM OLD.branch_name) THEN');
  rewritten := pg_catalog.replace(rewritten, 'IF NEW.pr_number IS NOT NULL THEN',
    'IF NEW.pr_number IS NOT NULL AND (current_setting(''minddy.encryption_maintenance'', true) IS DISTINCT FROM ''on'' OR TG_OP = ''INSERT'' OR ROW(NEW.pr_number, NEW.pr_url, NEW.pr_state) IS DISTINCT FROM ROW(OLD.pr_number, OLD.pr_url, OLD.pr_state)) THEN');
  EXECUTE rewritten;
END;
$migration$;
COMMIT;
