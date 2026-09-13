-- Give every scheduled or manual routine occurrence one durable, private Numo
-- conversation. The routine clock still claims its due timestamp first; this
-- record then preserves the occurrence even when admission or execution fails.
BEGIN;

CREATE TABLE public.numo_routine_occurrences (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  routine_id uuid NOT NULL REFERENCES public.agent_routines(id) ON DELETE CASCADE,
  origin text NOT NULL,
  scheduled_for timestamptz,
  conversation_id uuid NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  request_id uuid NOT NULL UNIQUE,
  turn_id uuid UNIQUE REFERENCES public.numo_assistant_turns(id) ON DELETE SET NULL,
  error_code text,
  error_message text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT numo_routine_occurrences_origin_check CHECK (
    origin IN ('scheduled', 'manual')
  ),
  CONSTRAINT numo_routine_occurrences_schedule_check CHECK (
    (origin = 'scheduled' AND scheduled_for IS NOT NULL)
    OR (origin = 'manual' AND scheduled_for IS NULL)
  ),
  CONSTRAINT numo_routine_occurrences_error_check CHECK (
    (error_code IS NULL AND error_message IS NULL)
    OR error_code IS NOT NULL
  )
);

CREATE UNIQUE INDEX numo_routine_occurrences_due_unique
  ON public.numo_routine_occurrences (routine_id, scheduled_for)
  WHERE origin = 'scheduled';
CREATE INDEX numo_routine_occurrences_routine_idx
  ON public.numo_routine_occurrences (routine_id, created_at DESC);
CREATE INDEX numo_routine_occurrences_unbound_idx
  ON public.numo_routine_occurrences (created_at)
  WHERE turn_id IS NULL AND error_code IS NULL;

CREATE TRIGGER numo_routine_occurrences_set_updated_at
  BEFORE UPDATE ON public.numo_routine_occurrences
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.numo_routine_occurrences ENABLE ROW LEVEL SECURITY;
CREATE POLICY numo_routine_occurrences_select
  ON public.numo_routine_occurrences FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.agent_routines AS routine
    WHERE routine.id = numo_routine_occurrences.routine_id
      AND public.can_access_project(routine.project_id)
  ));
REVOKE ALL ON public.numo_routine_occurrences FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.numo_routine_occurrences TO authenticated;
GRANT ALL ON public.numo_routine_occurrences TO service_role;

-- Reservation is idempotent for both source event identities: a scheduled
-- timestamp can only become one occurrence, and a retried manual request keeps
-- its request id. Conversation configuration is deliberately NULL. Legacy
-- routine model/reasoning values were removed by MIN-518 and are never copied or
-- reinterpreted as Numo conversation choices.
CREATE OR REPLACE FUNCTION public.ensure_numo_routine_occurrence(
  p_routine_id uuid,
  p_user_id uuid,
  p_origin text,
  p_scheduled_for timestamptz,
  p_request_id uuid,
  p_title text
) RETURNS public.numo_routine_occurrences
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_routine public.agent_routines%ROWTYPE;
  v_occurrence public.numo_routine_occurrences%ROWTYPE;
  v_conversation_id uuid;
BEGIN
  IF p_routine_id IS NULL OR p_user_id IS NULL OR p_request_id IS NULL
     OR p_origin NOT IN ('scheduled', 'manual')
     OR (p_origin = 'scheduled' AND p_scheduled_for IS NULL)
     OR (p_origin = 'manual' AND p_scheduled_for IS NOT NULL)
     OR pg_catalog.nullif(pg_catalog.btrim(p_title), '') IS NULL THEN
    RAISE EXCEPTION 'routine_occurrence_invalid' USING ERRCODE = '22023';
  END IF;

  SELECT routine.* INTO v_routine
  FROM public.agent_routines AS routine
  JOIN public.projects AS project ON project.id = routine.project_id
  WHERE routine.id = p_routine_id
    AND routine.deleted_at IS NULL
    AND project.deleted_at IS NULL
  FOR UPDATE OF routine;
  IF v_routine.id IS NULL THEN
    RAISE EXCEPTION 'routine_not_found' USING ERRCODE = 'P0002';
  END IF;
  IF v_routine.owner_id IS DISTINCT FROM p_user_id THEN
    RAISE EXCEPTION 'routine_owner_mismatch' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_occurrence
  FROM public.numo_routine_occurrences
  WHERE request_id = p_request_id
     OR (
       p_origin = 'scheduled'
       AND routine_id = p_routine_id
       AND origin = 'scheduled'
       AND scheduled_for = p_scheduled_for
     )
  ORDER BY created_at ASC
  LIMIT 1;
  IF v_occurrence.id IS NOT NULL THEN
    IF v_occurrence.routine_id IS DISTINCT FROM p_routine_id
       OR v_occurrence.origin IS DISTINCT FROM p_origin
       OR v_occurrence.scheduled_for IS DISTINCT FROM p_scheduled_for THEN
      RAISE EXCEPTION 'routine_occurrence_conflict' USING ERRCODE = '23505';
    END IF;
    RETURN v_occurrence;
  END IF;

  INSERT INTO public.conversations (
    project_id, user_id, title, model, reasoning_level
  ) VALUES (
    NULL, p_user_id, pg_catalog.left(pg_catalog.btrim(p_title), 200), NULL, NULL
  ) RETURNING id INTO v_conversation_id;

  INSERT INTO public.numo_routine_occurrences (
    routine_id, origin, scheduled_for, conversation_id, request_id
  ) VALUES (
    p_routine_id, p_origin, p_scheduled_for, v_conversation_id, p_request_id
  ) RETURNING * INTO v_occurrence;
  RETURN v_occurrence;
END;
$$;
REVOKE ALL ON FUNCTION public.ensure_numo_routine_occurrence(
  uuid, uuid, text, timestamptz, uuid, text
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ensure_numo_routine_occurrence(
  uuid, uuid, text, timestamptz, uuid, text
) TO service_role;

COMMIT;
