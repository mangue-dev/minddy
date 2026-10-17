-- Live page carets travel as Broadcast (MIN-688).
--
-- Supabase allows a client five Presence updates per 30 seconds and closes
-- the channel beyond that (`ClientPresenceRateLimitReached`), which a moving
-- caret reaches within a second. Carets therefore move to client Broadcast on
-- the same private `page-collaboration:<pageId>` topic: only members of the
-- page's project may send or receive there, on the topic of the current
-- membership generation. The Presence policies of this topic, unused now, are
-- dropped.

BEGIN;

DROP POLICY IF EXISTS members_receive_page_collaboration ON realtime.messages;
DROP POLICY IF EXISTS members_track_page_collaboration ON realtime.messages;

CREATE POLICY members_receive_page_collaboration_carets ON realtime.messages
FOR SELECT TO authenticated
USING (
  extension = 'broadcast'
  AND realtime.topic() LIKE 'page-collaboration:%'
  AND EXISTS (
    SELECT 1 FROM public.pages AS page
    WHERE page.id = public.topic_uuid(realtime.topic())
      AND page.deleted_at IS NULL
      AND public.can_access_project(page.project_id)
  )
  AND public.realtime_topic_is_current(realtime.topic())
);

CREATE POLICY members_send_page_collaboration_carets ON realtime.messages
FOR INSERT TO authenticated
WITH CHECK (
  extension = 'broadcast'
  AND realtime.topic() LIKE 'page-collaboration:%'
  AND EXISTS (
    SELECT 1 FROM public.pages AS page
    WHERE page.id = public.topic_uuid(realtime.topic())
      AND page.deleted_at IS NULL
      AND public.can_access_project(page.project_id)
  )
  AND public.realtime_topic_is_current(realtime.topic())
);

COMMIT;
