-- Managed forge relay control plane (docs/managed-forge-relay-plan.md, Phase 2).
-- Cloud-only tables backing the relay API that serves opting-in self-hosted
-- instances. Instances never touch the database directly — they call the signed
-- relay API — so every table is service-role only: RLS enabled with NO policies,
-- exactly like the other internal ledgers (stripe_webhook_events,
-- forge_webhook_deliveries).

-- Registered instances. The operator registers an instance from the Cloud
-- dashboard by submitting the Ed25519 PUBLIC key generated instance-side;
-- the private key never leaves the instance.
CREATE TABLE public.forge_relay_instances (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    name text NOT NULL,
    public_key text NOT NULL,
    status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'revoked')),
    created_at timestamp with time zone NOT NULL DEFAULT now(),
    revoked_at timestamp with time zone
);

-- A public key identifies at most one instance: re-registering the same key
-- must not silently alias an existing identity.
CREATE UNIQUE INDEX idx_forge_relay_instances_public_key
    ON public.forge_relay_instances (public_key);

-- Installations of the official GitHub App claimed by an instance through the
-- claim flow. One installation belongs to exactly one instance: this binding is
-- the first authorization check of every token mint.
CREATE TABLE public.forge_relay_installations (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    instance_id uuid NOT NULL REFERENCES public.forge_relay_instances(id) ON DELETE CASCADE,
    installation_id bigint NOT NULL UNIQUE,
    account_login text NOT NULL,
    claimed_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE INDEX idx_forge_relay_installations_instance
    ON public.forge_relay_installations (instance_id);

-- Instance-side project_git_links mirror. This is the second authorization
-- check of a token mint: a repo not mirrored here is refused, fail-closed
-- (docs/managed-forge-relay-plan.md, "Link lifecycle sync").
CREATE TABLE public.forge_relay_link_mirror (
    instance_id uuid NOT NULL REFERENCES public.forge_relay_instances(id) ON DELETE CASCADE,
    provider text NOT NULL CHECK (provider IN ('github', 'gitlab')),
    repo_full_name text NOT NULL,
    connection_id text,
    updated_at timestamp with time zone NOT NULL DEFAULT now(),
    PRIMARY KEY (instance_id, provider, repo_full_name)
);

-- Append-only record of every relay action (mints, link syncs, refusals of
-- interest). Feeds the per-instance delivery/quota dashboards and incident
-- response (docs/managed-forge-relay-plan.md, "Security model").
CREATE TABLE public.forge_relay_audit (
    id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    instance_id uuid REFERENCES public.forge_relay_instances(id) ON DELETE SET NULL,
    action text NOT NULL,
    detail jsonb NOT NULL DEFAULT '{}'::jsonb,
    created_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE INDEX idx_forge_relay_audit_instance_created
    ON public.forge_relay_audit (instance_id, created_at DESC);

-- Replay protection: one row per accepted request nonce, unique constraint is
-- the replay verdict. Expired rows are housekept opportunistically.
CREATE TABLE public.forge_relay_nonces (
    nonce text PRIMARY KEY,
    expires_at timestamp with time zone NOT NULL
);

CREATE INDEX idx_forge_relay_nonces_expires ON public.forge_relay_nonces (expires_at);

ALTER TABLE public.forge_relay_instances ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.forge_relay_installations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.forge_relay_link_mirror ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.forge_relay_audit ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.forge_relay_nonces ENABLE ROW LEVEL SECURITY;
