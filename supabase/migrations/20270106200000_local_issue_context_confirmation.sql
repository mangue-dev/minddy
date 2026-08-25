ALTER TABLE public.agent_runs
  ADD COLUMN IF NOT EXISTS local_issue_context_confirmed boolean DEFAULT false NOT NULL;

COMMENT ON COLUMN public.agent_runs.local_issue_context_confirmed IS
  'The signed-in local user explicitly acknowledged untrusted issue content before this issue-anchored run received a local execution lease (MIN-439).';
