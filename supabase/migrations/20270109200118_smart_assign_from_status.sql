-- MIN-957: the owner chooses the status from which Smart Assign may assign an
-- issue. `projects.smart_assign_from_status` holds it: `backlog` (the default,
-- and what every project did until now) assigns every issue past triage;
-- `todo` leaves backlog issues empty until they are committed.
--
-- `smart_assign_backfill_candidates` reads the setting: a backfill fills the
-- issues from the start status up to todo, so a project that assigns from
-- todo no longer counts or fills its backlog. Same signature, same grants.
--
-- Additive only: the previous release ignores the column, every existing
-- project keeps `backlog`, and the function returns for them what it returned
-- before.

BEGIN;

ALTER TABLE public.projects
  ADD COLUMN smart_assign_from_status text NOT NULL DEFAULT 'backlog'
  CONSTRAINT projects_smart_assign_from_status_check
    CHECK (smart_assign_from_status = ANY (ARRAY['backlog', 'todo']::text[]));

CREATE OR REPLACE FUNCTION public.smart_assign_backfill_candidates(
  p_project_id uuid,
  p_limit integer DEFAULT NULL
)
RETURNS SETOF uuid
LANGUAGE sql STABLE SECURITY INVOKER
SET search_path = ''
AS $$
  SELECT i.id
  FROM public.issues i
  JOIN public.projects p ON p.id = i.project_id
  WHERE i.project_id = p_project_id
    AND i.deleted_at IS NULL
    AND i.assignee_id IS NULL
    AND (
      i.status = 'todo'
      OR (i.status = 'backlog' AND p.smart_assign_from_status = 'backlog')
    )
    AND NOT EXISTS (
      SELECT 1 FROM public.issue_events e
      WHERE e.issue_id = i.id AND e.field = 'assignee_id'
    )
  ORDER BY i.created_at, i.id
  LIMIT p_limit;
$$;

COMMIT;
