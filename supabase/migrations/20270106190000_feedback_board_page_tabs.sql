-- Published wiki pages as tabs of the public site (board + shared views).
--
-- Mirrors the shared-view tab coupling (`show_views`, `visible_view_ids`):
-- `show_pages` arms the feature, `visible_page_ids` holds the opt-in selection
-- of published pages (view_shares.page_id targets) rendered as tabs next to
-- the Feedback tab and the shared views. A share row deleted by unpublishing
-- simply drops out of the navigation on the next request.

ALTER TABLE "public"."feedback_boards" ADD COLUMN IF NOT EXISTS "show_pages" boolean DEFAULT false NOT NULL;

ALTER TABLE "public"."feedback_boards" ADD COLUMN IF NOT EXISTS "visible_page_ids" "uuid"[] DEFAULT '{}'::"uuid"[] NOT NULL;
