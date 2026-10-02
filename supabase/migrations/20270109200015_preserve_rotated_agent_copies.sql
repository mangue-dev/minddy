-- Updating a PR URL must not republish an older branch or checkpoint copy.
BEGIN;
CREATE OR REPLACE FUNCTION public.migrate_agent_run_pr_url(
  p_id uuid,p_project_id uuid,p_old_url text,p_new_url text DEFAULT NULL
) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE row public.agent_runs;
  prior text:=current_setting('minddy.encryption_maintenance',true);
BEGIN
  SELECT * INTO row FROM public.agent_runs WHERE id=p_id AND project_id=p_project_id FOR UPDATE;
  IF NOT FOUND OR row.pr_url IS DISTINCT FROM p_old_url THEN RETURN false; END IF;
  PERFORM set_config('minddy.encryption_maintenance','on',true);
  IF p_new_url IS NULL THEN
    UPDATE public.agent_runs SET pr_url_encryption_checked_at=clock_timestamp() WHERE id=p_id;
  ELSE
    UPDATE public.agent_runs SET pr_url=p_new_url,pr_url_encryption_checked_at=clock_timestamp() WHERE id=p_id;
  END IF;
  PERFORM set_config('minddy.encryption_maintenance',COALESCE(prior,''),true);
  RETURN true;
END;
$$;

DO $migration$
DECLARE definition text; rewritten text; field text; old_assignment text; condition text;
BEGIN
  definition:=pg_get_functiondef('public.sync_agent_runtime_from_run()'::regprocedure);
  rewritten:=replace(definition,
    'IF NEW.branch_name IS NOT NULL AND (current_setting(''minddy.encryption_maintenance'', true) IS DISTINCT FROM ''on'' OR TG_OP = ''INSERT'' OR NEW.branch_name IS DISTINCT FROM OLD.branch_name) THEN',
    'IF NEW.branch_name IS NOT NULL AND (TG_OP = ''INSERT'' OR NEW.branch_name IS DISTINCT FROM OLD.branch_name) THEN');
  rewritten:=replace(rewritten,
    'IF NEW.pr_number IS NOT NULL AND (current_setting(''minddy.encryption_maintenance'', true) IS DISTINCT FROM ''on'' OR TG_OP = ''INSERT'' OR ROW(NEW.pr_number, NEW.pr_url, NEW.pr_state) IS DISTINCT FROM ROW(OLD.pr_number, OLD.pr_url, OLD.pr_state)) THEN',
    'IF NEW.pr_number IS NOT NULL AND (TG_OP = ''INSERT'' OR ROW(NEW.pr_number, NEW.pr_url, NEW.pr_state) IS DISTINCT FROM ROW(OLD.pr_number, OLD.pr_url, OLD.pr_state)) THEN');
  IF rewritten=definition THEN RAISE EXCEPTION 'Cannot reconcile rotated Agent artifact synchronization'; END IF;
  FOREACH field IN ARRAY ARRAY['base_branch','work_branch','checkpoint','checkpoint_ciphertext','checkpoint_encryption_version'] LOOP
    condition:=CASE field
      WHEN 'base_branch' THEN 'NEW.base_branch IS NOT DISTINCT FROM OLD.base_branch'
      WHEN 'work_branch' THEN 'NEW.branch_name IS NOT DISTINCT FROM OLD.branch_name'
      ELSE 'ROW(NEW.checkpoint,NEW.checkpoint_ciphertext,NEW.checkpoint_encryption_version) IS NOT DISTINCT FROM ROW(OLD.checkpoint,OLD.checkpoint_ciphertext,OLD.checkpoint_encryption_version)' END;
    old_assignment:=field || ' = NEW.' || CASE field WHEN 'work_branch' THEN 'branch_name' ELSE field END;
    rewritten:=replace(rewritten,old_assignment,
      field || ' = CASE WHEN ' || condition || ' THEN ' || field || ' ELSE NEW.' ||
        CASE field WHEN 'work_branch' THEN 'branch_name' ELSE field END || ' END');
    old_assignment:=field || ' = EXCLUDED.' || field;
    rewritten:=replace(rewritten,old_assignment,
      field || ' = CASE WHEN TG_OP=''UPDATE'' AND agent_runtime_sessions.current_run_id=NEW.id AND ' ||
      condition || ' THEN agent_runtime_sessions.' || field || ' ELSE EXCLUDED.' || field || ' END');
  END LOOP;
  EXECUTE rewritten;
END;
$migration$;
COMMIT;
