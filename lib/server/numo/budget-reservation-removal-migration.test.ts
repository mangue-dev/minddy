import { describe, expect, it } from "vitest";

import { canonicalSql, migrationFiles, readMigration } from "@/test/sql-migrations";

const sql = canonicalSql(
  readMigration("20270109200096_numo_turns_without_budget_reservation.sql"),
);

describe("Numo turns without a budget reservation", () => {
  it("drops the reserving admission RPC, its helpers and the turn budget column", () => {
    expect(sql).toContain("drop function if exists public.begin_numo_turn_with_budget(");
    expect(sql).toContain("drop function if exists public.concurrent_managed_budget_grant(numeric, numeric);");
    expect(sql).toContain("drop function if exists public.get_numo_operation_platform_spend(uuid);");
    expect(sql).toContain("alter table public.numo_assistant_turns drop column if exists managed_budget_usd;");
  });

  // MIN-869: a later migration must not bring back a per-turn reservation.
  it("is not followed by a migration that reintroduces the reservation", () => {
    const later = migrationFiles().filter((file) => file > "20270109200096_numo_turns_without_budget_reservation.sql");
    for (const file of later) {
      const source = canonicalSql(readMigration(file));
      expect(source, file).not.toContain("begin_numo_turn_with_budget");
      expect(source, file).not.toContain("managed_budget_usd");
    }
  });
});
