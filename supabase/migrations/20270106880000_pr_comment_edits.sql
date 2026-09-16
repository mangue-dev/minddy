-- MIN-548 — previous versions of PR conversation comments: one row per edit,
-- the body the comment carried BEFORE the rewrite. Snapshots are recorded by
-- the edit API (before the forge write) and by the GitHub `issue_comment`
-- edited webhook (`changes.body.from`). GitLab has no note-edit webhook: only
-- edits made from minddy carry history there.
CREATE TABLE IF NOT EXISTS "public"."pr_comment_edits" (
    "id" uuid NOT NULL DEFAULT gen_random_uuid(),
    "provider" text NOT NULL,
    "repo_full_name" text NOT NULL,
    "pr_number" integer NOT NULL,
    "comment_id" bigint NOT NULL,
    "body" text NOT NULL,
    "edited_by" text,
    "created_at" timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT "pr_comment_edits_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "pr_comment_edits_lookup"
    ON "public"."pr_comment_edits" USING "btree"
    ("provider", "repo_full_name", "pr_number", "comment_id", "created_at");

ALTER TABLE "public"."pr_comment_edits" ENABLE ROW LEVEL SECURITY;

-- Same rule as `pull_requests_select`: a member of ANY project linking the
-- repository reads the history. Writes stay on the service role (webhook
-- receiver and edit API): no insert/update/delete policy on purpose.
CREATE POLICY "pr_comment_edits_select" ON "public"."pr_comment_edits" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."project_git_links" "l"
  WHERE (("l"."provider" = "pr_comment_edits"."provider") AND ("l"."repo_full_name" = "pr_comment_edits"."repo_full_name") AND "public"."can_access_project"("l"."project_id")))));
