-- Managed forge relay, Phase 4 (docs/managed-forge-relay-plan.md): GitHub
-- webhook fan-out.

-- Instance webhook endpoint and its signing secret. The secret is GENERATED
-- instance-side and pushed over the authenticated relay channel (Cloud holds
-- only the instance's Ed25519 PUBLIC key, so it cannot derive a shared HMAC
-- secret itself) — the same pattern as the GitLab per-repo hook secrets.
ALTER TABLE public.forge_relay_instances ADD COLUMN webhook_url text;
ALTER TABLE public.forge_relay_instances ADD COLUMN webhook_secret_encrypted text;

-- Delivery queue: at-least-once fan-out with retry/backoff and dead-letter.
-- The payload is kept verbatim so a retry re-signs the exact same bytes.
CREATE TABLE public.forge_relay_deliveries (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    instance_id uuid NOT NULL REFERENCES public.forge_relay_instances(id) ON DELETE CASCADE,
    provider text NOT NULL DEFAULT 'github',
    delivery_guid text NOT NULL,
    event text,
    payload text NOT NULL,
    status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'delivered', 'dead')),
    attempts integer NOT NULL DEFAULT 0,
    next_attempt_at timestamp with time zone NOT NULL DEFAULT now(),
    last_error text,
    created_at timestamp with time zone NOT NULL DEFAULT now(),
    delivered_at timestamp with time zone,
    UNIQUE (instance_id, provider, delivery_guid)
);

CREATE INDEX idx_forge_relay_deliveries_due
    ON public.forge_relay_deliveries (status, next_attempt_at);
CREATE INDEX idx_forge_relay_deliveries_instance_created
    ON public.forge_relay_deliveries (instance_id, created_at DESC);

-- Service-role only, like the other relay tables.
ALTER TABLE public.forge_relay_deliveries ENABLE ROW LEVEL SECURITY;
