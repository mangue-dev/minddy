-- Fence idle-sandbox shutdown from concurrent conversation resumes. The
-- reaper holds this lease until the provider confirms the old sandbox stop.
ALTER TABLE public.agent_runs
  ADD COLUMN sandbox_reap_claim uuid,
  ADD COLUMN sandbox_reap_claimed_at timestamptz;

CREATE INDEX idx_agent_runs_sandbox_reap_claim
  ON public.agent_runs (sandbox_reap_claim)
  WHERE sandbox_reap_claim IS NOT NULL;

COMMENT ON COLUMN public.agent_runs.sandbox_reap_claim IS
  'Lease held while the persisted sandbox identity is being stopped. A resume must wait until it is released.';
