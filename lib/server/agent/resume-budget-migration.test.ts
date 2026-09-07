import { describe, expect, it } from "vitest";

import { canonicalSql, readMigration } from "@/test/sql-migrations";

const sql = canonicalSql(
  readMigration("20270106430000_atomic_agent_resume_budget.sql"),
);
const failedResumeSql = canonicalSql(
  readMigration("20270106500000_resume_failed_agent_checkpoint.sql"),
);
const releaseHardeningSql = canonicalSql(
  readMigration("20270106620000_release_security_hardening.sql"),
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
    expect(failedResumeSql).toContain("get diagnostics v_updated = row_count");
    expect(failedResumeSql).toContain("'state', 'conflict'");
  });

  it("keeps idle sandbox reaping indexed for completed and failed runs", () => {
    expect(failedResumeSql).toContain("drop index if exists public.idx_agent_runs_idle_sandbox");
    expect(failedResumeSql).toContain(
      "where status in ('completed', 'failed') and sandbox_id is not null and sandbox_stopped_at is null",
    );
  });

  it("resumes the latest run and stores its message under one anchor lock", () => {
    const fn = releaseHardeningSql.indexOf(
      "create or replace function public.resume_latest_agent_run_with_message",
    );
    const budgetLock = releaseHardeningSql.indexOf(
      "hashtextextended(p_owner_id::text, 460)",
      fn,
    );
    const anchorLock = releaseHardeningSql.indexOf(
      "hashtextextended('agent-run:' || v_anchor, 459)",
      budgetLock,
    );
    const latest = releaseHardeningSql.indexOf(
      "order by created_at desc, id desc",
      anchorLock,
    );
    const message = releaseHardeningSql.indexOf(
      "insert into public.agent_run_messages",
      latest,
    );
    const resume = releaseHardeningSql.indexOf(
      "set status = 'queued'",
      message,
    );

    expect(fn).toBeGreaterThan(0);
    expect(budgetLock).toBeGreaterThan(fn);
    expect(anchorLock).toBeGreaterThan(budgetLock);
    expect(latest).toBeGreaterThan(anchorLock);
    expect(message).toBeGreaterThan(latest);
    expect(resume).toBeGreaterThan(message);
  });

  it("locks current identities and scopes before the terminal run write", () => {
    const fn = releaseHardeningSql.indexOf(
      "create or replace function public.resume_latest_agent_run_with_message",
    );
    const anchor = releaseHardeningSql.indexOf(
      "hashtextextended('agent-run:' || v_anchor, 459)",
      fn,
    );
    const access = releaseHardeningSql.indexOf(
      "lock_live_agent_run_project_access",
      anchor,
    );
    const runLock = releaseHardeningSql.indexOf("for update", access);
    const conversationLock = releaseHardeningSql.indexOf("for update", runLock + 1);
    const latest = releaseHardeningSql.indexOf(
      "order by created_at desc, id desc",
      conversationLock,
    );
    const repository = releaseHardeningSql.indexOf(
      "agent_run_repository_binding_is_current",
      latest,
    );
    const message = releaseHardeningSql.indexOf(
      "insert into public.agent_run_messages",
      repository,
    );

    expect(anchor).toBeGreaterThan(fn);
    expect(access).toBeGreaterThan(anchor);
    expect(runLock).toBeGreaterThan(access);
    expect(conversationLock).toBeGreaterThan(runLock);
    expect(latest).toBeGreaterThan(conversationLock);
    expect(repository).toBeGreaterThan(latest);
    expect(message).toBeGreaterThan(repository);
    expect(releaseHardeningSql.slice(fn, runLock)).toContain(
      "v_run.created_by is distinct from p_owner_id",
    );
  });

  it("reauthorizes active steering under the same run-to-conversation order", () => {
    const fn = releaseHardeningSql.indexOf(
      "create or replace function public.insert_latest_agent_run_message",
    );
    const anchor = releaseHardeningSql.indexOf(
      "hashtextextended('agent-run:' || v_anchor, 459)",
      fn,
    );
    const access = releaseHardeningSql.indexOf(
      "lock_live_agent_run_project_access",
      anchor,
    );
    const runLock = releaseHardeningSql.indexOf("for update", access);
    const conversationLock = releaseHardeningSql.indexOf("for update", runLock + 1);
    const repository = releaseHardeningSql.indexOf(
      "agent_run_repository_binding_is_current",
      conversationLock,
    );
    const message = releaseHardeningSql.indexOf(
      "insert into public.agent_run_messages",
      repository,
    );

    expect(anchor).toBeGreaterThan(fn);
    expect(access).toBeGreaterThan(anchor);
    expect(runLock).toBeGreaterThan(access);
    expect(conversationLock).toBeGreaterThan(runLock);
    expect(repository).toBeGreaterThan(conversationLock);
    expect(message).toBeGreaterThan(repository);
    expect(releaseHardeningSql.slice(conversationLock, message)).toContain(
      "return 'forbidden'",
    );
  });
});
