-- MIN-549: resolve project access once per issue read, rather than calling
-- can_access_project for every issue and twice again for each category link.
-- Filter each RLS-protected source by the current identity so the owner/member
-- indexes bound the work to this user's projects, including for single reads.
-- Keep the existing behavior for trashed projects; only trashed issues are hidden.
ALTER POLICY issues_select ON public.issues
  USING (
    project_id IN (
      SELECT id FROM public.projects
      WHERE owner_id = (SELECT auth.uid())
      UNION
      SELECT project_id FROM public.project_members
      WHERE user_id = (SELECT auth.uid())
    )
    AND deleted_at IS NULL
  );

-- The parent read already applies issues_select, including project access and
-- the issue trash filter. Repeating can_access_project adds no restriction.
ALTER POLICY issue_categories_select ON public.issue_categories
  USING (
    EXISTS (
      SELECT 1 FROM public.issues AS issue
      WHERE issue.id = issue_categories.issue_id
    )
  );
