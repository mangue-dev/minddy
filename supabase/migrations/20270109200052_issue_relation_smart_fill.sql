-- MIN-717: Smart Fill proposes issue relations from an issue embedding index.
--
-- Two service-only tables, both derived from issue content and both removed
-- with their issue:
--
-- - `issue_embeddings` — one vector per (issue, index version). The index
--   version names the provider, the model and the returned dimensions, so a
--   query only ever compares vectors of the same embedding space: changing the
--   admin model starts a new version next to the old one instead of mixing
--   them. The vector and the content fingerprint it was computed from are
--   derived private data: the repository encrypts both under the project's
--   content key, exactly like feedback post embeddings. `content_version` is a
--   random identifier rotated whenever the fingerprint changes; it carries no
--   content and lets relation decisions be cached without a clear digest.
-- - `issue_relation_inferences` — one row per relation decision Smart Fill
--   made for a pair, keyed by both content versions. A retry on unchanged
--   content reuses the cached verdict instead of paying for it again, and an
--   applied relation that a person later removed (the row keeps
--   `applied_at` while its `relation_id` falls to NULL) is never recreated.
--
-- Neither table is read by clients: RLS is on with no policy and the anon and
-- authenticated grants are revoked.

CREATE TABLE public.issue_embeddings (
  issue_id uuid NOT NULL REFERENCES public.issues(id) ON DELETE CASCADE,
  index_version text NOT NULL CHECK (char_length(index_version) BETWEEN 1 AND 300),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  content_version uuid NOT NULL,
  dimensions integer NOT NULL CHECK (dimensions > 0 AND dimensions <= 8192),
  embedding jsonb,
  content_hash text,
  encrypted_content jsonb,
  encryption_version integer NOT NULL DEFAULT 0,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  PRIMARY KEY (issue_id, index_version)
);

CREATE INDEX idx_issue_embeddings_project_version
  ON public.issue_embeddings (project_id, index_version);

ALTER TABLE public.issue_embeddings ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.issue_embeddings FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.issue_embeddings TO service_role;

CREATE TABLE public.issue_relation_inferences (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  issue_id uuid NOT NULL REFERENCES public.issues(id) ON DELETE CASCADE,
  candidate_id uuid NOT NULL REFERENCES public.issues(id) ON DELETE CASCADE,
  issue_version uuid NOT NULL,
  candidate_version uuid NOT NULL,
  verdict text NOT NULL CHECK (verdict IN ('none', 'related', 'blocks', 'blocked_by')),
  engine text CHECK (engine IS NULL OR engine IN ('model', 'llm')),
  relation_id uuid REFERENCES public.issue_relations(id) ON DELETE SET NULL,
  applied_at timestamp with time zone,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CHECK (issue_id <> candidate_id),
  UNIQUE (issue_id, candidate_id, issue_version, candidate_version)
);

CREATE INDEX idx_issue_relation_inferences_pair
  ON public.issue_relation_inferences (issue_id, candidate_id);
CREATE INDEX idx_issue_relation_inferences_candidate
  ON public.issue_relation_inferences (candidate_id, issue_id);
CREATE INDEX idx_issue_relation_inferences_project
  ON public.issue_relation_inferences (project_id, created_at DESC);

ALTER TABLE public.issue_relation_inferences ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.issue_relation_inferences FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.issue_relation_inferences TO service_role;

-- Indexing and relation decisions are Smart Fill work billed to the account
-- that owns the pass: their own ledger features, in the Automations segment.
ALTER TABLE "public"."ai_usage" DROP CONSTRAINT IF EXISTS "ai_usage_feature_check";

ALTER TABLE "public"."ai_usage"
    ADD CONSTRAINT "ai_usage_feature_check" CHECK (("feature" = ANY (ARRAY['numo_chat'::text, 'numo_comment'::text, 'dictation'::text, 'transcription'::text, 'smart_assign'::text, 'smart_fill'::text, 'feedback_classify'::text, 'feedback_analyze'::text, 'embedding'::text, 'agent_code'::text, 'sandbox_compute'::text, 'web_search'::text, 'pr_review'::text, 'import_map'::text, 'landing_demo'::text, 'brief_split'::text, 'feedback_voice'::text, 'routine_code'::text, 'routine_compute'::text, 'jev_decision'::text, 'smart_triage'::text, 'jev_shadow'::text, 'faq_ask'::text, 'issue_embedding'::text, 'issue_relation'::text])));
