-- MIN-761: per-account OpenRouter keys on Minddy Cloud.
--
-- A management key issues one OpenRouter API key per billed account, capped at
-- the usage its plan still includes, plus one daily-capped key for the public
-- surfaces that have no account (dictation demo, FAQ answers). OpenRouter then
-- holds the spending cap, outside Minddy's code.
--
-- `baseline_usd` is the key's cumulative OpenRouter usage at the start of the
-- current usage window; it may be negative when the window started before the
-- key existed (the ledger usage already spent in that window). The limit is
-- `baseline_usd + included usage x headroom`, never below the key's usage.
--
-- Only the service role reads or writes this table: RLS is enabled without any
-- policy, and the key itself is stored encrypted (system scope).

CREATE TABLE public.managed_ai_keys (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  purpose text NOT NULL CHECK (purpose IN ('user', 'public')),
  user_id uuid UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  key_hash text NOT NULL UNIQUE,
  key_encrypted text NOT NULL,
  window_start timestamptz,
  baseline_usd numeric NOT NULL DEFAULT 0,
  plan_id text,
  limit_usd numeric NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT managed_ai_keys_owner CHECK (
    (purpose = 'user' AND user_id IS NOT NULL AND window_start IS NOT NULL AND plan_id IS NOT NULL)
    OR (purpose = 'public' AND user_id IS NULL)
  )
);

-- A single public key: a concurrent second issuance fails on this index and
-- deletes its own key at OpenRouter.
CREATE UNIQUE INDEX managed_ai_keys_single_public
  ON public.managed_ai_keys (purpose) WHERE purpose = 'public';

ALTER TABLE public.managed_ai_keys ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.managed_ai_keys FROM anon, authenticated;
GRANT ALL ON TABLE public.managed_ai_keys TO service_role;

COMMENT ON TABLE public.managed_ai_keys IS
  'Minddy Cloud OpenRouter keys issued per billed account (MIN-761). Service role only.';
