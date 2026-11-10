-- MIN-903: when the owner turns Smart Assign on, they can ask it to fill the
-- open issues nobody is assigned to. Three additions:
--
-- - `projects.smart_assign_enabled_at`: when Smart Assign was last turned on.
--   An empty assignee reads "Smart Assign" only on issues it will really
--   fill, and an open issue older than this date is not one of them. Projects
--   that already have it on are stamped now: nothing fills their older issues.
-- - `projects.smart_assign_backfill_requested_at`: set while a backfill the
--   owner asked for still has issues to assign. The Smart Assign cron resumes
--   those projects and clears the column when it is done.
-- - `notifications.issue_count` and the `smart_assign_batch` type: a backfill
--   tells each person once how many issues it assigned them, instead of once
--   per issue.
--
-- `smart_assign_backfill_candidates` lists what a backfill may assign: open
-- issues (backlog, todo) with no assignee that were never assigned before.
-- An issue someone unassigned by hand carries an `assignee_id` event and is
-- left alone, as in the 24-hour sweep.
--
-- Additive only: the previous release ignores the new columns, never writes
-- the new type and never calls the function.

BEGIN;

ALTER TABLE public.projects
  ADD COLUMN smart_assign_enabled_at timestamptz,
  ADD COLUMN smart_assign_backfill_requested_at timestamptz;

UPDATE public.projects
  SET smart_assign_enabled_at = now()
  WHERE smart_assign_enabled AND smart_assign_enabled_at IS NULL;

CREATE INDEX projects_smart_assign_backfill_requested_idx
  ON public.projects (smart_assign_backfill_requested_at)
  WHERE smart_assign_backfill_requested_at IS NOT NULL;

ALTER TABLE public.notifications ADD COLUMN issue_count integer;
ALTER TABLE public.notifications ADD CONSTRAINT notifications_issue_count_check CHECK (
  (type = 'smart_assign_batch') = (issue_count IS NOT NULL)
  AND (issue_count IS NULL OR issue_count > 0)
);

ALTER TABLE public.notifications DROP CONSTRAINT notifications_type_check;
ALTER TABLE public.notifications ADD CONSTRAINT notifications_type_check CHECK (type = ANY (ARRAY[
  'assigned', 'mention', 'comment', 'agent_done', 'agent_question', 'agent_failed',
  'feedback_new', 'pr_reviewed', 'pr_merged', 'pr_opened', 'automation_paused',
  'automation_stopped', 'routine_done', 'page_mention', 'page_agent_edit', 'page_comment',
  'instance_config_changed', 'numo_message', 'smart_assign_batch'
]::text[]));

CREATE FUNCTION public.smart_assign_backfill_candidates(
  p_project_id uuid,
  p_limit integer DEFAULT NULL
)
RETURNS SETOF uuid
LANGUAGE sql STABLE SECURITY INVOKER
SET search_path = ''
AS $$
  SELECT i.id
  FROM public.issues i
  WHERE i.project_id = p_project_id
    AND i.deleted_at IS NULL
    AND i.assignee_id IS NULL
    AND i.status IN ('backlog', 'todo')
    AND NOT EXISTS (
      SELECT 1 FROM public.issue_events e
      WHERE e.issue_id = i.id AND e.field = 'assignee_id'
    )
  ORDER BY i.created_at, i.id
  LIMIT p_limit;
$$;

REVOKE ALL ON FUNCTION public.smart_assign_backfill_candidates(uuid, integer)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.smart_assign_backfill_candidates(uuid, integer)
  TO service_role;

COMMIT;
