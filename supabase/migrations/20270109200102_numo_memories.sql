-- MIN-915: Numo's memory. Short, durable notes Numo keeps about the user it
-- works for: preferences ("write my issue titles in English"), context ("the
-- X project is paused until January"), standing instructions and delegations.
--
-- A memory belongs to one user and is never shared with other members. It may
-- be tied to one project (`project_id`), in which case it is only read in that
-- project's context; deleting the project deletes it. Deleting a memory is
-- also how the user withdraws what it allowed, so it keeps a stable id.
--
-- The text is model-written free text, sealed under the user's key once
-- content encryption is enabled, like the notebook (`user_scratchpad`). The
-- table is service-only: the application reads it through
-- `lib/server/numo/memory-content.ts`, which filters by the requesting user.
--
-- The 100-memory cap per user is enforced by the repository; the length cap
-- of 1,000 characters is also checked here for clear rows.
--
-- Additive only: the previous release neither reads nor writes the table.

BEGIN;

CREATE TABLE public.numo_memories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  project_id uuid REFERENCES public.projects(id) ON DELETE CASCADE,
  content text,
  encrypted_content text,
  encryption_version integer NOT NULL DEFAULT 0,
  -- The conversation where Numo wrote it, for the user's reference. Not a
  -- foreign key: deleting a conversation keeps what Numo learned in it.
  source_conversation_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  last_used_at timestamptz,
  CONSTRAINT numo_memories_content_state CHECK (
    (encryption_version = 0 AND encrypted_content IS NULL AND content IS NOT NULL)
    OR (encryption_version > 0 AND encrypted_content IS NOT NULL AND content IS NULL)
  ),
  CONSTRAINT numo_memories_clear_length CHECK (
    char_length(COALESCE(content, '')) <= 1000
  )
);

CREATE INDEX idx_numo_memories_user_recent
  ON public.numo_memories (user_id, last_used_at DESC);
CREATE INDEX idx_numo_memories_project
  ON public.numo_memories (project_id) WHERE project_id IS NOT NULL;

ALTER TABLE public.numo_memories ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.numo_memories FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.numo_memories TO service_role;

COMMIT;
