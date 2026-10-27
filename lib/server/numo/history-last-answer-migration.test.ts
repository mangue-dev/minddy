import { describe, expect, it } from "vitest";

import { canonicalSql, readMigration } from "@/test/sql-migrations";

const sql = canonicalSql(
  readMigration("20270109200083_numo_history_last_answer_at.sql"),
);

describe("Numo history latest-answer migration", () => {
  it("appends the latest answer so the previous release reads the same columns", () => {
    const history = sql.slice(
      sql.indexOf("create or replace view public.numo_conversation_history"),
      sql.indexOf("create or replace view public.numo_user_conversation_history"),
    );
    expect(history).toContain("with (security_invoker = true)");
    expect(history).toMatch(/end as project,\s*answer\.created_at as last_answer_at\s+from/);
    expect(history).toContain("m.role = 'assistant'::text");
    expect(history).toContain("on s.conversation_id = i.id and s.user_id = auth.uid()");
  });

  it("keeps routine conversations out of the user history", () => {
    expect(sql).toMatch(/numo_user_conversation_history with \(security_invoker = true\)/);
    expect(sql).toContain("where not public.is_numo_routine_conversation(history.legacy_id)");
  });
});
