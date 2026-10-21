-- MIN-750: Smart Fill re-evaluates an issue whose title or description changed.
--
-- One row per issue born with Smart Fill active. `fields` lists the properties
-- Smart Fill still owns: left empty by the author at creation and never
-- changed by hand since (priority, effort, category_ids, objective_id). An
-- issue without a row is never re-evaluated: issues created before this
-- migration, or with Smart Fill off, keep every value as it is.
--
-- `reevaluate_at` is the debounce: each title or description edit pushes it
-- five minutes ahead and records the editor in `reevaluate_by`, who pays for
-- the pass and whose preference applies. The scheduled worker runs the rows
-- that are due and clears the column.
--
-- Only the service role reads or writes this table: RLS is enabled without any
-- policy.

CREATE TABLE public.issue_smart_fill (
  issue_id uuid PRIMARY KEY REFERENCES public.issues(id) ON DELETE CASCADE,
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  fields text[] NOT NULL DEFAULT '{}'::text[],
  reevaluate_at timestamptz,
  reevaluate_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT issue_smart_fill_fields_ck CHECK (
    fields <@ ARRAY['priority', 'effort', 'category_ids', 'objective_id']::text[]
  )
);

CREATE INDEX issue_smart_fill_due
  ON public.issue_smart_fill (reevaluate_at) WHERE reevaluate_at IS NOT NULL;
CREATE INDEX issue_smart_fill_project ON public.issue_smart_fill (project_id);
CREATE INDEX issue_smart_fill_reevaluate_by
  ON public.issue_smart_fill (reevaluate_by) WHERE reevaluate_by IS NOT NULL;

ALTER TABLE public.issue_smart_fill ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.issue_smart_fill FROM anon, authenticated;
GRANT ALL ON TABLE public.issue_smart_fill TO service_role;

COMMENT ON TABLE public.issue_smart_fill IS
  'Properties Smart Fill still owns on an issue, and its pending re-evaluation (MIN-750). Service role only.';
