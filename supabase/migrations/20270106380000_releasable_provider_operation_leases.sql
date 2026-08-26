-- Release short provider-operation leases after the external call finishes
-- while retaining reservation rows for sliding-window quota accounting.
CREATE OR REPLACE FUNCTION public.release_provider_operation(
  p_actor_id uuid,
  p_provider text,
  p_operation text,
  p_resource_key text
) RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_id bigint;
BEGIN
  IF p_actor_id IS NULL
     OR p_provider IS NULL OR p_provider = ''
     OR p_operation IS NULL OR p_operation = ''
     OR p_resource_key IS NULL OR p_resource_key = '' THEN
    RAISE EXCEPTION 'provider_operation_release_invalid' USING ERRCODE = '22023';
  END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(p_provider || ':' || p_resource_key, 466)
  );
  SELECT id
  INTO v_id
  FROM public.provider_operation_reservations
  WHERE actor_id = p_actor_id
    AND provider = p_provider
    AND operation = p_operation
    AND resource_key = p_resource_key
    AND lease_expires_at > pg_catalog.clock_timestamp()
  ORDER BY created_at DESC
  LIMIT 1;

  IF v_id IS NULL THEN RETURN false; END IF;
  UPDATE public.provider_operation_reservations
  SET lease_expires_at = pg_catalog.clock_timestamp()
  WHERE id = v_id;
  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION public.release_provider_operation(uuid, text, text, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.release_provider_operation(uuid, text, text, text)
  TO service_role;
