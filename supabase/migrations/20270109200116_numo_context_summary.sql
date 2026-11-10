-- MIN-954: context compaction for Numo. When a conversation outgrows the
-- model's budget, Numo summarizes its start and keeps the summary on the
-- conversation, so later turns resume from it instead of reloading every
-- message (or silently dropping the oldest ones, as the fixed window of 30
-- messages did).
--
-- - `context_summary`: the summary, encrypted like the conversation title
--   (`mdys3:` envelope) wherever titles are.
-- - `context_summary_through_at` / `context_summary_through_id`: the last
--   message the summary covers, in the history's (created_at, id) order. A
--   turn reloads only the messages after it.
--
-- Additive only. The previous release ignores the new columns and keeps
-- reading its fixed window.

BEGIN;

ALTER TABLE public.conversations
  ADD COLUMN IF NOT EXISTS context_summary text,
  ADD COLUMN IF NOT EXISTS context_summary_through_at timestamptz,
  ADD COLUMN IF NOT EXISTS context_summary_through_id uuid;

COMMENT ON COLUMN public.conversations.context_summary IS
  'Summary of the compacted start of the conversation (MIN-954), encrypted like the title.';

COMMIT;
