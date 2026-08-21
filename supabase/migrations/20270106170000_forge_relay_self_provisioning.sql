-- Self-service provisioning of the managed forge relay, INSTANCE side
-- (docs/managed-forge-relay-plan.md). A self-hosted instance with no
-- operator-owned forge app registers itself against the minddy control plane
-- on first connect and stores the issued identity here — no environment
-- setup. Singleton table (one row, `id` pinned to true): the instance has
-- exactly one relay identity.
--
-- The Ed25519 PRIVATE key and the webhook HMAC secret are encrypted with the
-- same at-rest protection as the stored forge tokens
-- (GIT_TOKEN_ENCRYPTION_SECRET); the control plane only ever receives the
-- matching PUBLIC key. Service-role only: RLS enabled with NO policies, like
-- the other internal ledgers.
CREATE TABLE public.forge_relay_provisioning (
    id boolean PRIMARY KEY DEFAULT true CHECK (id = true),
    relay_url text NOT NULL,
    instance_id uuid NOT NULL,
    signing_key_encrypted text NOT NULL,
    webhook_secret_encrypted text NOT NULL,
    registered_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.forge_relay_provisioning ENABLE ROW LEVEL SECURITY;
