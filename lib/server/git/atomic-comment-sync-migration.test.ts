import { describe, expect, it } from "vitest";

import { canonicalSql, readMigration } from "@/test/sql-migrations";

const sql = canonicalSql(
  readMigration("20270106410000_atomic_github_comment_sync.sql"),
);

describe("atomic GitHub comment sync migration", () => {
  it("locks the remote identity before reading or creating the local comment", () => {
    const lock = sql.indexOf("p_issue_id::text || ':' || p_remote_comment_id, 467");
    const sidecar = sql.indexOf("from public.github_issue_comment_syncs", lock);
    const comment = sql.indexOf("insert into public.comments", sidecar);
    expect(lock).toBeGreaterThan(0);
    expect(sidecar).toBeGreaterThan(lock);
    expect(comment).toBeGreaterThan(sidecar);
  });
});
