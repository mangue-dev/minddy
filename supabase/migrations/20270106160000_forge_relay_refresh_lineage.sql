-- Managed forge relay: relay-brokered OAuth token refresh
-- (docs/managed-forge-relay-plan.md). Refresh grants require the OAuth app's
-- client credentials, which relayed instances deliberately do not hold, so
-- Cloud runs the refresh on their behalf over the signed channel.

-- Lineage binding: a refresh request is only honored when its refresh token
-- matches (by SHA-256) a token Cloud handed to THIS instance. Every brokered
-- rotation advances the hash, so at most the latest token of each account is
-- refreshable. Kept apart from forge_relay_user_deliveries because deliveries
-- are transient (pruned after their TTL) while lineage must outlive them.
CREATE TABLE public.forge_relay_refresh_lineage (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    instance_id uuid NOT NULL REFERENCES public.forge_relay_instances(id) ON DELETE CASCADE,
    provider text NOT NULL CHECK (provider IN ('github', 'gitlab')),
    provider_account_id text NOT NULL,
    refresh_token_hash text NOT NULL,
    updated_at timestamp with time zone NOT NULL DEFAULT now(),
    UNIQUE (instance_id, provider, refresh_token_hash)
);

CREATE INDEX idx_forge_relay_refresh_lineage_instance
    ON public.forge_relay_refresh_lineage (instance_id);

-- Service-role only, like the other relay tables: instances never touch the
-- database directly.
ALTER TABLE public.forge_relay_refresh_lineage ENABLE ROW LEVEL SECURITY;

-- The issuing app of a stored user identity decides where its refresh grant
-- runs: identities authorized through the relay must refresh through the
-- relay (their grant belongs to the managed app's client), local ones locally.
-- Same marker and default as git_connections.source.
ALTER TABLE public.git_user_identities ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'local';
