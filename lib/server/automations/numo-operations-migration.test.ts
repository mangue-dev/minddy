import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const sql = readFileSync(
  path.join(
    process.cwd(),
    "supabase/migrations/20270106770000_numo_automation_operations.sql",
  ),
  "utf8",
).toLowerCase();

describe("Numo automation operation migration", () => {
  it("reserves one durable operation per chain step", () => {
    expect(sql).toContain(
      "constraint numo_automation_operations_chain_step_unique unique (chain_id, step)",
    );
    expect(sql).toContain("request_id uuid not null unique");
    expect(sql).toContain("turn_id uuid unique references public.numo_assistant_turns");
  });

  it("creates one private conversation and reuses it for later steps", () => {
    expect(sql).toContain("select conversation_id into v_conversation_id");
    expect(sql).toContain("insert into public.conversations");
    expect(sql).toContain("if v_operation.id is not null then return v_operation");
    expect(sql).toContain("v_chain.status <> 'running'");
    expect(sql).toContain("v_chain.step <> p_step");
    expect(sql).toContain("<> p_rule_id");
  });

  it("selects automation retries without scanning interactive turns", () => {
    expect(sql).toContain("function public.retryable_numo_automation_operations");
    expect(sql).toContain("join public.numo_assistant_turns as turn");
    expect(sql).toContain("where turn.status = 'retryable'");
    expect(sql).toContain("and chain.status = 'running'");
  });

  it("keeps operation admission service-owned", () => {
    expect(sql).toContain(
      "revoke all on public.numo_automation_operations from public, anon, authenticated",
    );
    expect(sql).toContain("to service_role");
    expect(sql).toContain("if v_chain.owner_id <> p_user_id");
  });
});
