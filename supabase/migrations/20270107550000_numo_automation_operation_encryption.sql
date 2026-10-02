-- MIN-591: protect private automation prompts, issue snapshots and outcomes.
BEGIN;
ALTER TABLE public.numo_automation_operations
  ADD COLUMN content_encryption_checked_at timestamptz,
  DROP CONSTRAINT numo_automation_operations_blockers_check,
  ADD CONSTRAINT numo_automation_operations_blockers_check CHECK (
    jsonb_typeof(outcome_blockers) IN ('array','object'));
CREATE INDEX numo_automation_content_queue ON public.numo_automation_operations
  (content_encryption_checked_at NULLS FIRST,id);

CREATE TABLE public.numo_automation_content_scope (
  id boolean PRIMARY KEY DEFAULT true CHECK(id),
  activated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.numo_automation_content_scope ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.numo_automation_content_scope FROM PUBLIC,anon,authenticated;
GRANT ALL ON public.numo_automation_content_scope TO service_role;

CREATE FUNCTION public.automation_operation_json_cipher_valid(
  value jsonb,project uuid,chain uuid,operation_step integer,field_name text
) RETURNS boolean LANGUAGE plpgsql STABLE SET search_path = '' AS $$
BEGIN
  IF jsonb_typeof(value) <> 'object' OR
      NOT (value ? 'encrypted_operation_value') THEN RETURN false; END IF;
  RETURN value - ARRAY['encrypted_operation_value','encryption_version',
      'project_id','chain_id','step','field']::text[] = '{}'::jsonb
    AND (SELECT count(*) FROM pg_catalog.jsonb_object_keys(value)) = 6
    AND value->>'project_id' IS NOT DISTINCT FROM project::text
    AND value->>'chain_id' IS NOT DISTINCT FROM chain::text
    AND value->>'step' IS NOT DISTINCT FROM operation_step::text
    AND value->>'field' IS NOT DISTINCT FROM field_name
    AND COALESCE((value->>'encryption_version')::integer > 0,false)
    AND COALESCE(((value->>'encrypted_operation_value')::jsonb
      ->>'format')::integer = 3,false)
    AND (value->>'encryption_version')::integer IS NOT DISTINCT FROM
      ((value->>'encrypted_operation_value')::jsonb
      ->>'keyVersion')::integer;
EXCEPTION WHEN invalid_text_representation OR numeric_value_out_of_range
  THEN RETURN false;
END;
$$;
REVOKE ALL ON FUNCTION public.automation_operation_json_cipher_valid(
  jsonb,uuid,uuid,integer,text) FROM PUBLIC,anon,authenticated;

CREATE FUNCTION public.guard_numo_automation_content()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE active boolean; project uuid; old_version integer; new_version integer;
BEGIN
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('numo-automation-content-activation', 591));
  IF TG_OP='UPDATE' AND (NEW.id IS DISTINCT FROM OLD.id OR
      NEW.chain_id IS DISTINCT FROM OLD.chain_id OR
      NEW.step IS DISTINCT FROM OLD.step) THEN
    RAISE EXCEPTION 'numo_automation_binding_immutable' USING ERRCODE='23514';
  END IF;
  SELECT project_id INTO project FROM public.agent_chains WHERE id=NEW.chain_id;
  IF project IS NULL THEN
    RAISE EXCEPTION 'numo_automation_project_missing' USING ERRCODE='23503';
  END IF;
  active := EXISTS (SELECT 1 FROM public.numo_automation_content_scope)
    OR NEW.prompt LIKE 'mdyo3:%' OR NEW.context ? 'encrypted_operation_value'
    OR NEW.outcome_summary LIKE 'mdyo3:%'
    OR NEW.outcome_blockers ? 'encrypted_operation_value';
  IF NEW.prompt LIKE 'mdyo3:%' THEN
    IF NEW.prompt !~ '^mdyo3:[1-9][0-9]*:[A-Za-z0-9_-]+$' THEN
      RAISE EXCEPTION 'numo_automation_prompt_ciphertext_invalid' USING ERRCODE='23514';
    END IF;
    new_version := pg_catalog.split_part(NEW.prompt,':',2)::integer;
    IF TG_OP='UPDATE' AND OLD.prompt LIKE 'mdyo3:%' THEN
      old_version := pg_catalog.split_part(OLD.prompt,':',2)::integer;
      IF new_version < old_version THEN
        RAISE EXCEPTION 'numo_automation_key_rollback' USING ERRCODE='23514';
      END IF;
    END IF;
    INSERT INTO public.numo_automation_content_scope(id)
      VALUES(true) ON CONFLICT DO NOTHING;
    active := true;
  ELSIF active AND (TG_OP='INSERT' OR NEW.prompt IS DISTINCT FROM OLD.prompt OR
      NEW.content_encryption_checked_at IS DISTINCT FROM
        OLD.content_encryption_checked_at) THEN
    RAISE EXCEPTION 'numo_automation_prompt_requires_encryption'
      USING ERRCODE='23514';
  END IF;
  IF NEW.context ? 'encrypted_operation_value' THEN
    IF NOT public.automation_operation_json_cipher_valid(NEW.context,
        project,NEW.chain_id,NEW.step,'context') THEN
      RAISE EXCEPTION 'numo_automation_context_ciphertext_invalid'
        USING ERRCODE='23514';
    END IF;
    IF TG_OP='UPDATE' AND OLD.context ? 'encrypted_operation_value' AND
       (NEW.context->>'encryption_version')::integer <
         (OLD.context->>'encryption_version')::integer THEN
      RAISE EXCEPTION 'numo_automation_key_rollback' USING ERRCODE='23514';
    END IF;
    INSERT INTO public.numo_automation_content_scope(id)
      VALUES(true) ON CONFLICT DO NOTHING;
    active := true;
  ELSIF active AND (TG_OP='INSERT' OR NEW.context IS DISTINCT FROM OLD.context OR
      NEW.content_encryption_checked_at IS DISTINCT FROM
        OLD.content_encryption_checked_at) THEN
    RAISE EXCEPTION 'numo_automation_context_requires_encryption'
      USING ERRCODE='23514';
  END IF;
  IF NEW.outcome_summary LIKE 'mdyo3:%' THEN
    IF NEW.outcome_summary !~ '^mdyo3:[1-9][0-9]*:[A-Za-z0-9_-]+$' THEN
      RAISE EXCEPTION 'numo_automation_summary_ciphertext_invalid'
        USING ERRCODE='23514';
    END IF;
    IF TG_OP='UPDATE' AND OLD.outcome_summary LIKE 'mdyo3:%' AND
       pg_catalog.split_part(NEW.outcome_summary,':',2)::integer <
         pg_catalog.split_part(OLD.outcome_summary,':',2)::integer THEN
      RAISE EXCEPTION 'numo_automation_key_rollback' USING ERRCODE='23514';
    END IF;
    INSERT INTO public.numo_automation_content_scope(id)
      VALUES(true) ON CONFLICT DO NOTHING;
    active := true;
  ELSIF active AND NEW.outcome_summary IS NOT NULL AND
      (TG_OP='INSERT' OR NEW.outcome_summary IS DISTINCT FROM
        OLD.outcome_summary OR NEW.content_encryption_checked_at IS DISTINCT FROM
        OLD.content_encryption_checked_at) THEN
    RAISE EXCEPTION 'numo_automation_summary_requires_encryption'
      USING ERRCODE='23514';
  END IF;
  IF NEW.outcome_blockers ? 'encrypted_operation_value' THEN
    IF NOT public.automation_operation_json_cipher_valid(NEW.outcome_blockers,
        project,NEW.chain_id,NEW.step,'outcome_blockers') THEN
      RAISE EXCEPTION 'numo_automation_blockers_ciphertext_invalid'
        USING ERRCODE='23514';
    END IF;
    IF TG_OP='UPDATE' AND OLD.outcome_blockers ? 'encrypted_operation_value' AND
       (NEW.outcome_blockers->>'encryption_version')::integer <
         (OLD.outcome_blockers->>'encryption_version')::integer THEN
      RAISE EXCEPTION 'numo_automation_key_rollback' USING ERRCODE='23514';
    END IF;
    INSERT INTO public.numo_automation_content_scope(id)
      VALUES(true) ON CONFLICT DO NOTHING;
    active := true;
  ELSIF active AND (NEW.outcome IS NOT NULL OR
      NEW.outcome_blockers <> '[]'::jsonb) AND
      (TG_OP='INSERT' OR NEW.outcome_blockers IS DISTINCT FROM
        OLD.outcome_blockers OR NEW.content_encryption_checked_at IS DISTINCT FROM
        OLD.content_encryption_checked_at) THEN
    RAISE EXCEPTION 'numo_automation_blockers_requires_encryption'
      USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER numo_automation_content_guard BEFORE INSERT OR UPDATE
  ON public.numo_automation_operations FOR EACH ROW
  EXECUTE FUNCTION public.guard_numo_automation_content();
REVOKE ALL ON FUNCTION public.guard_numo_automation_content()
  FROM PUBLIC,anon,authenticated;

CREATE FUNCTION public.migrate_numo_automation_content(
  p_id uuid,p_old_prompt text,p_old_context jsonb,
  p_old_summary text,p_old_blockers jsonb,
  p_new_prompt text,p_new_context jsonb,
  p_new_summary text,p_new_blockers jsonb
) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE observed public.numo_automation_operations; identifier text;
BEGIN
  SELECT * INTO observed FROM public.numo_automation_operations
    WHERE id=p_id FOR UPDATE;
  IF NOT FOUND OR observed.prompt IS DISTINCT FROM p_old_prompt OR
      observed.context IS DISTINCT FROM p_old_context OR
      observed.outcome_summary IS DISTINCT FROM p_old_summary OR
      observed.outcome_blockers IS DISTINCT FROM p_old_blockers THEN
    RETURN false;
  END IF;
  UPDATE public.numo_automation_operations SET prompt=p_new_prompt,
    context=p_new_context,outcome_summary=p_new_summary,
    outcome_blockers=p_new_blockers,
    content_encryption_checked_at=clock_timestamp() WHERE id=p_id;
  IF observed.step=1 THEN
    SELECT project.key || '-' || issue.number::text INTO identifier
      FROM public.agent_chains AS chain
      JOIN public.issues AS issue ON issue.id=chain.issue_id
      JOIN public.projects AS project ON project.id=chain.project_id
      WHERE chain.id=observed.chain_id;
    IF identifier IS NULL THEN
      RAISE EXCEPTION 'chain_issue_identifier_missing' USING ERRCODE='23503';
    END IF;
    UPDATE public.conversations SET title=identifier
      WHERE id=observed.conversation_id AND
        title LIKE identifier || ': %';
  END IF;
  RETURN true;
END;
$$;
REVOKE ALL ON FUNCTION public.migrate_numo_automation_content(
  uuid,text,jsonb,text,jsonb,text,jsonb,text,jsonb)
  FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.migrate_numo_automation_content(
  uuid,text,jsonb,text,jsonb,text,jsonb,text,jsonb)
  TO service_role;

-- The reservation's display title used to copy the issue title into the
-- conversation before inserting its encrypted operation. Keep only its
-- existing routing identifier in the transaction and reject clear payloads
-- through the operation guard.
CREATE OR REPLACE FUNCTION public.ensure_numo_automation_operation(
  p_chain_id uuid,p_step integer,p_rule_id text,p_mode text,p_user_id uuid,
  p_title text,p_request_id uuid,p_prompt text,p_locale text,p_context jsonb
) RETURNS public.numo_automation_operations
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_chain public.agent_chains%ROWTYPE;
  v_operation public.numo_automation_operations%ROWTYPE;
  v_conversation_id uuid;
  v_identifier text;
BEGIN
  SELECT * INTO v_chain FROM public.agent_chains
    WHERE id=p_chain_id FOR UPDATE;
  IF v_chain.id IS NULL THEN
    RAISE EXCEPTION 'chain_not_found' USING ERRCODE='P0002';
  END IF;
  IF v_chain.owner_id <> p_user_id THEN
    RAISE EXCEPTION 'chain_owner_mismatch' USING ERRCODE='42501';
  END IF;
  IF v_chain.status <> 'running' OR v_chain.step <> p_step OR
      jsonb_array_length(v_chain.played_rule_ids) = 0 OR
      v_chain.played_rule_ids ->>
        (jsonb_array_length(v_chain.played_rule_ids)-1) <> p_rule_id THEN
    RAISE EXCEPTION 'chain_step_mismatch' USING ERRCODE='40001';
  END IF;
  SELECT * INTO v_operation FROM public.numo_automation_operations
    WHERE chain_id=p_chain_id AND step=p_step;
  IF v_operation.id IS NOT NULL THEN RETURN v_operation; END IF;

  SELECT conversation_id INTO v_conversation_id
    FROM public.numo_automation_operations
    WHERE chain_id=p_chain_id ORDER BY step ASC LIMIT 1;
  IF v_conversation_id IS NULL THEN
    SELECT project.key || '-' || issue.number::text INTO v_identifier
      FROM public.issues AS issue
      JOIN public.projects AS project ON project.id=issue.project_id
      WHERE issue.id=v_chain.issue_id AND project.id=v_chain.project_id;
    IF v_identifier IS NULL THEN
      RAISE EXCEPTION 'chain_issue_identifier_missing' USING ERRCODE='23503';
    END IF;
    INSERT INTO public.conversations(project_id,user_id,title)
      VALUES(NULL,p_user_id,v_identifier)
      RETURNING id INTO v_conversation_id;
  END IF;
  INSERT INTO public.numo_automation_operations(chain_id,step,rule_id,
    mode,conversation_id,request_id,prompt,locale,context)
    VALUES(p_chain_id,p_step,p_rule_id,p_mode,v_conversation_id,
      p_request_id,p_prompt,p_locale,COALESCE(p_context,'{}'::jsonb))
    RETURNING * INTO v_operation;
  RETURN v_operation;
END;
$$;
REVOKE ALL ON FUNCTION public.ensure_numo_automation_operation(
  uuid,integer,text,text,uuid,text,uuid,text,text,jsonb)
  FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.ensure_numo_automation_operation(
  uuid,integer,text,text,uuid,text,uuid,text,text,jsonb) TO service_role;
COMMIT;
