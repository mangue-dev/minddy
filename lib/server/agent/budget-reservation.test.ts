import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { canonicalSql, readMigration } from "@/test/sql-migrations";

const sql = canonicalSql(
  readMigration("20270106300000_atomic_agent_budget_and_rest_claim.sql"),
);
const launchRoute = readFileSync(
  join(process.cwd(), "app/api/agent-runs/route.ts"),
  "utf8",
);

describe("atomic agent budget reservations", () => {
  it("throttles interactive launches before reading their request body", () => {
    const throttle = launchRoute.indexOf("rateLimitRefusal(");
    const bodyRead = launchRoute.indexOf("await request.json()", throttle);

    expect(throttle).toBeGreaterThan(0);
    expect(bodyRead).toBeGreaterThan(throttle);
  });

  it("serializes account reservations before recomputing spend and inserting", () => {
    const lock = sql.indexOf("pg_advisory_xact_lock");
    const usage = sql.indexOf("from public.ai_usage", lock);
    const reservations = sql.indexOf("from public.agent_runs as run", usage);
    const insert = sql.indexOf("insert into public.agent_runs", reservations);

    expect(lock).toBeGreaterThan(0);
    expect(usage).toBeGreaterThan(lock);
    expect(reservations).toBeGreaterThan(usage);
    expect(insert).toBeGreaterThan(reservations);
  });

  it("never grants more than the unspent account budget after active reservations", () => {
    expect(sql).toContain(
      "least( p_requested_budget, greatest(p_budget_cap - v_spent - v_reserved, 0) )",
    );
    expect(sql).toContain("run.status in ('queued', 'running')");
    expect(sql).toContain(
      "greatest(run.managed_budget_usd - coalesce(usage.spent, 0), 0)",
    );
  });

  it("claims one rest callback per running turn and resets the claim on re-entry", () => {
    expect(sql).toContain("create or replace function public.claim_agent_run_rest");
    expect(sql).toContain("and rest_claimed_at is null");
    expect(sql.match(/rest_claimed_at = null/g)).toHaveLength(2);
  });

  it("keeps both reservation and completion RPCs service-role only", () => {
    expect(sql).toContain(
      "grant execute on function public.create_agent_run_with_budget( uuid, timestamptz, numeric, numeric, jsonb ) to service_role",
    );
    expect(sql).toContain(
      "grant execute on function public.claim_agent_run_rest(uuid) to service_role",
    );
  });
});
