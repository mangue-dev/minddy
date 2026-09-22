-- MIN-591: only the application service can read wrapped tenant data keys.
-- Plaintext data keys and KMS key material never enter PostgreSQL.

CREATE TABLE public.envelope_data_keys (
  scope_kind text NOT NULL CHECK (scope_kind IN ('project', 'user', 'system')),
  scope_id uuid NOT NULL,
  purpose text NOT NULL CHECK (purpose IN ('content', 'blind_index')),
  version integer NOT NULL CHECK (version > 0 AND version < 2147483647),
  wrapped_key text NOT NULL,
  is_current boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (scope_kind, scope_id, purpose, version)
);

CREATE UNIQUE INDEX envelope_data_keys_one_current
  ON public.envelope_data_keys (scope_kind, scope_id, purpose)
  WHERE is_current;

ALTER TABLE public.envelope_data_keys ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.envelope_data_keys FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.envelope_data_keys TO service_role;

CREATE FUNCTION public.create_envelope_data_key_if_absent(
  p_scope_kind text,
  p_scope_id uuid,
  p_purpose text,
  p_wrapped_key text
)
RETURNS public.envelope_data_keys
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_key public.envelope_data_keys%ROWTYPE;
BEGIN
  IF p_scope_kind NOT IN ('project', 'user', 'system')
     OR p_purpose NOT IN ('content', 'blind_index')
     OR p_scope_id IS NULL
     OR length(p_wrapped_key) < 1 THEN
    RAISE EXCEPTION 'invalid_envelope_key_input' USING ERRCODE = '22023';
  END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    'envelope-key:' || p_scope_kind || ':' || p_scope_id::text || ':' || p_purpose,
    0
  ));

  SELECT * INTO v_key FROM public.envelope_data_keys
  WHERE scope_kind = p_scope_kind AND scope_id = p_scope_id
    AND purpose = p_purpose AND is_current;

  IF NOT FOUND THEN
    INSERT INTO public.envelope_data_keys
      (scope_kind, scope_id, purpose, version, wrapped_key, is_current)
    VALUES (p_scope_kind, p_scope_id, p_purpose, 1, p_wrapped_key, true)
    RETURNING * INTO v_key;
  END IF;

  RETURN v_key;
END;
$function$;

CREATE FUNCTION public.rotate_envelope_data_key(
  p_scope_kind text,
  p_scope_id uuid,
  p_purpose text,
  p_expected_version integer,
  p_wrapped_key text
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_version integer;
BEGIN
  IF p_scope_kind NOT IN ('project', 'user', 'system')
     OR p_purpose NOT IN ('content', 'blind_index')
     OR p_scope_id IS NULL
     OR p_expected_version IS NULL OR p_expected_version < 1
     OR p_expected_version >= 2147483646
     OR length(p_wrapped_key) < 1 THEN
    RAISE EXCEPTION 'invalid_envelope_key_input' USING ERRCODE = '22023';
  END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    'envelope-key:' || p_scope_kind || ':' || p_scope_id::text || ':' || p_purpose,
    0
  ));

  SELECT version INTO v_version FROM public.envelope_data_keys
  WHERE scope_kind = p_scope_kind AND scope_id = p_scope_id
    AND purpose = p_purpose AND is_current;

  IF v_version IS DISTINCT FROM p_expected_version THEN
    RETURN false;
  END IF;

  UPDATE public.envelope_data_keys SET is_current = false
  WHERE scope_kind = p_scope_kind AND scope_id = p_scope_id
    AND purpose = p_purpose AND is_current;

  INSERT INTO public.envelope_data_keys
    (scope_kind, scope_id, purpose, version, wrapped_key, is_current)
  VALUES (p_scope_kind, p_scope_id, p_purpose, p_expected_version + 1,
    p_wrapped_key, true);

  RETURN true;
END;
$function$;

REVOKE ALL ON FUNCTION public.create_envelope_data_key_if_absent(text, uuid, text, text)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.rotate_envelope_data_key(text, uuid, text, integer, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_envelope_data_key_if_absent(text, uuid, text, text)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.rotate_envelope_data_key(text, uuid, text, integer, text)
  TO service_role;

-- Vault is useful for existing secrets, but the decrypted view must not be
-- readable by public API roles if an operator later adds secrets to it.
DO $block$
BEGIN
  IF pg_catalog.to_regclass('vault.decrypted_secrets') IS NOT NULL THEN
    REVOKE ALL ON TABLE vault.decrypted_secrets
      FROM PUBLIC, anon, authenticated, service_role;
  END IF;
END;
$block$;
