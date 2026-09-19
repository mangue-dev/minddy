-- MIN-549: resolve project access once per issue read, rather than calling
-- can_access_project for every issue and twice again for each category link.
-- The projects SELECT policy uses the same owner-or-member rule. Keep its
-- existing behavior for trashed projects; only trashed issues are hidden here.
ALTER POLICY issues_select ON public.issues
  USING (
    project_id IN (SELECT id FROM public.projects)
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
