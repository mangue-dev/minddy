-- MIN-926, third part: the two pull request signals the forge sends but
-- minddy never stored, a review request and failing CI. They are not
-- gestures on the ticket, so they bypass `issue_events` (the activity
-- timeline) and land in the event journal directly, for background Numo's
-- batches (lib/server/numo/forge-signals.ts).
--
-- One row per linked issue and recipient. A CI failure is journaled once per
-- pull request and head commit, however many suites or statuses report it;
-- a review request once per pull request and reviewer within ten minutes, so
-- a re-request after new commits still counts.
--
-- Additive only: the previous release never calls the function.

BEGIN;

CREATE INDEX routine_events_pull_request_signals
  ON public.routine_events(subject_id, created_at) WHERE event='issue.pull_request';

CREATE FUNCTION public.journal_pull_request_signal(
  p_issue_id uuid, p_pull_request_id uuid, p_type text, p_head_sha text, p_recipient_id uuid
) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE pid uuid;
BEGIN
  IF p_type NOT IN ('pr_review_requested','pr_checks_failed') OR p_issue_id IS NULL OR p_pull_request_id IS NULL THEN
    RAISE EXCEPTION 'pull_request_signal_invalid' USING ERRCODE='22023';
  END IF;
  -- Same lock order as the other issue journal paths: row, then subject.
  SELECT project_id INTO pid FROM public.issues WHERE id=p_issue_id AND deleted_at IS NULL FOR NO KEY UPDATE;
  IF pid IS NULL OR NOT EXISTS(SELECT 1 FROM public.projects WHERE id=pid AND deleted_at IS NULL) THEN RETURN false; END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(pid::text||'issue'||p_issue_id::text,677));
  IF EXISTS(SELECT 1 FROM public.routine_events e
    WHERE e.subject_id=p_issue_id AND e.event='issue.pull_request'
      AND e.after_state->>'type'=p_type AND e.after_state->>'pull_request_id'=p_pull_request_id::text
      AND e.recipient_id IS NOT DISTINCT FROM p_recipient_id
      AND CASE WHEN p_type='pr_checks_failed' AND p_head_sha IS NOT NULL
        THEN e.after_state->>'head_sha'=p_head_sha
        ELSE e.created_at>now()-interval '10 minutes' END) THEN
    RETURN false;
  END IF;
  INSERT INTO public.routine_events(project_id,subject_type,subject_id,event,after_state,actor_kind,recipient_id)
    VALUES(pid,'issue',p_issue_id,'issue.pull_request',
      jsonb_build_object('type',p_type,'pull_request_id',p_pull_request_id,'head_sha',p_head_sha),
      'system',p_recipient_id);
  RETURN true;
END; $$;
REVOKE ALL ON FUNCTION public.journal_pull_request_signal(uuid,uuid,text,text,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.journal_pull_request_signal(uuid,uuid,text,text,uuid) TO service_role;

COMMIT;
