import { describe, expect, it } from "vitest";

import {
  canonicalSql,
  migrationFiles,
  readMigration,
} from "@/test/sql-migrations";

const RECONCILE_MIGRATION = "20270106860000_reconcile_nullif_special_form.sql";

describe("NULLIF special-form resolution migration", () => {
  it("keeps every migration free of schema-qualified NULLIF calls", () => {
    for (const file of migrationFiles()) {
      expect(readMigration(file), file).not.toContain("pg_catalog.nullif");
    }
  });

  it("converges already-applied instances on corrected function bodies", () => {
    const sql = canonicalSql(readMigration(RECONCILE_MIGRATION));
    expect(sql).toContain(
      "create or replace function public.create_agent_run_with_budget",
    );
    expect(sql).toContain(
      "if nullif(p_values->>'parent_numo_turn_id', '') is not null",
    );
    expect(sql).toContain(
      "create or replace function public.ensure_numo_routine_occurrence",
    );
    expect(sql).toContain("nullif(pg_catalog.btrim(p_title), '') is null");
    expect(sql).toContain(
      "grant execute on function public.create_agent_run_with_budget",
    );
    expect(sql).toContain(
      "grant execute on function public.ensure_numo_routine_occurrence",
    );
  });
});
