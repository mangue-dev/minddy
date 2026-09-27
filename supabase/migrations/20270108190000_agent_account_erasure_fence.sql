-- Serialize account erasure with every new or resumed Agent run. The fence
-- remains after a failed erasure attempt, so a retry cannot race new work.
BEGIN;

CREATE TABLE public.agent_account_erasure_fences (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.agent_account_erasure_fences ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.agent_account_erasure_fences FROM PUBLIC, anon, authenticated;

CREATE FUNCTION public.begin_agent_account_erasure(p_user_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF p_user_id IS NULL OR pg_catalog.current_setting('transaction_isolation') <> 'read committed' THEN
    RAISE EXCEPTION 'agent_account_erasure_requires_read_committed' USING ERRCODE = 'P0001';
  END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_user_id::text, 5911900));
  IF NOT EXISTS (SELECT 1 FROM auth.users WHERE id = p_user_id) THEN
    RAISE EXCEPTION 'agent_account_erasure_user_missing' USING ERRCODE = 'P0001';
  END IF;
  INSERT INTO public.agent_account_erasure_fences(user_id)
  VALUES (p_user_id)
  ON CONFLICT (user_id) DO NOTHING;
  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION public.begin_agent_account_erasure(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.begin_agent_account_erasure(uuid) TO service_role;

CREATE FUNCTION public.guard_agent_account_erasure()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_user_id uuid;
  v_project_owner uuid;
  v_project_deleted_at timestamptz;
  v_private_owner uuid;
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF OLD.status IS NOT DISTINCT FROM NEW.status OR NEW.status NOT IN ('queued', 'running') THEN
      RETURN NEW;
    END IF;
  END IF;
  IF pg_catalog.current_setting('transaction_isolation') <> 'read committed' THEN
    RAISE EXCEPTION 'agent_account_erasure_requires_read_committed' USING ERRCODE = 'P0001';
  END IF;

  -- Share the project row lock with trash updates. An insert that starts first
  -- finishes before erasure enumerates runs; one that starts later is refused.
  SELECT owner_id, deleted_at INTO v_project_owner, v_project_deleted_at
  FROM public.projects WHERE id = NEW.project_id FOR SHARE;
  IF NOT FOUND OR v_project_deleted_at IS NOT NULL THEN
    RAISE EXCEPTION 'agent_project_unavailable' USING ERRCODE = 'P0001';
  END IF;
  SELECT owner_id INTO v_private_owner
  FROM public.agent_conversations
  WHERE id = NEW.conversation_id AND visibility = 'private';

  FOR v_user_id IN
    SELECT DISTINCT candidate
    FROM pg_catalog.unnest(ARRAY[NEW.created_by, v_project_owner, v_private_owner]) AS users(candidate)
    WHERE candidate IS NOT NULL
    ORDER BY candidate
  LOOP
    PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_user_id::text, 5911900));
    IF EXISTS (
      SELECT 1 FROM public.agent_account_erasure_fences WHERE user_id = v_user_id
    ) THEN
      RAISE EXCEPTION 'agent_account_erasing' USING ERRCODE = 'P0001';
    END IF;
  END LOOP;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.guard_agent_account_erasure() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS agent_runs_account_erasure_fence ON public.agent_runs;
CREATE TRIGGER agent_runs_account_erasure_fence
BEFORE INSERT OR UPDATE OF status ON public.agent_runs
FOR EACH ROW EXECUTE FUNCTION public.guard_agent_account_erasure();

COMMIT;
