import { readFileSync } from "node:fs";
import { join } from "node:path";

import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

/**
 * MIN-293 — THE LOCAL TOUR TRIGGER, exercised on the real road.
 *
 * What is held here is **the ORDER of the guards**, and this cannot be deduced from any
 * kind. Each protects something different, and only one inversion is enough
 * to render it inoperative:
 *
 * - a run refused by its NATURE (anchor `pr`, webhook, routine, chain) must not
 * never be a claim: the claim passes it to `running`, and a run `running` that
 * no one plays is a dead run up to the guard dog;
 * - an interactive BYOK run can be claimed without depending on the mint platform;
 * - the LEASE is mounted LAST, because to issue is to revoke: to mount it
 * before the preparation would kill a round in progress only to discover that we
 * doesn't know how to prepare a new one.
 *
 * `app/**` is outside the scope of `vitest.config.ts`, but a test of `lib/`
 * can go get it — same doctrine as `local-exec-admission.test.ts`. Born
 * are mocked only the modules which EXIT the process: the base, the forge, the
 * preparation of the tour.
 */

const h = vi.hoisted(() => ({
  run: null as Record<string, unknown> | null,
  next: true,
  claimed: true,
  prepares: true,
  declined: true,
  calls: [] as string[],
  claimedDevice: null as string | null,
}));

/**
 * **The mint is a CONDITION OF EXISTENCE of the local path**, not a setting:
 * without `OPENROUTER_PROVISIONING_KEY`, the key which would go down on the machine
 * would be the platform key — uncapped, shared with Numo, transcription
 * and embeddings. The deployment that doesn't know how to hit a capped key
 * refuses the run, and the test checks it below.
 */
process.env.OPENROUTER_PROVISIONING_KEY ||= "cle-de-provisioning-de-test";

vi.mock("@/lib/server/api-auth", () => ({
  getAuthedUser: vi.fn(async () => ({ ok: true as const, user: { id: "user-1" } })),
}));

vi.mock("@/lib/server/agent/run-access", () => ({
  canReadAgentRun: vi.fn(async () => true),
}));

vi.mock("@/lib/server/agent/runs", () => ({
  getRun: vi.fn(async () => h.run),
  findQueuedLocalRunForMachine: vi.fn(async () => {
    h.calls.push("find");
    return h.next ? h.run : null;
  }),
  claimLocalRun: vi.fn(async (input: { userId: string; deviceId: string }) => {
    h.calls.push("claim");
    h.claimedDevice = input.deviceId;
    return h.claimed && h.run?.created_by === input.userId ? h.run : null;
  }),
  declineQueuedLocalRun: vi.fn(async () => {
    h.calls.push("decline");
    return h.declined ? { ...h.run, local_exec: false } : null;
  }),
  appendEvent: vi.fn(async () => {
    h.calls.push("event");
  }),
}));

vi.mock("@/lib/server/agent/launch", () => ({
  kickAgentDrain: vi.fn(() => {
    h.calls.push("drain");
  }),
}));

vi.mock("@/lib/supabase-service", () => ({
  getServiceClient: vi.fn(() => ({})),
}));

vi.mock("@/lib/server/agent/execute", () => ({
  executeAgentRun: vi.fn(
    async (
      _run: unknown,
      opts: { onLocalAssignment?: (job: unknown, meta: { repoFullName: string }) => void },
    ) => {
      h.calls.push("prepare");
      if (!h.prepares) return "failed";
      opts.onLocalAssignment?.({
        protocolVersion: 2,
        runId: "run-1",
        model: "anthropic/claude-sonnet-5",
        repoMode: "clone",
        authUrl: "https://x-access-token:ghs_x@github.com/mangue-dev/minddy.git",
      }, { repoFullName: "mangue-dev/minddy" });
      return "detached";
    },
  ),
}));

vi.mock("@/lib/server/agent/local-exec", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/server/agent/local-exec")>();
  return {
    ...actual,
    issueLocalExecToken: vi.fn(async () => {
      h.calls.push("lease");
      return { ok: true as const, token: "bail.hs256", gen: 3, expiresInSeconds: 900 };
    }),
  };
});

async function POST(body: unknown) {
  const route = await import("@/app/api/desktop/local-turn/route");
  return route.POST(
    new NextRequest("https://minddy.test/api/desktop/local-turn", {
      method: "POST",
      headers: { origin: "https://minddy.test", "content-type": "application/json" },
      body: JSON.stringify(body),
    }),
  );
}

const DEVICE_ID = "0123456789abcdef0123456789abcdef";
const direct = (runId = "run-1") => POST({ runId, deviceId: DEVICE_ID, projectIds: [] });

function row(over: Record<string, unknown> = {}) {
  return {
    id: "run-1",
    project_id: "proj-1",
    created_by: "user-1",
    key_mode: "platform",
    status: "queued",
    local_exec: true,
    budget_usd: null,
    triggered_by: "chat",
    routine_id: null,
    chain_id: null,
    pull_request_id: null,
    ...over,
  };
}

beforeEach(() => {
  h.run = row();
  h.next = true;
  h.claimed = true;
  h.prepares = true;
  h.declined = true;
  h.calls.length = 0;
  h.claimedDevice = null;
});

describe("POST /api/desktop/local-turn", () => {
  it("rend l'affectation, bail compris, et dans le bon ordre", async () => {
    const response = await direct();
    expect(response.status).toBe(200);

    const body = await response.json();
    expect(body).toMatchObject({
      runId: "run-1",
      projectId: "proj-1",
      repoFullName: "mangue-dev/minddy",
    });
    // The lease travels IN the job, never next to it: a local job IS a job that
    // carries a token (`isLocalJob`), and a second truth would eventually diverge.
    expect(body.job.controlToken).toBe("bail.hs256");
    // And the layout is NOT set by the server — it does not know any path to
    // cette machine.
    expect(body.job).not.toHaveProperty("layout");

    // To issue is to revoke: the lease comes AFTER preparation.
    expect(h.calls).toEqual(["claim", "prepare", "lease"]);
  });

  it("rend une affectation que la COQUILLE sait lire — l'aller-retour complet", async () => {
    /**
     * The test that was missing, and which would have cost less than a real test.
     *
     * The two halves of the contract live in two worlds that don't compile
     * together: the route is from the server, the parser is from the shell
     * (whose graph-type cannot reach `vm/protocol.ts`). Nothing, except
     * this test, only says that they are talking about the same thing — and the first time they
     * diverged, the refusal said “update the app”.
     */
    const { parseLocalTurnAssignment } = await import("@/lib/desktop/local-turn");
    const body = await (await direct()).json();
    const parsed = parseLocalTurnAssignment(body);

    expect(parsed, "la coquille refuserait cette affectation").not.toBeNull();
    expect(parsed?.runId).toBe("run-1");
    expect(parsed?.repoFullName).toBe("mangue-dev/minddy");
    expect(parsed?.job.controlToken).toBe("bail.hs256");
  });

  it("refuse un run qui n'est pas local, SANS le claim", async () => {
    h.run = row({ local_exec: false });
    expect((await direct()).status).toBe(409);
    expect(h.calls).toEqual([]);
  });

  it("refuse un run à CONTEXTE TIERS avant tout claim", async () => {
    // An anchor `pr`, webhook, routine, or string run reads text
    // potential attacker. In microVM, an injection costs a disposable VM; in
    // local, it's a shell on the developer's machine.
    for (const over of [
      { pull_request_id: "pr-1" },
      { routine_id: "rt-1" },
      { chain_id: "ch-1" },
      { triggered_by: "mention" },
      { triggered_by: "automation" },
    ]) {
      h.calls.length = 0;
      h.run = row(over);
      expect((await direct()).status).toBe(409);
      expect(h.calls, JSON.stringify(over)).toEqual([]);
    }
  });

  it("joue un run BYOK sans plafond ni mint de la plateforme", async () => {
    h.run = row({ key_mode: "byok" });
    expect((await direct()).status).toBe(200);
    expect(h.calls).toEqual(["claim", "prepare", "lease"]);
  });

  it("replie dans le cloud quand ce déploiement ne sait pas frapper de clé plafonnée", async () => {
    // In a disposable microVM, degradation to the platform key is
    // assumed. On someone's machine, that key is UNCAPPED and
    // shared with Numo, transcription and embeddings.
    const saved = process.env.OPENROUTER_PROVISIONING_KEY;
    delete process.env.OPENROUTER_PROVISIONING_KEY;
    try {
      const response = await direct();
      expect(response.status).toBe(200);
      expect(await response.json()).toMatchObject({
        status: "idle",
        declinedRunId: "run-1",
        reason: "no_mint",
      });
      expect(h.calls).toEqual(["decline", "event", "drain"]);
    } finally {
      process.env.OPENROUTER_PROVISIONING_KEY = saved;
    }
  });

  it("ne replie pas sous les pieds d'une autre coquille qui a déjà claim", async () => {
    const saved = process.env.OPENROUTER_PROVISIONING_KEY;
    delete process.env.OPENROUTER_PROVISIONING_KEY;
    h.declined = false;
    try {
      expect((await direct()).status).toBe(409);
      expect(h.calls).toEqual(["decline"]);
    } finally {
      process.env.OPENROUTER_PROVISIONING_KEY = saved;
    }
  });

  it("ne monte AUCUN bail quand la préparation échoue", async () => {
    // The opposite would kill the previous turn of this run (to emit is to revoke)
    // to return a token that no one can use.
    h.prepares = false;
    expect((await direct()).status).toBe(409);
    expect(h.calls).toEqual(["claim", "prepare"]);
  });

  it("rend 409 quand le run n'était plus claimable — une autre machine a gagné", async () => {
    h.claimed = false;
    expect((await direct()).status).toBe(409);
    expect(h.calls).toEqual(["claim"]);
  });

  it("la coquille réclame le plus ancien run de ses seuls projets attachés", async () => {
    const response = await POST({
      deviceId: "0123456789abcdef0123456789abcdef",
      projectIds: ["11111111-2222-4333-8444-555555555555"],
    });
    expect(response.status).toBe(200);
    expect((await response.json()).runId).toBe("run-1");
    expect(h.calls).toEqual(["find", "claim", "prepare", "lease"]);
    expect(h.claimedDevice).toBe(DEVICE_ID);
  });

  it("rend un état idle quand aucun tour local n'attend cette machine", async () => {
    h.next = false;
    const response = await POST({
      deviceId: "0123456789abcdef0123456789abcdef",
      projectIds: ["11111111-2222-4333-8444-555555555555"],
    });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ status: "idle" });
    expect(h.calls).toEqual(["find"]);
  });

  it("borne et valide ce qu'une machine annonce", async () => {
    for (const body of [
      { deviceId: "court", projectIds: ["11111111-2222-4333-8444-555555555555"] },
      { deviceId: "0123456789abcdef0123456789abcdef", projectIds: ["pas-un-uuid"] },
      {
        deviceId: "0123456789abcdef0123456789abcdef",
        projectIds: Array.from({ length: 51 }, () => "11111111-2222-4333-8444-555555555555"),
      },
    ]) {
      expect((await POST(body)).status).toBe(400);
    }
    expect(h.calls).toEqual([]);
  });

  it("rend 404 sur un run inconnu, sans dire qu'il est inconnu", async () => {
    h.run = null;
    expect((await direct()).status).toBe(404);
  });

  it("refuse un corps sans identifiant ni claim de machine", async () => {
    expect((await POST({})).status).toBe(400);
  });

  it("does not let a readable project colleague claim another member's local run", async () => {
    h.run = row({ created_by: "user-2" });
    expect((await direct()).status).toBe(409);
    expect(h.calls).toEqual(["claim"]);
  });
});

/**
 * AND THE SERVER HALF OF THE SAME DECISION: **the drain never takes a run
 * local.**
 *
 * Without this line, the user requests their machine, gets the cloud, and nothing
 * didn't tell him — the exact fault that this shipyard fights everywhere else. Read
 * in the SOURCE because the query is a string of `postgrest`: exercise it
 * would require a base, and what matters is that it is there.
 */
describe("le drain laisse les runs locaux à leur machine", () => {
  it("exclut `local_exec` de la file qu'il claim", () => {
    const source = readFileSync(join(__dirname, "drain.ts"), "utf8");
    expect(source).toContain('.not("local_exec", "is", true)');
  });
});

/**
 * AND THE BRANCH OF `execute.ts`, read in the source for the reason explained
 * `engine-wiring.test.ts`: exercising it would require a base, a forge, a
 * model catalog and a microVM. What we hold here is what
 * would break silently — a local branch that would still wake up a
 * machine, or which would run the loop instead of rendering the assignment.
 */
describe("la préparation locale d'`execute.ts`", () => {
  const source = readFileSync(join(__dirname, "execute.ts"), "utf8");

  it("does not wake a microVM for a local turn", () => {
    expect(source).toContain(
      "localTurn ? { sandbox: null, created: false } : await getOrCreateAgentSandbox(",
    );
  });

  it("rend l'affectation au lieu de lancer la boucle", () => {
    const local = source.slice(source.indexOf("if (localTurn) {"));
    expect(local).toContain("opts.onLocalAssignment?.(assignment, {");
    // The microVM loop comes AFTER, and is therefore never reached.
    expect(local.indexOf("opts.onLocalAssignment?.(assignment, {")).toBeLessThan(
      local.indexOf("startVmLoop("),
    );
  });

  /**
   * ⚠ **THE DEFECT THAT COSTED A REAL TEST.**
   *
   * The type of `onLocalAssignment` says `Omit<VmJob, "layout" | "bootstrapMs">`,
   * and a `Omit<>` does NOT remove ANYTHING from execution: the object still carried its
   * `layout: cloudLayout()`, and the machine received `/vercel/sandbox` paths.
   * The shell refused it - its guard `"layout" in job` is there for that - but the
   * message said “update the app”, so the fault was in the wrong one
   * endroit pendant tout un test.
   *
   * A `Omit<>` on a NETWORK boundary is a note of intent, not a
   * withdrawal. What does it is this `rest` of destructuring, and it is this that we
   * garde ici.
   */
  it("RETIRE le layout du cloud avant de rendre l'affectation", () => {
    expect(source).toContain("const { layout: _cloudLayout, ...assignment } = job;");
  });

  it("laisse le harness résoudre la baseline du diff qu'il est seul à connaître", () => {
    expect(source).toContain('const baselineHead = host ? await revParseHead(host) : "";');
  });

  it("n'écrit AUCUN nom de microVM sur la ligne d'un run local", () => {
    // `handleControlPlaneRequest` compares `sandbox_id` to the signed name of
    // the caller, and the watchdog questions the platform about this name:
    // an invented value would make both lie false.
    expect(source).toContain("...(sandbox ? { sandbox_id: sandboxName(sandbox)");
  });

  it("prépare en parallèle les lectures qui précèdent le job local", () => {
    // These operations do not depend on each other. They must be
    // launched before waiting for the target, otherwise each round trip lengthens the
    // time between the sending of the first token.
    const prepareAt = source.indexOf("const targetPromise = run.repo_link_id");
    const endpointAt = source.indexOf("const endpointPromise = resolveAgentApiKey(");
    const targetAwaitAt = source.indexOf("const target = await targetPromise;");
    expect(prepareAt).toBeGreaterThan(-1);
    expect(endpointAt).toBeGreaterThan(prepareAt);
    expect(targetAwaitAt).toBeGreaterThan(endpointAt);
    expect(source).toContain("const [issue, prRun, prefs, quotaAndLedger, endpoint] = await Promise.all([");
  });

  it("mints a least-privilege repository token for a local turn", () => {
    // The full target remains server-side for forge API operations. The local
    // execution transport receives only the read/write profile required by the
    // run, just like the cloud firewall.
    expect(source).toContain("const vmTarget = target\n      ? await resolveRepoCloneTarget(");
    expect(source).toContain('policy.repository === "read" ? "repo-read" : "repo-write"');
  });

  it("ne minte pas de clé fournisseur avant de rendre un job local", () => {
    expect(source).toContain('if (keyMode === "platform" && !localTurn)');
  });

  it("rend l'identité du dépôt avec l'affectation sans la résoudre une seconde fois", () => {
    // `null` = project without a linked repository: the shell validates the
    // attached folder as a plain git checkout, without remote comparison.
    expect(source).toContain("repoFullName: target?.repoFullName ?? null");
  });

  it("recouvre l'event de démarrage et ne publie pas de sandbox cloud en local", () => {
    expect(source).toContain("if (!localTurn) await runningEvent");
    expect(source).toContain('if (sandbox) await emit("status", { phase: "sandbox_ready" })');
    const localStart = source.indexOf("if (localTurn) {");
    const local = source.slice(localStart, source.indexOf("if (!sandbox) throw", localStart));
    expect(local).not.toContain("last_activity_at: new Date().toISOString()");
  });

  it("ne recharge pas les ressources du ticket pour une reprise opencode", () => {
    // Local tour memory lives in SQLite: boot prompt is not
    // rebuilt, so its resources should not delay steering.
    expect(source).toContain("includePromptContext: !run.checkpoint?.opencode?.sessionId");
    expect(source).toContain("includePromptContext\n      ? service");
    expect(source).toContain("Promise.resolve({ data: [] })");
  });
});
