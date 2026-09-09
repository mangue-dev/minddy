-- Account defaults apply to new managed sandboxes. Existing instances keep
-- their provider allocation, with its estimated rate recorded on the run.
ALTER TABLE public.user_agent_preferences
  ADD COLUMN sandbox_region text NOT NULL DEFAULT 'eu'
    CHECK (sandbox_region IN ('eu', 'us')),
  ADD COLUMN sandbox_size text NOT NULL DEFAULT 'standard'
    CHECK (sandbox_size IN ('standard', 'performance'));

ALTER TABLE public.agent_runs
  ADD COLUMN sandbox_billing jsonb;

COMMENT ON COLUMN public.agent_runs.sandbox_billing IS
  'Server-recorded provider allocation and estimated USD/minute rate. Null retains legacy billing; never supplied by the agent report.';
