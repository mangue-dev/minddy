-- Managed forge relay, Phase 3 (docs/managed-forge-relay-plan.md): GitHub claim
-- flow and relay-sourced connections.

-- Connections created through the relay claim flow are flagged so the
-- instance-side ForgeProvider selection routes their token mints to the relay
-- instead of a local GitHub App. Existing rows stay 'local'.
ALTER TABLE public.git_connections ADD COLUMN source text NOT NULL DEFAULT 'local';

-- Claim codes bind a GitHub App installation to a claiming instance. The code
-- itself is never stored — only its SHA-256 — because the operator's browser
-- carries it through the claim URL. A row appears when the GitHub setup URL
-- lands back on Cloud with a valid claim state; the instance then polls it
-- (single consumption, idempotent reads) before storing its local connection.
CREATE TABLE public.forge_relay_claims (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    instance_id uuid NOT NULL REFERENCES public.forge_relay_instances(id) ON DELETE CASCADE,
    code_hash text NOT NULL UNIQUE,
    status text NOT NULL DEFAULT 'claimed' CHECK (status IN ('claimed', 'consumed')),
    installation_id bigint NOT NULL,
    account_login text,
    created_at timestamp with time zone NOT NULL DEFAULT now(),
    claimed_at timestamp with time zone NOT NULL DEFAULT now(),
    consumed_at timestamp with time zone
);

CREATE INDEX idx_forge_relay_claims_instance
    ON public.forge_relay_claims (instance_id);

-- Service-role only, like the other relay tables: instances never touch the
-- database directly.
ALTER TABLE public.forge_relay_claims ENABLE ROW LEVEL SECURITY;
