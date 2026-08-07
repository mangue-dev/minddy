import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AiUsageInput } from "@/lib/server/ai-usage";

/**
 * MIN-223 — le plan de contrôle ne croit RIEN de ce que la microVM raconte
 * d'elle-même.
 *
 * Ce que ces tests gardent tient en une phrase : le `runId` vient de l'OIDC posé
 * par la plateforme, jamais du corps de la requête. Tout le reste — le topic du
 * direct, le payeur au ledger, l'acteur des écritures de tickets — en DÉRIVE.
 * L'oublier une fois, sur une seule surface, et une VM compromise diffuse sur le
 * fil d'un autre run ou impute sa dépense à quelqu'un d'autre. C'est précisément
 * ce qu'une clé Supabase à portée réduite n'aurait pas su empêcher : le topic et
 * le payeur y sont des paramètres.
 *
 * On ne moque que ce qui sort du process (base, realtime, ledger, tools) : le
 * routage des surfaces et les dérivations sont le vrai chemin.
 */

const h = vi.hoisted(() => ({
  recorded: [] as AiUsageInput[],
  streams: [] as Array<{ topic: string; event: string; text: unknown }>,
  events: [] as Array<{ runId: string; type: string }>,
  stamped: [] as Array<Record<string, unknown>>,
  issueCalls: [] as Array<{ ctx: Record<string, unknown>; name: string }>,
  /** Ce qui a été confié à `afterOrNow` — donc au canal qui maintient
   *  l'invocation en vie après la réponse, et jamais détaché. */
  afterWork: [] as Array<() => void | Promise<void>>,
  prIssueId: null as string | null,
  stampReturnsNull: false,
  landed: 0,
  run: null as Record<string, unknown> | null,
}));

vi.mock("@/lib/server/ai-usage", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/server/ai-usage")>()),
  recordAiUsage: vi.fn(async (input: AiUsageInput | AiUsageInput[]) => {
    h.recorded.push(...(Array.isArray(input) ? input : [input]));
  }),
}));

vi.mock("./live", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./live")>()),
  broadcastToTopic: vi.fn(
    async (topic: string, event: string, payload: Record<string, unknown>) => {
      h.streams.push({ topic, event, text: payload.text });
    },
  ),
}));

// `afterOrNow` n'exécute RIEN ici : les tests le déclenchent eux-mêmes. C'est ce
// qui rend visible la différence entre « confié au canal de fond » et « détaché »
// — un `void fetch(…)` posé avant la réponse n'apparaîtrait jamais dans cette
// file, et il mourrait avec l'invocation en vrai.
vi.mock("@/lib/server/after-safe", () => ({
  afterOrNow: (work: () => void | Promise<void>) => {
    h.afterWork.push(work);
  },
}));

vi.mock("./pr-run", () => ({
  loadPrRunContext: vi.fn(async () => ({ issueId: h.prIssueId })),
}));

vi.mock("./vm-rest", () => ({
  landVmTurn: vi.fn(async () => {
    h.landed++;
  }),
}));

vi.mock("./runs", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./runs")>()),
  getRun: vi.fn(async () => h.run),
  appendEvent: vi.fn(async (runId: string, type: string) => {
    h.events.push({ runId, type });
  }),
  stampRun: vi.fn(async (_runId: string, fields: Record<string, unknown>) => {
    h.stamped.push(fields);
    return h.stampReturnsNull ? null : (h.run as never);
  }),
  pullPendingMessages: vi.fn(async () => ["fais plutôt ça"]),
  readInterruptFlag: vi.fn(async () => true),
}));

vi.mock("./issue-tools", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./issue-tools")>()),
  executeIssueTool: vi.fn(async (ctx: Record<string, unknown>, name: string) => {
    h.issueCalls.push({ ctx, name });
    return { result: { ok: true }, success: true };
  }),
}));

vi.mock("./scratchpad-tools", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./scratchpad-tools")>()),
  executeScratchpadTool: vi.fn(async () => ({ result: { ok: true }, success: true })),
}));

vi.mock("@/lib/server/account-settings", () => ({
  getAccountSettings: vi.fn(async () => ({ ok: false as const })),
}));

vi.mock("@/lib/supabase-service", () => ({
  getServiceClient: () => ({
    from: () => ({
      select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { key: "MIN" } }) }) }),
    }),
  }),
}));

import { handleControlPlaneRequest } from "./control-plane";

const RUN_ID = "11111111-2222-4333-8444-555555555555";
const OTHER_RUN = "99999999-8888-4777-8666-555555555555";

beforeEach(() => {
  h.recorded.length = 0;
  h.streams.length = 0;
  h.events.length = 0;
  h.stamped.length = 0;
  h.issueCalls.length = 0;
  h.afterWork.length = 0;
  h.prIssueId = null;
  h.stampReturnsNull = false;
  h.landed = 0;
  h.run = {
    id: RUN_ID,
    status: "running",
    run_id: "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee",
    project_id: "proj-1",
    issue_id: "issue-1",
    pull_request_id: null,
    created_by: "user-owner",
    chain_id: null,
    model: "deepseek/deepseek-v4-flash",
    checkpoint: { messages: [] },
  };
});

const call = (
  method: string,
  surface: string,
  body: Record<string, unknown> | null = null,
  runId = RUN_ID,
) => handleControlPlaneRequest({ runId, method, surface, body });

describe("le direct — le topic vient du run, pas du corps", () => {
  it("diffuse sur le run de l'OIDC même quand le corps en désigne un autre", async () => {
    const res = await call("POST", "/stream", { text: "salut", runId: OTHER_RUN, topic: "x" });
    expect(res.status).toBe(200);
    await Promise.all(h.afterWork.map((w) => w()));
    expect(h.streams).toEqual([{ topic: `agent-run:${RUN_ID}`, event: "stream", text: "salut" }]);
  });

  it("confie la diffusion au canal de fond, au lieu de la détacher", async () => {
    // Le direct n'est écrit NULLE PART : contrairement aux events, aucun poll ne
    // le rattrape. Détaché juste avant la réponse, son fetch meurt gelé avec
    // l'invocation et le fil ne voit jamais l'agent écrire (cf. after-safe.ts).
    await call("POST", "/stream", { text: "salut" });
    // Rien n'est parti pendant la requête : la diffusion attend le crochet.
    expect(h.streams).toHaveLength(0);
    expect(h.afterWork).toHaveLength(1);
    // Et le travail doit RENDRE sa promesse : la détacher à l'intérieur du
    // crochet referait exactement la même panne, un cran plus bas.
    const returned = h.afterWork[0]();
    expect(returned).toBeInstanceOf(Promise);
    await returned;
    expect(h.streams).toHaveLength(1);
  });
});

describe("le ledger — le payeur vient de la ligne du run, pas du corps", () => {
  it("impute au créateur du run et ignore un billTo envoyé", async () => {
    await call("POST", "/usage", {
      feature: "agent_code",
      cost: 0.42,
      billTo: { userId: "quelquun-dautre" },
      userId: "quelquun-dautre",
      runId: OTHER_RUN,
    });
    expect(h.recorded).toHaveLength(1);
    expect(h.recorded[0].billTo).toEqual({ userId: "user-owner" });
    // …et sous l'identifiant de facturation du run, pas sous celui du corps.
    expect(h.recorded[0].runId).toBe("aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee");
    expect(h.recorded[0].cost).toBe(0.42);
  });

  it("refuse une feature hors du périmètre de l'agent", async () => {
    // Sans ce refus, une VM compromise rangerait sa dépense sous `numo_chat` et
    // la sortirait des compteurs de l'agent — invisible là où on la cherche.
    const res = await call("POST", "/usage", { feature: "numo_chat", cost: 10 });
    expect(res.status).toBe(400);
    expect(h.recorded).toHaveLength(0);
  });
});

describe("les events", () => {
  it("écrivent sur le run de l'OIDC", async () => {
    await call("POST", "/events", { type: "tool_call", payload: { name: "read_file" } });
    expect(h.events).toEqual([{ runId: RUN_ID, type: "tool_call" }]);
  });

  it("refusent un event sans type plutôt que d'en inventer un", async () => {
    expect((await call("POST", "/events", { payload: {} })).status).toBe(400);
  });
});

describe("le checkpoint", () => {
  it("rend celui de la ligne", async () => {
    const res = await call("GET", "/checkpoint");
    expect(res.body).toEqual({ checkpoint: { messages: [] } });
  });

  it("dit 409 quand le run n'est plus en cours — au lieu de laisser croire", async () => {
    // Une VM qui croit avoir sauvegardé et continue travaille pour une
    // conversation qui est finie.
    h.stampReturnsNull = true;
    const res = await call("PUT", "/checkpoint", { checkpoint: { messages: [1] } });
    expect(res.status).toBe(409);
  });
});

describe("steering et interruption — inchangés côté base", () => {
  it("drainent les messages en attente", async () => {
    expect((await call("GET", "/messages")).body).toEqual({ messages: ["fais plutôt ça"] });
  });

  it("rendent le drapeau d'interruption", async () => {
    expect((await call("GET", "/interrupt")).body).toEqual({ interrupted: true });
  });
});

describe("les tools de plateforme", () => {
  it("rejouent un tool ticket avec l'acteur du run, jamais celui du corps", async () => {
    await call("POST", "/tool/read_issue", {
      args: { issue: "MIN-1" },
      actorId: "quelquun-dautre",
    });
    expect(h.issueCalls).toHaveLength(1);
    expect(h.issueCalls[0].ctx.actorId).toBe("user-owner");
    expect(h.issueCalls[0].ctx.runId).toBe(RUN_ID);
  });

  it("ancrent une RELECTURE sur le ticket de sa pull request", async () => {
    // `run.issue_id` est toujours nul sur une session de review, mais la PR porte
    // souvent le ticket qu'elle met en œuvre : c'est LUI le défaut de `read_issue`
    // (même règle qu'execute.ts). Sans ça le tool annonce un défaut qui n'existe
    // pas, et le premier appel sans argument brûle un round.
    h.run = { ...h.run, issue_id: null, pull_request_id: "pr-1" };
    h.prIssueId = "issue-de-la-pr";
    await call("POST", "/tool/read_issue", { args: {} });
    expect(h.issueCalls[0].ctx.anchorIssueId).toBe("issue-de-la-pr");
  });

  it("ne servent PAS les tools de fichier — ils s'exécutent dans la VM", async () => {
    for (const name of ["read_file", "edit_file", "run_command", "git_commit"]) {
      expect((await call("POST", `/tool/${name}`, { args: {} })).status).toBe(404);
    }
  });
});

describe("la surface est fermée", () => {
  it("refuse ce qu'elle ne connaît pas", async () => {
    expect((await call("POST", "/whatever")).status).toBe(404);
    // …y compris une bonne surface avec la mauvaise méthode.
    expect((await call("GET", "/events")).status).toBe(404);
    expect((await call("POST", "/messages")).status).toBe(404);
  });

  it("refuse un run qui n'existe pas", async () => {
    h.run = null;
    expect((await call("POST", "/events", { type: "status" })).status).toBe(404);
  });
});

describe("la fin de tour n'atterrit qu'UNE fois", () => {
  it("met la session au repos quand le run tourne encore", async () => {
    const res = await call("POST", "/rest", { status: "completed", costUsd: 0.1 });
    expect(res.status).toBe(200);
    expect(h.landed).toBe(1);
  });

  it("refuse en 409 un second rapport — le client ne le retente pas", async () => {
    // Le client du plan de contrôle retente sur 5xx : sans cette garde, un rapport
    // dont la réponse s'est perdue en vol serait rejoué. Events en double dans le
    // fil, et une SECONDE ligne de compute au ledger — la moitié microVM de la
    // facture, comptée deux fois.
    h.run = { ...h.run, status: "completed" };
    const res = await call("POST", "/rest", { status: "completed", costUsd: 0.1 });
    expect(res.status).toBe(409);
    expect(h.landed).toBe(0);
  });

  it("refuse un rapport sans statut plutôt que d'en inventer un", async () => {
    expect((await call("POST", "/rest", { costUsd: 1 })).status).toBe(400);
    expect(h.landed).toBe(0);
  });
});

describe("le checkpoint périodique fait aussi office de battement de cœur", () => {
  it("horodate l'activité du run à chaque sauvegarde", async () => {
    // C'est le seul signal régulier qu'un tour qui vit dans la VM produise, et
    // c'est sur lui que le chien de garde décide d'aller interroger la plateforme.
    // Sans lui, il la sonderait pour chaque run à chaque passage du cron.
    await call("PUT", "/checkpoint", { checkpoint: { messages: [] } });
    expect(h.stamped[0]).toHaveProperty("last_activity_at");
  });

  it("dit 409 quand le run n'est plus en cours — la VM doit s'arrêter", async () => {
    h.stampReturnsNull = true;
    const res = await call("PUT", "/checkpoint", { checkpoint: { messages: [] } });
    expect(res.status).toBe(409);
  });
});
