-- Bind relay authorization to provider-issued repository ids. Existing mirror
-- rows receive an intentionally unusable legacy identity and therefore fail
-- closed until the owning instance sends its next reconciliation snapshot.
ALTER TABLE public.forge_relay_link_mirror
    ADD COLUMN external_repo_id text;

UPDATE public.forge_relay_link_mirror
SET external_repo_id = 'legacy:' || repo_full_name;

ALTER TABLE public.forge_relay_link_mirror
    ALTER COLUMN external_repo_id SET NOT NULL,
    DROP CONSTRAINT forge_relay_link_mirror_pkey,
    ADD CONSTRAINT forge_relay_link_mirror_pkey
        PRIMARY KEY (instance_id, provider, external_repo_id);

CREATE INDEX idx_forge_relay_link_mirror_provider_repo
    ON public.forge_relay_link_mirror (provider, external_repo_id);

-- Reserve one mint slot under a per-instance transaction lock. The audit row
-- is the reservation, so concurrent callers cannot all observe the same count
-- and exceed the limit. Authorized attempts consume quota even if GitHub later
-- refuses the mint, which prevents an upstream failure from becoming a bypass.
CREATE OR REPLACE FUNCTION public.reserve_forge_relay_mint(
    p_instance_id uuid,
    p_limit integer
) RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    recent_mints bigint;
BEGIN
    IF p_limit <= 0 THEN
        RETURN 'quota_exceeded';
    END IF;

    PERFORM pg_catalog.pg_advisory_xact_lock(
        pg_catalog.hashtextextended(p_instance_id::text, 455)
    );

    IF NOT EXISTS (
        SELECT 1
        FROM public.forge_relay_instances
        WHERE id = p_instance_id
          AND status = 'active'
    ) THEN
        RETURN 'instance_inactive';
    END IF;

    SELECT count(*)
    INTO recent_mints
    FROM public.forge_relay_audit
    WHERE instance_id = p_instance_id
      AND action = 'mint_installation_token'
      AND created_at >= pg_catalog.now() - interval '1 hour';

    IF recent_mints >= p_limit THEN
        RETURN 'quota_exceeded';
    END IF;

    INSERT INTO public.forge_relay_audit (instance_id, action, detail)
    VALUES (
        p_instance_id,
        'mint_installation_token',
        pg_catalog.jsonb_build_object('state', 'reserved')
    );

    RETURN 'reserved';
END;
$$;

REVOKE ALL ON FUNCTION public.reserve_forge_relay_mint(uuid, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.reserve_forge_relay_mint(uuid, integer) TO service_role;
