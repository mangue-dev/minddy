import { describe, expect, it } from "vitest";
import { canonicalSql, readMigration } from "@/test/sql-migrations";

const sql = canonicalSql(
  readMigration("20270106750000_numo_delegated_work_notifications.sql"),
);

describe("Numo delegated work notifications migration", () => {
  it("stores a paired parent conversation and exact work target", () => {
    expect(sql).toContain("add column if not exists numo_conversation_id uuid");
    expect(sql).toContain("references public.numo_conversation_ids(id) on delete cascade");
    expect(sql).toContain("add column if not exists numo_work_id uuid");
    expect(sql).toContain("references public.agent_runs(id) on delete cascade");
    expect(sql).toContain("notifications_numo_work_pair_check");
  });
});
