-- MIN-591: the keyed hook digest is sufficient for relay authentication.
-- Remove the unused recoverable secret copy and make legacy mirror writers fail.
BEGIN;
ALTER TABLE public.forge_relay_link_mirror
  DROP COLUMN webhook_secret_encrypted;
COMMIT;
