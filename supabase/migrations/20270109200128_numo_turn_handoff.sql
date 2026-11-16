-- MIN-1010: a Numo turn outlives the 300-second function that runs it.
--
-- When the time left in a job does not cover the next step, the loop stops
-- at a durable boundary (the checkpoint before a generation or before a tool
-- is already written) and the job gives the turn back to the queue with this
-- function. A new job claims it right away and resumes from that checkpoint.
--
-- Changing jobs is not a failure: the attempt `claim_numo_turn` took for this
-- job is returned, so a long turn never reaches the three-attempt ceiling by
-- running long. The conversation stays `generating`, and the checkpoint is
-- kept as it is.
--
-- Additive only: the previous release never calls it.

BEGIN;

CREATE FUNCTION public.hand_off_numo_turn(
  p_turn_id uuid,
  p_claim_token uuid
) RETURNS SETOF public.numo_assistant_turns
LANGUAGE sql SECURITY DEFINER SET search_path = '' AS $$
  UPDATE public.numo_assistant_turns
  SET status = 'queued',
      claim_token = NULL,
      claimed_at = NULL,
      not_before = now(),
      attempts = GREATEST(attempts - 1, 0),
      error_message = NULL,
      updated_at = now()
  WHERE id = p_turn_id
    AND claim_token = p_claim_token
    AND status = 'running'
  RETURNING *;
$$;

REVOKE ALL ON FUNCTION public.hand_off_numo_turn(uuid, uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.hand_off_numo_turn(uuid, uuid)
  TO service_role;

COMMIT;
