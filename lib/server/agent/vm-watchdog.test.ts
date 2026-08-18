import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * MIN-224 — the watchdog does not PRESUME, it observes.
 *
 * WHAT IT REPLACES, and why the replacement is not cosmetic.
 * The presumptive sweeper (removed in MIN-225) declared everything dead run
 * `running` silent for twenty
 * minutes, then stole his claim. This was tenable as long as a chunk lasted
 * five minutes. A tower that lives in the microVM can work for hours without
 * writing an event — a `npm test` that lasts, a model that thinks — and the old
 * sweeper would kill it at full health, to restart a SECOND loop on the
 * same microVM. The second checkpoint would overwrite the first.
 *
 * The new one asks the platform if the process is alive. Three answers, and the
 * two that are not "dead" do NOTHING. This is what these tests keep: a
 * watchdog which concludes with silence of the API is worse than no watchdog of
 * guard at all.
 */

const h = vi.hoisted(() => ({
  /** What the platform responds to: true alive, false dead, null “we don’t know”. */
  alive: null as boolean | null,
  /** The stamp is refused: someone has completed the run in the meantime. */
  stampRefused: false,
  probes: [] as Array<{ sandbox: string; command: string }>,
  events: [] as Array<{ runId: string; type: string; payload: Record<string, unknown> }>,
  stamped: [] as Array<{ runId: string; fields: Record<string, unknown> }>,
  notifications: [] as string[],
  revoked: [] as string[],
  rows: [] as Array<Record<string, unknown>>,
  updates: [] as Array<Record<string, unknown>>,
  /** The compute lines written — the half of the bill that no one
 * else holds on this path. */
  compute: [] as Array<Record<string, unknown>>,
  /** What the ledger responds to; `null` = read failed. */
  ledgerSpend: null as number | null,
  /** The order of the two billing gestures, to keep “compute first”. */
  order: [] as string[],
}));

vi.mock("@/lib/server/usage", () => ({
  recordSandboxUsage: vi.fn(async (params: Record<string, unknown>) => {
    h.order.push("compute");
    h.compute.push(params);
  }),
}));

vi.mock("@/lib/server/ai-usage", () => ({
  spentFromLedger: vi.fn(async () => {
    h.order.push("ledger");
    return h.ledgerSpend;
  }),
}));

vi.mock("./sandbox", () => ({
  isLoopCommandAlive: vi.fn(async (sandbox: string, command: string) => {
    h.probes.push({ sandbox, command });
    return h.alive;
  }),
  stopSandboxByName: vi.fn(async () => {}),
}));

vi.mock("./runs", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./runs")>()),
  appendEvent: vi.fn(async (runId: string, type: string, payload: Record<string, unknown>) => {
    h.events.push({ runId, type, payload });
  }),
  stampRun: vi.fn(async (runId: string, fields: Record<string, unknown>) => {
    h.stamped.push({ runId, fields });
    return h.stampRefused ? null : ({ id: runId } as never);
  }),
  notifyAgentRun: vi.fn(async (_run: unknown, type: string) => {
    h.notifications.push(type);
  }),
  claimRun: vi.fn(async () => null),
}));

vi.mock("./run-key", () => ({
  revokeRunKey: vi.fn(async (hash: string) => {
    h.revoked.push(hash);
  }),
}));

vi.mock("./execute", () => ({ executeAgentRun: vi.fn(async () => "completed") }));

const { reapDeadVmRuns } = await import("./drain");

/** Minimal Supabase client: the SELECT of the watchdog and the UPDATE of the key. */
function fakeService() {
  const builder = {
    select: () => builder,
    eq: () => builder,
    not: () => builder,
    lt: () => builder,
    limit: async () => ({ data: h.rows }),
    update: (fields: Record<string, unknown>) => {
      h.updates.push(fields);
      return { eq: async () => ({}) };
    },
  };
  return { from: () => builder } as never;
}

/** The tour started an hour ago — that's what the microVM cost. */
const STARTED_MS_AGO = 60 * 60_000;

const ROW = {
  id: "run-1",
  sandbox_id: "agent-run-1",
  loop_command_id: "cmd-42",
  created_by: "user-1",
  project_id: "proj-1",
  issue_id: "issue-1",
  provider_key_id: "hash-1",
  run_id: "ledger-run-1",
  routine_id: null,
  continuations: 0,
  started_at: new Date(Date.now() - STARTED_MS_AGO).toISOString(),
  last_activity_at: new Date(Date.now() - STARTED_MS_AGO).toISOString(),
  cost_usd: 0,
};

/** A date `ms` old, in base format. */
const agoIso = (ms: number) => new Date(Date.now() - ms).toISOString();

beforeEach(() => {
  h.alive = null;
  h.stampRefused = false;
  h.probes.length = 0;
  h.events.length = 0;
  h.stamped.length = 0;
  h.notifications.length = 0;
  h.revoked.length = 0;
  h.updates.length = 0;
  h.compute.length = 0;
  h.order.length = 0;
  h.ledgerSpend = null;
  h.rows = [{ ...ROW }];
});

describe("reapDeadVmRuns", () => {
  it("ne touche à RIEN quand le process vit, si silencieux soit-il", async () => {
    h.alive = true;
    const { reaped } = await reapDeadVmRuns(fakeService());
    expect(h.probes).toEqual([{ sandbox: "agent-run-1", command: "cmd-42" }]);
    expect(reaped).toBe(0);
    expect(h.stamped).toHaveLength(0);
    expect(h.events).toHaveLength(0);
  });

  it("ne touche à RIEN quand la plateforme ne sait pas répondre", async () => {
    // microVM not found, session expired, API down. Concluding here would put
    // to the rest of the towers in full health, on the sole faith of silence.
    h.alive = null;
    const { reaped } = await reapDeadVmRuns(fakeService());
    expect(reaped).toBe(0);
    expect(h.stamped).toHaveLength(0);
  });

  it("sur un process MORT : la ligne repose, et le fil le dit", async () => {
    h.alive = false;
    const { reaped } = await reapDeadVmRuns(fakeService());
    expect(reaped).toBe(1);
    expect(h.stamped[0].fields).toMatchObject({
      status: "completed",
      loop_command_id: null,
    });
    expect(h.events[0]).toMatchObject({ runId: "run-1", type: "error" });
    expect(h.events[0].payload.code).toBe("turnLost");
    expect(h.notifications).toEqual(["agent_failed"]);
  });

  /**
 * THE FALSE POSITIVE THAT WE READ IN PRODUCTION (run of PR 51). The stamp can only
 * fail one way — its guard `status in ('running')` no longer matches,
 * that is, someone has just finished this run. The round then
 * did not stop: it ENDED. Announcing your loss before knowing it wrote a
 * failure message under a conversation that had ended successfully.
 */
  it("ne raconte RIEN quand la conclusion lui a été soufflée entre-temps", async () => {
    h.alive = false;
    h.stampRefused = true;
    const { reaped } = await reapDeadVmRuns(fakeService());
    expect(reaped).toBe(0);
    expect(h.events).toEqual([]);
    expect(h.notifications).toEqual([]);
  });

  it("NE TOUCHE PAS au checkpoint — c'est de lui que le tour suivant repart", async () => {
    // The loop saves one every five minutes, at a round boundary
    // safe. Crush it (or erase it, like the old street sweeper at the end of his rope)
    // attempts) would lose everything the round had understood.
    h.alive = false;
    await reapDeadVmRuns(fakeService());
    expect(Object.keys(h.stamped[0].fields)).not.toContain("checkpoint");
  });

  it("révoque la clé du run mort", async () => {
    h.alive = false;
    await reapDeadVmRuns(fakeService());
    expect(h.revoked).toEqual(["hash-1"]);
    expect(h.updates).toContainEqual({ provider_key_id: null });
  });

  it("FACTURE le compute de la microVM — sinon il disparaît en silence", async () => {
    // In the new form, the wall-clock is held by the loop and wound up
    // in his end of turn report; the function no longer charges anything for its
    // side. A turn whose process dies never returns this report: without this
    // line, wakeup, clone and VM times come out of all
    // meters, and no one would notice until the Vercel bill.
    h.alive = false;
    await reapDeadVmRuns(fakeService());
    expect(h.compute).toHaveLength(1);
    expect(h.compute[0]).toMatchObject({
      // The identifier of the LEDGER, not that of the line — it is under it that the
      // expenditure of a repeated run is counted.
      runId: "ledger-run-1",
      feature: "sandbox_compute",
      projectId: "proj-1",
      billTo: { userId: "user-1" },
    });
    expect(h.compute[0].durationMs as number).toBeGreaterThanOrEqual(STARTED_MS_AGO);
  });

  it("range le compute d'une ROUTINE avec elle, pas sous « Agents »", async () => {
    h.alive = false;
    h.rows = [{ ...ROW, routine_id: "routine-1" }];
    await reapDeadVmRuns(fakeService());
    expect(h.compute[0]).toMatchObject({ feature: "routine_compute" });
  });

  it("ne facture rien sans date de départ — mieux vaut zéro qu'un chiffre inventé", async () => {
    h.alive = false;
    h.rows = [{ ...ROW, started_at: null }];
    const { reaped } = await reapDeadVmRuns(fakeService());
    // The run is well put to rest: the footage is a sideline, never a
    // conclusion prerequisite.
    expect(reaped).toBe(1);
    expect(h.compute).toHaveLength(0);
  });

  /**
 * MIN-286 — the run line said "free" for a turn that was not.
 *
 * `cost_usd` is only written by HEALTHY outputs: a turn whose process
 * dies leaves it at its value before the turn, therefore at zero on one first
 * round. Measured in production during the opencode observation window:
 * three runs harvested, 0 on the line, $0.159 on the ledger. The invoice and the
 * ceilings were safe (they already read the ledger); what lied was this
 * that a human reread after the incident.
 */
  it("recolle `cost_usd` au ledger sur un run moissonné", async () => {
    h.alive = false;
    h.ledgerSpend = 0.0678;
    await reapDeadVmRuns(fakeService());
    expect(h.updates).toContainEqual({ cost_usd: 0.0678 });
    // The microVM compute BEFORE rereading, otherwise the sum reread
    // would not carry the line we just wrote.
    expect(h.order).toEqual(["compute", "ledger"]);
  });

  it("ne fait jamais RECULER la dépense affichée", async () => {
    // Ledger and column are two lower bounds: the larger is the truer. A
    // late ledger (a line not yet written) must not erase what the
    // column already carried.
    h.alive = false;
    h.rows = [{ ...ROW, cost_usd: 0.5 }];
    h.ledgerSpend = 0.01;
    await reapDeadVmRuns(fakeService());
    expect(h.updates).not.toContainEqual({ cost_usd: 0.01 });
  });

  it("ne touche pas à la colonne quand le ledger ne répond pas", async () => {
    // `spentFromLedger` returns `null`, never 0, precisely so that we don't confuse
    // not “failed read” with “this run spent nothing”.
    h.alive = false;
    h.ledgerSpend = null;
    const { reaped } = await reapDeadVmRuns(fakeService());
    expect(reaped).toBe(1);
    expect(h.updates.some((u) => "cost_usd" in u)).toBe(false);
  });

  it("ne facture rien sur un process VIVANT", async () => {
    h.alive = true;
    await reapDeadVmRuns(fakeService());
    expect(h.compute).toHaveLength(0);
  });

  it("sans identifiant de commande, il n'interroge rien — mais il finit par conclure", async () => {
    // `startVmLoop` writes this identifier at the end of boot (~22 s). One line
    // which still does not have it after a quarter of an hour is a dead function
    // between the claim and the launch: there is no process to probe, and there is no
    // will never have one. This is the case that the old query didn't even look at —
    // the run remained `running` forever.
    h.rows = [{ ...ROW, loop_command_id: null }];
    const { reaped } = await reapDeadVmRuns(fakeService());
    expect(h.probes).toHaveLength(0);
    expect(reaped).toBe(1);
    expect(h.stamped[0].fields).toMatchObject({ status: "completed" });
  });

  it("laisse un amorçage EN COURS tranquille", async () => {
    // Twenty seconds of life: the loop may be starting. THE
    // delay is counted on `started_at` (placed on the claim) and not on silence — a
    // re-queued run with a deadline ahead arrives at the claim with a clock
    // of already old activity, and counting it there would kill him in the middle of waking up.
    h.rows = [{ ...ROW, loop_command_id: null, started_at: agoIso(20_000) }];
    const { reaped } = await reapDeadVmRuns(fakeService());
    expect(reaped).toBe(0);
  });

  it("l'ignorance ne dure pas TOUJOURS : au bout de deux heures, elle vaut décès", async () => {
    // A destroyed microVM responds “not found” on each pass, so `null`,
    // so nothing: the run remained `running` until a human deleted it
    // base. What was missing was not a bolder verdict, it was a milestone.
    h.alive = null;
    h.rows = [{ ...ROW, started_at: agoIso(3 * 60 * 60_000), last_activity_at: agoIso(3 * 60 * 60_000) }];
    const { reaped } = await reapDeadVmRuns(fakeService());
    expect(reaped).toBe(1);
    expect(h.events[0].payload.code).toBe("turnLost");
  });

  it("mais elle dure assez pour un tour qui travaille en silence", async () => {
    // An hour without a sign, the platform unreachable: a single round can
    // last this (a never-ending `npm test`). We wait.
    h.alive = null;
    h.rows = [{ ...ROW, started_at: agoIso(60 * 60_000), last_activity_at: agoIso(60 * 60_000) }];
    const { reaped } = await reapDeadVmRuns(fakeService());
    expect(reaped).toBe(0);
  });
});
