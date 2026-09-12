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

  it("recovers a terminal worker whose callback raced or was interrupted", () => {
    const recovery = sql.indexOf("create or replace function public.recover_stale_numo_turns");
    const operation = sql.slice(recovery);
    expect(operation).toContain("join public.agent_runs r on r.id = t.active_run_id");
    expect(operation).toContain("t.status = 'waiting_work'");
    expect(operation).toContain("r.status in ('completed', 'failed', 'canceled')");
    expect(operation).toContain("public.resume_numo_turn_from_worker");
  });

  it("commits each assistant tool-call message with its replay checkpoint", () => {
    const checkpoint = sql.indexOf("create or replace function public.checkpoint_numo_tool_round");
    const stop = sql.indexOf("create or replace function public.request_numo_turn_stop", checkpoint);
    const operation = sql.slice(checkpoint, stop);
    expect(operation).toContain("insert into public.assistant_messages");
    expect(operation).toContain("update public.numo_assistant_turns");
    expect(operation).toContain("'assistantmessageid', v_message_id");
  });

  it("refuses to replay an unfinished mutation", () => {
    const claim = sql.indexOf("create or replace function public.claim_numo_tool_operation");
    const operation = sql.slice(claim);
    expect(operation).toContain("if v_operation.replay_policy = 'retry'");
    expect(operation).toContain("set status = 'ambiguous'");
    expect(operation).toContain("set status = 'reconciling'");
  });

  it("records an in-flight tool result while a stop is pending", () => {
    const complete = sql.indexOf("create or replace function public.complete_numo_tool_operation");
    const recovery = sql.indexOf("create or replace function public.recover_stale_numo_turns", complete);
    const operation = sql.slice(complete, recovery);
    expect(operation).toContain("status in ('running', 'stopping')");
    expect(operation).toContain("set active_run_id = r.id");
    expect(operation).toContain("o.tool_name = 'launch_code_agent'");
  });

  it("interrupts an active worker as part of stop and stale-stop recovery", () => {
    const stop = sql.indexOf("create or replace function public.request_numo_turn_stop");
    const retry = sql.indexOf("create or replace function public.retry_numo_turn", stop);
    expect(sql.slice(stop, retry)).toContain("update public.agent_runs");
    const recovery = sql.indexOf("create or replace function public.recover_stale_numo_turns");
    expect(sql.slice(recovery)).toContain("set interrupt_requested = true");
  });

  it("keeps execution tables server-written while allowing owner replay", () => {
    expect(sql).toContain("grant select on public.numo_assistant_turns to authenticated");
    expect(sql).toContain("grant select on public.numo_turn_events to authenticated");
    expect(sql).toContain("revoke all on public.numo_tool_operations from public, anon, authenticated");
  });
});
