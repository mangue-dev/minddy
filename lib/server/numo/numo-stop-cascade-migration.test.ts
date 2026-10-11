import { describe, expect, it } from "vitest";

import { canonicalSql, migrationFiles, readMigration } from "@/test/sql-migrations";

const sql = canonicalSql(
  readMigration("20270107020000_numo_stop_cascade.sql"),
);

function operation(name: string) {
  const start = sql.indexOf(`create or replace function public.${name}`);
  expect(start).toBeGreaterThan(0);
  return sql.slice(start);
}

describe("Historical Numo stop cascade migration (MIN-599)", () => {
  it("interrupts every live worker of the turn, not only the awaited one", () => {
    const stop = operation("request_numo_turn_stop");
    expect(stop).toContain(
      "parent_numo_turn_id = v_turn.id and status in ('queued', 'running')",
    );
    expect(stop).not.toContain("id = v_turn.active_run_id and status in ('queued', 'running')");
  });

  it("swallows the unconsumed steering queued for every worker of the turn", () => {
    const stop = operation("request_numo_turn_stop");
    expect(stop).toContain(
      "select id from public.agent_runs where parent_numo_turn_id = v_turn.id",
    );
    expect(stop).toContain("consumed_at is null");
  });

  it("keeps canceling pending worker questions on stop", () => {
    const stop = operation("request_numo_turn_stop");
    expect(stop).toContain("set status = 'canceled'");
    expect(stop).toContain("parent_numo_turn_id = v_turn.id and status = 'pending'");
  });

  it("cascades the stale-stop recovery to every live worker too", () => {
    const recovery = operation("recover_stale_numo_turns");
    expect(recovery).toContain("v_turn.status = 'stopping'");
    expect(recovery).toContain(
      "parent_numo_turn_id = v_turn.id and status in ('queued', 'running')",
    );
  });

  it("preserves the terminal-worker reconciliation of stale turns", () => {
    const recovery = operation("recover_stale_numo_turns");
    expect(recovery).toContain("join public.agent_runs r on r.id = t.active_run_id");
    expect(recovery).toContain("t.status = 'waiting_work'");
    expect(recovery).toContain("public.resume_numo_turn_from_worker");
  });
});

describe("Independent Numo stop after encryption migrations", () => {
  const latestRecovery = migrationFiles()
    .map((file) => canonicalSql(readMigration(file)))
    .filter((contents) => contents.includes(
      "create or replace function public.recover_stale_numo_turns()",
    ))
    .at(-1)!
    .split("create or replace function public.recover_stale_numo_turns()").at(-1)!;

  const latestStop = migrationFiles()
    .map((file) => canonicalSql(readMigration(file)))
    .filter((contents) => contents.includes("create or replace function public.request_numo_turn_stop("))
    .at(-1)!;

  it("preserves workers, steering and questions in the latest stop and recovery definitions", () => {
    for (const definition of [latestStop, latestRecovery]) {
      expect(definition).not.toContain("update public.agent_runs");
      expect(definition).not.toContain("update public.agent_run_messages");
      expect(definition).not.toContain("update public.agent_run_input_requests");
      expect(definition).toContain("from public, anon, authenticated");
      expect(definition).toContain("to service_role");
    }
    expect(latestStop).toContain("conversation_id = p_conversation_id and user_id = p_user_id");
    expect(latestStop).toContain("pg_advisory_xact_lock");
  });

  it("leaves protected worker handoff to the application and clears error copies", () => {
    expect(latestRecovery).not.toContain("public.resume_numo_turn_from_worker");
    expect(latestRecovery).not.toContain("delegation_result");
    expect(latestRecovery.match(/error_message = null/g)).toHaveLength(2);
    expect(latestRecovery).toContain(
      "when v_turn.checkpoint ->> 'phase' = 'worker_result' then 'queued'",
    );
    expect(latestRecovery).toContain("claimed_at < now() - interval '6 minutes'");
    expect(latestRecovery).toContain("for update skip locked");
  });
});
