import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const read = (name: string) =>
  readFileSync(join(process.cwd(), "supabase/migrations", name), "utf8");

const migration = read("20270109200099_comment_history_policy_reads.sql");
const baseline = read("20270106090000_baseline.sql");

/** The body of one policy, from its CREATE to the closing semicolon. */
function policy(sql: string, name: string): string {
  const start = sql.indexOf(`CREATE POLICY ${name} `);
  expect(start).toBeGreaterThanOrEqual(0);
  return sql.slice(start, sql.indexOf(";", start));
}

describe("set-based read policies for comments, attachments and activity", () => {
  it("drops the per-row project helper from the four SELECT policies", () => {
    for (const name of ["comments_select", "attachments_select", "issue_events_select", "page_comments_select"]) {
      const body = policy(migration, name);
      expect(body).toContain("FOR SELECT TO authenticated");
      expect(body).toContain("project_id IN (SELECT public.accessible_project_ids())");
      expect(body).not.toContain("can_access_project");
      expect(migration).toContain(`DROP POLICY IF EXISTS ${name} ON`);
    }
  });

  it("keeps the live-parent conditions the old policies inherited from parent RLS", () => {
    const comments = policy(migration, "comments_select");
    expect(comments).toContain("i.id = comments.issue_id AND i.deleted_at IS NULL");
    expect(comments).toContain("o.id = comments.objective_id AND o.deleted_at IS NULL");
    // Neither the old nor the new policy has a feedback-post branch.
    expect(comments).not.toContain("feedback_post");

    const events = policy(migration, "issue_events_select");
    expect(events).toContain("i.id = issue_events.issue_id AND i.deleted_at IS NULL");
    expect(events).toContain("o.id = issue_events.objective_id AND o.deleted_at IS NULL");
    expect(events).toContain("p.id = issue_events.page_id AND p.deleted_at IS NULL");
    expect(events).not.toContain("feedback_post");

    expect(policy(migration, "page_comments_select"))
      .toContain("p.id = page_comments.page_id AND p.deleted_at IS NULL");
  });

  it("matches the parents the baseline policies probed", () => {
    // The baseline form this migration replaces, and the parents it matched.
    expect(baseline).toContain('"i"."id" = "comments"."issue_id"');
    expect(baseline).toContain('"o"."id" = "comments"."objective_id"');
    expect(baseline).toContain('"p"."id" = "issue_events"."page_id"');
    for (const table of ["issues", "objectives", "pages"]) {
      expect(baseline).toMatch(new RegExp(`CREATE POLICY "${table}_select" ON "public"."${table}"[^;]*"deleted_at" IS NULL`));
    }
  });

  it("does not touch write policies", () => {
    expect(migration).not.toMatch(/FOR (INSERT|UPDATE|DELETE|ALL)/);
  });
});
