import { describe, expect, it } from "vitest";

import { canonicalSql, readMigration } from "@/test/sql-migrations";

const sql = canonicalSql(
  readMigration("20270106450000_fix_pull_request_upsert_lock_key.sql"),
);

describe("pull request upsert lock key migration", () => {
  it("extracts every JSON lock-key component before concatenating it", () => {
    expect(sql).toContain(
      "(p_values->>'provider') || ':' || " +
        "(p_values->>'repo_full_name') || ':' || " +
        "(p_values->>'number')",
    );
    expect(sql).not.toContain(
      "p_values->>'provider' || ':' || p_values->>'repo_full_name'",
    );
  });
});
