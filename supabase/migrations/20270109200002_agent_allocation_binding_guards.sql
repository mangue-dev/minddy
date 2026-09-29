BEGIN;
CREATE UNIQUE INDEX agent_allocation_physical_identity ON public.agent_sandbox_allocations(sandbox_name);
ALTER TABLE public.agent_sandbox_allocations
  ADD COLUMN conversation_id uuid,
  ADD COLUMN created_by uuid,
  ADD COLUMN project_owner_id uuid,
  ADD COLUMN private_owner_id uuid,
  ADD COLUMN repo_link_id uuid,
  ADD COLUMN connection_id uuid,
  ADD COLUMN repo_provider text,
  ADD COLUMN repo_external_id text;

CREATE FUNCTION public.agent_allocation_run_authority_current(p_run_id uuid)
RETURNS boolean LANGUAGE sql SECURITY DEFINER SET search_path = '' AS $$
  SELECT EXISTS(SELECT 1 FROM public.agent_runs r JOIN public.projects p ON p.id=r.project_id
    WHERE r.id=p_run_id AND r.created_by IS NOT NULL AND p.deleted_at IS NULL
      AND (p.owner_id=r.created_by OR EXISTS(SELECT 1 FROM public.project_members m WHERE m.project_id=p.id AND m.user_id=r.created_by))
      AND CASE WHEN r.repo_link_id IS NULL AND r.connection_id IS NULL AND r.repo_provider IS NULL AND r.repo_external_id IS NULL
        THEN NOT EXISTS(SELECT 1 FROM public.project_git_links l WHERE l.project_id=p.id)
        ELSE EXISTS(SELECT 1 FROM public.project_git_links l WHERE l.project_id=p.id AND l.id=r.repo_link_id
          AND l.connection_id=r.connection_id AND l.provider=r.repo_provider AND l.external_repo_id=r.repo_external_id) END);
$$;

CREATE FUNCTION public.capture_agent_allocation_binding()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF public.agent_allocation_run_authority_current(NEW.run_id) IS NOT TRUE THEN RAISE EXCEPTION 'agent_allocation_authority_revoked'; END IF;
  SELECT r.conversation_id,r.created_by,p.owner_id,c.owner_id,r.repo_link_id,r.connection_id,r.repo_provider,r.repo_external_id
    INTO NEW.conversation_id,NEW.created_by,NEW.project_owner_id,NEW.private_owner_id,NEW.repo_link_id,NEW.connection_id,NEW.repo_provider,NEW.repo_external_id
    FROM public.agent_runs r JOIN public.projects p ON p.id=r.project_id
      LEFT JOIN public.agent_conversations c ON c.id=r.conversation_id AND c.visibility='private'
    WHERE r.id=NEW.run_id AND r.project_id=NEW.project_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'agent_allocation_binding_missing'; END IF;
  RETURN NEW;
END; $$;
CREATE TRIGGER agent_allocation_capture_binding BEFORE INSERT ON public.agent_sandbox_allocations
  FOR EACH ROW EXECUTE FUNCTION public.capture_agent_allocation_binding();

CREATE FUNCTION public.guard_agent_allocation_binding()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF NEW.state='attached' AND (public.agent_allocation_run_authority_current(NEW.run_id) IS NOT TRUE OR NOT EXISTS(
    SELECT 1 FROM public.agent_runs r JOIN public.projects p ON p.id=r.project_id
      LEFT JOIN public.agent_conversations c ON c.id=r.conversation_id AND c.visibility='private'
    WHERE r.id=NEW.run_id AND r.project_id=NEW.project_id AND r.status='running'
      AND r.created_by IS NOT DISTINCT FROM NEW.created_by
      AND r.conversation_id IS NOT DISTINCT FROM NEW.conversation_id
      AND p.owner_id IS NOT DISTINCT FROM NEW.project_owner_id
      AND c.owner_id IS NOT DISTINCT FROM NEW.private_owner_id
      AND r.repo_link_id IS NOT DISTINCT FROM NEW.repo_link_id
      AND r.connection_id IS NOT DISTINCT FROM NEW.connection_id
      AND r.repo_provider IS NOT DISTINCT FROM NEW.repo_provider
      AND r.repo_external_id IS NOT DISTINCT FROM NEW.repo_external_id
  )) THEN RAISE EXCEPTION 'agent_allocation_binding_changed'; END IF;
  RETURN NEW;
END; $$;
CREATE TRIGGER agent_allocation_binding_guard BEFORE UPDATE OF state ON public.agent_sandbox_allocations
  FOR EACH ROW EXECUTE FUNCTION public.guard_agent_allocation_binding();

CREATE FUNCTION public.retire_previous_agent_allocations(p_run_id uuid)
RETURNS SETOF public.agent_sandbox_allocations LANGUAGE sql SECURITY DEFINER SET search_path = '' AS $$
  UPDATE public.agent_sandbox_allocations SET state='revoked'
    WHERE run_id=p_run_id AND state='attached' AND NOT provider_pending RETURNING *;
$$;

CREATE FUNCTION public.guard_agent_allocation_parent_deletion()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF TG_TABLE_SCHEMA='auth' THEN
    PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(OLD.id::text,5911900));
    INSERT INTO public.agent_account_erasure_fences(user_id) VALUES(OLD.id) ON CONFLICT DO NOTHING;
  END IF;
  IF EXISTS(SELECT 1 FROM public.agent_sandbox_allocations a WHERE a.state<>'cleaned' AND
    CASE WHEN TG_TABLE_SCHEMA='auth' THEN a.user_ids @> ARRAY[OLD.id] ELSE a.project_id=OLD.id END) THEN
    RAISE EXCEPTION 'agent_allocation_erasure_incomplete';
  END IF;
  RETURN OLD;
END; $$;
CREATE TRIGGER users_agent_allocation_delete_guard BEFORE DELETE ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.guard_agent_allocation_parent_deletion();
CREATE TRIGGER projects_agent_allocation_delete_guard BEFORE DELETE ON public.projects
  FOR EACH ROW EXECUTE FUNCTION public.guard_agent_allocation_parent_deletion();

REVOKE ALL ON FUNCTION public.capture_agent_allocation_binding(),public.guard_agent_allocation_binding(),
  public.retire_previous_agent_allocations(uuid),public.guard_agent_allocation_parent_deletion(),public.agent_allocation_run_authority_current(uuid) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.retire_previous_agent_allocations(uuid) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.agent_allocation_run_authority_current(uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.retire_previous_agent_allocations(uuid) TO service_role;
REVOKE ALL ON public.agent_sandbox_allocations,public.agent_project_erasure_fences FROM service_role;
COMMIT;
