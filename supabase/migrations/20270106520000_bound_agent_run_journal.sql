-- Keep the immutable OpenCode audit trail compact and make batch retries
-- idempotent. Existing JSONB rows remain readable while new rows use an opaque
-- gzip payload that PostgreSQL does not need to parse or aggregate.
ALTER TABLE public.agent_run_journal
  ALTER COLUMN events DROP NOT NULL,
  ADD COLUMN IF NOT EXISTS payload text,
  ADD COLUMN IF NOT EXISTS payload_encoding text,
  ADD COLUMN IF NOT EXISTS payload_sha256 text,
  ADD COLUMN IF NOT EXISTS event_count integer,
  ADD COLUMN IF NOT EXISTS payload_bytes integer,
  ADD COLUMN IF NOT EXISTS stored_bytes integer;

ALTER TABLE public.agent_run_journal
  ADD CONSTRAINT agent_run_journal_payload_shape_check
  CHECK (
    (
      events IS NOT NULL
      AND payload IS NULL
      AND payload_encoding IS NULL
      AND payload_sha256 IS NULL
    )
    OR
    (
      events IS NULL
      AND payload IS NOT NULL
      AND payload_encoding = 'gzip-json-v1'
      AND payload_sha256 ~ '^[0-9a-f]{64}$'
      AND event_count > 0
      AND payload_bytes > 0
      AND stored_bytes > 0
    )
  ) NOT VALID;

ALTER TABLE public.agent_run_journal
  ADD CONSTRAINT agent_run_journal_batch_unique
  UNIQUE (run_id, session_id, payload_sha256);

CREATE INDEX IF NOT EXISTS idx_agent_run_journal_session
  ON public.agent_run_journal (run_id, session_id, id);

COMMENT ON TABLE public.agent_run_journal IS
  'Immutable OpenCode session batches. New batches use gzip-json-v1 payloads and a content digest; legacy JSONB batches remain readable. Replay must be ordered and bounded.';
