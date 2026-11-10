-- MIN-953: recurring reminders, the personal alternative to a routine. The
-- user asks Numo "every evening at 19:00, review my issues and prepare
-- tomorrow": a date reminder that comes back on a cadence instead of firing
-- once, runs a Numo turn each time, and may carry permissions the user
-- confirmed when setting it.
--
-- - `recurrence`: null for a one-off reminder. Otherwise the cadence, at a
--   wall-clock time in the reminder's `timezone`:
--   {"kind":"daily","time":"19:00"}, {"kind":"weekdays","time":"08:30"},
--   {"kind":"weekly","time":"09:00","weekday":1} (1 = Monday … 7 = Sunday) or
--   {"kind":"monthly","time":"09:00","day":31} (a shorter month uses its last
--   day). Only a date reminder with the action `act` recurs.
-- - `grants`: the sensitive categories the user allowed this reminder's
--   unattended turn to use, confirmed when it was set. Empty for a one-off
--   reminder. The user's real rights are checked again at every occurrence.
-- - `consecutive_failures`: occurrences in a row that did not finish. At
--   three the reminder is paused and the user is told.
-- - Status `paused`: a recurring reminder that waits for the user to resume
--   it. Nothing fires while it is paused.
--
-- A recurring reminder stays `active` between occurrences: the clock moves
-- `fire_at` to the next occurrence in the same conditional update that
-- claims the current one. `fired_at` and `outcome` then describe its last
-- occurrence, and `conversation_id` the conversation that occurrence ran in.
--
-- Additive only. The previous release ignores the new columns and never
-- lists a `paused` row; a recurring reminder it meets is an active date
-- reminder with a valid `fire_at`, which it would fire once.

BEGIN;

ALTER TABLE public.numo_watches
  ADD COLUMN recurrence jsonb,
  ADD COLUMN grants text[] NOT NULL DEFAULT '{}',
  ADD COLUMN consecutive_failures integer NOT NULL DEFAULT 0;

ALTER TABLE public.numo_watches ADD CONSTRAINT numo_watches_recurrence CHECK (
  recurrence IS NULL OR (
    target_type = 'date'
    AND action = 'act'
    AND timezone IS NOT NULL
    AND jsonb_typeof(recurrence) = 'object'
    AND recurrence->>'kind' IN ('daily', 'weekdays', 'weekly', 'monthly')
    AND recurrence->>'time' ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
  )
);

ALTER TABLE public.numo_watches ADD CONSTRAINT numo_watches_grants CHECK (
  grants <@ ARRAY[
    'trash', 'delete', 'pull_request', 'external', 'administration',
    'account', 'public_reply', 'notification', 'outside_scope'
  ]::text[]
  AND (recurrence IS NOT NULL OR grants = '{}')
);

ALTER TABLE public.numo_watches ADD CONSTRAINT numo_watches_consecutive_failures
  CHECK (consecutive_failures >= 0);

ALTER TABLE public.numo_watches DROP CONSTRAINT numo_watches_status;
ALTER TABLE public.numo_watches ADD CONSTRAINT numo_watches_status CHECK (
  status IN ('active', 'fired', 'canceled', 'expired', 'paused')
  AND (status <> 'paused' OR recurrence IS NOT NULL)
);

COMMIT;
