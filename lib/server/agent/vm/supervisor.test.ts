import { readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { runOpencodeTurn, lastSeqByAggregate, type SupervisorDeps } from "./supervisor";
import { OpencodeClient } from "./opencode-client";
import { takeGeneration } from "./llm-proxy";
import { OPENCODE_ANCHOR_FILE, OPENCODE_TOOL_DIR } from "./opencode-config";
import { SUPERVISOR_URL_ENV } from "./opencode-tools";
import { startToolBridge } from "./tool-bridge";
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

/** La session du tour capturé — celle que le faux serveur doit rendre. */
const PARENT = "ses_00999fb08ffe1CH0pZOeoJnbos";
/** Une session FILLE, comme le `task` d'opencode en ouvre une. */
const CHILD = "ses_fille";

function fixtureLines(): string[] {
  return readFileSync(FIXTURE, "utf8").trim().split("\n");
}

/**
 * Le flux du faux serveur : le tour capturé, avec les frames du test INSÉRÉES
 * AVANT le `session.idle` de la mère. Les mettre après ne prouverait rien — la
 * boucle est déjà sortie, et le test passerait sans jamais les lire.
 */
function sseBody(): string {
  const lines = fixtureLines();
  const idle = lines.findIndex((line) => line.includes('"session.idle"'));
  const at = idle === -1 ? lines.length : idle;
  return [...lines.slice(0, at), ...h.extraFrames, ...lines.slice(at)]
    .map((line) => `data: ${line}\n\n`)
    .join("");
}

/** Un round assistant terminé, tel que `message.updated` le rend. */
function childRound(over: Record<string, unknown> = {}): string {
  return JSON.stringify({
    type: "message.updated",
    properties: {
      sessionID: CHILD,
      info: {
        id: "msg_fille_1",
        sessionID: CHILD,
        role: "assistant",
        finish: "stop",
        modelID: "deepseek/deepseek-v4-flash",
        cost: 0.002,
        tokens: { input: 100, output: 20, reasoning: 0, cache: { read: 10, write: 5 } },
        ...over,
      },
    },
  });
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
  /** Frames ajoutées au flux capturé (sessions filles, erreurs…). */
  extraFrames: [] as string[],
  /** Ce que le superviseur a répondu aux permissions, dans l'ordre. */
  permissionReplies: [] as Array<{ id: string; reply: string; message?: string }>,
  /** Questions écartées (`/question/:id/reject`). */
  questionsRejected: [] as string[],
  /** Le serveur refuse la réponse à une permission. */
  permissionReplyFails: false,
  proxyClosed: false,
  /** L'horloge du superviseur : `tick` la fait avancer à chaque lecture, ce qui
   *  est le seul moyen de faire tomber un sondage (steering, budget) dans un test
   *  qui dure trois millisecondes. À 0, le temps ne bouge pas. */
  clock: 1_000_000,
  tick: 0,
  /** La file de steering du plan de contrôle, drainée par `pullSteering`. */
  steering: [] as string[],
  /** Le drapeau d'interruption (« Stop »). */
  interrupt: false,
  /** Combien de fois le superviseur l'a EFFACÉ (un stop + message le consomme). */
  interruptCleared: 0,
  /** Les prompts postés à la session, dans l'ordre. */
  prompts: [] as string[],
  /** Combien de fois la session a été coupée. */
  aborts: 0,
  /** Ce que le plan de contrôle répond sur le restant de budget. */
  remainingUsd: null as number | null,
  budgetReads: 0,
  /** Les tools que le superviseur exécute lui-même, tels qu'il les donne au pont. */
  supervisorTools: {} as Record<string, (args: Record<string, unknown>) => Promise<unknown>>,
  /** Appels au plan de contrôle (`cp.callTool`), dans l'ordre. */
  toolCalls: [] as Array<{ name: string; body: Record<string, unknown> }>,
  /** Les commandes passées au dépôt, dans l'ordre — l'ordre EST ce qui se teste
   *  pour les jobs de fond : tués avant le `git add -A`, jamais après. */
  exec: [] as string[],
  /** Ce que le proxy local a vu passer chez le fournisseur. */
  generations: [] as Array<{
    id: string | null;
    model: string;
    outputTokens: number | null;
    costUsd: number | null;
  }>,
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
    pullSteering: async () => h.steering.splice(0),
    hasPendingMessages: async () => h.steering.length > 0,
    checkInterrupt: async () => h.interrupt,
    clearInterrupt: async () => {
      h.interrupt = false;
      h.interruptCleared += 1;
    },
    budgetRemaining: async () => {
      h.budgetReads += 1;
      return h.remainingUsd;
    },
    syncPlan: async () => {},
    callTool: async (name, body) => {
      h.toolCalls.push({ name, body });
      return { result: { url: "https://forge/pr/7" }, success: true };
    },
    repoAuthUrl: async () => "https://x-access-token:fresh@github.com/org/repo.git",
    reportTurn: async () => {},
  };
}

/** Le dépôt : seuls `commitAndPush` et `changedFiles` le touchent ici. */
function host() {
  return {
    exec: vi.fn(async (command: string) => {
      h.exec.push(command);
      // Le lanceur d'un job de fond rend son PID sur stdout (`background.ts`).
      if (command.includes("setsid")) return { exitCode: 0, stdout: "4242\n", stderr: "" };
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
      // La session rendue est CELLE DU FLUX capturé : c'est ce qui fait du tour
      // rejoué un tour de la mère, et non un tour d'inconnue.
      return new Response(JSON.stringify({ id: PARENT, projectID: "p" }), { status: 200 });
    }
    if (path.endsWith("/prompt_async")) {
      const body = JSON.parse(String(init?.body ?? "{}")) as { parts?: Array<{ text?: string }> };
      h.prompts.push((body.parts ?? []).map((part) => part.text ?? "").join(""));
      return new Response(null, { status: 204 });
    }
    if (path.startsWith("/permission/") && path.endsWith("/reply")) {
      const body = JSON.parse(String(init?.body ?? "{}")) as { reply: string; message?: string };
      h.permissionReplies.push({ id: path.split("/")[2], ...body });
      if (h.permissionReplyFails) return new Response("gone", { status: 404 });
      return new Response("true", { status: 200 });
    }
    if (path.startsWith("/question/") && path.endsWith("/reject")) {
      h.questionsRejected.push(path.split("/")[2]);
      return new Response("true", { status: 200 });
    }
    if (path.endsWith("/abort")) {
      h.aborts += 1;
      return new Response("true", { status: 200 });
    }
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
    /**
     * Le proxy, en mémoire : il rend ce que `h.generations` déclare et applique
     * le MÊME appariement que le vrai (`takeGeneration`), qui est testé à part
     * chez [llm-proxy.test.ts](llm-proxy.test.ts). Ce qu'on garde ici, c'est le
     * branchement — que la ligne de ledger porte l'identifiant et le coût vus
     * chez le fournisseur.
     */
    startProxy: async () => ({
      url: "http://127.0.0.1:9999",
      take: (round) => takeGeneration(h.generations, round),
      close: async () => {
        h.proxyClosed = true;
      },
    }),
    // Le pont de tools est le VRAI ([tool-bridge.ts](tool-bridge.ts)), sur un
    // port libre : en production il en tient un fixe (4097), et deux tests qui
    // tournent en parallèle se le disputeraient. On ne l'intercepte que pour
    // GARDER les tools que le superviseur exécute lui-même : `create_pr` n'est
    // appelable que par le modèle, et aucun modèle ne tourne ici.
    startToolBridge: async (opts) => {
      h.supervisorTools = (opts.supervisorTools ?? {}) as typeof h.supervisorTools;
      return await startToolBridge(opts);
    },
    toolBridgePort: 0,
    // Le vrai plafond est à 60 s : ce test-ci vérifie ce qui se passe QUAND il
    // tombe, pas combien de temps il dure.
    bootTimeoutMs: 300,
    now: () => (h.clock += h.tick),
  };
}

function job(over: Partial<VmJob> = {}): VmJob {
  return {
    runId: "11111111-2222-4333-8444-555555555555",
    ledgerRunId: "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee",
    projectId: "proj-1",
    appOrigin: "https://minddy.example",
    engine: "opencode",
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

const run = (over: Partial<VmJob> = {}, moreDeps: Partial<SupervisorDeps> = {}) =>
  runOpencodeTurn(
    job(over),
    { prompt: "fais le ticket", anchorInstructions: "# Ancrage minddy\nMIN-42" },
    cp(),
    host(),
    { ...deps(), ...moreDeps },
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
  h.extraFrames = [];
  h.generations = [];
  h.proxyClosed = false;
  h.remainingUsd = null;
  h.budgetReads = 0;
  h.clock = 1_000_000;
  h.tick = 0;
  h.steering = [];
  h.interrupt = false;
  h.interruptCleared = 0;
  h.prompts = [];
  h.aborts = 0;
  h.permissionReplies = [];
  h.questionsRejected = [];
  h.permissionReplyFails = false;
  h.supervisorTools = {};
  h.toolCalls = [];
  h.exec = [];
});

/** Une demande de permission, telle qu'opencode la publie sur le flux. */
function permissionFrame(
  permission: string,
  metadata: Record<string, unknown>,
  callId = "call_garde",
  id = "per_1",
): string {
  return JSON.stringify({
    type: "permission.asked",
    properties: {
      id,
      sessionID: PARENT,
      permission,
      patterns: [],
      metadata,
      always: [],
      tool: { messageID: "msg_1", callID: callId },
    },
  });
}

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

  it("porte le `generation_id` et le coût FACTURÉ vus par le proxy", async () => {
    // Opencode n'expose l'identifiant de génération nulle part (dossier §2.6) :
    // c'est le proxy local, et lui seul, qui le rend au ledger. Le coût suit la
    // même règle — celui du fournisseur prime sur celui qu'opencode calcule.
    h.generations = [{ id: "gen-abc", model: "", outputTokens: null, costUsd: 0.0042 }];
    const report = await run();
    expect(h.usage[0].generationId).toBe("gen-abc");
    expect(h.usage[0].cost).toBe(0.0042);
    expect(h.usage[0].estimated).toBe(false);
    expect(report.costUsd).toBeCloseTo(
      h.usage.reduce((sum, l) => sum + Number(l.cost ?? 0), 0),
      10,
    );
    // Le proxy est fermé avec le serveur : un port qui reste ouvert dans une
    // microVM qui enchaîne les tours est un port de moins au tour suivant.
    expect(h.proxyClosed).toBe(true);
  });

  it("retombe sur le coût d'opencode quand le fournisseur n'a rien dit", async () => {
    // Le cas normal aujourd'hui : OpenRouter ne rend le coût qu'avec
    // `usage: {include: true}`, et un provider BYOK peut ne rien rendre du tout.
    h.generations = [{ id: "gen-xyz", model: "", outputTokens: null, costUsd: null }];
    await run();
    expect(h.usage[0].generationId).toBe("gen-xyz");
    expect(Number(h.usage[0].cost)).toBeGreaterThan(0);
    expect(h.usage[0].estimated).toBe(false);
  });

  it("dit au tour suivant où en est la numérotation du ledger", async () => {
    // `execute.ts` relit `checkpoint.usageSeq` : sans lui, le tour repris
    // renumérote ses lignes par-dessus celles du tour d'avant.
    const report = await run();
    const parentLines = h.usage.filter((l) => Number(l.seq) < 1_000_000);
    expect((report.checkpoint as { usageSeq?: number }).usageSeq).toBe(7 + parentLines.length);
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

describe("le plafond de dépense", () => {
  it("coupe le tour à la frontière de round, et le DIT comme un budget", async () => {
    // Le premier round de la fixture coûte déjà plus que ça : la garde doit
    // mordre là, couper la session, et rendre `budget_exhausted` — pas `error`.
    // La fonction en tire une conduite propre (event `quota_exhausted`, pas de
    // re-queue) ; rangé sous `error`, le run serait retenté sans quoi payer.
    const report = await run({ budgetUsd: 0.0000001 });
    expect(report.status).toBe("budget_exhausted");
    expect(h.routes.some((r) => r.endsWith("/abort"))).toBe(true);
    // Une seule ligne de ledger : on ne paie pas un appel de plus.
    expect(h.usage).toHaveLength(1);
    // Le tour garde tout de même son journal — la reprise ne dépend pas de la
    // raison de l'arrêt.
    expect((report.checkpoint as { opencode?: unknown }).opencode).toBeTruthy();
  });

  it("laisse le tour aller au bout quand il reste du budget", async () => {
    const report = await run({ budgetUsd: 100 });
    expect(report.status).toBe("completed");
    expect(h.routes.some((r) => r.endsWith("/abort"))).toBe(false);
  });

  it("RELIT le plafond en cours de tour, il ne le snapshote pas", async () => {
    // Rien ne réserve de budget : deux runs concurrents lisent le même restant
    // et le prennent chacun pour plafond. Un tour de microVM dure des heures —
    // un plafond figé au démarrage serait aveugle du début à la fin.
    h.remainingUsd = 0;
    // L'horloge avance d'une minute par lecture, pour franchir la cadence de
    // relecture sans faire attendre le test.
    let clock = Date.now();
    const report = await run(
      { budgetUsd: 1_000 },
      {
        now: () => {
          clock += 60_000;
          return clock;
        },
      },
    );
    expect(h.budgetReads).toBeGreaterThan(0);
    expect(report.status).toBe("budget_exhausted");
  });

  it("ne plafonne rien quand le job n'a pas de budget (BYOK)", async () => {
    const report = await run({ budgetUsd: undefined });
    expect(report.status).toBe("completed");
  });
});

describe("les garde-fous", () => {
  it("laisse passer une commande anodine", async () => {
    h.extraFrames = [permissionFrame("bash", { command: "npm test" })];
    await run();
    expect(h.permissionReplies).toEqual([{ id: "per_1", reply: "once" }]);
  });

  it("refuse `git reset --hard` et dit pourquoi AU MODÈLE", async () => {
    h.extraFrames = [
      permissionFrame("bash", { command: "git reset --hard" }),
      // Le tool revient en erreur derrière le refus : c'est cette frame-là qui
      // porte le refus jusqu'au fil.
      JSON.stringify({
        type: "message.part.updated",
        properties: {
          sessionID: PARENT,
          part: {
            type: "tool",
            tool: "bash",
            callID: "call_garde",
            state: { status: "error", error: "rejected", input: { command: "git reset --hard" } },
          },
        },
      }),
    ];
    await run();
    expect(h.permissionReplies[0].reply).toBe("reject");
    // Le message VOYAGE : opencode le recopie dans l'erreur du tool. Sans lui, le
    // modèle ne sait pas ce qu'on lui reproche et réessaie.
    expect(h.permissionReplies[0].message).toContain("the harness owns git");
    // Et le refus reste mesurable sur `agent_run_events`, comme du temps de la
    // boucle maison (`FORBIDDEN_COMMAND_REASON`).
    const result = h.events.find((e) => e.payload.id === "call_garde" && e.type === "tool_result");
    expect(result?.payload.reason).toBe("forbidden_command");
  });

  it("refuse une écriture dans `.git/`, qu'opencode exécuterait sans rien dire", async () => {
    h.extraFrames = [
      permissionFrame("edit", { filepath: "/vercel/sandbox/repo/.git/config" }),
    ];
    await run();
    expect(h.permissionReplies[0].reply).toBe("reject");
    expect(h.permissionReplies[0].message).toContain(".git");
  });

  it("laisse passer une écriture du dépôt", async () => {
    h.extraFrames = [permissionFrame("edit", { filepath: "/vercel/sandbox/repo/lib/a.ts" })];
    await run();
    expect(h.permissionReplies[0].reply).toBe("once");
  });

  /**
   * MIN-286 lot 2, tâche 14 — L'ÉDITION EST LE FAIT QUE LES RÈGLES DE LIVRAISON
   * LISENT, et chez opencode elle ne passe plus par un de nos tools : la demande
   * de permission est le seul endroit où on la voit. Sans ce câblage, un tour qui
   * édite se présente à la porte comme un tour qui n'a rien touché — donc sans
   * type-check, sans tests et sans relecture avant que le code parte chez un humain.
   */
  it("note une écriture autorisée au checkpoint, en chemin de dépôt", async () => {
    h.extraFrames = [permissionFrame("edit", { filepath: "/vercel/sandbox/repo/lib/a.ts" })];
    const report = await run();
    expect(report.checkpoint?.editedPaths).toEqual(["lib/a.ts"]);
    expect(report.checkpoint?.repoTouched).toBe(true);
  });

  it("ne note RIEN d'une écriture refusée — elle n'a pas eu lieu", async () => {
    h.extraFrames = [permissionFrame("edit", { filepath: "/vercel/sandbox/repo/.git/config" })];
    const report = await run();
    expect(report.checkpoint?.editedPaths).toBeUndefined();
    expect(report.checkpoint?.repoTouched).toBeUndefined();
  });

  it("ne perd pas le tour quand le verdict n'arrive pas à destination", async () => {
    // Le serveur peut refuser la réponse (permission déjà expirée, route qui
    // bouge à une release près). Le tour continue : le tool restera suspendu
    // jusqu'à la deadline, ce qui est un signal — un tour mort n'en est pas un.
    h.extraFrames = [permissionFrame("bash", { command: "ls" })];
    h.permissionReplyFails = true;
    const report = await run();
    expect(report.status).toBe("completed");
  });
});

describe("les questions à l'utilisateur", () => {
  const question = JSON.stringify({
    type: "question.asked",
    properties: {
      id: "que_1",
      sessionID: PARENT,
      questions: [
        {
          question: "Quelle approche ?",
          header: "Approche",
          options: [{ label: "A (Recommended)", description: "…" }, { label: "B", description: "…" }],
        },
      ],
      tool: { messageID: "msg_1", callID: "call_q" },
    },
  });

  it("pose les questions au fil, puis ARRÊTE le tour", async () => {
    h.extraFrames = [question];
    const report = await run();
    // Le même event que la boucle maison : c'est ce que la carte de questions du
    // feed sait déjà rendre, y compris sur un run relu trois mois plus tard.
    const asked = h.events.find((e) => e.type === "question");
    expect(asked?.payload.id).toBe("call_q");
    // `askedUser` est ce qui met la session en `awaiting_input` et envoie
    // `agent_question` plutôt qu'`agent_done` (vm-rest.ts).
    expect(report.askedUser).toBe(true);
    expect(report.status).toBe("completed");
    // Pas de mot de la fin : la carte de questions clôt le fil, et le commit
    // prend son message générique.
    expect(report.reply).toBeUndefined();
  });

  it("ne tient pas la microVM ouverte le temps qu'un humain revienne", async () => {
    h.extraFrames = [question];
    const report = await run();
    // La question est écartée (le tool se résout, l'historique reste apparié) et
    // la session coupée : la réponse reviendra au tour suivant, par le steering.
    expect(h.questionsRejected).toEqual(["que_1"]);
    expect(h.routes.some((r) => r.endsWith("/abort"))).toBe(true);
    // Et le tour garde son journal : c'est lui qui fera repartir le suivant.
    expect((report.checkpoint as { opencode?: unknown }).opencode).toBeTruthy();
  });

  it("ne prend PAS l'abort de la question pour une panne", async () => {
    // Tout `abort` publie `session.error` `MessageAbortedError` : sans le filtre
    // du traducteur, le tour rendrait `error` et le fil afficherait une panne là
    // où il y a une question.
    h.extraFrames = [
      question,
      JSON.stringify({
        type: "session.error",
        properties: { sessionID: PARENT, error: { name: "MessageAbortedError", data: { message: "Aborted" } } },
      }),
    ];
    const report = await run();
    expect(report.status).toBe("completed");
    expect(report.errorMessage).toBeUndefined();
    expect(h.events.some((e) => e.type === "error")).toBe(false);
  });
});

describe("les sessions filles", () => {
  /**
   * Le flux `/event` est celui du SERVEUR : quand le modèle délègue, la fille
   * publie sur le même canal. Trois choses en dépendent, et chacune casse en
   * silence — le tour se termine trop tôt, la réponse se mélange, la dépense se
   * range dans la mauvaise bande.
   */
  it("compte la fille dans le MÊME run, dans la bande des sous-agents", async () => {
    h.extraFrames = [childRound()];
    await run();
    const child = h.usage.find((l) => Number(l.seq) >= 2_000_000_000);
    expect(child, "la fille doit avoir sa ligne de ledger").toBeTruthy();
    // Slot 0 de la bande des sous-agents — la convention de la boucle maison
    // (`subagentUsageSeq`), pour que l'ordre d'un run se lise pareil.
    expect(child!.seq).toBe(2_000_000_000);
    expect(child!.cachedTokens).toBe(10);
    expect(child!.cacheWriteTokens).toBe(5);
    // La mère garde sa propre numérotation, elle ne saute pas.
    expect(h.usage[0].seq).toBe(7);
  });

  it("ne termine PAS le tour sur le `session.idle` d'une fille", async () => {
    // La fille se tait avant la mère : si son `idle` sortait de la boucle, tout
    // ce que la mère fait ensuite serait perdu — et le tour rendrait la main
    // sans rien avoir répondu.
    h.extraFrames = [
      JSON.stringify({ type: "session.idle", properties: { sessionID: CHILD } }),
      JSON.stringify({
        type: "message.part.updated",
        properties: {
          sessionID: PARENT,
          part: {
            type: "tool",
            tool: "grep",
            callID: "call_apres",
            state: { status: "running", input: { pattern: "y" } },
          },
        },
      }),
    ];
    const report = await run();
    expect(h.events.some((e) => e.payload.id === "call_apres")).toBe(true);
    expect(report.status).toBe("completed");
    expect(report.reply).toBeTruthy();
  });

  it("marque les gestes de la fille au lieu de les prêter à la mère", async () => {
    h.extraFrames = [
      JSON.stringify({
        type: "message.part.updated",
        properties: {
          sessionID: CHILD,
          part: {
            type: "tool",
            tool: "grep",
            callID: "call_fille",
            state: { status: "running", input: { pattern: "x" } },
          },
        },
      }),
    ];
    await run();
    const own = h.events.find((e) => e.payload.id === "call_fille");
    expect(own?.payload.subagent_id).toBe(CHILD);
    // Ceux de la mère ne portent rien : c'est elle qui parle.
    expect(h.events.find((e) => e.payload.id === "call_1")?.payload.subagent_id).toBeUndefined();
  });

  it("garde le texte de la fille hors de la réponse du tour", async () => {
    h.extraFrames = [
      JSON.stringify({
        type: "message.part.updated",
        properties: {
          sessionID: CHILD,
          part: { type: "text", id: "prt_fille", text: "RAPPORT DE LA FILLE" },
        },
      }),
    ];
    const report = await run();
    // La réponse part dans le message de commit et dans le fil : le rapport
    // d'une fille n'y a rien à faire.
    expect(report.reply).not.toContain("RAPPORT DE LA FILLE");
  });
});

/**
 * MIN-286 lot 2, tâche 15 — LA FORGE, ET LE SEUL TOOL COUPÉ EN DEUX.
 *
 * `create_pr` pousse ICI (la microVM a le dépôt) et fait ouvrir LÀ-BAS (la
 * fonction a le token de forge). Ce qui se teste est donc la moitié VM : qu'elle
 * pousse avant de faire ouvrir, qu'elle remonte la branche plutôt que de laisser
 * la fonction la relire, et qu'elle refuse dans les deux cas où pousser
 * livrerait autre chose que le travail du tour.
 */
describe("la forge", () => {
  /** Le handler tel que le pont le reçoit — avant sa porte de livraison. */
  const createPr = () => h.supervisorTools.create_pr;

  it("pousse, PUIS fait ouvrir la pull request, branche comprise", async () => {
    await run();
    const out = (await createPr()({ title: "MIN-42: le titre", body: "le corps" })) as {
      success: boolean;
    };
    expect(out.success).toBe(true);
    const call = h.toolCalls.find((c) => c.name === "create_pr");
    expect(call).toBeTruthy();
    // Le push a eu lieu AVANT l'appel : la fonction ouvre sur une tête qui existe.
    expect((call!.body.pushed as { committed: boolean }).committed).toBe(true);
    /**
     * LA BRANCHE VOYAGE. `agent_runs.branch_name` n'est stampé qu'après un push
     * réel (MIN-123) — or ce push-ci est le premier du run dans le cas normal :
     * la fonction lirait une branche nulle et ouvrirait sur une tête vide.
     */
    expect(call!.body.workBranch).toBe("minddy/agent/min-42-abcd1234");
  });

  it("rend un push raté au modèle, sans le token de la forge", async () => {
    h.pushed = false;
    await run();
    const out = (await createPr()({ title: "t" })) as { success: boolean; result: { error: string } };
    expect(out.success).toBe(false);
    expect(out.result.error).toContain("push failed");
    // Un rejet de push recopie l'URL de push, token compris (MIN-239).
    expect(out.result.error).not.toContain("ghs_SECRET");
    // Et rien n'a été demandé à la forge : il n'y a pas de tête à ouvrir.
    expect(h.toolCalls.some((c) => c.name === "create_pr")).toBe(false);
  });

  it("refuse de livrer pendant qu'une fille écrit dans le même dépôt", async () => {
    // `commitAndPush` fait `git add -A` sur un sandbox PARTAGÉ : livrer ici
    // emporterait le travail d'un `implement` à moitié posé.
    h.extraFrames = [
      JSON.stringify({
        type: "message.part.updated",
        properties: {
          sessionID: PARENT,
          part: {
            type: "tool",
            tool: "task",
            callID: "call_task",
            state: {
              status: "running",
              input: { subagent_type: "general", description: "d", prompt: "p" },
              metadata: { sessionId: CHILD },
            },
          },
        },
      }),
    ];
    await run();
    const out = (await createPr()({ title: "t" })) as { success: boolean; result: { error: string } };
    expect(out.success).toBe(false);
    expect(out.result.error).toContain("editing the repository right now");
    expect(h.toolCalls.some((c) => c.name === "create_pr")).toBe(false);
  });

  it("ne donne AUCUN `create_pr` à une session de relecture", async () => {
    // Une relecture ne pousse pas et n'ouvre rien (`writesToRepo: false`) : le
    // tool n'est ni servi au modèle (`agentToolsFor` à l'ancrage `pr`) ni routé.
    await run({ writesToRepo: false, anchor: "pr" });
    expect(h.supervisorTools.create_pr).toBeUndefined();
    const files = h.files.filter((f) => f.path.startsWith(OPENCODE_TOOL_DIR));
    expect(files.some((f) => f.path.endsWith("/create_pr.ts"))).toBe(false);
    // Les trois écritures de la relecture, elles, restent servies : elles
    // s'exécutent côté fonction, qui a la forge (pr-tools.ts).
    for (const name of ["comment_pr", "comment_pr_line", "reply_pr_thread"]) {
      expect(files.some((f) => f.path.endsWith(`/${name}.ts`))).toBe(true);
    }
  });

  it("ne sert aucun tool d'écriture à une session de relecture", async () => {
    await run({ writesToRepo: false, anchor: "pr" });
    const config = JSON.parse(h.env.OPENCODE_CONFIG_CONTENT) as {
      permission: Record<string, string>;
      agent: Record<string, { tools: Record<string, boolean> }>;
    };
    expect(config.permission.edit).toBe("deny");
    for (const tool of ["edit", "write", "apply_patch"]) {
      expect(config.agent.build.tools[tool]).toBe(false);
    }
  });
});

/**
 * MIN-286 lot 3 — LES JOBS DE FOND, reposés en tool local.
 *
 * `bash` n'a pas de mode fond : sans ce tool, la doctrine « fais tourner le code
 * pour de vrai » se rabattait sur un `&` dans le shell persistant — donc sans
 * aucun de ses garde-fous. Ce qui se teste ici est exactement ce que le repli ne
 * tenait pas : le tool est SERVI et exécuté dans la VM, et ses jobs sont TUÉS
 * avant que quoi que ce soit ne stage le dépôt.
 */
describe("les jobs de fond", () => {
  /** Ce qu'un tool généré poste : le pont, puis le registre du superviseur. */
  const background = () => h.supervisorTools.run_background;

  it("sert `run_background` au modèle et l'exécute dans la microVM", async () => {
    await run();
    const files = h.files.filter((f) => f.path.startsWith(OPENCODE_TOOL_DIR));
    expect(files.some((f) => f.path.endsWith("/run_background.ts"))).toBe(true);

    const out = (await background()({ action: "start", command: "npm run dev" })) as {
      success: boolean;
      result: { job_id: string; pid: number };
    };
    expect(out.success).toBe(true);
    expect(out.result.pid).toBe(4242);
    // Le job tourne dans le dépôt de la VM, jamais chez le plan de contrôle.
    expect(h.exec.some((c) => c.includes("setsid"))).toBe(true);
    expect(h.toolCalls.some((c) => c.name === "run_background")).toBe(false);
  });

  it("refuse une commande que le garde-fou git interdit", async () => {
    // `checkCommand` vaut ICI AUSSI : sans lui, `run_background` serait une porte
    // dérobée sur `git push` (MIN-108).
    await run();
    const out = (await background()({ action: "start", command: "git push --force" })) as {
      success: boolean;
    };
    expect(out.success).toBe(false);
    expect(h.exec.some((c) => c.includes("git push --force"))).toBe(false);
  });

  it("tue ses jobs AVANT de stager le dépôt en fin de tour", async () => {
    /**
     * Le job est lancé PENDANT le tour (le pont est ouvert avant le serveur), ce
     * qui est la seule façon de prouver l'ordre : un serveur encore vivant
     * pendant le `git add -A` fait commiter ce qu'il vient d'écrire, et il
     * tiendrait la microVM éveillée après le tour.
     */
    await run(
      {},
      {
        startToolBridge: async (opts) => {
          h.supervisorTools = (opts.supervisorTools ?? {}) as typeof h.supervisorTools;
          await background()({ action: "start", command: "npm run dev" });
          return await startToolBridge(opts);
        },
      },
    );
    const killed = h.exec.findIndex((c) => c.includes("kill -TERM"));
    const staged = h.exec.findIndex((c) => c.includes("git add -A"));
    expect(killed).toBeGreaterThanOrEqual(0);
    expect(staged).toBeGreaterThanOrEqual(0);
    expect(killed).toBeLessThan(staged);
  });

  it("tue ses jobs avant un `create_pr`, et le DIT au modèle", async () => {
    // Un serveur arrêté en silence laisse le modèle croire qu'il tourne : il
    // enchaîne des `curl` sur un port mort en cherchant ce qu'il a cassé (MIN-209).
    await run();
    await background()({ action: "start", command: "npm run dev" });
    const out = (await h.supervisorTools.create_pr({ title: "MIN-42: le titre" })) as {
      success: boolean;
    };
    expect(out.success).toBe(true);
    const call = h.toolCalls.find((c) => c.name === "create_pr");
    expect(String(call!.body.jobsNote)).toContain("1 background job was stopped");
  });

  it("n'en donne AUCUN à une session de relecture", async () => {
    // Une relecture tient dans une session : rien à lancer, rien à laisser vivant.
    await run({ writesToRepo: false, anchor: "pr" });
    expect(h.supervisorTools.run_background).toBeUndefined();
    const files = h.files.filter((f) => f.path.startsWith(OPENCODE_TOOL_DIR));
    expect(files.some((f) => f.path.endsWith("/run_background.ts"))).toBe(false);
  });
});

describe("la reprise", () => {
  it("exporte le journal du tour pour que le suivant reparte d'ailleurs", async () => {
    const report = await run();
    const state = (report.checkpoint as { opencode?: { sessionId: string; seq: Record<string, number> } })
      .opencode;
    expect(state?.sessionId).toBe(PARENT);
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

/**
 * MIN-286 lot 3 — LE STEERING ET LE « STOP ».
 *
 * Les deux gestes les plus visibles du produit, et les deux que le superviseur
 * n'avait pas : un bouton « Stop » qui ne fait rien et un message écrit pendant un
 * tour qui reste dans la file ne se voient dans aucun test de type — ils se voient
 * en s'en servant, sur un tour qui dure des heures.
 *
 * Ce que ces tests fixent, et qui n'est pas évident : **on ne draine la file que
 * quand on est en mesure de poster derrière**. `pullSteering` consomme ; un message
 * drainé et non posté est perdu pour de bon, puisque le plan de contrôle ne
 * re-queue le run que sur ce qui reste dans la file.
 */
/**
 * Une file qui se remplit APRÈS le premier prompt — c'est le seul montage qui
 * exerce l'injection en cours de tour. Une file remplie avant partirait avec le
 * prompt du tour, et le test passerait sans rien couper.
 */
function steeringAfterFirstPrompt(text: string): Partial<ControlPlaneClient> {
  let given = false;
  const ready = () => h.prompts.length >= 1 && !given;
  return {
    hasPendingMessages: async () => ready(),
    pullSteering: async () => {
      if (!ready()) return [];
      given = true;
      return [text];
    },
  };
}

describe("le steering et le « Stop »", () => {
  it("poste la file avec le prompt du tour, et le dit au fil", async () => {
    h.steering = ["et regarde aussi les tests"];
    await run();
    expect(h.prompts[0]).toBe("fais le ticket\n\net regarde aussi les tests");
    // SEUL le message de steering entre dans le fil : le prompt du tour y est
    // déjà (message de lancement, ou réponse affichée par le composer), et le
    // dire deux fois le ferait lire deux fois.
    expect(h.events.filter((e) => e.type === "user_message").map((e) => e.payload.text)).toEqual([
      "et regarde aussi les tests",
    ]);
  });

  it("un tour REPRIS n'a que la file : c'est par là qu'arrive la réponse à une question", async () => {
    h.steering = ["oui, la deuxième option"];
    const report = await run({}, {});
    expect(h.prompts[0]).toBe("fais le ticket\n\noui, la deuxième option");
    expect(report.status).toBe("completed");
  });

  it("ne poste RIEN quand il n'y a rien à dire — pas de relance fabriquée", async () => {
    const report = await runOpencodeTurn(
      job(),
      { prompt: "   ", anchorInstructions: "# Ancrage" },
      cp(),
      host(),
      deps(),
    );
    expect(h.prompts).toEqual([]);
    expect(report.status).toBe("completed");
    expect(report.costUsd).toBe(0);
    // Un tour qui n'a rien joué ne pousse pas : il n'a rien produit.
    expect(report.pushed).toBeNull();
  });

  it("coupe le round et repose la consigne à la frontière suivante", async () => {
    // Le temps avance : c'est ce qui fait tomber le sondage en cours de tour. Et
    // le message n'arrive qu'APRÈS le premier prompt — sinon il partirait avec
    // lui, et le test ne dirait rien de l'injection en cours de tour.
    h.tick = 3_000;
    const report = await runOpencodeTurn(
      job(),
      { prompt: "fais le ticket", anchorInstructions: "# Ancrage" },
      { ...cp(), ...steeringAfterFirstPrompt("ajoute un test") },
      host(),
      deps(),
    );
    // La consigne n'est jamais postée dans une session qui travaille : on coupe
    // (`abort`), et on repose au `session.idle` qui suit.
    expect(h.aborts).toBeGreaterThanOrEqual(1);
    expect(h.events.some((e) => e.type === "status" && e.payload.phase === "steered")).toBe(true);
    expect(h.prompts).toEqual(["fais le ticket", "ajoute un test"]);
    expect(report.status).toBe("completed");
  });

  it("un « Stop » nu arrête le tour, et le rapport le DIT", async () => {
    h.tick = 3_000;
    h.interrupt = true;
    const report = await run();
    expect(h.aborts).toBeGreaterThanOrEqual(1);
    expect(report.status).toBe("interrupted");
    // Le drapeau n'est PAS consommé sur un stop nu : c'est la fonction qui le
    // range en remettant la session au repos.
    expect(h.interruptCleared).toBe(0);
  });

  it("un « Stop » ACCOMPAGNÉ d'un message se poursuit dans ce tour", async () => {
    h.tick = 3_000;
    h.interrupt = true;
    const report = await runOpencodeTurn(
      job(),
      { prompt: "fais le ticket", anchorInstructions: "# Ancrage" },
      { ...cp(), ...steeringAfterFirstPrompt("arrête ça et fais plutôt l'autre") },
      host(),
      deps(),
    );
    // Le drapeau est consommé, sinon le sondage suivant sortirait du tour avec le
    // message pour seule trace — accepté et jamais joué.
    expect(h.interruptCleared).toBe(1);
    expect(report.status).not.toBe("interrupted");
    expect(h.prompts.at(-1)).toBe("arrête ça et fais plutôt l'autre");
  });
});
