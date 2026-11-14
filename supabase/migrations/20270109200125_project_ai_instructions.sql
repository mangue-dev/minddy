-- MIN-988: project instructions for Smart Fill and Smart Assign, the
-- project's working language, and instructions proposed from corrections.
--
-- - `projects.ai_language`: the language every writing pass uses (issue
--   titles, objective names, and feedback translation when the project sets
--   no team language of its own). NULL keeps today's behavior: each pass
--   follows the language of the text it reads. A two-letter code from the
--   application's closed list; the format alone is checked here.
-- - `project_ai_instructions`: one row per project, holding a short free
--   text per automation (`title`, `properties`, `objectives`, `assign`) as a
--   JSON object. It is the owner's text about how the team works: sealed
--   under the project's key once content encryption is enabled, like the
--   Smart Assign rules. It lives in its own row rather than in the sealed
--   `projects` payload, whose shape the previous release reads strictly.
-- - `ai_instruction_proposals`: an instruction minddy drafted after people
--   repeatedly corrected a value Smart Fill or Smart Assign had set. Nothing
--   is applied from here: the owner accepts it (which writes the instruction
--   above) or dismisses it, and a dismissal silences that use case until
--   `dismissed_until`. At most one proposal waits per project.
--
-- Both tables are service-only: the application reads them through
-- `lib/server/ai-instructions.ts` and `lib/server/ai-instruction-proposals.ts`,
-- which check project membership and ownership.
--
-- Additive only: the previous release neither reads nor writes any of it.

BEGIN;

ALTER TABLE public.projects
  ADD COLUMN ai_language text
  CONSTRAINT projects_ai_language_format CHECK (ai_language IS NULL OR ai_language ~ '^[a-z]{2}$');

CREATE TABLE public.project_ai_instructions (
  project_id uuid PRIMARY KEY REFERENCES public.projects(id) ON DELETE CASCADE,
  content jsonb,
  encrypted_content text,
  encryption_version integer NOT NULL DEFAULT 0,
  updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT project_ai_instructions_content_state CHECK (
    (encryption_version = 0 AND encrypted_content IS NULL AND content IS NOT NULL
      AND jsonb_typeof(content) = 'object')
    OR (encryption_version > 0 AND encrypted_content IS NOT NULL AND content IS NULL)
  ),
  -- Four instructions of 500 characters at most, with their JSON framing.
  CONSTRAINT project_ai_instructions_clear_size CHECK (
    content IS NULL OR pg_column_size(content) <= 16384
  )
);

ALTER TABLE public.project_ai_instructions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.project_ai_instructions FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.project_ai_instructions TO service_role;

CREATE TABLE public.ai_instruction_proposals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  use_case text NOT NULL CHECK (use_case IN ('title', 'properties', 'objectives', 'assign')),
  -- The corrected issue field the proposal was drafted from.
  field text NOT NULL CHECK (field IN ('title', 'priority', 'effort', 'categories', 'objective_id', 'assignee_id')),
  correction_count integer NOT NULL CHECK (correction_count > 0),
  -- The drafted instruction and the one-sentence observation shown with it.
  instruction text,
  observation text,
  encrypted_content text,
  encryption_version integer NOT NULL DEFAULT 0,
  evidence_issue_ids uuid[] NOT NULL DEFAULT '{}',
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'dismissed')),
  dismissed_until timestamptz,
  resolved_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  resolved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ai_instruction_proposals_content_state CHECK (
    (encryption_version = 0 AND encrypted_content IS NULL
      AND instruction IS NOT NULL AND observation IS NOT NULL)
    OR (encryption_version > 0 AND encrypted_content IS NOT NULL
      AND instruction IS NULL AND observation IS NULL)
  ),
  CONSTRAINT ai_instruction_proposals_clear_length CHECK (
    char_length(COALESCE(instruction, '')) <= 500
    AND char_length(COALESCE(observation, '')) <= 500
  ),
  CONSTRAINT ai_instruction_proposals_resolution CHECK (
    (status = 'pending' AND resolved_at IS NULL)
    OR (status <> 'pending' AND resolved_at IS NOT NULL)
  ),
  CONSTRAINT ai_instruction_proposals_dismissal CHECK (
    dismissed_until IS NULL OR status = 'dismissed'
  )
);

-- One proposal at a time per project.
CREATE UNIQUE INDEX ai_instruction_proposals_one_pending
  ON public.ai_instruction_proposals (project_id) WHERE status = 'pending';
CREATE INDEX idx_ai_instruction_proposals_project_recent
  ON public.ai_instruction_proposals (project_id, created_at DESC);

ALTER TABLE public.ai_instruction_proposals ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.ai_instruction_proposals FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.ai_instruction_proposals TO service_role;

COMMIT;
