import { describe, expect, it } from "vitest";

import { canonicalSql, readMigration } from "@/test/sql-migrations";

const sql = canonicalSql(
  readMigration("20270106680000_durable_numo_turns.sql"),
);

describe("durable Numo turns migration", () => {
  it("defines explicit execution, suspension, stop, retry, and reconciliation states", () => {
    expect(sql).toContain("'queued', 'running', 'waiting_work', 'waiting_input', 'stopping'");
    expect(sql).toContain("'stopped', 'retryable', 'reconciling', 'completed', 'failed'");
    expect(sql).toContain("create or replace function public.claim_numo_turn");
    expect(sql).toContain("claimed_at < now() - interval '6 minutes'");
    expect(sql).toContain("when v_turn.checkpoint ->> 'phase' = 'worker_result' then 'queued'");
  });

  it("commits an idempotent intent and user message together", () => {
    expect(sql).toContain("constraint numo_assistant_turns_request_unique unique (conversation_id, request_id)");
    const begin = sql.indexOf("create or replace function public.begin_numo_turn");
    const turn = sql.indexOf("insert into public.numo_assistant_turns", begin);
    const message = sql.indexOf("insert into public.assistant_messages", turn);
    expect(begin).toBeGreaterThan(0);
    expect(turn).toBeGreaterThan(begin);
    expect(message).toBeGreaterThan(turn);
  });

  it("deduplicates worker events and only wakes the currently awaited run", () => {
    const resume = sql.indexOf("create or replace function public.resume_numo_turn_from_worker");
    expect(sql.slice(resume)).toContain("active_run_id = p_run_id and status = 'waiting_work'");
    expect(sql.slice(resume)).toContain("perform public.append_numo_turn_event");
    expect(sql).toContain("id uuid primary key");
  });

  it("refuses to replay an unfinished mutation", () => {
    const claim = sql.indexOf("create or replace function public.claim_numo_tool_operation");
    const operation = sql.slice(claim);
    expect(operation).toContain("if v_operation.replay_policy = 'retry'");
    expect(operation).toContain("set status = 'ambiguous'");
    expect(operation).toContain("set status = 'reconciling'");
  });

  it("keeps execution tables server-written while allowing owner replay", () => {
    expect(sql).toContain("grant select on public.numo_assistant_turns to authenticated");
    expect(sql).toContain("grant select on public.numo_turn_events to authenticated");
    expect(sql).toContain("revoke all on public.numo_tool_operations from public, anon, authenticated");
  });
});
