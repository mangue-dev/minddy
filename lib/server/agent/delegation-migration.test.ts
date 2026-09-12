import { describe, expect, it } from "vitest";

import { canonicalSql, readMigration } from "@/test/sql-migrations";

const sql = canonicalSql(
  readMigration("20270106720000_numo_code_delegation_contract.sql"),
);

describe("Numo code delegation migration", () => {
  it("records parent ownership, lineage and versioned brief/result payloads", () => {
    expect(sql).toContain("add column parent_numo_conversation_id uuid");
    expect(sql).toContain("add column parent_numo_turn_id uuid");
    expect(sql).toContain("add column parent_numo_tool_call_id text");
    expect(sql).toContain("add column continued_from_run_id uuid references public.agent_runs(id)");
    expect(sql).toContain("add column delegation_brief jsonb");
    expect(sql).toContain("add column delegation_result jsonb");
    expect(sql).toContain("delegation_brief ->> 'version' = '1'");
    expect(sql).toContain("delegation_result ->> 'version' = '1'");
  });

  it("makes a parent tool delivery an at-most-once worker launch", () => {
    expect(sql).toContain("create unique index agent_runs_numo_tool_call_unique");
    expect(sql).toContain("(parent_numo_turn_id, parent_numo_tool_call_id)");
    expect(sql).toContain("foreign key (parent_numo_turn_id, parent_numo_conversation_id)");
    expect(sql).toContain("references public.numo_assistant_turns(id, conversation_id)");
  });

  it("keeps managed-budget worker creation atomic with the delegation record", () => {
    const rpc = sql.indexOf("create or replace function public.create_agent_run_with_budget");
    expect(rpc).toBeGreaterThan(0);
    expect(sql.slice(rpc)).toContain("parent_numo_tool_call_id");
    expect(sql.slice(rpc)).toContain("delegation_brief");
    expect(sql.slice(rpc)).toContain("managed_budget_usd");
  });
});
