import { describe, expect, it } from "vitest";

import { canonicalSql, readMigration } from "@/test/sql-migrations";

const sql = canonicalSql(
  readMigration("20270106340000_agent_lifecycle_concurrency.sql"),
);

describe("pull request lifecycle concurrency migration", () => {
  it("keeps pull request observations monotonic and linking serialized", () => {
    expect(sql).toContain("create or replace function public.upsert_pull_request_monotonic");
    expect(sql).toContain("v_incoming_updated_at > v_current.updated_at");
    expect(sql).toContain("hashtextextended('issue:' || v_lock_issue_id::text, 459)");
    expect(sql).toContain("create or replace function public.link_pull_request_to_issue_atomic");
    expect(sql).toContain("return 'issue_already_linked'");
  });
});
