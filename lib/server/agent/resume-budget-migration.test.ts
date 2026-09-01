import { describe, expect, it } from "vitest";

import { canonicalSql, readMigration } from "@/test/sql-migrations";

const sql = canonicalSql(
  readMigration("20270106430000_atomic_agent_resume_budget.sql"),
);
const failedResumeSql = canonicalSql(
  readMigration("20270106500000_resume_failed_agent_checkpoint.sql"),
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

  it("resumes failed turns only when a checkpoint survived", () => {
    expect(failedResumeSql).toContain(
      "v_run.status not in ('completed', 'failed', 'canceled')",
    );
    expect(failedResumeSql).toContain(
      "v_run.status = 'failed' and v_run.checkpoint is null",
    );
  });

  it("keeps idle sandbox reaping indexed for completed and failed runs", () => {
    expect(failedResumeSql).toContain("drop index if exists public.idx_agent_runs_idle_sandbox");
    expect(failedResumeSql).toContain(
      "where status in ('completed', 'failed') and sandbox_id is not null and sandbox_stopped_at is null",
    );
  });
});
