-- MIN-923: Numo's reminders ("watches"). In a conversation the user asks
-- Numo "once MIN-42 is done, remind me to tell the client" or "when the 0.40
-- objective is done, create the release issue". Numo records a watch: a
-- condition on one object plus an instruction. When the condition holds, the
-- routines clock fires it once: a note in the user's inbox (`notify`), or a
-- Numo turn that carries out the instruction (`act`) in the conversation the
-- watch came from.
--
-- Watching costs no model call: the routines clock compares each active
-- watch with the current state of its target (issue or objective status, new
-- comments since the watch was created, a due date). It reads state rather
-- than the routine journal so that a write the journal skips cannot lose a
-- reminder.
--
-- The instruction is model-written free text, sealed under the user's key
-- once content encryption is enabled, like Numo's memory. The table is
-- service-only: the application reads it through
-- `lib/server/numo/watches.ts`, which filters on the requesting user.
--
-- The cap of 20 active watches per user is enforced by the repository; the
-- 90-day expiry is stored on the row (`expires_at`).
--
-- Additive only: the previous release neither reads nor writes the table.

BEGIN;

CREATE TABLE public.numo_watches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  -- What the condition reads: an issue, an objective, or only the clock.
  target_type text NOT NULL,
  -- The issue or objective. Not a foreign key: a trashed target keeps its
  -- row, and the watch is cancelled by the clock when it finds it gone.
  target_id uuid,
  -- {"kind":"status","status":"done"}, {"kind":"comment"} or {"kind":"date"}.
  condition jsonb NOT NULL,
  action text NOT NULL,
  instruction text,
  encrypted_content text,
  encryption_version integer NOT NULL DEFAULT 0,
  -- The conversation the watch came from, where an `act` turn runs. Not a
  -- foreign key: deleting the conversation keeps the reminder, and its turn
  -- then opens a new conversation.
  conversation_id uuid,
  status text NOT NULL DEFAULT 'active',
  -- A date watch fires at this time.
  fire_at timestamptz,
  expires_at timestamptz NOT NULL,
  fired_at timestamptz,
  -- How the firing went: a note, a Numo turn, a note because the usage
  -- budget had run out, or a failure. Null while active.
  outcome text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT numo_watches_target_type CHECK (target_type IN ('issue', 'objective', 'date')),
  CONSTRAINT numo_watches_target CHECK (
    (target_type = 'date' AND target_id IS NULL AND fire_at IS NOT NULL)
    OR (target_type <> 'date' AND target_id IS NOT NULL AND fire_at IS NULL)
  ),
  CONSTRAINT numo_watches_condition CHECK (
    jsonb_typeof(condition) = 'object' AND condition->>'kind' IN ('status', 'comment', 'date')
  ),
  CONSTRAINT numo_watches_action CHECK (action IN ('notify', 'act')),
  CONSTRAINT numo_watches_status CHECK (status IN ('active', 'fired', 'canceled', 'expired')),
  CONSTRAINT numo_watches_outcome CHECK (
    outcome IS NULL OR outcome IN ('notified', 'acted', 'budget_fallback', 'failed')
  ),
  CONSTRAINT numo_watches_content_state CHECK (
    (encryption_version = 0 AND encrypted_content IS NULL AND instruction IS NOT NULL)
    OR (encryption_version > 0 AND encrypted_content IS NOT NULL AND instruction IS NULL)
  ),
  CONSTRAINT numo_watches_clear_length CHECK (
    char_length(COALESCE(instruction, '')) <= 1000
  )
);

-- The clock reads the active watches by target; the settings list and the
-- per-user cap read them by user.
CREATE INDEX idx_numo_watches_active_target
  ON public.numo_watches (target_type, target_id) WHERE status = 'active';
CREATE INDEX idx_numo_watches_user_status
  ON public.numo_watches (user_id, status, created_at DESC);
CREATE INDEX idx_numo_watches_finished
  ON public.numo_watches (updated_at) WHERE status <> 'active';

ALTER TABLE public.numo_watches ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.numo_watches FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.numo_watches TO service_role;

COMMIT;
