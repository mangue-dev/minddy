import type { SupabaseClient } from "@supabase/supabase-js";
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * MIN-355 — THE WATCHDOG AND THE RUNS THAT CANNOT BE QUESTIONED.
 *
 * `reapDeadVmRuns` does not assume anything: it ASKS the platform if the process is alive.
 * A local run has no microVM or commands — there is no one to ask
 * question, never. It therefore fell into the “never launched” branch, whose
 * fifteen minutes is only valid because a microVM boot lasts twenty
 * seconds: three minutes of silence on a quarter-hour old run
 * were enough to declare him dead, publish "the agent has stopped" and charge
 * compute that no one has consumed.
 *
 * The two halves of the fix are here: the TERMINAL (that of the cloud case
 * undetermined, two hours) and the INVOICE (none — there was no microVM).
 */

const h = vi.hoisted(() => ({
  /** The runs surveyed on the platform. A local run never appears there. */
  probed: [] as string[],
  stamped: [] as Array<{ id: string; fields: Record<string, unknown> }>,
  events: [] as Array<{ runId: string; type: string }>,
  computeLines: [] as Array<{ runId: string; durationMs: number }>,
  revokedKeys: [] as string[],
  updates: [] as Array<Record<string, unknown>>,
}));

vi.mock("./sandbox", () => ({
  isLoopCommandAlive: vi.fn(async (sandboxId: string) => {
    h.probed.push(sandboxId);
    return null; // “we don’t know” — the case that this test brings into focus.
  }),
  stopSandboxByName: vi.fn(async () => {}),
}));

vi.mock("./runs", () => ({
  stampRun: vi.fn(async (id: string, fields: Record<string, unknown>) => {
    h.stamped.push({ id, fields });
    return { id };
  }),
  appendEvent: vi.fn(async (runId: string, type: string) => {
    h.events.push({ runId, type });
  }),
  notifyAgentRun: vi.fn(async () => {}),
  claimRun: vi.fn(async () => null),
}));

vi.mock("@/lib/server/usage", () => ({
  recordSandboxUsage: vi.fn(async (line: { runId: string; durationMs: number }) => {
    h.computeLines.push({ runId: line.runId, durationMs: line.durationMs });
  }),
}));

vi.mock("@/lib/server/ai-usage", () => ({
  spentFromLedger: vi.fn(async () => 0),
}));

vi.mock("./run-key", () => ({
  revokeRunKey: vi.fn(async (id: string) => {
    h.revokedKeys.push(id);
  }),
}));

vi.mock("./execute", () => ({ executeAgentRun: vi.fn(async () => {}) }));
vi.mock("./deployment", () => ({ currentDeploymentScope: () => null }));
vi.mock("./pr-landing", () => ({ SANDBOX_USAGE_SEQ_BASE: 900_000 }));

import { reapDeadVmRuns } from "./drain";

const MINUTE = 60_000;
const RUN_ID = "11111111-2222-4333-8444-555555555555";

/** A local run line, silent and launched from `agedMinutes`. */
function localRow(agedMinutes: number) {
  const at = new Date(Date.now() - agedMinutes * MINUTE).toISOString();
  return {
    id: RUN_ID,
    sandbox_id: null,
    loop_command_id: null,
    local_exec: true,
    created_by: "user-1",
    project_id: "proj-1",
    issue_id: "issue-1",
    provider_key_id: "key-1",
    run_id: RUN_ID,
    routine_id: null,
    continuations: 0,
    started_at: at,
    last_activity_at: at,
    cost_usd: 0,
  };
}

/** The bare essentials of the Supabase client: a read, then writes. */
function fakeService(rows: unknown[]): SupabaseClient {
  const write = {
    update: (fields: Record<string, unknown>) => {
      h.updates.push(fields);
      return { eq: () => ({ eq: () => ({}) }) };
    },
    select: () => ({
      eq: () => ({
        lt: () => ({ limit: async () => ({ data: rows }) }),
      }),
    }),
  };
  return { from: () => write } as unknown as SupabaseClient;
}

beforeEach(() => {
  h.probed.length = 0;
  h.stamped.length = 0;
  h.events.length = 0;
  h.computeLines.length = 0;
  h.revokedKeys.length = 0;
  h.updates.length = 0;
});

describe("un run qui joue sur la machine de l'utilisateur", () => {
  it("survit à vingt minutes de silence — le quart d'heure ne le vise plus", async () => {
    // The ordinary case that we broke: a sleeping Mac, a thinking tower. THE
    // harness writes `last_activity_at` every two minutes, but nothing
    // ensures that a machine responds continuously — and there is no one to probe.
    const { reaped } = await reapDeadVmRuns(fakeService([localRow(20)]));
    expect(reaped).toBe(0);
    expect(h.stamped).toEqual([]);
    expect(h.events).toEqual([]);
    // And we didn't ask anyone: there is no microVM or command.
    expect(h.probed).toEqual([]);
  });

  it("fails beyond the local recovery threshold", async () => {
    const { reaped } = await reapDeadVmRuns(fakeService([localRow(180)]));
    expect(reaped).toBe(1);
    expect(h.stamped[0]?.fields.status).toBe("failed");
    // The thread SAYS so — that's what distinguishes "the agent stopped and that's it"
    // why” of a conversation that no longer responds.
    expect(h.events).toEqual([{ runId: RUN_ID, type: "error" }]);
    // The key to the model is indeed revoked: it existed.
    expect(h.revokedKeys).toEqual(["key-1"]);
  });

  it("ne facture AUCUNE minute de microVM — il n'y en a pas eu", async () => {
    await reapDeadVmRuns(fakeService([localRow(180)]));
    expect(h.computeLines).toEqual([]);
  });

  it("keeps the boot threshold for a cloud VM without a command", async () => {
    // The “never launched” branch keeps its meaning where it has one: a function
    // dead between the claim and the launch, the initiation of which lasts twenty seconds.
    const cloud = { ...localRow(20), local_exec: false };
    await reapDeadVmRuns(fakeService([cloud]));
    expect(h.stamped[0]?.fields.status).toBe("failed");
    expect(h.computeLines).toHaveLength(1);
  });
});
