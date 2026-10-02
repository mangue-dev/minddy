-- MIN-591: project-bound encryption of private forge default branches.
BEGIN;
ALTER TABLE public.project_git_links
  ADD COLUMN default_branch_checked_at timestamptz;
CREATE INDEX project_git_link_default_branch_queue
  ON public.project_git_links(default_branch_checked_at NULLS FIRST,project_id)
  WHERE default_branch IS NOT NULL;

CREATE TABLE public.forge_default_branch_scope(
  id boolean PRIMARY KEY DEFAULT true CHECK(id),
  activated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.forge_default_branch_scope ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.forge_default_branch_scope FROM PUBLIC,anon,authenticated;
GRANT ALL ON public.forge_default_branch_scope TO service_role;

CREATE FUNCTION public.guard_forge_default_branch()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE sealed boolean:=COALESCE(NEW.default_branch LIKE 'mdyg3:%',false);
  prior boolean:=false;
BEGIN
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('forge-default-branch-activation',591));
  IF sealed AND NEW.default_branch !~ '^mdyg3:[1-9][0-9]*:[A-Za-z0-9_-]+$' THEN
    RAISE EXCEPTION 'forge_default_branch_ciphertext_invalid' USING ERRCODE='23514';
  END IF;
  IF TG_OP='UPDATE' THEN
    prior:=COALESCE(OLD.default_branch LIKE 'mdyg3:%',false);
    IF NEW.project_id IS DISTINCT FROM OLD.project_id AND (prior OR sealed OR
        EXISTS(SELECT 1 FROM public.forge_default_branch_scope)) THEN
      RAISE EXCEPTION 'forge_default_branch_scope_immutable' USING ERRCODE='23514';
    END IF;
    IF prior AND NEW.default_branch IS NOT NULL AND
        (NOT sealed OR split_part(NEW.default_branch,':',2)::integer <
          split_part(OLD.default_branch,':',2)::integer) THEN
      RAISE EXCEPTION 'forge_default_branch_downgrade' USING ERRCODE='23514';
    END IF;
  END IF;
  IF NEW.default_branch IS NOT NULL AND NOT sealed AND
      EXISTS(SELECT 1 FROM public.forge_default_branch_scope) THEN
    RAISE EXCEPTION 'forge_default_branch_requires_encryption' USING ERRCODE='23514';
  END IF;
  IF sealed AND (TG_OP='INSERT' OR
      NEW.default_branch IS DISTINCT FROM OLD.default_branch) THEN
    NEW.default_branch_checked_at:=clock_timestamp();
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER forge_default_branch_guard BEFORE INSERT OR UPDATE
  ON public.project_git_links FOR EACH ROW
  EXECUTE FUNCTION public.guard_forge_default_branch();
REVOKE ALL ON FUNCTION public.guard_forge_default_branch()
  FROM PUBLIC,anon,authenticated;

CREATE FUNCTION public.migrate_forge_default_branch(p_project_id uuid,
  p_old text,p_new text DEFAULT NULL)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE changed integer;
BEGIN
  UPDATE public.project_git_links SET
    default_branch=COALESCE(p_new,p_old),
    default_branch_checked_at=clock_timestamp()
  WHERE project_id=p_project_id AND default_branch=p_old;
  GET DIAGNOSTICS changed=ROW_COUNT;
  RETURN changed=1;
END;
$$;
REVOKE ALL ON FUNCTION public.migrate_forge_default_branch(uuid,text,text)
  FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.migrate_forge_default_branch(uuid,text,text)
  TO service_role;

CREATE FUNCTION public.activate_forge_default_branches()
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('forge-default-branch-activation',591));
  IF EXISTS(SELECT 1 FROM public.project_git_links WHERE
      default_branch IS NOT NULL AND
      (default_branch !~ '^mdyg3:[1-9][0-9]*:[A-Za-z0-9_-]+$' OR
       default_branch_checked_at IS NULL)) THEN
    RETURN false;
  END IF;
  INSERT INTO public.forge_default_branch_scope(id) VALUES(true)
    ON CONFLICT DO NOTHING;
  RETURN true;
END;
$$;
REVOKE ALL ON FUNCTION public.activate_forge_default_branches()
  FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.activate_forge_default_branches()
  TO service_role;
COMMIT;
