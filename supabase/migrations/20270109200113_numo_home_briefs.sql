-- MIN-930: Numo's word on the home page. After a turn that changed the
-- user's journal (`numo_journal_entries`), a short call sums up what is open
-- or not yet seen in a few sentences, with up to four suggestions for the
-- composer. Each rewrite is a new row: the latest one is shown, the previous
-- ones are kept (the repository keeps the last 50 per user).
--
-- `journal_entry_ids` lists the entries the text covers: a visit of the home
-- page marks them seen. `journal_digest` is a hash of those entries and their
-- state, so a turn that changed nothing the word covers does not pay for a
-- new call. `conversation_id` is the conversation of the newest covered entry,
-- which the home page opens; it is not a foreign key, like the journal's.
--
-- The text and the suggestions are model-written free text, sealed together
-- under the user's key once content encryption is enabled, like the journal.
-- The table is service-only: the application reads it through
-- `lib/server/numo/home-brief-content.ts`, which filters by the requesting
-- user, so no row policy is granted.
--
-- A new row is announced on the user's realtime topic WITHOUT its content,
-- so the home page reads it again through the authorized route.
--
-- The usage feature and the per-user AI route of the call are CHECK lists,
-- so both are extended. A member who routes Numo's conversation titles to
-- one of their keys gets the same route for the word, as for the wake
-- decision (20270109200107).
--
-- Additive only: the previous release neither reads nor writes the table,
-- the new feature or the new route.

BEGIN;

CREATE TABLE public.numo_home_briefs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  content text,
  suggestions jsonb,
  encrypted_content text,
  encryption_version integer NOT NULL DEFAULT 0,
  journal_entry_ids uuid[] NOT NULL DEFAULT '{}',
  journal_digest text NOT NULL,
  conversation_id uuid,
  generated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT numo_home_briefs_content_state CHECK (
    (encryption_version = 0 AND encrypted_content IS NULL
      AND content IS NOT NULL AND suggestions IS NOT NULL)
    OR (encryption_version > 0 AND encrypted_content IS NOT NULL
      AND content IS NULL AND suggestions IS NULL)
  ),
  CONSTRAINT numo_home_briefs_suggestions_shape CHECK (
    suggestions IS NULL OR (jsonb_typeof(suggestions) = 'array'
      AND jsonb_array_length(suggestions) <= 4)
  ),
  CONSTRAINT numo_home_briefs_clear_length CHECK (
    char_length(COALESCE(content, '')) <= 1000
  ),
  CONSTRAINT numo_home_briefs_entries CHECK (cardinality(journal_entry_ids) <= 200),
  CONSTRAINT numo_home_briefs_digest CHECK (journal_digest ~ '^[0-9a-f]{64}$')
);

-- The latest version of a user, and the versions past the kept ones.
CREATE INDEX idx_numo_home_briefs_user
  ON public.numo_home_briefs (user_id, generated_at DESC);

ALTER TABLE public.numo_home_briefs ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.numo_home_briefs FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.numo_home_briefs TO service_role;

-- Realtime only tells the home page to read the word again: no content.
CREATE OR REPLACE FUNCTION public.broadcast_numo_home_brief_row()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $function$
BEGIN
  PERFORM realtime.broadcast_changes(
    'user:' || NEW.user_id, TG_OP, TG_OP, TG_TABLE_NAME, TG_TABLE_SCHEMA,
    jsonb_populate_record(NULL::public.numo_home_briefs, jsonb_build_object(
      'id', NEW.id, 'user_id', NEW.user_id, 'generated_at', NEW.generated_at,
      'journal_digest', NEW.journal_digest)),
    NULL);
  RETURN NULL;
EXCEPTION WHEN OTHERS THEN
  RETURN NULL;
END;
$function$;
REVOKE ALL ON FUNCTION public.broadcast_numo_home_brief_row() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER numo_home_briefs_broadcast AFTER INSERT ON public.numo_home_briefs
  FOR EACH ROW EXECUTE FUNCTION public.broadcast_numo_home_brief_row();

ALTER TABLE "public"."ai_usage" DROP CONSTRAINT IF EXISTS "ai_usage_feature_check";

ALTER TABLE "public"."ai_usage"
    ADD CONSTRAINT "ai_usage_feature_check" CHECK (("feature" = ANY (ARRAY['numo_chat'::text, 'numo_comment'::text, 'dictation'::text, 'transcription'::text, 'smart_assign'::text, 'smart_fill'::text, 'feedback_classify'::text, 'feedback_analyze'::text, 'embedding'::text, 'agent_code'::text, 'sandbox_compute'::text, 'web_search'::text, 'pr_review'::text, 'import_map'::text, 'landing_demo'::text, 'brief_split'::text, 'feedback_voice'::text, 'routine_code'::text, 'routine_compute'::text, 'jev_decision'::text, 'smart_triage'::text, 'jev_shadow'::text, 'faq_ask'::text, 'issue_embedding'::text, 'issue_relation'::text, 'issue_search'::text, 'numo_wake'::text, 'numo_home_brief'::text])));

ALTER TABLE public.user_ai_usage_routes
  DROP CONSTRAINT user_ai_usage_routes_usage_key_check;

ALTER TABLE public.user_ai_usage_routes
  ADD CONSTRAINT user_ai_usage_routes_usage_key_check CHECK (usage_key IN (
    'assistant_model', 'conversation_title_model', 'web_search_model', 'numo_wake_model',
    'home_brief_model',
    'smart_assign_model', 'smart_fill_model', 'smart_fill_title_model',
    'import_map_model', 'brief_model', 'issue_embedding_model',
    'issue_relation_model', 'dictate_model', 'transcription_model',
    'feedback_analysis_model', 'feedback_embedding_model'
  ));

INSERT INTO public.user_ai_usage_routes (user_id, usage_key, ai_key_id, created_at, updated_at)
SELECT user_id, 'home_brief_model', ai_key_id, now(), now()
FROM public.user_ai_usage_routes
WHERE usage_key = 'conversation_title_model'
ON CONFLICT (user_id, usage_key) DO NOTHING;

COMMIT;
