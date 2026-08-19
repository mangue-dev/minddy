-- Reapply minddy Realtime policies after the local Supabase stack initializes
-- its Realtime schema. The baseline records these policies, but local startup can
-- recreate realtime.messages afterwards.
DROP POLICY IF EXISTS "members_receive_broadcasts" ON "realtime"."messages";
CREATE POLICY "members_receive_broadcasts" ON "realtime"."messages"
FOR SELECT TO "authenticated"
USING (
  "extension" = 'broadcast' AND (
    ("realtime"."topic"() LIKE 'project:%'
      AND "public"."can_access_project"("public"."topic_uuid"("realtime"."topic"())))
    OR ("realtime"."topic"() LIKE 'user:%'
      AND split_part("realtime"."topic"(), ':', 2) = (SELECT "auth"."uid"()::text))
    OR ("realtime"."topic"() LIKE 'agent-run:%'
      AND "public"."can_watch_agent_run"("realtime"."topic"()))
    OR ("realtime"."topic"() LIKE 'numo-comment:%'
      AND "public"."can_watch_numo_comment"("realtime"."topic"()))
    OR ("realtime"."topic"() LIKE 'pull-request:%'
      AND "public"."can_watch_pull_request"("realtime"."topic"()))
  )
);

DROP POLICY IF EXISTS "members_receive_page_presence" ON "realtime"."messages";
CREATE POLICY "members_receive_page_presence" ON "realtime"."messages"
FOR SELECT TO "authenticated"
USING (
  "extension" = 'presence'
  AND "realtime"."topic"() LIKE 'page-presence:%'
  AND "public"."can_access_project"("public"."topic_uuid"("realtime"."topic"()))
);

DROP POLICY IF EXISTS "members_track_page_presence" ON "realtime"."messages";
CREATE POLICY "members_track_page_presence" ON "realtime"."messages"
FOR INSERT TO "authenticated"
WITH CHECK (
  "extension" = 'presence'
  AND "realtime"."topic"() LIKE 'page-presence:%'
  AND "public"."can_access_project"("public"."topic_uuid"("realtime"."topic"()))
);
