import { describe, expect, it } from "vitest";

import { canonicalSql, readMigration } from "@/test/sql-migrations";
import {
  NUMO_JOB_DURATION_MS,
  NUMO_STEP_RESERVE_MS,
  numoJobDeadline,
  numoTurnShouldHandOff,
} from "./job-deadline";

const sql = canonicalSql(readMigration("20270109200128_numo_turn_handoff.sql"));

describe("Numo turn handoff between jobs (MIN-1010)", () => {
  it("re-queues only the job's own running claim, due at once", () => {
    expect(sql).toContain("create function public.hand_off_numo_turn");
    expect(sql).toContain("set status = 'queued'");
    expect(sql).toContain("claim_token = null");
    expect(sql).toContain("not_before = now()");
    expect(sql).toContain("where id = p_turn_id and claim_token = p_claim_token and status = 'running'");
  });

  it("returns the attempt the claim took and keeps the stored checkpoint", () => {
    expect(sql).toContain("attempts = greatest(attempts - 1, 0)");
    expect(sql).not.toContain("checkpoint =");
    expect(sql).not.toContain("public.conversations");
  });

  it("is callable by the service role alone", () => {
    expect(sql).toContain("revoke all on function public.hand_off_numo_turn(uuid, uuid) from public, anon, authenticated");
    expect(sql).toContain("grant execute on function public.hand_off_numo_turn(uuid, uuid) to service_role");
  });

  it("hands off once the time left no longer covers the next step", () => {
    const start = 1_000_000;
    const deadline = numoJobDeadline(start);
    expect(deadline).toBeLessThan(start + NUMO_JOB_DURATION_MS);
    const lastGeneration = deadline - NUMO_STEP_RESERVE_MS.generation;
    expect(numoTurnShouldHandOff(deadline, "generation", lastGeneration)).toBe(false);
    expect(numoTurnShouldHandOff(deadline, "generation", lastGeneration + 1)).toBe(true);
    expect(numoTurnShouldHandOff(deadline, "tool", lastGeneration + 1)).toBe(false);
    expect(numoTurnShouldHandOff(deadline, "tool", deadline - NUMO_STEP_RESERVE_MS.tool + 1)).toBe(true);
  });
});
