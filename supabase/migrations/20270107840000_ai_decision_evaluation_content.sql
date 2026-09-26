-- MIN-591: keep shadow decision answers and subject identities off the ledger.
BEGIN;
ALTER TABLE public.ai_decision_evaluations
  ADD CONSTRAINT ai_decision_evaluations_pkey PRIMARY KEY(id);
ALTER TABLE public.ai_decision_evaluations
  ALTER COLUMN jev_answers DROP NOT NULL,
  DROP CONSTRAINT ai_decision_evaluations_agree_needs_answers_check,
  ADD COLUMN encrypted_content text,
  ADD COLUMN encryption_version integer NOT NULL DEFAULT 0,
  ADD COLUMN content_revision bigint NOT NULL DEFAULT 0,
  ADD COLUMN replay_succeeded boolean,
  ADD COLUMN encryption_checked_at timestamptz,
  ADD COLUMN encryption_attempted_at timestamptz,
  ADD CONSTRAINT ai_decision_evaluations_agree_needs_answers_check
    CHECK (agree IS NULL OR llm_answers IS NOT NULL OR
      replay_succeeded IS TRUE);
CREATE INDEX ai_decision_evaluations_encryption_queue ON
  public.ai_decision_evaluations(encryption_attempted_at NULLS FIRST,id);

CREATE TABLE public.ai_decision_evaluation_scope(
  id boolean PRIMARY KEY DEFAULT true CHECK(id),
  activated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.ai_decision_evaluation_scope ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.ai_decision_evaluation_scope
  FROM PUBLIC,anon,authenticated;
GRANT ALL ON public.ai_decision_evaluation_scope TO service_role;

CREATE FUNCTION public.ai_decision_evaluation_cipher_version(p_cipher text)
RETURNS integer LANGUAGE plpgsql IMMUTABLE STRICT SET search_path='' AS $$
DECLARE parsed jsonb; format_number integer; key_version integer;
BEGIN
  parsed:=p_cipher::jsonb;
  format_number:=COALESCE((parsed->>'format')::integer,0);
  key_version:=COALESCE((parsed->>'keyVersion')::integer,0);
  IF format_number=3 AND key_version>0 THEN RETURN key_version; END IF;
  RETURN 0;
EXCEPTION WHEN others THEN RETURN 0;
END;
$$;
REVOKE ALL ON FUNCTION public.ai_decision_evaluation_cipher_version(text)
  FROM PUBLIC,anon,authenticated;

CREATE FUNCTION public.guard_ai_decision_evaluation_content()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE sealed boolean;
BEGIN
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('ai-decision-evaluation-content',591));
  sealed:=NEW.encryption_version>0 AND NEW.subject_id IS NULL AND
    NEW.jev_answers IS NULL AND NEW.llm_answers IS NULL AND
    NEW.replay_succeeded IS NOT NULL AND
    public.ai_decision_evaluation_cipher_version(NEW.encrypted_content)
      =NEW.encryption_version;
  IF TG_OP='UPDATE' THEN
    NEW.content_revision:=OLD.content_revision+1;
    IF NEW.id IS DISTINCT FROM OLD.id OR
        NEW.encryption_version<OLD.encryption_version OR
        (OLD.encryption_version>0 AND NOT sealed) THEN
      RAISE EXCEPTION 'ai_decision_evaluation_scope_change'
        USING ERRCODE='23514';
    END IF;
  END IF;
  IF NEW.encryption_version<0 OR
      (NEW.encryption_version=0 AND
        (NEW.encrypted_content IS NOT NULL OR NEW.jev_answers IS NULL)) OR
      (NEW.encryption_version>0 AND NOT sealed) THEN
    RAISE EXCEPTION 'ai_decision_evaluation_state_invalid'
      USING ERRCODE='23514';
  END IF;
  IF NOT sealed AND EXISTS(SELECT 1 FROM public.ai_decision_evaluation_scope) THEN
    RAISE EXCEPTION 'ai_decision_evaluation_requires_encryption'
      USING ERRCODE='23514';
  END IF;
  IF sealed AND (TG_OP='INSERT' OR
      NEW.encrypted_content IS DISTINCT FROM OLD.encrypted_content) THEN
    NEW.encryption_checked_at:=pg_catalog.clock_timestamp();
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER ai_decision_evaluation_content_guard BEFORE INSERT OR UPDATE
  ON public.ai_decision_evaluations FOR EACH ROW
  EXECUTE FUNCTION public.guard_ai_decision_evaluation_content();
REVOKE ALL ON FUNCTION public.guard_ai_decision_evaluation_content()
  FROM PUBLIC,anon,authenticated;

CREATE FUNCTION public.activate_ai_decision_evaluation_content()
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('ai-decision-evaluation-content',591));
  IF EXISTS(SELECT 1 FROM public.ai_decision_evaluations WHERE
      encryption_version<1 OR encrypted_content IS NULL OR
      subject_id IS NOT NULL OR jev_answers IS NOT NULL OR
      llm_answers IS NOT NULL OR replay_succeeded IS NULL OR
      encryption_checked_at IS NULL OR
      public.ai_decision_evaluation_cipher_version(encrypted_content)
        <>encryption_version) THEN RETURN false; END IF;
  INSERT INTO public.ai_decision_evaluation_scope(id) VALUES(true)
    ON CONFLICT DO NOTHING;
  RETURN true;
END;
$$;
REVOKE ALL ON FUNCTION public.activate_ai_decision_evaluation_content()
  FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.activate_ai_decision_evaluation_content()
  TO service_role;

CREATE OR REPLACE VIEW public.ai_decision_evaluations_weekly
  WITH (security_invoker=true) AS
SELECT e.use_case,pg_catalog.date_trunc('week',e.created_at) AS week_start,
  count(*) AS samples,
  count(*) FILTER (WHERE e.agree IS NOT NULL) AS comparable,
  count(*) FILTER (WHERE e.agree IS TRUE) AS agree_count,
  count(*) FILTER (WHERE
    COALESCE(e.replay_succeeded,e.llm_answers IS NOT NULL) IS FALSE)
    AS replay_failed,
  pg_catalog.sum(e.jev_latency_ms) AS jev_latency_sum,
  pg_catalog.count(e.jev_latency_ms) AS jev_latency_count,
  pg_catalog.sum(e.llm_latency_ms) AS llm_latency_sum,
  pg_catalog.count(e.llm_latency_ms) AS llm_latency_count,
  pg_catalog.sum(e.llm_cost) AS llm_cost_sum,
  pg_catalog.count(e.llm_cost) AS llm_cost_count
FROM public.ai_decision_evaluations e GROUP BY 1,2;
COMMIT;
