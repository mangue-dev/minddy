-- Managed forge relay, Phase 3 (docs/managed-forge-relay-plan.md): GitHub user
-- authorization broker.

-- Transient handoff of user-authorization tokens brokered by Cloud. Cloud runs
-- the GitHub OAuth dance (the app's user-callback URL is fixed on the app),
-- stores the token set here for at most one consumption, and the user's
-- browser bounces back to the instance, which retrieves the delivery over the
-- signed relay channel. Tokens are stored encrypted, like every other forge
-- token; rows are housekept opportunistically.
CREATE TABLE public.forge_relay_user_deliveries (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    instance_id uuid NOT NULL REFERENCES public.forge_relay_instances(id) ON DELETE CASCADE,
    user_id text NOT NULL,
    provider_account_id text NOT NULL,
    account_login text,
    account_avatar_url text,
    access_token_encrypted text NOT NULL,
    refresh_token_encrypted text,
    token_expires_at timestamp with time zone,
    oauth_scopes text,
    status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'delivered')),
    created_at timestamp with time zone NOT NULL DEFAULT now(),
    delivered_at timestamp with time zone
);

CREATE INDEX idx_forge_relay_user_deliveries_instance
    ON public.forge_relay_user_deliveries (instance_id);
CREATE INDEX idx_forge_relay_user_deliveries_created
    ON public.forge_relay_user_deliveries (created_at);

-- Service-role only, like the other relay tables.
ALTER TABLE public.forge_relay_user_deliveries ENABLE ROW LEVEL SECURITY;
