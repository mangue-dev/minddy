import { describe, expect, it } from "vitest";
import { canonicalSql, readMigration } from "@/test/sql-migrations";

const sql = canonicalSql(
  readMigration("20270106100000_restore_agent_conversation_read_cursors.sql"),
);

describe("agent conversation read-cursor repair migration", () => {
  it("marks existing private and project conversations as read for their readers", () => {
    expect(sql).toContain("insert into public.agent_conversation_reads");
    expect(sql).toContain("from public.agent_conversations c");
    expect(sql).toContain("join public.projects p on p.id = c.project_id");
    expect(sql).toContain("join public.project_members pm on pm.project_id = c.project_id");
    expect(sql).toContain("set last_read_at = excluded.last_read_at");
  });

  it("keeps future agent completions eligible to become unread", () => {
    expect(sql).toContain("select user_id, conversation_id, now()");
    expect(sql).not.toContain("completed_at");
  });
});
