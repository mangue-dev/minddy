-- Squashed from 20270106093000 and 20270106094000. Existing instances that
-- recorded both versions already have this schema; remove only 20270106093000
-- from their migration history with `supabase migration repair`.

-- Notify project members that a page body changed without sending its content.
-- `broadcast_page_row` removes the body from the payload before broadcasting.
DROP TRIGGER IF EXISTS pages_broadcast_update ON public.pages;

CREATE TRIGGER pages_broadcast_update
AFTER UPDATE ON public.pages
FOR EACH ROW
WHEN (
  OLD.title IS DISTINCT FROM NEW.title
  OR OLD.icon IS DISTINCT FROM NEW.icon
  OR OLD.parent_id IS DISTINCT FROM NEW.parent_id
  OR OLD.position IS DISTINCT FROM NEW.position
  OR OLD.favorite IS DISTINCT FROM NEW.favorite
  OR OLD.deleted_at IS DISTINCT FROM NEW.deleted_at
  OR OLD.deleted_root_id IS DISTINCT FROM NEW.deleted_root_id
  OR OLD.parent_block_removed IS DISTINCT FROM NEW.parent_block_removed
  OR OLD.content IS DISTINCT FROM NEW.content
)
EXECUTE FUNCTION public.broadcast_page_row();

-- The agent records a newly opened pull request while the forge webhook can
-- deliver the same event. Keep the oldest inbox line before enforcing the
-- per-recipient invariant used by the atomic upsert.
WITH ranked AS (
  SELECT
    id,
    row_number() OVER (
      PARTITION BY user_id, type, pull_request_id
      ORDER BY created_at ASC, id ASC
    ) AS position
  FROM public.notifications
  WHERE type = 'pr_opened'
    AND pull_request_id IS NOT NULL
)
DELETE FROM public.notifications AS notification
USING ranked
WHERE notification.id = ranked.id
  AND ranked.position > 1;

CREATE UNIQUE INDEX notifications_one_opened_pull_request_per_recipient
  ON public.notifications (user_id, type, pull_request_id);
