-- MIN-923, review of 20270109200110 (neither has reached production).
--
-- - `timezone`: the user's IANA time zone when the watch was set, so the
--   turn an `act` watch starts reads its clock in that zone rather than UTC.
-- - Outcome `muted`: the watch fired while the user had Messages from Numo
--   turned off, so no note was written; until now that read as `notified`.
--
-- Additive only.

BEGIN;

ALTER TABLE public.numo_watches ADD COLUMN timezone text;
ALTER TABLE public.numo_watches ADD CONSTRAINT numo_watches_timezone_length
  CHECK (timezone IS NULL OR char_length(timezone) <= 64);

ALTER TABLE public.numo_watches DROP CONSTRAINT numo_watches_outcome;
ALTER TABLE public.numo_watches ADD CONSTRAINT numo_watches_outcome CHECK (
  outcome IS NULL OR outcome IN ('notified', 'muted', 'acted', 'budget_fallback', 'failed')
);

COMMIT;
