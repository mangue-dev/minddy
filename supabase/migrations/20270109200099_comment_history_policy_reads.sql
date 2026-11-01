-- MIN-875: the thread, resource and activity reads that every ticket,
-- objective and page opens (`comments`, `attachments`, `issue_events`,
-- `page_comments`) still ran the baseline SELECT policies. Those called
-- `can_access_project(...)` once per row, or probed the parent row with a
-- correlated EXISTS that called it again. Migration 20270109200088 documents
-- the cost of that form and rewrote the other project-scoped tables.
--
-- These four policies now compare `project_id` with the caller's project set,
-- computed once per statement, and keep exactly the visibility they had:
--
-- * `comments` and `issue_events` carry a `project_id` that the composite
--   foreign keys of MIN-591 bind to the project of their issue, objective or
--   page, so the project test replaces the helper call inside each parent
--   probe. The probes stay because the old policy only matched a parent that
--   the caller's own RLS could read, and `issues_select`, `objectives_select`
--   and `pages_select` all hide trashed rows: a thread or an activity line
--   follows a trashed parent out of sight. The policies never had a
--   feedback-post branch, so those rows stay hidden from the session client
--   (the service role still reads them).
-- * `attachments` already tested its own `project_id`; only its form changes.
-- * `page_comments` keeps its live-page condition, a primary-key lookup.
--
-- Write policies are not touched.

DROP POLICY IF EXISTS comments_select ON public.comments;
CREATE POLICY comments_select ON public.comments
  FOR SELECT TO authenticated
  USING (
    project_id IN (SELECT public.accessible_project_ids())
    AND (
      EXISTS (
        SELECT 1 FROM public.issues AS i
        WHERE i.id = comments.issue_id AND i.deleted_at IS NULL
      )
      OR EXISTS (
        SELECT 1 FROM public.objectives AS o
        WHERE o.id = comments.objective_id AND o.deleted_at IS NULL
      )
    )
  );

DROP POLICY IF EXISTS attachments_select ON public.attachments;
CREATE POLICY attachments_select ON public.attachments
  FOR SELECT TO authenticated
  USING (project_id IN (SELECT public.accessible_project_ids()));

DROP POLICY IF EXISTS issue_events_select ON public.issue_events;
CREATE POLICY issue_events_select ON public.issue_events
  FOR SELECT TO authenticated
  USING (
    project_id IN (SELECT public.accessible_project_ids())
    AND (
      EXISTS (
        SELECT 1 FROM public.issues AS i
        WHERE i.id = issue_events.issue_id AND i.deleted_at IS NULL
      )
      OR EXISTS (
        SELECT 1 FROM public.objectives AS o
        WHERE o.id = issue_events.objective_id AND o.deleted_at IS NULL
      )
      OR EXISTS (
        SELECT 1 FROM public.pages AS p
        WHERE p.id = issue_events.page_id AND p.deleted_at IS NULL
      )
    )
  );

DROP POLICY IF EXISTS page_comments_select ON public.page_comments;
CREATE POLICY page_comments_select ON public.page_comments
  FOR SELECT TO authenticated
  USING (
    project_id IN (SELECT public.accessible_project_ids())
    AND EXISTS (
      SELECT 1 FROM public.pages AS p
      WHERE p.id = page_comments.page_id AND p.deleted_at IS NULL
    )
  );
