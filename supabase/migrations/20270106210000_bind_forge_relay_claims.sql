-- Bind GitHub relay claims to an authenticated, one-time installation setup.
-- A claim now exists before the browser is redirected to GitHub. The setup URL
-- may reserve exactly one installation, and the user authorization callback
-- records the stable repository identity that proved access to that installation.
ALTER TABLE public.forge_relay_claims
    DROP CONSTRAINT IF EXISTS forge_relay_claims_status_check;

ALTER TABLE public.forge_relay_claims
    ALTER COLUMN installation_id DROP NOT NULL,
    ALTER COLUMN claimed_at DROP NOT NULL,
    ADD COLUMN repository_id bigint,
    ADD COLUMN repository_full_name text,
    ADD CONSTRAINT forge_relay_claims_status_check
        CHECK (status IN ('pending', 'verifying', 'claimed', 'consumed'));

ALTER TABLE public.forge_relay_claims
    ALTER COLUMN status SET DEFAULT 'pending';
