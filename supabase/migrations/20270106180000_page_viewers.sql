-- Who currently has a page open (watch heartbeats).
--
-- The open editor pings this table every PAGE_WATCH_PING_MS and removes its row
-- when it leaves. `notifyAgentPageWrite` reads it before inserting: a recipient
-- whose row is fresher than PAGE_WATCH_FRESH_MS is LOOKING at the page — the
-- agent's write is already arriving live through realtime, and an inbox line
-- would only repeat what they are seeing.
--
-- One row per (page, user): a second tab on the same page just refreshes it.

CREATE TABLE IF NOT EXISTS "public"."page_viewers" (
    "page_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "seen_at" timestamp with time zone DEFAULT "now"() NOT NULL
);

ALTER TABLE "public"."page_viewers" OWNER TO "postgres";

ALTER TABLE ONLY "public"."page_viewers"
    ADD CONSTRAINT "page_viewers_pkey" PRIMARY KEY ("page_id", "user_id");

ALTER TABLE ONLY "public"."page_viewers"
    ADD CONSTRAINT "page_viewers_page_id_fkey" FOREIGN KEY ("page_id") REFERENCES "public"."pages"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."page_viewers"
    ADD CONSTRAINT "page_viewers_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;

ALTER TABLE "public"."page_viewers" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "page_viewers_select" ON "public"."page_viewers" FOR SELECT TO "authenticated" USING (("user_id" = "auth"."uid"()));

CREATE POLICY "page_viewers_delete" ON "public"."page_viewers" FOR DELETE TO "authenticated" USING (("user_id" = "auth"."uid"()));

CREATE POLICY "page_viewers_insert" ON "public"."page_viewers" FOR INSERT TO "authenticated" WITH CHECK (
  ("user_id" = "auth"."uid"())
  AND EXISTS (
    SELECT 1
    FROM "public"."pages" p
    WHERE p."id" = "page_viewers"."page_id"
      AND "public"."can_access_project"(p."project_id")
  )
);

CREATE POLICY "page_viewers_update" ON "public"."page_viewers" FOR UPDATE TO "authenticated" USING (("user_id" = "auth"."uid"())) WITH CHECK (
  ("user_id" = "auth"."uid"())
  AND EXISTS (
    SELECT 1
    FROM "public"."pages" p
    WHERE p."id" = "page_viewers"."page_id"
      AND "public"."can_access_project"(p."project_id")
  )
);

GRANT ALL ON TABLE "public"."page_viewers" TO "anon";
GRANT ALL ON TABLE "public"."page_viewers" TO "authenticated";
GRANT ALL ON TABLE "public"."page_viewers" TO "service_role";

COMMENT ON TABLE "public"."page_viewers" IS 'Who has a page open right now. The open editor upserts one row every PAGE_WATCH_PING_MS and deletes it on exit; notifyAgentPageWrite skips the inbox line for a viewer fresher than PAGE_WATCH_FRESH_MS, since they watch the agent''s write live.';
