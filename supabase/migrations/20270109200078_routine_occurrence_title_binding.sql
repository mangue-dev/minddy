-- MIN-791: open routine occurrence conversations again.
--
-- `20270109200043_enriched_routines.sql` re-created this function from a body
-- older than `20270107570000_numo_conversation_title_encryption.sql` and lost
-- two of its guarantees. The conversation took a random id although the
-- application encrypts its title bound to the request id, and the `mdyn3:`
-- ciphertext was cut to 200 characters. Every read decrypts the title, so
-- those conversations could no longer be opened and the title backfill failed
-- on them. This body restores both guarantees on top of the arming support.
CREATE OR REPLACE FUNCTION public.ensure_numo_routine_occurrence(
  p_routine_id uuid,
  p_user_id uuid,
  p_origin text,
  p_scheduled_for timestamptz,
  p_request_id uuid,
  p_title text,
  p_arming_id uuid DEFAULT NULL
) RETURNS public.numo_routine_occurrences
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_routine public.agent_routines%ROWTYPE;
  v_occurrence public.numo_routine_occurrences%ROWTYPE;
  v_conversation_id uuid;
  v_arming public.routine_armings%ROWTYPE;
BEGIN
  IF p_routine_id IS NULL OR p_user_id IS NULL OR p_request_id IS NULL
     OR p_origin NOT IN ('scheduled', 'manual', 'event', 'database')
     OR (p_origin = 'scheduled' AND p_scheduled_for IS NULL)
     OR (p_origin <> 'scheduled' AND p_scheduled_for IS NOT NULL)
     OR nullif(pg_catalog.btrim(p_title), '') IS NULL THEN
    RAISE EXCEPTION 'routine_occurrence_invalid' USING ERRCODE = '22023';
  END IF;

  SELECT routine.* INTO v_routine
  FROM public.agent_routines AS routine
  JOIN public.projects AS project ON project.id = routine.project_id
  WHERE routine.id = p_routine_id
    AND routine.deleted_at IS NULL
    AND project.deleted_at IS NULL
    AND project.owner_id = p_user_id
  FOR UPDATE OF routine;
  IF v_routine.id IS NULL THEN
    RAISE EXCEPTION 'routine_not_found' USING ERRCODE = 'P0002';
  END IF;
  IF v_routine.owner_id IS DISTINCT FROM p_user_id THEN
    RAISE EXCEPTION 'routine_owner_mismatch' USING ERRCODE = '42501';
  END IF;

  IF p_origin IN ('event','database') THEN
    SELECT * INTO v_arming FROM public.routine_armings WHERE id=p_arming_id AND routine_id=p_routine_id FOR UPDATE;
    IF v_arming.id IS NULL OR NOT v_routine.enabled OR v_arming.revision<>v_routine.trigger_revision
      OR v_arming.state NOT IN ('reserved','consumed') OR v_arming.request_id<>p_request_id
      OR v_arming.lease_until<now() OR v_routine.trigger_type<>p_origin THEN
      RAISE EXCEPTION 'routine_arming_invalid' USING ERRCODE='22023';
    END IF;
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

  -- The application encrypts the title bound to the request id, so the
  -- conversation takes that id and the ciphertext is stored unchanged.
  INSERT INTO public.conversations (
    id, project_id, user_id, title, model, reasoning_level
  ) VALUES (
    p_request_id, NULL, p_user_id, CASE WHEN p_title LIKE 'mdyn3:%'
      THEN p_title ELSE pg_catalog.left(pg_catalog.btrim(p_title), 200) END, NULL, NULL
  ) RETURNING id INTO v_conversation_id;

  INSERT INTO public.numo_routine_occurrences (
    routine_id, origin, scheduled_for, conversation_id, request_id,arming_id,event_id,subject_id,subject_type,cause_routine_ids
  ) VALUES (
    p_routine_id, p_origin, p_scheduled_for, v_conversation_id, p_request_id,p_arming_id,v_arming.event_id,v_arming.subject_id,v_arming.subject_type,COALESCE((SELECT cause_routine_ids FROM public.routine_events WHERE id=v_arming.event_id),'{}')
  ) RETURNING * INTO v_occurrence;
  RETURN v_occurrence;
END;
$$;
REVOKE ALL ON FUNCTION public.ensure_numo_routine_occurrence(
  uuid, uuid, text, timestamptz, uuid, text, uuid
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ensure_numo_routine_occurrence(
  uuid, uuid, text, timestamptz, uuid, text, uuid
) TO service_role;

-- The damaged titles cannot be decrypted, and a clear title is refused once
-- title encryption is active, so they are cleared and the interface shows its
-- untitled label. Only titles cut to exactly 200 characters on a conversation
-- whose id differs from its occurrence's request id match: an intact
-- ciphertext is always longer, and older occurrences kept their own id with a
-- title the backfill encrypted for that id.
UPDATE public.conversations AS conversation
SET title = NULL
FROM public.numo_routine_occurrences AS occurrence
WHERE occurrence.conversation_id = conversation.id
  AND occurrence.request_id <> conversation.id
  AND conversation.title LIKE 'mdyn3:%'
  AND pg_catalog.length(conversation.title) = 200;
