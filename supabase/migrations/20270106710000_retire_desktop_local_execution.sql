-- Retire desktop-local Numo execution without rewriting historical runs.
-- Existing rows keep their local execution marker, checkpoint, branch, and
-- artifact references so conversations and desktop-owned diffs remain readable.
UPDATE public.agent_runs
SET status = 'canceled',
    interrupt_requested = true,
    local_exec_gen = local_exec_gen + 1,
    error_message = 'Local execution was retired. Start a new server-sandbox conversation after committing or copying any local changes; local files and checkpoints were not modified.',
    updated_at = now()
WHERE local_exec = true
  AND status IN ('queued', 'running');

CREATE OR REPLACE FUNCTION public.reject_new_local_agent_execution()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF NEW.local_exec = true THEN
    IF TG_OP = 'INSERT' OR (TG_OP = 'UPDATE' AND OLD.local_exec = false) THEN
      RAISE EXCEPTION 'local_execution_retired' USING ERRCODE = 'P0001';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_reject_new_local_agent_execution
  ON public.agent_runs;
CREATE TRIGGER trg_reject_new_local_agent_execution
BEFORE INSERT OR UPDATE OF local_exec ON public.agent_runs
FOR EACH ROW EXECUTE FUNCTION public.reject_new_local_agent_execution();

COMMENT ON FUNCTION public.reject_new_local_agent_execution() IS
  'Prevents new desktop-local Numo runs while allowing historical local rows to retain their execution marker for readable history and diffs.';
