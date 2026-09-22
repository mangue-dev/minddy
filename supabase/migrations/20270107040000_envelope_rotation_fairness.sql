-- Failed KMS scopes must not permanently occupy the head of a bounded rotation scan.
ALTER TABLE public.envelope_data_keys
  ADD COLUMN IF NOT EXISTS rotation_attempted_at timestamptz;

-- Keep key material and key-version mutations behind the existing guarded RPCs.
-- Supabase default privileges can grant broader rights when a table is created;
-- granting SELECT in the original migration did not remove those rights.
REVOKE ALL ON public.envelope_data_keys FROM service_role;
GRANT SELECT ON public.envelope_data_keys TO service_role;
GRANT UPDATE (rotation_attempted_at) ON public.envelope_data_keys TO service_role;

CREATE INDEX IF NOT EXISTS envelope_content_rotation_queue
  ON public.envelope_data_keys (rotation_attempted_at ASC NULLS FIRST, created_at, scope_kind, scope_id)
  WHERE is_current AND purpose = 'content';
