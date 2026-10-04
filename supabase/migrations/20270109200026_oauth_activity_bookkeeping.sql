-- Consolidate post-response OAuth activity writes without caching authorization.
CREATE OR REPLACE FUNCTION public.touch_oauth_grant_activity(
  p_grant_id uuid, p_api_key_id uuid, p_used_at timestamptz
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  -- Bind the key to this grant; never let a mismatched pair touch another key.
  UPDATE public.oauth_grants
  SET last_used_at = greatest(last_used_at, p_used_at)
  WHERE id = p_grant_id AND api_key_id = p_api_key_id AND revoked_at IS NULL
    AND p_used_at IS NOT NULL;
  IF NOT FOUND THEN RETURN; END IF;

  UPDATE public.api_keys
  SET last_used_at = greatest(last_used_at, p_used_at)
  WHERE id = p_api_key_id AND revoked_at IS NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.touch_oauth_grant_activity(uuid, uuid, timestamptz)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.touch_oauth_grant_activity(uuid, uuid, timestamptz)
  TO service_role;
