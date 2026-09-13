import { describe, expect, it } from "vitest";

import { canonicalSql, readMigration } from "@/test/sql-migrations";

const sql = canonicalSql(
  readMigration("20270106740000_numo_usage_operation_budget.sql"),
);

function operation(start: string, end: string): string {
  const from = sql.indexOf(`create or replace function public.${start}`);
  const to = sql.indexOf(`create or replace function public.${end}`, from + 1);
  expect(from).toBeGreaterThan(0);
  expect(to).toBeGreaterThan(from);
  return sql.slice(from, to);
}

describe("Numo operation usage migration", () => {
  it("preserves historical charges while adding deterministic write identities", () => {
    expect(sql).toContain("set idempotency_key = 'legacy:' || id::text");
    expect(sql).toContain("alter column idempotency_key set not null");
    expect(sql).toContain(
      "create unique index ai_usage_idempotency_key_unique",
    );
    expect(sql).not.toContain("delete from public.ai_usage");
    expect(sql).not.toContain("update public.ai_usage set feature");
  });

  it("backfills parent, worker, and routine attribution without changing costs", () => {
    expect(sql).toContain("where usage.run_id = turn.run_id");
    expect(sql).toContain("set numo_turn_id = run.parent_numo_turn_id");
    expect(sql).toContain(
      "routine_id = coalesce(usage.routine_id, run.routine_id)",
    );
    expect(sql).not.toMatch(/update public\.ai_usage[^;]*\bcost\s*=/);
  });

  it("serializes account reservations and includes standalone and Numo work", () => {
    const begin = operation(
      "begin_numo_turn_with_budget",
      "create_agent_run_with_budget",
    );
    const accountLock = begin.indexOf("hashtextextended(p_user_id::text, 460)");
    const ledger = begin.indexOf("from public.ai_usage", accountLock);
    const agentReservations = begin.indexOf(
      "from public.agent_runs as run",
      ledger,
    );
    const numoReservations = begin.indexOf(
      "from public.numo_assistant_turns as turn",
      agentReservations,
    );
    const insert = begin.indexOf(
      "insert into public.numo_assistant_turns",
      numoReservations,
    );

    expect(accountLock).toBeGreaterThan(0);
    expect(ledger).toBeGreaterThan(accountLock);
    expect(agentReservations).toBeGreaterThan(ledger);
    expect(numoReservations).toBeGreaterThan(agentReservations);
    expect(insert).toBeGreaterThan(numoReservations);
    expect(begin).toContain("run.parent_numo_turn_id is null");
  });

  it("lets every delegated worker draw from one locked parent reservation", () => {
    const create = operation(
      "create_agent_run_with_budget",
      "resume_agent_run_with_budget",
    );
    expect(create).toContain(
      "if pg_catalog.nullif(p_values->>'parent_numo_turn_id', '') is not null",
    );
    expect(create).toContain("from public.numo_assistant_turns");
    expect(create).toContain("for update");
    expect(create).toContain(
      "where numo_turn_id = v_parent.id and key_mode = 'platform'",
    );
    expect(create).toContain("if v_parent.managed_budget_usd is null");
    expect(create).toContain("set managed_budget_usd = v_granted");
    expect(create).toContain("v_granted := v_parent.managed_budget_usd");
  });

  it("keeps BYOK parent usage out of a managed worker reservation", () => {
    expect(sql).toContain(
      "create or replace function public.get_numo_operation_platform_spend",
    );
    expect(sql).toContain("and key_mode = 'platform'");
  });

  it("reacquires the parent operation reservation on a worker continuation", () => {
    const resume = operation(
      "resume_latest_agent_run_with_message",
      "get_user_usage_history",
    );
    expect(resume).toContain(
      "turn.id is distinct from v_run.parent_numo_turn_id",
    );
    expect(resume).toContain(
      "where id = v_run.parent_numo_turn_id",
    );
    expect(resume).toContain("and user_id = p_owner_id");
    expect(resume).toContain(
      "greatest(v_run.budget_usd - v_operation_total_spent, 0)",
    );
    expect(resume).toContain(
      "then coalesce(v_operation_platform_spent, 0) + v_granted",
    );
    expect(resume).toContain(
      "update public.numo_assistant_turns set managed_budget_usd = v_stored_budget",
    );
  });

  it("groups unified history by operation without rewriting feature totals", () => {
    const history = sql.slice(
      sql.indexOf("create or replace function public.get_user_usage_history"),
    );
    expect(history).toContain("coalesce(u.numo_turn_id, u.run_id)");
    expect(history).toContain(
      "when bool_or(u.routine_id is not null) then 'routine_code'",
    );
    expect(history).toContain(
      "and (p_features is null or u.feature = any(p_features))",
    );
    expect(history).toContain("sum(coalesce(u.cost, 0)) as cost");
  });
});
