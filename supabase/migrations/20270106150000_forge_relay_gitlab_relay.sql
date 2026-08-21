-- Managed forge relay, Phase 5 (docs/managed-forge-relay-plan.md): GitLab
-- OAuth broker + webhook relay.

-- The delivery handoff now also serves GitLab token pairs.
ALTER TABLE public.forge_relay_user_deliveries
    ADD COLUMN provider text NOT NULL DEFAULT 'github';

-- Per-repo hook secret shared by the instance at hook-registration time and on
-- every rotation: Cloud verifies incoming GitLab deliveries and re-signs the
-- fan-out with it. Same direction as the GitHub fan-out secret — the INSTANCE
-- generates, Cloud stores encrypted.
ALTER TABLE public.forge_relay_link_mirror
    ADD COLUMN webhook_secret_encrypted text;
