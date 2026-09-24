BEGIN;

ALTER TABLE public.agent_runs ADD COLUMN summary_encryption_checked_at timestamptz;
ALTER TABLE public.agent_turns ADD COLUMN summary_encryption_checked_at timestamptz;
-- Account transfers retain archived turns without recreating worker runs.
ALTER TABLE public.agent_turns ALTER COLUMN run_id DROP NOT NULL;
CREATE INDEX agent_runs_summary_encryption_queue ON public.agent_runs
  (summary_encryption_checked_at NULLS FIRST,id)
  WHERE outcome IS NOT NULL OR error_message IS NOT NULL;
CREATE INDEX agent_turns_summary_encryption_queue ON public.agent_turns
  (summary_encryption_checked_at NULLS FIRST,id)
  WHERE outcome IS NOT NULL OR error_message IS NOT NULL;

CREATE TABLE public.agent_summary_encryption_scopes (
  project_id uuid PRIMARY KEY REFERENCES public.projects(id) ON DELETE CASCADE,
  activated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.agent_summary_encryption_scopes ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.agent_summary_encryption_scopes FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.agent_summary_encryption_scopes TO service_role;

CREATE FUNCTION public.guard_agent_run_summary()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE old_value text; new_value text; field_name text; old_version integer;
  new_version integer; active boolean;
BEGIN
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(NEW.project_id::text,59131));
  IF TG_OP = 'UPDATE' AND NEW.project_id IS DISTINCT FROM OLD.project_id AND
      (OLD.outcome LIKE 'mdys3:%' OR OLD.error_message LIKE 'mdys3:%' OR
       NEW.outcome LIKE 'mdys3:%' OR NEW.error_message LIKE 'mdys3:%') THEN
    RAISE EXCEPTION 'agent_summary_scope_is_immutable' USING ERRCODE = '23514';
  END IF;
  active := EXISTS (SELECT 1 FROM public.agent_summary_encryption_scopes s
    WHERE s.project_id=NEW.project_id);
  FOREACH field_name IN ARRAY ARRAY['outcome','error_message'] LOOP
    new_value := CASE field_name WHEN 'outcome' THEN NEW.outcome ELSE NEW.error_message END;
    old_value := CASE WHEN TG_OP='UPDATE' THEN
      CASE field_name WHEN 'outcome' THEN OLD.outcome ELSE OLD.error_message END END;
    IF new_value LIKE 'mdys3:%' THEN
      IF new_value !~ '^mdys3:[1-9][0-9]*:[A-Za-z0-9_-]+$' THEN
        RAISE EXCEPTION 'agent_summary_ciphertext_invalid' USING ERRCODE = '23514';
      END IF;
      new_version := split_part(new_value,':',2)::integer;
      IF old_value LIKE 'mdys3:%' THEN
        old_version := split_part(old_value,':',2)::integer;
        IF new_version < old_version THEN
          RAISE EXCEPTION 'agent_summary_key_version_rollback' USING ERRCODE = '23514';
        END IF;
      END IF;
      INSERT INTO public.agent_summary_encryption_scopes(project_id)
        VALUES(NEW.project_id) ON CONFLICT DO NOTHING;
      active := true;
    ELSIF new_value IS NOT NULL AND active AND
        (TG_OP='INSERT' OR new_value IS DISTINCT FROM old_value) THEN
      RAISE EXCEPTION 'agent_summary_requires_encryption' USING ERRCODE = '23514';
    END IF;
  END LOOP;
  RETURN NEW;
END;
$$;
CREATE TRIGGER agent_run_summary_guard BEFORE INSERT OR UPDATE ON public.agent_runs
  FOR EACH ROW EXECUTE FUNCTION public.guard_agent_run_summary();
REVOKE ALL ON FUNCTION public.guard_agent_run_summary()
  FROM PUBLIC,anon,authenticated;

CREATE FUNCTION public.guard_agent_turn_summary()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE project uuid; old_value text; new_value text; field_name text;
BEGIN
  SELECT c.project_id INTO project FROM public.agent_conversations c
    WHERE c.id=NEW.conversation_id;
  IF project IS NULL THEN
    RAISE EXCEPTION 'agent_turn_project_missing' USING ERRCODE = '23503';
  END IF;
  IF NEW.run_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.agent_runs r
      WHERE r.id=NEW.run_id AND r.project_id=project) THEN
    RAISE EXCEPTION 'agent_turn_run_project_mismatch' USING ERRCODE = '23503';
  END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(project::text,59131));
  IF TG_OP='UPDATE' AND (NEW.run_id,NEW.conversation_id) IS DISTINCT FROM
      (OLD.run_id,OLD.conversation_id) AND
      (OLD.outcome LIKE 'mdys3:%' OR OLD.error_message LIKE 'mdys3:%') THEN
    RAISE EXCEPTION 'agent_turn_summary_scope_is_immutable' USING ERRCODE = '23514';
  END IF;
  FOREACH field_name IN ARRAY ARRAY['outcome','error_message'] LOOP
    new_value := CASE field_name WHEN 'outcome' THEN NEW.outcome ELSE NEW.error_message END;
    old_value := CASE WHEN TG_OP='UPDATE' THEN
      CASE field_name WHEN 'outcome' THEN OLD.outcome ELSE OLD.error_message END END;
    IF new_value LIKE 'mdys3:%' THEN
      IF new_value !~ '^mdys3:[1-9][0-9]*:[A-Za-z0-9_-]+$' THEN
        RAISE EXCEPTION 'agent_turn_summary_ciphertext_invalid' USING ERRCODE = '23514';
      END IF;
    ELSIF new_value IS NOT NULL AND EXISTS (
        SELECT 1 FROM public.agent_summary_encryption_scopes s
        WHERE s.project_id=project) AND
        (TG_OP='INSERT' OR new_value IS DISTINCT FROM old_value) THEN
      RAISE EXCEPTION 'agent_turn_summary_requires_encryption' USING ERRCODE = '23514';
    END IF;
  END LOOP;
  RETURN NEW;
END;
$$;
CREATE TRIGGER agent_turn_summary_guard BEFORE INSERT OR UPDATE ON public.agent_turns
  FOR EACH ROW EXECUTE FUNCTION public.guard_agent_turn_summary();
REVOKE ALL ON FUNCTION public.guard_agent_turn_summary()
  FROM PUBLIC,anon,authenticated;

CREATE FUNCTION public.migrate_agent_run_summary(
  p_id uuid,p_project_id uuid,p_old_outcome text,p_old_error text,
  p_new_outcome text DEFAULT NULL,p_new_error text DEFAULT NULL,
  p_write boolean DEFAULT false
) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE row public.agent_runs;
BEGIN
  SELECT * INTO row FROM public.agent_runs WHERE id=p_id AND project_id=p_project_id
    FOR UPDATE;
  IF NOT FOUND OR row.outcome IS DISTINCT FROM p_old_outcome OR
      row.error_message IS DISTINCT FROM p_old_error THEN RETURN false; END IF;
  IF p_write THEN
    UPDATE public.agent_runs SET outcome=p_new_outcome,error_message=p_new_error,
      summary_encryption_checked_at=clock_timestamp() WHERE id=p_id;
  ELSE
    UPDATE public.agent_runs SET summary_encryption_checked_at=clock_timestamp()
      WHERE id=p_id;
  END IF;
  RETURN true;
END;
$$;
REVOKE ALL ON FUNCTION public.migrate_agent_run_summary(
  uuid,uuid,text,text,text,text,boolean) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.migrate_agent_run_summary(
  uuid,uuid,text,text,text,text,boolean) TO service_role;

CREATE FUNCTION public.migrate_agent_turn_summary(
  p_id uuid,p_project_id uuid,p_old_outcome text,p_old_error text,
  p_new_outcome text DEFAULT NULL,p_new_error text DEFAULT NULL,
  p_write boolean DEFAULT false
) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE row public.agent_turns;
BEGIN
  SELECT t.* INTO row FROM public.agent_turns t
  JOIN public.agent_conversations c ON c.id=t.conversation_id
  WHERE t.id=p_id AND c.project_id=p_project_id FOR UPDATE OF t;
  IF NOT FOUND OR row.outcome IS DISTINCT FROM p_old_outcome OR
      row.error_message IS DISTINCT FROM p_old_error THEN RETURN false; END IF;
  IF p_write THEN
    UPDATE public.agent_turns SET outcome=p_new_outcome,error_message=p_new_error,
      summary_encryption_checked_at=clock_timestamp() WHERE id=p_id;
  ELSE
    UPDATE public.agent_turns SET summary_encryption_checked_at=clock_timestamp()
      WHERE id=p_id;
  END IF;
  RETURN true;
END;
$$;
REVOKE ALL ON FUNCTION public.migrate_agent_turn_summary(
  uuid,uuid,text,text,text,text,boolean) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.migrate_agent_turn_summary(
  uuid,uuid,text,text,text,text,boolean) TO service_role;

COMMIT;
