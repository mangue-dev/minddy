-- MIN-927: Numo's journal, the material of its word on the home page
-- (MIN-925). Each entry is one free-text sentence Numo writes for the user
-- it works for: something it did that changed their content ("I did the web
-- research asked for in MIN-42"), or something that waits for them ("PR #12
-- has waited for your review for 3 days").
--
-- There is deliberately no entry type, so the system can evolve. Only the
-- lifecycle is structured: an entry is written (`created_at`), shown to the
-- user (`seen_at`, set by the home page), and closed by Numo once it no
-- longer applies (`closed_at`, with a free-text `closed_reason`). A closed
-- entry the user has not seen yet is still shown once, as settled.
--
-- An entry belongs to one user and is never shared with other members. It
-- may concern one project (`project_id`); deleting the project deletes it.
-- `source` says which kind of Numo turn wrote it.
--
-- The text and the closing reason are model-written free text, sealed together
-- under the user's key once content encryption is enabled, like Numo's memory
-- (`numo_memories`). The table is service-only: the application reads it
-- through `lib/server/numo/journal-content.ts`, which filters by the
-- requesting user, so no row policy is needed and none is granted.
--
-- The cap on open entries per user is enforced by the repository; the length
-- caps are also checked here for clear rows. Closed entries leave with the
-- nightly retention sweep.
--
-- Additive only: the previous release neither reads nor writes the table.

BEGIN;

CREATE TABLE public.numo_journal_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  project_id uuid REFERENCES public.projects(id) ON DELETE CASCADE,
  content text,
  closed_reason text,
  encrypted_content text,
  encryption_version integer NOT NULL DEFAULT 0,
  source text NOT NULL,
  -- The conversation of the turn that wrote it, for reference. Not a foreign
  -- key: deleting a conversation keeps what still waits for the user.
  source_conversation_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  seen_at timestamptz,
  closed_at timestamptz,
  CONSTRAINT numo_journal_entries_source CHECK (
    source IN ('wake', 'conversation', 'routine', 'mention')
  ),
  CONSTRAINT numo_journal_entries_content_state CHECK (
    (encryption_version = 0 AND encrypted_content IS NULL AND content IS NOT NULL)
    OR (encryption_version > 0 AND encrypted_content IS NOT NULL
      AND content IS NULL AND closed_reason IS NULL)
  ),
  -- Only a closed entry has a reason (always hidden once sealed).
  CONSTRAINT numo_journal_entries_reason_when_closed CHECK (
    closed_at IS NOT NULL OR closed_reason IS NULL
  ),
  CONSTRAINT numo_journal_entries_clear_length CHECK (
    char_length(COALESCE(content, '')) <= 500
    AND char_length(COALESCE(closed_reason, '')) <= 300
  )
);

-- What is still open, newest first: Numo's prompt and the cap.
CREATE INDEX idx_numo_journal_entries_open
  ON public.numo_journal_entries (user_id, created_at DESC) WHERE closed_at IS NULL;
-- What the user has not seen yet, open or closed: the home page.
CREATE INDEX idx_numo_journal_entries_unseen
  ON public.numo_journal_entries (user_id, created_at DESC) WHERE seen_at IS NULL;
-- The retention sweep.
CREATE INDEX idx_numo_journal_entries_closed
  ON public.numo_journal_entries (closed_at) WHERE closed_at IS NOT NULL;
CREATE INDEX idx_numo_journal_entries_project
  ON public.numo_journal_entries (project_id) WHERE project_id IS NOT NULL;

ALTER TABLE public.numo_journal_entries ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.numo_journal_entries FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.numo_journal_entries TO service_role;

COMMIT;
