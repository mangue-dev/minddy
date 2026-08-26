import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

function source(path: string): string {
  return readFileSync(join(process.cwd(), path), "utf8");
}

describe("destructive race guards", () => {
  it("rechecks feedback purge eligibility in the deleting transaction", () => {
    const route = source("app/api/cron/feedback-analysis/route.ts");
    const migration = source(
      "supabase/migrations/20270106350000_destructive_race_guards.sql",
    );

    expect(route).toContain('.rpc("purge_feedback_junk_guarded"');
    expect(migration).toContain("v_post.issue_id IS NOT NULL");
    expect(migration).toContain("merged.merged_into_id = v_post.id");
    expect(migration).toContain("v_post.vote_count > 1");
  });

  it("uses guarded page and share mutations instead of stale read-then-delete flows", () => {
    const pages = source("lib/server/pages.ts");
    const commentMutation = source(
      "app/api/projects/[id]/pages/[pageId]/comments/[commentId]/route.ts",
    );
    const shares = source("lib/server/view-shares.ts");

    expect(pages).toContain('.rpc("discard_blank_page_guarded"');
    expect(commentMutation).toContain('.eq("page_id", pageId)');
    expect(shares).toContain('.rpc("upsert_view_share_guarded"');
    expect(shares).toContain('.rpc("revoke_view_share_guarded"');
    expect(shares).toContain("reserveCustomDomainMutation(`view:${viewId}`");
  });

  it("binds provider cleanup to the exact retained domain generation", () => {
    const domains = source("lib/server/custom-domains.ts");

    expect(domains).toContain('provider: "vercel-domain-names"');
    expect(domains).toContain('"delete_custom_domain_if_current"');
    expect(domains).toContain("if (error || retained) return;");
  });
});
