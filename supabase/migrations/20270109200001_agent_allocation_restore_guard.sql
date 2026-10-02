BEGIN;

CREATE FUNCTION public.guard_agent_project_allocation_fence()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF TG_OP='UPDATE' AND (NEW.status NOT IN ('queued','running') OR OLD.status IS NOT DISTINCT FROM NEW.status) THEN RETURN NEW; END IF;
  PERFORM id FROM public.projects WHERE id=NEW.project_id FOR SHARE;
  IF EXISTS(SELECT 1 FROM public.agent_project_erasure_fences WHERE project_id=NEW.project_id) THEN
    RAISE EXCEPTION 'agent_project_unavailable';
  END IF;
  RETURN NEW;
END; $$;
CREATE TRIGGER agent_runs_project_allocation_fence BEFORE INSERT OR UPDATE OF status ON public.agent_runs
  FOR EACH ROW EXECUTE FUNCTION public.guard_agent_project_allocation_fence();

CREATE FUNCTION public.clear_agent_project_fence_on_restore()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF OLD.deleted_at IS NOT NULL AND NEW.deleted_at IS NULL THEN
    IF EXISTS(SELECT 1 FROM public.agent_sandbox_allocations WHERE project_id=NEW.id AND state<>'cleaned') THEN
      RAISE EXCEPTION 'agent_project_allocation_cleanup_pending';
    END IF;
    DELETE FROM public.agent_project_erasure_fences WHERE project_id=NEW.id;
  END IF;
  RETURN NEW;
END; $$;
CREATE TRIGGER projects_agent_allocation_restore BEFORE UPDATE OF deleted_at ON public.projects
  FOR EACH ROW EXECUTE FUNCTION public.clear_agent_project_fence_on_restore();

-- Fair, bounded deletion retries also sweep unknown outcomes, without certifying them.
ALTER TABLE public.agent_sandbox_allocations ADD COLUMN cleanup_attempted_at timestamptz;
CREATE FUNCTION public.next_agent_allocation_cleanup_batch(p_limit integer DEFAULT 25)
RETURNS SETOF public.agent_sandbox_allocations LANGUAGE sql SECURITY DEFINER SET search_path = '' AS $$
  WITH selected AS (
    SELECT id FROM public.agent_sandbox_allocations WHERE state='revoked'
    ORDER BY cleanup_attempted_at ASC NULLS FIRST,created_at,id LIMIT greatest(1,least(p_limit,100)) FOR UPDATE SKIP LOCKED
  ) UPDATE public.agent_sandbox_allocations a SET cleanup_attempted_at=clock_timestamp()
    FROM selected s WHERE a.id=s.id RETURNING a.*;
$$;
REVOKE ALL ON FUNCTION public.guard_agent_project_allocation_fence(),public.clear_agent_project_fence_on_restore(),public.next_agent_allocation_cleanup_batch(integer)
  FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.next_agent_allocation_cleanup_batch(integer) TO service_role;
COMMIT;
