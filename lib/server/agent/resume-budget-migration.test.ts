import { describe, expect, it } from "vitest";

import { canonicalSql, readMigration } from "@/test/sql-migrations";

const sql = canonicalSql(
  readMigration("20270106430000_atomic_agent_resume_budget.sql"),
);

describe("atomic agent resume budget migration", () => {
  it("serializes the reservation before re-queuing an inactive run", () => {
    const lock = sql.indexOf("hashtextextended(p_user_id::text, 460)");
    const reservations = sql.indexOf("run.status in ('queued', 'running')", lock);
    const update = sql.indexOf("set status = 'queued'", reservations);
    expect(lock).toBeGreaterThan(0);
    expect(reservations).toBeGreaterThan(lock);
    expect(update).toBeGreaterThan(reservations);
  });

  it("replaces the stale per-run reservation with the newly granted amount", () => {
    expect(sql).toContain("managed_budget_usd = v_granted");
    expect(sql).toContain("'state', 'no_budget'");
  });
});
