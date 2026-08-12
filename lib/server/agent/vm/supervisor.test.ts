import { readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { runOpencodeTurn, lastSeqByAggregate, type SupervisorDeps } from "./supervisor";
import { OpencodeClient } from "./opencode-client";
import { OPENCODE_ANCHOR_FILE, OPENCODE_TOOL_DIR } from "./opencode-config";
import { SUPERVISOR_URL_ENV } from "./opencode-tools";
import type { ControlPlaneClient } from "./control-plane-client";
import type { VmJob } from "./protocol";

/**
 * MIN-286 lot 1 — le superviseur, joué de bout en bout sur un FAUX serveur
 * opencode qui rejoue un vrai tour capturé.
 *
 * La forme du test suit celle de [turn.test.ts](turn.test.ts) : on ne moque que
 * ce qui SORT du process (le serveur opencode, le plan de contrôle, le dépôt), et
 * le superviseur tourne pour de vrai — y compris sa traduction d'events, qui rend
 * ici exactement les mêmes frames que le binaire a émises.
 *
 * Ce qu'il garde : un tour **rend toujours un rapport**, il **écrit son décor
 * avant de démarrer**, il **compte chaque round au ledger**, il **pousse**, et il
 * **exporte son journal** pour que le tour suivant reparte d'ailleurs.
 */

const FIXTURE = join(__dirname, "fixtures", "opencode-turn.ndjson");

function sseBody(): string {
  return (
    readFileSync(FIXTURE, "utf8")
      .trim()
      .split("\n")
      .map((line) => `data: ${line}\n\n`)
      .join("")
  );
}

const h = {
  files: [] as Array<{ path: string; content: string }>,
  env: {} as Record<string, string>,
  stopped: false,
  events: [] as Array<{ type: string; payload: Record<string, unknown> }>,
  usage: [] as Array<Record<string, unknown>>,
  live: [] as Array<Record<string, unknown>>,
  /** Routes appelées sur le faux serveur, dans l'ordre. */
  routes: [] as string[],
  /** Le journal que `/sync/history` rend. */
  history: [] as Record<string, unknown>[],
  replayed: null as Record<string, unknown> | null,
  healthy: true,
  pushed: true,
};

function cp(): ControlPlaneClient {
  return {
    emit: async (type, payload) => {
      h.events.push({ type, payload });
    },
    emitLive: (progress) => {
      h.live.push(progress as unknown as Record<string, unknown>);
    },
    recordUsage: async (line) => {
      h.usage.push(line as unknown as Record<string, unknown>);
    },
    saveCheckpointQuietly: async () => true,
    pullSteering: async () => [],
    hasPendingMessages: async () => false,
    checkInterrupt: async () => false,
    clearInterrupt: async () => {},
    budgetRemaining: async () => null,
    syncPlan: async () => {},
    callTool: async () => ({ result: {}, success: true }),
    repoAuthUrl: async () => "https://x-access-token:fresh@github.com/org/repo.git",
    reportTurn: async () => {},
  };
}

/** Le dépôt : seuls `commitAndPush` et `changedFiles` le touchent ici. */
function host() {
  return {
    exec: vi.fn(async (command: string) => {
      // `commitAndPush` enchaîne add / commit / push / rev-parse ; `changedFiles`
      // fait un diff. Ce qui compte est que le superviseur les appelle, pas ce
      // que git répond — la mécanique est testée chez `repo-host`.
      if (command.includes("rev-parse")) return { exitCode: 0, stdout: "sha-après\n", stderr: "" };
      if (command.includes("status --porcelain")) return { exitCode: 0, stdout: " M a.ts\n", stderr: "" };
      if (command.includes("push") && !h.pushed) {
        return { exitCode: 1, stdout: "", stderr: "remote rejected" };
      }
      if (command.includes("diff")) return { exitCode: 0, stdout: "", stderr: "" };
      return { exitCode: 0, stdout: "", stderr: "" };
    }),
    writeFiles: vi.fn(async () => {}),
    readFile: vi.fn(async () => null),
  } as never;
}

/** Le faux serveur opencode : les routes que le client appelle vraiment. */
function fakeFetch(): typeof fetch {
  return (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const path = url.replace(/^http:\/\/127\.0\.0\.1:\d+/, "").split("?")[0];
    h.routes.push(`${init?.method ?? "GET"} ${path}`);

    if (path === "/global/health") {
      return new Response(JSON.stringify({ healthy: h.healthy }), { status: 200 });
    }
    if (path === "/session" && init?.method === "POST") {
      return new Response(JSON.stringify({ id: "ses_neuve", projectID: "p" }), { status: 200 });
    }
    if (path.endsWith("/prompt_async")) return new Response(null, { status: 204 });
    if (path.endsWith("/abort")) return new Response("true", { status: 200 });
    if (path === "/sync/history") {
      return new Response(JSON.stringify({ events: h.history }), { status: 200 });
    }
    if (path === "/sync/replay") {
      h.replayed = JSON.parse(String(init?.body ?? "{}"));
      return new Response("{}", { status: 200 });
    }
    if (path === "/event") {
      return new Response(sseBody(), {
        status: 200,
        headers: { "content-type": "text/event-stream" },
      });
    }
    return new Response("{}", { status: 200 });
  }) as typeof fetch;
}

function deps(): SupervisorDeps {
  return {
    startServer: async (env) => {
      h.env = env;
      return {
        stop: async () => {
          h.stopped = true;
        },
      };
    },
    writeFile: async (path, content) => {
      h.files.push({ path, content });
    },
    client: (baseUrl) =>
      new OpencodeClient({ baseUrl, directory: "/vercel/sandbox/repo", fetchImpl: fakeFetch() }),
    // Le vrai plafond est à 60 s : ce test-ci vérifie ce qui se passe QUAND il
    // tombe, pas combien de temps il dure.
    bootTimeoutMs: 300,
  };
}

function job(over: Partial<VmJob> = {}): VmJob {
  return {
    runId: "11111111-2222-4333-8444-555555555555",
    ledgerRunId: "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee",
    projectId: "proj-1",
    appOrigin: "https://minddy.example",
    model: "deepseek/deepseek-v4-flash",
    baseUrl: "https://openrouter.ai/api/v1",
    provider: "openrouter",
    llmPlaceholderKey: "placeholder",
    reasoningLevel: "medium",
    contextWindow: 200_000,
    inputUsdPerMTok: 0.3,
    pricing: { inputUsdPerMTok: 0.3, outputUsdPerMTok: 1.2 },
    anchor: "issue",
    writesToRepo: true,
    interactive: true,
    chain: false,
    imageInput: false,
    webSearch: true,
    webSearchMax: 5,
    subagents: {
      models: false,
      favorites: [],
      maxParallel: 2,
      allowedIds: [],
      abovePlanIds: [],
      maxMultiplier: null,
    },
    messages: [],
    instructions: { paths: [], bytes: 0 },
    usageSeqStart: 7,
    parkedForSubagents: false,
    editedPaths: [],
    repoTouched: false,
    prInlineComments: 0,
    baseBranch: "main",
    workBranch: "minddy/agent/min-42-abcd1234",
    authUrl: "https://x-access-token:ghs_SECRET@github.com/org/repo.git",
    commitRef: "MIN-42",
    bootstrapMs: 21_500,
    filesFromSha: "sha-avant",
    locale: "fr",
    feature: "agent_code",
    checkpointMaxBytes: 3_200_000,
    ...over,
  };
}

const run = (over: Partial<VmJob> = {}) =>
  runOpencodeTurn(
    job(over),
    { prompt: "fais le ticket", anchorInstructions: "# Ancrage minddy\nMIN-42" },
    cp(),
    host(),
    deps(),
  );

beforeEach(() => {
  h.files = [];
  h.env = {};
  h.stopped = false;
  h.events = [];
  h.usage = [];
  h.live = [];
  h.routes = [];
  h.history = [
    { aggregate_id: "ses_neuve", seq: 3, type: "message.created", data: {} },
    { aggregate_id: "ses_neuve", seq: 4, type: "message.updated", data: {} },
  ];
  h.replayed = null;
  h.healthy = true;
  h.pushed = true;
});

describe("le décor, posé avant le premier octet de serveur", () => {
  it("écrit l'ancrage et les 32 tools de domaine hors du dépôt", async () => {
    await run();
    const anchor = h.files.find((f) => f.path === OPENCODE_ANCHOR_FILE);
    expect(anchor?.content).toContain("Ancrage minddy");
    const tools = h.files.filter((f) => f.path.startsWith(OPENCODE_TOOL_DIR));
    expect(tools.length).toBeGreaterThan(30);
    expect(tools.some((f) => f.path.endsWith("/read_issue.ts"))).toBe(true);
    for (const f of h.files) expect(f.path.startsWith("/vercel/sandbox/repo/")).toBe(false);
  });

  it("donne au serveur la config du tour et l'adresse du pont", async () => {
    await run();
    expect(JSON.parse(h.env.OPENCODE_CONFIG_CONTENT).model).toBe(
      "minddy/deepseek/deepseek-v4-flash",
    );
    // Les 32 tools générés lisent cette variable : sans elle, ils rendent une
    // phrase au modèle au lieu d'appeler quoi que ce soit.
    expect(h.env[SUPERVISOR_URL_ENV]).toMatch(/^http:\/\/127\.0\.0\.1:\d+$/);
    expect(h.env.OPENCODE_CONFIG_CONTENT).not.toContain("ghs_SECRET");
  });

  it("arrête toujours le serveur, même quand le tour échoue", async () => {
    h.healthy = false;
    const report = await run();
    expect(report.status).toBe("error");
    expect(report.errorMessage).toContain("healthy");
    expect(h.stopped).toBe(true);
    // Un tour qui n'a pas pu commencer facture quand même sa microVM : elle a
    // tourné pendant l'amorçage (cf. `VmJob.bootstrapMs`).
    expect(report.sandboxMs).toBeGreaterThanOrEqual(21_500);
  });
});

describe("le tour", () => {
  it("crée une session, poste le prompt et suit le flux jusqu'à `idle`", async () => {
    const report = await run();
    expect(h.routes).toContain("POST /session");
    expect(h.routes.some((r) => r.endsWith("/prompt_async"))).toBe(true);
    expect(report.status).toBe("completed");
  });

  it("traduit le flux en events de NOTRE fil", async () => {
    await run();
    expect(h.events.map((e) => e.type)).toEqual(["tool_call", "tool_result"]);
    expect(h.events[0].payload).toMatchObject({ name: "read_issue", issue: "MIN-286" });
  });

  it("écrit une ligne de ledger par round, numérotée depuis le job", async () => {
    const report = await run();
    expect(h.usage.length).toBeGreaterThan(0);
    // `usageSeqStart` vaut 7 : les lignes du tour continuent la numérotation du
    // run, elles ne repartent pas de zéro (c'est ce que `seq` sert à dire).
    expect(h.usage[0].seq).toBe(7);
    expect(h.usage[0].estimated).toBe(false);
    expect(report.costUsd).toBeGreaterThan(0);
    expect(report.costUsd).toBeCloseTo(
      h.usage.reduce((sum, l) => sum + Number(l.cost ?? 0), 0),
      10,
    );
  });

  it("marque l'usage `estimated` quand le job n'a pas de prix", async () => {
    // Sans prix déclaré, opencode calcule sur un catalogue qu'il n'a pas et rend
    // zéro : une ligne à zéro marquée « exacte » serait un mensonge définitif.
    await run({ pricing: undefined });
    expect(h.usage.every((l) => l.estimated === true)).toBe(true);
  });

  it("pousse le travail et rend la tête poussée", async () => {
    const report = await run();
    expect(report.pushed?.committed).toBe(true);
    expect(report.workBranch).toBe("minddy/agent/min-42-abcd1234");
  });

  it("ne pousse RIEN sur une session de relecture", async () => {
    const report = await run({ writesToRepo: false, anchor: "pr" });
    expect(report.pushed).toBeNull();
  });

  it("dit un push raté au lieu de perdre le tour", async () => {
    h.pushed = false;
    const report = await run();
    expect(report.pushError).toBeTruthy();
    // Le travail reste dans la microVM et le tour suivant le repoussera : un
    // échec de push n'est pas une raison de perdre l'état du tour.
    expect(report.checkpoint).toBeTruthy();
  });
});

describe("la reprise", () => {
  it("exporte le journal du tour pour que le suivant reparte d'ailleurs", async () => {
    const report = await run();
    const state = (report.checkpoint as { opencode?: { sessionId: string; seq: Record<string, number> } })
      .opencode;
    expect(state?.sessionId).toBe("ses_neuve");
    // Le curseur, agrégat par agrégat : c'est lui qui rend l'export incrémental
    // (5 events pour un tour, au lieu de tout l'historique).
    expect(state?.seq).toEqual({ ses_neuve: 4 });
  });

  it("rejoue le journal du tour précédent, en camelCase", async () => {
    await run({
      opencode: {
        sessionId: "ses_ancienne",
        events: [{ aggregateID: "ses_ancienne", seq: 1, type: "session.created", data: {} }],
        seq: { ses_ancienne: 1 },
      },
    });
    expect(h.routes).toContain("POST /sync/replay");
    // Le piège du dossier, et il est dans le schéma d'opencode : l'export rend du
    // snake_case, le replay attend du camelCase.
    expect(JSON.stringify(h.replayed)).toContain("aggregateID");
    expect(JSON.stringify(h.replayed)).not.toContain("aggregate_id");
    // Session REPRISE : on n'en crée pas une deuxième.
    expect(h.routes).not.toContain("POST /session");
  });

  it("normalise le curseur d'export", () => {
    expect(
      lastSeqByAggregate({ a: 2 }, [
        { aggregateID: "a", seq: 5 },
        { aggregateID: "b", seq: 1 },
        { aggregateID: "a", seq: 3 },
        { seq: 9 },
      ]),
    ).toEqual({ a: 5, b: 1 });
  });
});
