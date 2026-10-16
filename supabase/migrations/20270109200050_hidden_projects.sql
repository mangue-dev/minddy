-- MIN-692: hide a project from one's own navigation.
--
-- A hidden project is a personal preference, not a project state: it changes
-- neither access, membership, content nor activity. Each row says "this user
-- keeps this project out of their sidebar and default project lists"; other
-- members never read it, and nothing outside the navigation consults it.
--
-- - The owner has no project_members row, so the preference cannot live
--   there: it gets its own table keyed by (user_id, project_id).
-- - A row can only be written for a project the caller can access. A row
--   left behind by a membership that ended grants nothing and is never listed:
--   the application only reads it next to projects the caller can still open.

CREATE TABLE public.hidden_projects (
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  hidden_at timestamp with time zone NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, project_id)
);

CREATE INDEX idx_hidden_projects_project ON public.hidden_projects (project_id);

ALTER TABLE public.hidden_projects ENABLE ROW LEVEL SECURITY;

CREATE POLICY hidden_projects_select ON public.hidden_projects
  FOR SELECT TO authenticated USING (user_id = (SELECT auth.uid()));
CREATE POLICY hidden_projects_insert ON public.hidden_projects
  FOR INSERT TO authenticated
  WITH CHECK (user_id = (SELECT auth.uid()) AND public.can_access_project(project_id));
CREATE POLICY hidden_projects_delete ON public.hidden_projects
  FOR DELETE TO authenticated USING (user_id = (SELECT auth.uid()));

-- Supabase's default privileges grant every new table to anon and give
-- authenticated UPDATE too: keep exactly the verbs the policies cover.
REVOKE ALL ON public.hidden_projects FROM anon, authenticated;
GRANT SELECT, INSERT, DELETE ON public.hidden_projects TO authenticated;
GRANT ALL ON public.hidden_projects TO service_role;
