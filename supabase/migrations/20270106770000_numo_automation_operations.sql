-- Give every automation-chain step one durable Numo operation. The reservation
-- owns the private conversation and request identity before a turn is admitted,
-- so recovery can replay admission without creating a second conversation or
-- executing the same step twice.
BEGIN;

CREATE TABLE public.numo_automation_operations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  chain_id uuid NOT NULL REFERENCES public.agent_chains(id) ON DELETE CASCADE,
  step integer NOT NULL,
  rule_id text NOT NULL,
  mode text NOT NULL,
  conversation_id uuid NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  request_id uuid NOT NULL UNIQUE,
  turn_id uuid UNIQUE REFERENCES public.numo_assistant_turns(id) ON DELETE SET NULL,
  prompt text NOT NULL,
  locale text NOT NULL,
  context jsonb NOT NULL DEFAULT '{}'::jsonb,
  outcome text,
  outcome_summary text,
  outcome_blockers jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT numo_automation_operations_chain_step_unique UNIQUE (chain_id, step),
  CONSTRAINT numo_automation_operations_step_check CHECK (step > 0),
  CONSTRAINT numo_automation_operations_mode_check CHECK (
    mode IN ('plan', 'implement', 'verify', 'custom')
  ),
  CONSTRAINT numo_automation_operations_outcome_check CHECK (
    outcome IS NULL OR outcome IN ('ok', 'failed')
  ),
  CONSTRAINT numo_automation_operations_blockers_check CHECK (
    jsonb_typeof(outcome_blockers) = 'array'
  )
);

CREATE INDEX numo_automation_operations_chain_idx
  ON public.numo_automation_operations (chain_id, step DESC);
CREATE INDEX numo_automation_operations_unbound_idx
  ON public.numo_automation_operations (created_at)
  WHERE turn_id IS NULL;

ALTER TABLE public.numo_automation_operations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.numo_automation_operations FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.numo_automation_operations TO service_role;

CREATE TRIGGER numo_automation_operations_set_updated_at
  BEFORE UPDATE ON public.numo_automation_operations
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Serialize on the chain rather than relying on an insert/select race. The
-- first step creates the canonical private conversation; every later step
-- reuses it, making the whole chain visible as one Numo conversation.
CREATE OR REPLACE FUNCTION public.ensure_numo_automation_operation(
  p_chain_id uuid,
  p_step integer,
  p_rule_id text,
  p_mode text,
  p_user_id uuid,
  p_title text,
  p_request_id uuid,
  p_prompt text,
  p_locale text,
  p_context jsonb
) RETURNS public.numo_automation_operations
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_chain public.agent_chains%ROWTYPE;
  v_operation public.numo_automation_operations%ROWTYPE;
  v_conversation_id uuid;
BEGIN
  SELECT * INTO v_chain FROM public.agent_chains
  WHERE id = p_chain_id FOR UPDATE;
  IF v_chain.id IS NULL THEN
    RAISE EXCEPTION 'chain_not_found' USING ERRCODE = 'P0002';
  END IF;
  IF v_chain.owner_id <> p_user_id THEN
    RAISE EXCEPTION 'chain_owner_mismatch' USING ERRCODE = '42501';
  END IF;
  IF v_chain.status <> 'running'
    OR v_chain.step <> p_step
    OR jsonb_array_length(v_chain.played_rule_ids) = 0
    OR v_chain.played_rule_ids ->> (jsonb_array_length(v_chain.played_rule_ids) - 1) <> p_rule_id
  THEN
    RAISE EXCEPTION 'chain_step_mismatch' USING ERRCODE = '40001';
  END IF;

  SELECT * INTO v_operation FROM public.numo_automation_operations
  WHERE chain_id = p_chain_id AND step = p_step;
  IF v_operation.id IS NOT NULL THEN RETURN v_operation; END IF;

  SELECT conversation_id INTO v_conversation_id
  FROM public.numo_automation_operations
  WHERE chain_id = p_chain_id
  ORDER BY step ASC
  LIMIT 1;

  IF v_conversation_id IS NULL THEN
    INSERT INTO public.conversations (project_id, user_id, title)
    VALUES (NULL, p_user_id, p_title)
    RETURNING id INTO v_conversation_id;
  END IF;

  INSERT INTO public.numo_automation_operations (
    chain_id, step, rule_id, mode, conversation_id, request_id,
    prompt, locale, context
  ) VALUES (
    p_chain_id, p_step, p_rule_id, p_mode, v_conversation_id, p_request_id,
    p_prompt, p_locale, COALESCE(p_context, '{}'::jsonb)
  ) RETURNING * INTO v_operation;
  RETURN v_operation;
END;
$$;
REVOKE ALL ON FUNCTION public.ensure_numo_automation_operation(
  uuid, integer, text, text, uuid, text, uuid, text, text, jsonb
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ensure_numo_automation_operation(
  uuid, integer, text, text, uuid, text, uuid, text, text, jsonb
) TO service_role;

CREATE OR REPLACE FUNCTION public.retryable_numo_automation_operations(
  p_limit integer DEFAULT 25
) RETURNS SETOF public.numo_automation_operations
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT operation.*
  FROM public.numo_automation_operations AS operation
  JOIN public.numo_assistant_turns AS turn ON turn.id = operation.turn_id
  JOIN public.agent_chains AS chain ON chain.id = operation.chain_id
  WHERE turn.status = 'retryable'
    AND turn.not_before <= now()
    AND chain.status = 'running'
  ORDER BY turn.updated_at ASC, operation.id ASC
  LIMIT LEAST(GREATEST(p_limit, 1), 100)
$$;
REVOKE ALL ON FUNCTION public.retryable_numo_automation_operations(integer)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.retryable_numo_automation_operations(integer)
  TO service_role;

COMMIT;
